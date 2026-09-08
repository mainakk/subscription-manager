import { NextResponse } from "next/server";

import {
  ENRICHMENT_PROMPT_VERSION,
  enrichWithLlm,
  getAiConfig,
} from "@/lib/ai/enrich";
import { categoryNameForSlug } from "@/lib/categories";
import type { SourceEnrichmentRow } from "@/lib/db/types";
import { listRecentUploads } from "@/lib/platforms/youtube/client";
import {
  EnrichRequestSchema,
  runEnrichmentBatch,
  type EnrichDeps,
  type EnrichTarget,
} from "@/lib/sources/enrich";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getOAuthConfig, refreshAccessToken } from "@/lib/youtube/oauth";
import { decryptRefreshToken } from "@/lib/youtube/token-crypto";

function slugToName(slug: string) {
  return categoryNameForSlug(slug);
}

function uploadsPlaylistIdOf(metadata: unknown): string | null {
  if (metadata !== null && typeof metadata === "object") {
    const value = (metadata as Record<string, unknown>).uploadsPlaylistId;
    return typeof value === "string" && value.length > 0 ? value : null;
  }
  return null;
}

/**
 * AI-enriches a chunk of the caller's sources (default 10, max 25).
 * Each source costs one uploads lookup (1 YouTube quota unit) + one LLM
 * call. Repeat until `remaining` is 0. Failed items record nothing and
 * are reported per item for retry.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const parsed = EnrichRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { limit, force } = parsed.data;

  let user: { id: string } | null = null;
  try {
    user = await getAuthenticatedUser();
  } catch {
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const userId = user.id;

  const aiConfig = getAiConfig();
  if (!aiConfig) {
    return NextResponse.json({ error: "ai_not_configured" }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const { data: connectionData } = await admin
    .from("platform_connections")
    .select("status,encrypted_refresh_token")
    .eq("user_id", userId)
    .eq("platform", "youtube")
    .limit(1);
  const connection = (connectionData?.[0] ?? null) as {
    status: string;
    encrypted_refresh_token: string | null;
  } | null;
  if (!connection || !connection.encrypted_refresh_token) {
    return NextResponse.json({ error: "not_connected" }, { status: 400 });
  }
  if (connection.status === "revoked" || connection.status === "expired") {
    return NextResponse.json({ error: "reconnect_required" }, { status: 409 });
  }

  let refreshToken: string;
  try {
    refreshToken = decryptRefreshToken(connection.encrypted_refresh_token);
  } catch {
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  let accessToken: string;
  try {
    const config = getOAuthConfig(process.env.NEXT_PUBLIC_SITE_URL);
    accessToken = (await refreshAccessToken(config, refreshToken)).accessToken;
  } catch (err) {
    const code =
      err instanceof Error && "code" in err ? String((err as { code: unknown }).code) : "";
    if (code === "invalid_grant") {
      try {
        await admin
          .from("platform_connections")
          .update({ status: "revoked", last_error: "refresh_rejected" })
          .eq("user_id", userId)
          .eq("platform", "youtube");
      } catch {
        // Best effort.
      }
      return NextResponse.json({ error: "reconnect_required" }, { status: 409 });
    }
    return NextResponse.json(
      { error: "provider_error", retryable: true },
      { status: 502 },
    );
  }

  const { data: sourcesData, error: sourcesError } = await admin
    .from("sources")
    .select(
      "id,name,provider_description,subscriber_count,video_count,last_upload_at,metadata",
    )
    .eq("user_id", userId)
    .eq("platform", "youtube")
    .order("name");
  if (sourcesError) {
    return NextResponse.json({ error: "enrich_failed" }, { status: 500 });
  }
  const sources = (sourcesData ?? []) as {
    id: string;
    name: string;
    provider_description: string | null;
    subscriber_count: number | null;
    video_count: number | null;
    last_upload_at: string | null;
    metadata: unknown;
  }[];

  const { data: enrichedData } = await admin
    .from("source_enrichments")
    .select("source_id,category_slug,topics")
    .in(
      "source_id",
      sources.map((s) => s.id),
    );
  const enrichedRows = ((enrichedData ?? []) as Pick<
    SourceEnrichmentRow,
    "source_id" | "category_slug" | "topics"
  >[]);
  const enrichedIds = new Set(enrichedRows.map((r) => r.source_id));

  const candidates = force
    ? sources
    : sources.filter((s) => !enrichedIds.has(s.id));
  const targets: EnrichTarget[] = candidates.slice(0, limit).map((s) => ({
    sourceId: s.id,
    name: s.name,
    providerDescription: s.provider_description,
    subscriberCount: s.subscriber_count,
    videoCount: s.video_count,
    uploadsPlaylistId: uploadsPlaylistIdOf(s.metadata),
    lastUploadAt: s.last_upload_at,
  }));
  const remaining = Math.max(0, candidates.length - targets.length);

  const categoryCounts = new Map<string, number>();
  for (const row of enrichedRows) {
    categoryCounts.set(row.category_slug, (categoryCounts.get(row.category_slug) ?? 0) + 1);
  }
  const topCategories = [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .flatMap(([slug, count]) => {
      const name = slugToName(slug);
      return name ? [{ category: name, count }] : [];
    });

  const peers = enrichedRows.map((r) => ({ sourceId: r.source_id, topics: r.topics }));

  const deps: EnrichDeps = {
    fetchUploads: (playlistId) => listRecentUploads({ accessToken }, playlistId),
    callLlm: (input) => enrichWithLlm(input, aiConfig),
    updateLastUpload: async (sourceId, iso) => {
      const { error } = await admin
        .from("sources")
        .update({ last_upload_at: iso })
        .eq("id", sourceId)
        .eq("user_id", userId);
      if (error) throw new Error("db_failed");
    },
    saveResult: async (sourceId, save) => {
      const { error: enrichmentError } = await admin
        .from("source_enrichments")
        .upsert(
          {
            source_id: sourceId,
            category_slug: save.categorySlug,
            subcategory: save.subcategory,
            topics: save.topics,
            description: save.description,
            confidence: save.confidence,
            model: save.model,
            prompt_version: save.promptVersion,
          },
          { onConflict: "source_id" },
        );
      if (enrichmentError) throw new Error("db_failed");
      const { error: recommendationError } = await admin
        .from("source_recommendations")
        .insert({
          source_id: sourceId,
          verdict: save.verdict,
          reason: save.reason,
          signals: save.signals,
          model: save.model,
        });
      if (recommendationError) throw new Error("db_failed");
    },
  };

  try {
    const result = await runEnrichmentBatch(
      targets,
      { total: sources.length, topCategories, peers },
      deps,
      aiConfig.model,
      ENRICHMENT_PROMPT_VERSION,
    );
    return NextResponse.json({ ...result, remaining, model: aiConfig.model });
  } catch (err) {
    console.error(
      "Bulk enrichment failed:",
      err instanceof Error ? err.message : "unknown",
    );
    return NextResponse.json({ error: "enrich_failed" }, { status: 500 });
  }
}
