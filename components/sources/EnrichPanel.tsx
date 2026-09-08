"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  enrichFailureMessage,
  requestErrorMessage,
} from "@/lib/error-messages";
import {
  shouldContinueEnrichment,
  type EnrichFailure,
} from "@/lib/sources/enrich";
import type { CleanupSummary } from "@/lib/sources/summary";

interface EnrichResponse {
  succeeded: number;
  failed: number;
  remaining: number;
  failures: EnrichFailure[];
  error?: string;
}

/**
 * AI Cleanup summary + chunked enrichment runner (M3).
 * Processes 10 sources per request so long libraries never hit serverless
 * timeouts; loops client-side until `remaining` reaches 0, with a circuit
 * breaker that halts on any chunk with zero successes (failed items
 * record nothing, so the same chunk would otherwise repeat forever).
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
  const [halted, setHalted] = useState(false);
  const [runFailures, setRunFailures] = useState<EnrichFailure[]>([]);

  async function runAll() {
    setRunning(true);
    setError(null);
    setHalted(false);
    setRunFailures([]);
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
          setError(requestErrorMessage(body?.error ?? "enrich_failed"));
          break;
        }
        const out = (await res.json()) as EnrichResponse;
        done += out.succeeded;
        setProgress({ done, total: Math.max(summary.unenriched, done) });
        setRunFailures((prev) => {
          const seen = new Set(prev.map((f) => f.sourceId));
          return [...prev, ...out.failures.filter((f) => !seen.has(f.sourceId))];
        });
        if (!shouldContinueEnrichment(out)) {
          if (out.remaining > 0) setHalted(true);
          break;
        }
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
      {!running && (halted || runFailures.length > 0) ? (
        <div className="mt-3 rounded-md border border-border p-3">
          {halted ? (
            <p className="text-sm font-medium" role="alert">
              Stopped — a full chunk made no progress, so the run was halted
              instead of repeating it. Nothing was recorded for these sources.
            </p>
          ) : (
            <p className="text-sm font-medium">
              Last run finished with {runFailures.length}{" "}
              {runFailures.length === 1 ? "failure" : "failures"}.
            </p>
          )}
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {runFailures.slice(0, 10).map((f) => (
              <li key={f.sourceId}>
                {f.name} — {enrichFailureMessage(f.errorCode)}
                {f.retryable ? " (retryable)" : ""}
              </li>
            ))}
            {runFailures.length > 10 ? (
              <li>…and {runFailures.length - 10} more.</li>
            ) : null}
          </ul>
          <Button type="button" variant="outline" onClick={runAll} className="mt-3">
            Retry remaining
          </Button>
        </div>
      ) : null}
      {!aiConfigured && summary.total > 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          AI analysis needs an OpenAI-compatible key on the server
          (`OPENAI_API_KEY`, optional `OPENAI_BASE_URL` / `ENRICHMENT_MODEL`).
        </p>
      ) : null}
    </section>
  );
}
