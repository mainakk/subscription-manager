import { z } from "zod";

import { categorySlug } from "@/lib/categories";
import type { EnrichInput, EnrichOutput } from "@/lib/ai/enrich";

/**
 * Chunked enrichment orchestration (M3). Pure logic with injected side
 * effects so batching, failure handling, and overlap signals are
 * unit-testable. The route wires deps to Supabase + YouTube + the LLM.
 *
 * Single-pass design: each source costs one uploads lookup (1 YouTube
 * quota unit) + one LLM call. Topic overlap with already-enriched peers
 * is computed in code after the fact and stored in recommendation
 * signals — the verdict itself must not claim overlap it never saw.
 */

export const DEFAULT_ENRICH_LIMIT = 10;
export const MAX_ENRICH_LIMIT = 25;
export const ENRICH_CONCURRENCY = 3;

export const EnrichRequestSchema = z.object({
  limit: z.number().int().min(1).max(MAX_ENRICH_LIMIT).default(DEFAULT_ENRICH_LIMIT),
  force: z.boolean().default(false),
});

export type EnrichRequest = z.infer<typeof EnrichRequestSchema>;

export interface EnrichTarget {
  sourceId: string;
  name: string;
  providerDescription: string | null;
  subscriberCount: number | null;
  videoCount: number | null;
  /** Uploads playlist id from sync metadata; null skips recency lookup. */
  uploadsPlaylistId: string | null;
  lastUploadAt: string | null;
}

export interface RecentUploadEvidence {
  latestUploadAt: string | null;
  recentTitles: string[];
}

export interface EnrichSave {
  categorySlug: string;
  subcategory: string;
  topics: string[];
  description: string;
  confidence: number;
  verdict: EnrichOutput["recommendation"]["verdict"];
  reason: string;
  signals: Record<string, unknown>;
  model: string;
  promptVersion: string;
}

export interface EnrichDeps {
  fetchUploads(uploadsPlaylistId: string): Promise<RecentUploadEvidence>;
  callLlm(input: EnrichInput): Promise<EnrichOutput>;
  updateLastUpload(sourceId: string, iso: string): Promise<void>;
  saveResult(sourceId: string, save: EnrichSave): Promise<void>;
}

export interface EnrichFailure {
  sourceId: string;
  name: string;
  errorCode: string;
  retryable: boolean;
}

export interface PeerTopics {
  sourceId: string;
  topics: string[];
}

export interface OverlapEntry {
  topic: string;
  withCount: number;
  withSourceIds: string[];
}

/**
 * Topics of `topics` shared with peers (excluding self). Pure.
 * `withSourceIds` is capped; `withCount` always reflects the true total.
 */
export function computeTopicOverlap(
  topics: string[],
  peers: PeerTopics[],
  selfId: string,
  maxIds = 5,
): OverlapEntry[] {
  const normalized = [...new Set(topics.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  const out: OverlapEntry[] = [];
  for (const topic of normalized) {
    const withIds = peers
      .filter((p) => p.sourceId !== selfId)
      .filter((p) =>
        p.topics.some((t) => t.trim().toLowerCase() === topic),
      )
      .map((p) => p.sourceId);
    if (withIds.length > 0) {
      out.push({
        topic,
        withCount: withIds.length,
        withSourceIds: withIds.slice(0, maxIds),
      });
    }
  }
  return out;
}

interface PendingResult {
  target: EnrichTarget;
  output: EnrichOutput;
  evidence: RecentUploadEvidence;
}

function errorCodeOf(err: unknown): { errorCode: string; retryable: boolean } {
  if (err !== null && typeof err === "object") {
    const record = err as Record<string, unknown>;
    if (typeof record.code === "string") {
      const retryable = record.retryable === true;
      return { errorCode: String(record.code), retryable };
    }
  }
  return { errorCode: "enrich_failed", retryable: true };
}

export interface EnrichBatchResult {
  processed: number;
  succeeded: number;
  failed: number;
  failures: EnrichFailure[];
  saves: { sourceId: string; save: EnrichSave }[];
}

/**
 * Enriches `targets` with bounded concurrency. Upload evidence refreshes
 * `last_upload_at` best-effort (a failed lookup fails that source, not the
 * batch). Returns validated saves for the caller to persist — or persist
 * via deps.saveResult first? No: persistence stays in deps (see below).
 */
export async function runEnrichmentBatch(
  targets: EnrichTarget[],
  library: { total: number; topCategories: EnrichInput["topCategories"]; peers: PeerTopics[] },
  deps: EnrichDeps,
  model: string,
  promptVersion: string,
  concurrency: number = ENRICH_CONCURRENCY,
): Promise<EnrichBatchResult> {
  const pending: PendingResult[] = [];
  const failures: EnrichFailure[] = [];
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= targets.length) return;
      const target = targets[index];
      try {
        let evidence: RecentUploadEvidence = { latestUploadAt: null, recentTitles: [] };
        if (target.uploadsPlaylistId) {
          try {
            evidence = await deps.fetchUploads(target.uploadsPlaylistId);
          } catch (err) {
            const { errorCode, retryable } = errorCodeOf(err);
            failures.push({
              sourceId: target.sourceId,
              name: target.name,
              errorCode: `uploads_failed:${errorCode}`,
              retryable,
            });
            continue;
          }
          if (evidence.latestUploadAt) {
            try {
              await deps.updateLastUpload(target.sourceId, evidence.latestUploadAt);
            } catch {
              // Best effort; enrichment proceeds with in-memory evidence.
            }
          }
        }
        const output = await deps.callLlm({
          name: target.name,
          providerDescription: target.providerDescription,
          subscriberCount: target.subscriberCount,
          videoCount: target.videoCount,
          lastUploadAt: evidence.latestUploadAt ?? target.lastUploadAt,
          recentVideoTitles: evidence.recentTitles,
          libraryTotal: library.total,
          topCategories: library.topCategories,
        });
        pending.push({ target, output, evidence });
      } catch (err) {
        const { errorCode, retryable } = errorCodeOf(err);
        failures.push({
          sourceId: target.sourceId,
          name: target.name,
          errorCode,
          retryable,
        });
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(Math.max(concurrency, 1), targets.length) },
    () => worker(),
  );
  await Promise.all(workers);

  // Overlap post-pass: batch results join the known peers.
  const allPeers: PeerTopics[] = [
    ...library.peers,
    ...pending.map((p) => ({ sourceId: p.target.sourceId, topics: p.output.enrichment.topics })),
  ];
  const saves = pending.map(({ target, output, evidence }) => {
    const overlap = computeTopicOverlap(
      output.enrichment.topics,
      allPeers,
      target.sourceId,
    );
    return {
      sourceId: target.sourceId,
      save: {
        categorySlug: categorySlug(output.enrichment.category),
        subcategory: output.enrichment.subcategory,
        topics: output.enrichment.topics,
        description: output.enrichment.description,
        confidence: output.enrichment.confidence,
        verdict: output.recommendation.verdict,
        reason: output.recommendation.reason,
        signals: {
          lastUploadAt: evidence.latestUploadAt ?? target.lastUploadAt,
          videoCount: target.videoCount,
          subscriberCount: target.subscriberCount,
          recentVideoCount: evidence.recentTitles.length,
          overlap,
        },
        model,
        promptVersion,
      } satisfies EnrichSave,
    };
  });

  for (const { sourceId, save } of saves) {
    try {
      await deps.saveResult(sourceId, save);
    } catch {
      failures.push({
        sourceId,
        name: targets.find((t) => t.sourceId === sourceId)?.name ?? sourceId,
        errorCode: "db_failed",
        retryable: true,
      });
    }
  }

  const savedIds = new Set(
    saves
      .filter((s) => !failures.some((f) => f.sourceId === s.sourceId && f.errorCode === "db_failed"))
      .map((s) => s.sourceId),
  );
  return {
    processed: targets.length,
    succeeded: savedIds.size,
    failed: failures.length,
    failures,
    saves: saves.filter((s) => savedIds.has(s.sourceId)),
  };
}

export interface EnrichChunkOutcome {
  succeeded: number;
  failed: number;
  remaining: number;
}

/**
 * Dashboard loop policy (circuit breaker). The client requests chunk
 * after chunk; it must stop when done AND when a chunk makes no
 * progress — failed items record nothing, so without this check the
 * same failing chunk repeats forever.
 */
export function shouldContinueEnrichment(outcome: EnrichChunkOutcome): boolean {
  if (outcome.remaining === 0) return false;
  if (outcome.succeeded === 0) return false;
  return true;
}
