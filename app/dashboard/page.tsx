import Link from "next/link";
import { redirect } from "next/navigation";

import { AutoSync } from "@/components/connection/AutoSync";
import { DisconnectButton } from "@/components/connection/DisconnectButton";
import { SyncButton } from "@/components/connection/SyncButton";
import { AppNav } from "@/components/layout/AppNav";
import { SourcesExplorer } from "@/components/sources/SourcesExplorer";
import { buttonVariants } from "@/components/ui/button";
import type { PlatformConnectionRow, SourceRow } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

interface DashboardSearchParams {
  connected?: string;
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
    .eq("platform", "youtube")
    .limit(1);
  const connection = ((connectionData?.[0] ?? null) as PlatformConnectionRow | null);

  const { data: sourcesData } = await supabase
    .from("sources")
    .select("*")
    .eq("user_id", user.id)
    .eq("platform", "youtube")
    .order("name");
  const sources = ((sourcesData ?? []) as SourceRow[]);

  const connected = connection?.status === "connected";

  return (
    <div>
      <AppNav />
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Your Sources</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              YouTube subscriptions, imported into one list.
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
          {params.sync === "error" ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
              Import failed. Check the connection below and try syncing again.
            </div>
          ) : null}

          <section className="rounded-lg border border-border bg-card p-4">
            {connected ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">YouTube connected</p>
                  <p className="text-sm text-muted-foreground">
                    Last sync: {formatSyncTime(connection?.last_sync_at ?? null)}
                    {connection?.last_error
                      ? ` · last error: ${connection.last_error}`
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

          {params.connected === "1" && connected ? <AutoSync /> : null}

          {connected ? <SourcesExplorer sources={sources} /> : null}
        </div>
      </div>
    </div>
  );
}
