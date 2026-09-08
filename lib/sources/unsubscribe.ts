import { z } from "zod";

/**
 * Bulk-unsubscribe orchestration (M2). Pure logic with injected side effects
 * so the workflow — including partial failure — is unit-testable.
 *
 * Ordering per item (never optimistic):
 *   1. external delete
 *   2. local status update (only after confirmed success)
 *   3. audit row
 * Unknown ids (not owned by the caller) are reported separately and never
 * written to the audit table, whose source_id FK requires a real row.
 */

export const MAX_BULK_UNSUBSCRIBE = 50;

export const UnsubscribeRequestSchema = z.object({
  sourceIds: z
    .array(z.string().uuid())
    .min(1)
    .max(MAX_BULK_UNSUBSCRIBE)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "sourceIds must be unique",
    }),
});

export type UnsubscribeRequest = z.infer<typeof UnsubscribeRequestSchema>;

export interface OwnedSource {
  id: string;
  name: string;
  platform: string;
  external_id: string;
  subscription_external_id: string | null;
  status: string;
}

export interface ExternalDeleteResult {
  /** True when YouTube reports the subscription already gone (404). */
  alreadyGone: boolean;
}

export interface ActionRecord {
  sourceId: string;
  actionType: "unsubscribe";
  success: boolean;
  externalStatus: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  snapshot: Record<string, unknown>;
}

export interface UnsubscribeDeps {
  loadOwnedSources(ids: string[]): Promise<OwnedSource[]>;
  createBatch(totalCount: number): Promise<string>;
  deleteExternal(subscriptionExternalId: string): Promise<ExternalDeleteResult>;
  markUnsubscribed(sourceId: string, at: string): Promise<void>;
  recordAction(action: ActionRecord): Promise<void>;
  finalizeBatch(
    batchId: string,
    patch: { successCount: number; failureCount: number; status: string },
  ): Promise<void>;
}

export interface BulkSuccess {
  sourceId: string;
  alreadyGone: boolean;
}

export interface BulkFailure {
  sourceId: string;
  name: string | null;
  errorCode: string;
  retryable: boolean;
}

export type BatchStatus = "completed" | "completed_with_failures" | "failed";

export interface BulkResult {
  batchId: string;
  totalCount: number;
  successCount: number;
  failureCount: number;
  status: BatchStatus;
  successes: BulkSuccess[];
  failures: BulkFailure[];
  /** Requested ids with no row owned by the caller. Not audited. */
  unknownSourceIds: string[];
}

export interface ExternalOpError {
  errorCode: string;
  retryable: boolean;
}

function failure(
  sourceId: string,
  name: string | null,
  errorCode: string,
  retryable: boolean,
): BulkFailure {
  return { sourceId, name, errorCode, retryable };
}

export async function executeBulkUnsubscribe(
  requestedIds: string[],
  deps: UnsubscribeDeps,
): Promise<BulkResult> {
  const uniqueIds = [...new Set(requestedIds)];
  const owned = await deps.loadOwnedSources(uniqueIds);
  const ownedById = new Map(owned.map((source) => [source.id, source]));

  const unknownSourceIds = uniqueIds.filter((id) => !ownedById.has(id));
  const targets = uniqueIds.flatMap((id) => {
    const source = ownedById.get(id);
    return source ? [source] : [];
  });

  const batchId = await deps.createBatch(targets.length);
  const successes: BulkSuccess[] = [];
  const failures: BulkFailure[] = [];
  const now = new Date().toISOString();

  for (const source of targets) {
    if (!source.subscription_external_id) {
      const record: ActionRecord = {
        sourceId: source.id,
        actionType: "unsubscribe",
        success: false,
        externalStatus: null,
        errorCode: "missing_subscription_id",
        errorMessage: "No YouTube subscription id stored; nothing was deleted.",
        snapshot: { name: source.name, external_id: source.external_id },
      };
      await deps.recordAction(record);
      failures.push(failure(source.id, source.name, "missing_subscription_id", false));
      continue;
    }

    let alreadyGone = false;
    try {
      alreadyGone = (await deps.deleteExternal(source.subscription_external_id)).alreadyGone;
    } catch (err) {
      const op = err as Partial<ExternalOpError>;
      const errorCode =
        typeof op.errorCode === "string" ? op.errorCode : "provider_error";
      const retryable = op.retryable === true;
      await deps.recordAction({
        sourceId: source.id,
        actionType: "unsubscribe",
        success: false,
        externalStatus: null,
        errorCode,
        errorMessage: `YouTube unsubscribe failed (${errorCode}). Nothing was removed locally.`,
        snapshot: {
          name: source.name,
          external_id: source.external_id,
          subscription_external_id: source.subscription_external_id,
        },
      });
      failures.push(failure(source.id, source.name, errorCode, retryable));
      continue;
    }

    try {
      await deps.markUnsubscribed(source.id, now);
    } catch {
      // The external delete succeeded; a retry resolves via the already-gone path.
      await deps.recordAction({
        sourceId: source.id,
        actionType: "unsubscribe",
        success: false,
        externalStatus: alreadyGone ? 404 : 200,
        errorCode: "local_update_failed",
        errorMessage:
          "YouTube removal succeeded but the local record could not be updated. Retrying is safe.",
        snapshot: {
          name: source.name,
          external_id: source.external_id,
          subscription_external_id: source.subscription_external_id,
          already_gone: alreadyGone,
        },
      });
      failures.push(failure(source.id, source.name, "local_update_failed", true));
      continue;
    }

    await deps.recordAction({
      sourceId: source.id,
      actionType: "unsubscribe",
      success: true,
      externalStatus: alreadyGone ? 404 : 200,
      errorCode: null,
      errorMessage: null,
      snapshot: {
        name: source.name,
        external_id: source.external_id,
        subscription_external_id: source.subscription_external_id,
        already_gone: alreadyGone,
      },
    });
    successes.push({ sourceId: source.id, alreadyGone });
  }

  const status: BatchStatus =
    failures.length === 0
      ? "completed"
      : successes.length === 0
        ? "failed"
        : "completed_with_failures";
  await deps.finalizeBatch(batchId, {
    successCount: successes.length,
    failureCount: failures.length,
    status,
  });

  return {
    batchId,
    totalCount: targets.length,
    successCount: successes.length,
    failureCount: failures.length,
    status,
    successes,
    failures,
    unknownSourceIds,
  };
}
