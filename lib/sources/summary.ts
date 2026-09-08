import type { SourceRow } from "@/lib/db/types";
import type { EnrichmentMeta } from "@/lib/sources/filter";

const STALE_AFTER_MS = 6 * 30 * 24 * 3600 * 1000;

export interface CleanupSummary {
  total: number;
  enriched: number;
  unenriched: number;
  keep: number;
  review: number;
  unsubscribe: number;
  /** Sources with no upload in 6+ months (where upload data exists). */
  stale: number;
}

/**
 * Builds the AI Cleanup summary. Pure given `now` (defaults to the
 * current time) so the dashboard stays a thin fetcher and this is
 * unit-testable.
 */
export function buildCleanupSummary(
  sources: SourceRow[],
  meta: EnrichmentMeta,
  now: number = Date.now(),
): CleanupSummary {
  const enriched = Object.keys(meta.enrichments).length;
  const summary: CleanupSummary = {
    total: sources.length,
    enriched,
    unenriched: sources.length - enriched,
    keep: 0,
    review: 0,
    unsubscribe: 0,
    stale: 0,
  };
  for (const verdict of Object.values(meta.recommendations)) {
    if (verdict.verdict === "KEEP") summary.keep += 1;
    else if (verdict.verdict === "REVIEW") summary.review += 1;
    else summary.unsubscribe += 1;
  }
  const cutoff = now - STALE_AFTER_MS;
  for (const source of sources) {
    if (!source.last_upload_at) continue;
    const time = Date.parse(source.last_upload_at);
    if (!Number.isNaN(time) && time < cutoff) summary.stale += 1;
  }
  return summary;
}
