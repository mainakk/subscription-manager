"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { CleanupSummary } from "@/lib/sources/summary";

function enrichErrorMessage(code: string): string {
  switch (code) {
    case "ai_not_configured":
      return "AI is not configured on the server.";
    case "not_connected":
      return "YouTube is not connected.";
    case "reconnect_required":
      return "YouTube access expired. Disconnect and reconnect, then try again.";
    case "quota_exhausted":
      return "YouTube quota exhausted. Try again later.";
    default:
      return "Analysis failed. Try again.";
  }
}

interface EnrichResponse {
  succeeded: number;
  failed: number;
  remaining: number;
  error?: string;
}

/**
 * AI Cleanup summary + chunked enrichment runner (M3).
 * Processes 10 sources per request so long libraries never hit serverless
 * timeouts; loops client-side until `remaining` reaches 0.
 */
export function EnrichPanel({
  summary,
  aiConfigured,
}: {
  summary: CleanupSummary;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAll() {
    setRunning(true);
    setError(null);
    let done = 0;
    try {
      for (;;) {
        const res = await fetch("/api/sources/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 10 }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          setError(enrichErrorMessage(body?.error ?? "enrich_failed"));
          break;
        }
        const out = (await res.json()) as EnrichResponse;
        done += out.succeeded;
        setProgress({ done, total: Math.max(summary.unenriched, done) });
        if (out.remaining === 0) break;
      }
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">AI Cleanup</p>
          {summary.total === 0 ? (
            <p className="text-sm text-muted-foreground">
              Import sources first, then analyze them here.
            </p>
          ) : summary.enriched === 0 ? (
            <p className="text-sm text-muted-foreground">
              {summary.total} {summary.total === 1 ? "source" : "sources"} waiting
              for analysis.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Analyzed {summary.enriched} of {summary.total} · Keep{" "}
              {summary.keep} · Review {summary.review} · Unsubscribe{" "}
              {summary.unsubscribe}
              {summary.stale > 0 ? ` · ${summary.stale} stale` : ""}
            </p>
          )}
          {progress && running ? (
            <p className="mt-1 text-sm text-muted-foreground" role="status">
              Analyzed {progress.done} of {progress.total}…
            </p>
          ) : null}
          {error ? (
            <p className="mt-1 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        {summary.unenriched > 0 && aiConfigured && summary.total > 0 ? (
          <Button type="button" onClick={runAll} disabled={running}>
            {running ? "Analyzing…" : `Analyze ${summary.unenriched} sources`}
          </Button>
        ) : null}
      </div>
      {!aiConfigured && summary.total > 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          AI analysis needs an OpenAI-compatible key on the server
          (`OPENAI_API_KEY`, optional `OPENAI_BASE_URL` / `ENRICHMENT_MODEL`).
        </p>
      ) : null}
    </section>
  );
}
