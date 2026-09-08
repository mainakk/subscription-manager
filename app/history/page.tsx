import Link from "next/link";
import { redirect } from "next/navigation";

import { AppNav } from "@/components/layout/AppNav";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

interface HistorySearchParams {
  batch?: string;
}

interface BatchRow {
  id: string;
  type: string;
  platform: string;
  total_count: number;
  success_count: number;
  failure_count: number;
  status: string;
  created_at: string;
}

interface ActionRow {
  id: string;
  source_id: string;
  action_type: string;
  success: boolean;
  external_status: number | null;
  error_code: string | null;
  created_at: string;
  snapshot: { name?: unknown };
}

function batchStatusLabel(status: string): string {
  switch (status) {
    case "completed":
      return "Completed";
    case "completed_with_failures":
      return "Partial";
    case "failed":
      return "Failed";
    case "pending":
      return "In progress";
    default:
      return status;
  }
}

function formatTime(value: string): string {
  const time = Date.parse(value);
  return Number.isNaN(time) ? value : new Date(time).toLocaleString();
}

function actionName(action: ActionRow, names: Map<string, string>): string {
  const fromSource = names.get(action.source_id);
  if (fromSource) return fromSource;
  const fromSnapshot =
    typeof action.snapshot?.name === "string" ? action.snapshot.name : null;
  return fromSnapshot ?? action.source_id;
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<HistorySearchParams>;
}) {
  const params = await searchParams;

  if (!isSupabaseConfigured()) {
    redirect("/login?next=%2Fhistory");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=%2Fhistory");
  }

  const { data: batchData } = await supabase
    .from("user_action_batches")
    .select(
      "id,type,platform,total_count,success_count,failure_count,status,created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const batches = ((batchData ?? []) as BatchRow[]);

  const selectedBatch = params.batch
    ? (batches.find((b) => b.id === params.batch) ?? null)
    : null;

  let actions: ActionRow[] = [];
  let names = new Map<string, string>();
  if (selectedBatch) {
    const { data: actionData } = await supabase
      .from("user_actions")
      .select(
        "id,source_id,action_type,success,external_status,error_code,created_at,snapshot",
      )
      .eq("user_id", user.id)
      .eq("batch_id", selectedBatch.id)
      .order("created_at");
    actions = ((actionData ?? []) as ActionRow[]);
    const sourceIds = [...new Set(actions.map((a) => a.source_id))];
    if (sourceIds.length > 0) {
      const { data: sourceData } = await supabase
        .from("sources")
        .select("id,name")
        .eq("user_id", user.id)
        .in("id", sourceIds);
      names = new Map(
        (((sourceData ?? []) as { id: string; name: string }[]).map((s) => [
          s.id,
          s.name,
        ])),
      );
    }
  }

  return (
    <div>
      <AppNav />
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Action history</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every bulk unsubscribe, with per-item outcomes.
        </p>

        {selectedBatch ? (
          <div className="mt-6 flex flex-col gap-4">
            <Link
              href="/history"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              ← All batches
            </Link>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="font-medium">
                {batchStatusLabel(selectedBatch.status)} ·{" "}
                {selectedBatch.success_count} succeeded,{" "}
                {selectedBatch.failure_count} failed
              </p>
              <p className="text-sm text-muted-foreground">
                {formatTime(selectedBatch.created_at)} · {selectedBatch.platform}
              </p>
            </div>
            {actions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No items recorded for this batch.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {actions.map((action) => (
                  <li
                    key={action.id}
                    className="flex flex-wrap items-center gap-x-3 rounded-md border border-border p-3 text-sm"
                  >
                    <span className="font-medium">
                      {actionName(action, names)}
                    </span>
                    <span
                      className={
                        action.success
                          ? "text-green-700 dark:text-green-400"
                          : "text-destructive"
                      }
                    >
                      {action.success ? "Removed" : "Failed"}
                    </span>
                    {action.error_code ? (
                      <span className="text-muted-foreground">
                        {action.error_code}
                      </span>
                    ) : null}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatTime(action.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-2">
            {batches.length === 0 ? (
              <div className="rounded-md border border-dashed border-input p-8 text-center">
                <p className="font-medium">No actions yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Bulk unsubscribes from the dashboard will appear here.
                </p>
              </div>
            ) : (
              batches.map((batch) => (
                <Link
                  key={batch.id}
                  href={`/history?batch=${batch.id}`}
                  className="flex flex-wrap items-center gap-x-3 rounded-md border border-border p-3 text-sm hover:bg-accent"
                >
                  <span className="font-medium">
                    {batchStatusLabel(batch.status)}
                  </span>
                  <span className="text-muted-foreground">
                    {batch.success_count} succeeded, {batch.failure_count} failed
                    of {batch.total_count}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatTime(batch.created_at)}
                  </span>
                </Link>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
