import { NextResponse } from "next/server";

import type {
  ExistingSourceState,
  SourceUpsert,
} from "@/lib/platforms/youtube/normalize";
import {
  buildSourceUpserts,
  planSyncTransitions,
} from "@/lib/platforms/youtube/normalize";
import {
  YouTubeApiError,
  listSources,
} from "@/lib/platforms/youtube/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getOAuthConfig, refreshAccessToken } from "@/lib/youtube/oauth";
import { decryptRefreshToken } from "@/lib/youtube/token-crypto";

interface ConnectionRow {
  status: string;
  encrypted_refresh_token: string | null;
}

async function readConnection(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<ConnectionRow | null> {
  const { data } = await admin
    .from("platform_connections")
    .select("status,encrypted_refresh_token")
    .eq("user_id", userId)
    .eq("platform", "youtube")
    .limit(1);
  return (data?.[0] as ConnectionRow | undefined) ?? null;
}

async function setConnectionError(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  patch: { status?: string; last_error?: string | null },
): Promise<void> {
  try {
    await admin
      .from("platform_connections")
      .update(patch)
      .eq("user_id", userId)
      .eq("platform", "youtube");
  } catch {
    // Best effort; the API response below is what the user sees.
  }
}

/**
 * Imports the user's YouTube subscriptions into normalized sources.
 * Synchronous paginated sync (fine for MVP library sizes; no job queue).
 */
export async function POST() {
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

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const connection = await readConnection(admin, userId);
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
    console.error("YouTube sync: stored token undecryptable");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  let accessToken: string;
  try {
    const config = getOAuthConfig(process.env.NEXT_PUBLIC_SITE_URL);
    const tokens = await refreshAccessToken(config, refreshToken);
    accessToken = tokens.accessToken;
  } catch (err) {
    const code = err instanceof Error && "code" in err ? String((err as { code: unknown }).code) : "";
    if (code === "invalid_grant") {
      await setConnectionError(admin, userId, {
        status: "revoked",
        last_error: "refresh_rejected",
      });
      return NextResponse.json({ error: "reconnect_required" }, { status: 409 });
    }
    console.error("YouTube sync: token refresh failed");
    return NextResponse.json(
      { error: "provider_error", retryable: true },
      { status: 502 },
    );
  }

  const syncedAt = new Date().toISOString();
  const seen = new Set<string>();
  let upserted = 0;
  try {
    for await (const page of listSources({ accessToken })) {
      if (page.length === 0) continue;
      const rows: SourceUpsert[] = buildSourceUpserts(page, userId, syncedAt);
      const { error } = await admin
        .from("sources")
        .upsert(rows, { onConflict: "user_id,platform,external_id" });
      if (error) {
        console.error("YouTube sync: sources upsert failed");
        throw new Error("db_upsert_failed");
      }
      for (const row of rows) seen.add(row.external_id);
      upserted += rows.length;
    }

    const { data: existing } = await admin
      .from("sources")
      .select("external_id,status")
      .eq("user_id", userId)
      .eq("platform", "youtube");
    const states = ((existing ?? []) as ExistingSourceState[]).filter((row) =>
      ["active", "unsubscribed", "unavailable_externally"].includes(row.status),
    );
    const { toReactivate, toMarkMissing } = planSyncTransitions(seen, states);

    let reactivated = 0;
    if (toReactivate.length > 0) {
      const { data, error } = await admin
        .from("sources")
        .update({ status: "active", unsubscribed_at: null })
        .eq("user_id", userId)
        .eq("platform", "youtube")
        .in("external_id", toReactivate)
        .select("external_id");
      if (error) throw new Error("db_reactivate_failed");
      reactivated = data?.length ?? 0;
    }

    let markedUnavailable = 0;
    if (toMarkMissing.length > 0) {
      const { data, error } = await admin
        .from("sources")
        .update({ status: "unavailable_externally" })
        .eq("user_id", userId)
        .eq("platform", "youtube")
        .in("external_id", toMarkMissing)
        .select("external_id");
      if (error) throw new Error("db_mark_missing_failed");
      markedUnavailable = data?.length ?? 0;
    }

    await admin
      .from("platform_connections")
      .update({ status: "connected", last_sync_at: syncedAt, last_error: null })
      .eq("user_id", userId)
      .eq("platform", "youtube");

    return NextResponse.json({
      totalSeen: seen.size,
      upserted,
      reactivated,
      markedUnavailable,
      syncedAt,
    });
  } catch (err) {
    if (err instanceof YouTubeApiError) {
      if (err.code === "unauthenticated") {
        await setConnectionError(admin, userId, {
          status: "expired",
          last_error: "access_rejected",
        });
        return NextResponse.json({ error: "reconnect_required" }, { status: 409 });
      }
      await setConnectionError(admin, userId, { last_error: err.code });
      return NextResponse.json(
        { error: err.code, retryable: err.retryable },
        { status: 502 },
      );
    }
    console.error("YouTube sync failed:", err instanceof Error ? err.message : "unknown");
    await setConnectionError(admin, userId, { last_error: "sync_failed" });
    return NextResponse.json({ error: "sync_failed", retryable: true }, { status: 500 });
  }
}
