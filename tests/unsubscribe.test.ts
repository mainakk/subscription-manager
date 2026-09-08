import { describe, expect, it } from "vitest";

import { getAdapter } from "@/lib/platforms/registry";
import "@/lib/platforms/youtube";
import {
  MAX_BULK_UNSUBSCRIBE,
  UnsubscribeRequestSchema,
  executeBulkUnsubscribe,
  type ActionRecord,
  type OwnedSource,
  type UnsubscribeDeps,
} from "@/lib/sources/unsubscribe";

function owned(overrides: Partial<OwnedSource> & { id: string }): OwnedSource {
  return {
    name: `Channel ${overrides.id}`,
    platform: "youtube",
    external_id: `UC${overrides.id}`,
    subscription_external_id: `sub-${overrides.id}`,
    status: "active",
    ...overrides,
  };
}

interface FakeDb {
  actions: ActionRecord[];
  marked: { sourceId: string; at: string }[];
  batches: { id: string; total: number; patch?: { successCount: number; failureCount: number; status: string } }[];
}

function makeDeps(
  db: FakeDb,
  rows: OwnedSource[],
  behavior: (subId: string) => { alreadyGone: boolean } | { errorCode: string; retryable: boolean } = () => ({
    alreadyGone: false,
  }),
): UnsubscribeDeps {
  return {
    loadOwnedSources: async (ids) => rows.filter((r) => ids.includes(r.id)),
    createBatch: async (total) => {
      db.batches.push({ id: "batch-1", total });
      return "batch-1";
    },
    deleteExternal: async (subId) => {
      const outcome = behavior(subId);
      if ("errorCode" in outcome) {
        throw outcome;
      }
      return outcome;
    },
    markUnsubscribed: async (sourceId, at) => {
      db.marked.push({ sourceId, at });
    },
    recordAction: async (action) => {
      db.actions.push(action);
    },
    finalizeBatch: async (batchId, patch) => {
      const batch = db.batches.find((b) => b.id === batchId);
      if (batch) batch.patch = patch;
    },
  };
}

describe("UnsubscribeRequestSchema", () => {
  it("accepts 1..50 unique uuids", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(UnsubscribeRequestSchema.safeParse({ sourceIds: [id] }).success).toBe(true);
    expect(UnsubscribeRequestSchema.safeParse({ sourceIds: [] }).success).toBe(false);
    expect(UnsubscribeRequestSchema.safeParse({ sourceIds: [id, id] }).success).toBe(false);
    expect(UnsubscribeRequestSchema.safeParse({ sourceIds: ["nope"] }).success).toBe(false);
    expect(
      UnsubscribeRequestSchema.safeParse({ sourceIds: Array(MAX_BULK_UNSUBSCRIBE + 1).fill(id) })
        .success,
    ).toBe(false);
  });
});

describe("executeBulkUnsubscribe", () => {
  it("unsubscribes all, audits each, completes the batch", async () => {
    const db: FakeDb = { actions: [], marked: [], batches: [] };
    const result = await executeBulkUnsubscribe(
      ["s1", "s2"],
      makeDeps(db, [owned({ id: "s1" }), owned({ id: "s2" })]),
    );
    expect(result).toMatchObject({
      batchId: "batch-1",
      totalCount: 2,
      successCount: 2,
      failureCount: 0,
      status: "completed",
    });
    expect(result.unknownSourceIds).toEqual([]);
    expect(db.marked.map((m) => m.sourceId).sort()).toEqual(["s1", "s2"]);
    expect(db.actions).toHaveLength(2);
    expect(db.actions.every((a) => a.success)).toBe(true);
    expect(db.batches[0]).toMatchObject({
      total: 2,
      patch: { successCount: 2, failureCount: 0, status: "completed" },
    });
  });

  it("reports partial failure honestly and never touches failed rows locally", async () => {
    const db: FakeDb = { actions: [], marked: [], batches: [] };
    const result = await executeBulkUnsubscribe(
      ["s1", "s2", "s3"],
      makeDeps(db, [owned({ id: "s1" }), owned({ id: "s2" }), owned({ id: "s3" })], (subId) =>
        subId === "sub-s2"
          ? { errorCode: "quota_exhausted", retryable: false }
          : { alreadyGone: false },
      ),
    );
    expect(result).toMatchObject({
      totalCount: 3,
      successCount: 2,
      failureCount: 1,
      status: "completed_with_failures",
    });
    expect(result.failures).toEqual([
      { sourceId: "s2", name: "Channel s2", errorCode: "quota_exhausted", retryable: false },
    ]);
    // Failed row: audited as failed, local record untouched.
    expect(db.marked.map((m) => m.sourceId).sort()).toEqual(["s1", "s3"]);
    const failedAction = db.actions.find((a) => a.sourceId === "s2");
    expect(failedAction?.success).toBe(false);
  });

  it("counts already-gone subscriptions as success with a note", async () => {
    const db: FakeDb = { actions: [], marked: [], batches: [] };
    const result = await executeBulkUnsubscribe(
      ["s1"],
      makeDeps(db, [owned({ id: "s1" })], () => ({ alreadyGone: true })),
    );
    expect(result.successes).toEqual([{ sourceId: "s1", alreadyGone: true }]);
    expect(db.marked).toHaveLength(1);
    expect(db.actions[0]).toMatchObject({
      success: true,
      externalStatus: 404,
      snapshot: expect.objectContaining({ already_gone: true }),
    });
  });

  it("fails items without a stored subscription id and marks all-failed batches failed", async () => {
    const db: FakeDb = { actions: [], marked: [], batches: [] };
    const result = await executeBulkUnsubscribe(
      ["s1"],
      makeDeps(db, [owned({ id: "s1", subscription_external_id: null })]),
    );
    expect(result).toMatchObject({ successCount: 0, failureCount: 1, status: "failed" });
    expect(result.failures[0].errorCode).toBe("missing_subscription_id");
    expect(db.marked).toHaveLength(0);
  });

  it("reports unknown ids separately without auditing them", async () => {
    const db: FakeDb = { actions: [], marked: [], batches: [] };
    const result = await executeBulkUnsubscribe(
      ["s1", "ghost"],
      makeDeps(db, [owned({ id: "s1" })]),
    );
    expect(result.unknownSourceIds).toEqual(["ghost"]);
    expect(result.totalCount).toBe(1);
    expect(db.actions.every((a) => a.sourceId !== "ghost")).toBe(true);
  });
});

describe("YouTube adapter registration", () => {
  it("exposes read + unsubscribe capabilities", () => {
    const adapter = getAdapter("youtube");
    expect(adapter.platform).toBe("youtube");
    expect(adapter.capabilities).toMatchObject({
      readSources: true,
      unsubscribe: true,
    });
  });
});
