import Link from "next/link";
import { redirect } from "next/navigation";

import { AutoSync } from "@/components/connection/AutoSync";
import { DeleteDataButton } from "@/components/connection/DeleteDataButton";
import { DisconnectButton } from "@/components/connection/DisconnectButton";
import { SyncButton } from "@/components/connection/SyncButton";
import { AppNav } from "@/components/layout/AppNav";
import { EnrichPanel } from "@/components/sources/EnrichPanel";
import { SourcesExplorer } from "@/components/sources/SourcesExplorer";
import { buttonVariants } from "@/components/ui/button";
import { getAiConfig } from "@/lib/ai/enrich";
import { categoryNameForSlug } from "@/lib/categories";
import { KNOWN_SYNC_ERROR_CODES, requestErrorMessage } from "@/lib/error-messages";
import type {
  PlatformConnectionRow,
  SourceEnrichmentRow,
  SourceRecommendationRow,
  SourceRow,
} from "@/lib/db/types";
import type { EnrichmentMeta } from "@/lib/sources/filter";
import { buildCleanupSummary } from "@/lib/sources/summary";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

interface DashboardSearchParams {
  connected?: string;
  facebook_connected?: string;
  facebook_oauth?: string;
  oauth?: string;
  sync?: string;
}

function OAuthBanner({ code }: { code: string }) {
  if (code === "denied") {
    return (
      <div className="rounded-md border border-input bg-muted p-3 text-sm">
        You declined YouTube access. Nothing was imported — reconnect any time.
      </div>
    );
  }
  if (code === "misconfigured") {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
        YouTube OAuth is not configured on the server. Set GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET, and NEXT_PUBLIC_SITE_URL.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
      Could not connect YouTube. Please try again.
    </div>
  );
}

function SyncBanner({ code }: { code: string }) {
  const message = KNOWN_SYNC_ERROR_CODES.includes(code)
    ? requestErrorMessage(code)
    : "Import failed. Check the connection below and try syncing again.";
  return (
    <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
      {message}
    </div>
  );
}

function formatSyncTime(value: string | null): string {
  if (!value) return "never";
  const time = Date.parse(value);
  if (Number.isNaN(time)) return "never";
  return new Date(time).toLocaleString();
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const params = await searchParams;

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Your Sources</h1>
        <p className="mt-4 rounded-md border border-input bg-muted p-3 text-sm text-muted-foreground">
          Supabase is not configured. Copy .env.example to .env.local and set
          the Supabase variables.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=%2Fdashboard");
  }

  const { data: connectionData } = await supabase
    .from("platform_connections")
    .select("*")
    .eq("user_id", user.id)
  const connections = (connectionData ?? []) as PlatformConnectionRow[];
  const connection = connections.find((row) => row.platform === "youtube") ?? null;
  const facebookConnection = connections.find((row) => row.platform === "facebook") ?? null;

  const { data: sourcesData } = await supabase
    .from("sources")
    .select("*")
    .eq("user_id", user.id)
    .order("name");
  const sources = ((sourcesData ?? []) as SourceRow[]);

  const connected = connection?.status === "connected";
  const facebookConnected = facebookConnection?.status === "connected";

  const meta: EnrichmentMeta = { enrichments: {}, recommendations: {} };
  if (connected && sources.length > 0) {
    const sourceIds = sources.map((s) => s.id);
    const { data: enrichmentData } = await supabase
      .from("source_enrichments")
      .select("*")
      .in("source_id", sourceIds);
    for (const row of ((enrichmentData ?? []) as SourceEnrichmentRow[])) {
      const categoryName = categoryNameForSlug(row.category_slug);
      if (!categoryName) continue;
      meta.enrichments[row.source_id] = {
        categorySlug: row.category_slug,
        categoryName,
        subcategory: row.subcategory,
        topics: row.topics,
        description: row.description,
        confidence: row.confidence,
      };
    }
    const { data: recommendationData } = await supabase
      .from("source_recommendations")
      .select("source_id,verdict,reason,created_at")
      .in("source_id", sourceIds)
      .order("created_at", { ascending: false });
    for (const row of ((recommendationData ?? []) as Pick<
      SourceRecommendationRow,
      "source_id" | "verdict" | "reason" | "created_at"
    >[])) {
      if (!meta.recommendations[row.source_id]) {
        meta.recommendations[row.source_id] = {
          verdict: row.verdict,
          reason: row.reason,
        };
      }
    }
  }
  const summary = buildCleanupSummary(sources, meta);
  const aiConfigured = getAiConfig() !== null;

  return (
    <div>
      <AppNav />
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Your Sources</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              YouTube subscriptions and managed Facebook Pages, imported into one list.
            </p>
          </div>
          <Link
            href="/history"
            className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            View history
          </Link>
        </div>

        <div className="mt-6 flex flex-col gap-4">
          {params.oauth ? <OAuthBanner code={params.oauth} /> : null}
          {params.facebook_oauth === "denied" ? (
            <div className="rounded-md border border-input bg-muted p-3 text-sm">You declined Facebook access. Nothing was imported.</div>
          ) : params.facebook_oauth ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">Could not connect Facebook. Please try again.</div>
          ) : null}
          {params.sync ? <SyncBanner code={params.sync} /> : null}

          <section className="rounded-lg border border-border bg-card p-4">
            {connected ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">YouTube connected</p>
                  <p className="text-sm text-muted-foreground">
                    Last sync: {formatSyncTime(connection?.last_sync_at ?? null)}
                    {connection?.last_error
                      ? ` · ${requestErrorMessage(connection.last_error)}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <SyncButton />
                  <DisconnectButton />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">Connect YouTube to get started</p>
                  <p className="text-sm text-muted-foreground">
                    Read-only import plus permission to remove subscriptions you
                    choose later. Tokens stay on the server.
                  </p>
                </div>
                <a
                  href="/api/youtube/connect"
                  className={buttonVariants({})}
                >
                  Connect YouTube
                </a>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            {facebookConnected ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">Facebook connected</p>
                  <p className="text-sm text-muted-foreground">
                    Managed Pages only. Groups, followed Pages, and arbitrary public profiles are not supported by current Meta APIs.
                    {" "}Last sync: {formatSyncTime(facebookConnection?.last_sync_at ?? null)}
                  </p>
                </div>
                <div className="flex items-start gap-3"><SyncButton platform="facebook" /><DisconnectButton platform="facebook" /></div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-medium">Connect Facebook</p><p className="text-sm text-muted-foreground">Discover Pages you manage. Page removal is local-only.</p></div>
                <a href="/api/facebook/connect" className={buttonVariants({})}>Connect Facebook</a>
              </div>
            )}
          </section>

          {params.connected === "1" && connected ? <AutoSync /> : null}
          {params.facebook_connected === "1" && facebookConnected ? <AutoSync platform="facebook" /> : null}

          {connected || facebookConnected ? (
            <>
              <EnrichPanel summary={summary} aiConfigured={aiConfigured} />
              <SourcesExplorer sources={sources} meta={meta} />
            </>
          ) : null}

          {connected || sources.length > 0 ? (
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">Data & privacy</p>
                  <p className="text-sm text-muted-foreground">
                    Remove your imported sources, AI analysis, history, and
                    connection from this app.
                  </p>
                </div>
                <DeleteDataButton sourceCount={sources.length} />
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
