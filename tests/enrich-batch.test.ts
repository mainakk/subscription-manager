import { describe, expect, it } from "vitest";

import type { EnrichInput, EnrichOutput } from "@/lib/ai/enrich";
import {
  computeTopicOverlap,
  runEnrichmentBatch,
  type EnrichDeps,
  type EnrichTarget,
} from "@/lib/sources/enrich";

const library = { total: 3, topCategories: [], peers: [] } as {
  total: number;
  topCategories: EnrichInput["topCategories"];
  peers: { sourceId: string; topics: string[] }[];
};

function target(overrides: Partial<EnrichTarget> & { sourceId: string }): EnrichTarget {
  return {
    name: `Channel ${overrides.sourceId}`,
    providerDescription: "A channel description.",
    subscriberCount: 1000,
    videoCount: 50,
    uploadsPlaylistId: `UU${overrides.sourceId}`,
    lastUploadAt: null,
    ...overrides,
  };
}

function output(overrides?: Partial<EnrichOutput>): EnrichOutput {
  return {
    enrichment: {
      category: "Woodworking",
      subcategory: "Furniture",
      topics: ["joinery", "hand tools"],
      description: "Builds furniture with hand tools.",
      confidence: 0.9,
    },
    recommendation: { verdict: "KEEP", reason: "Active and focused." },
    ...overrides,
  };
}

interface Saved {
  uploaded: { sourceId: string; iso: string }[];
}

function makeDeps(saved: Saved, behavior?: {
  uploadsError?: { code: string; retryable: boolean };
  llmError?: { code: string; retryable: boolean };
  failSave?: boolean;
}): EnrichDeps {
  return {
    fetchUploads: async () => {
      if (behavior?.uploadsError) throw behavior.uploadsError;
      return {
        latestUploadAt: "2026-08-01T00:00:00.000Z",
        recentTitles: ["Build"],
      };
    },
    callLlm: async () => {
      if (behavior?.llmError) throw behavior.llmError;
      return output();
    },
    updateLastUpload: async (sourceId, iso) => {
      saved.uploaded.push({ sourceId, iso });
    },
    saveResult: async () => {
      if (behavior?.failSave) throw new Error("db down");
    },
  };
}

describe("computeTopicOverlap", () => {
  it("finds shared topics excluding self, with capped id lists", () => {
    const peers = [
      { sourceId: "p1", topics: ["Joinery", "hand tools"] },
      { sourceId: "p2", topics: ["joinery", "sourdough"] },
      { sourceId: "self", topics: ["joinery"] },
    ];
    const overlap = computeTopicOverlap(["joinery", "hand tools", "unique"], peers, "self", 1);
    expect(overlap).toEqual([
      { topic: "joinery", withCount: 2, withSourceIds: ["p1"] },
      { topic: "hand tools", withCount: 1, withSourceIds: ["p1"] },
    ]);
  });

  it("returns empty when nothing is shared", () => {
    expect(
      computeTopicOverlap(["a"], [{ sourceId: "p", topics: ["b"] }], "self"),
    ).toEqual([]);
  });
});

describe("runEnrichmentBatch", () => {
  it("enriches targets, refreshes upload dates, and stores overlap signals", async () => {
    const saved: Saved = { uploaded: [] };
    const result = await runEnrichmentBatch(
      [target({ sourceId: "s1" }), target({ sourceId: "s2" })],
      {
        ...library,
        peers: [{ sourceId: "old", topics: ["joinery", "unrelated"] }],
      },
      makeDeps(saved),
      "test-model",
      "v9",
      2,
    );
    expect(result).toMatchObject({ processed: 2, succeeded: 2, failed: 0 });
    expect(result.saves).toHaveLength(2);
    expect(result.saves[0].save).toMatchObject({
      categorySlug: "woodworking",
      model: "test-model",
      promptVersion: "v9",
    });
    expect(result.saves[0].save.signals).toMatchObject({
      lastUploadAt: "2026-08-01T00:00:00.000Z",
      overlap: [
        { topic: "joinery", withCount: 2 },
        { topic: "hand tools", withCount: 1 },
      ],
    });
    expect(saved.uploaded.map((u) => u.sourceId).sort()).toEqual(["s1", "s2"]);
  });

  it("isolates upload failures without failing the batch", async () => {
    const saved: Saved = { uploaded: [] };
    const deps = makeDeps(saved);
    const failing: EnrichDeps = {
      ...deps,
      fetchUploads: async (id) => {
        if (id === "UUs1") throw { code: "quota_exhausted", retryable: false };
        return deps.fetchUploads(id);
      },
    };
    const result = await runEnrichmentBatch(
      [target({ sourceId: "s1" }), target({ sourceId: "s2" })],
      library,
      failing,
      "m",
      "v",
      2,
    );
    expect(result).toMatchObject({ processed: 2, succeeded: 1, failed: 1 });
    expect(result.failures[0]).toMatchObject({
      sourceId: "s1",
      errorCode: "uploads_failed:quota_exhausted",
      retryable: false,
    });
  });

  it("records LLM failures without saving", async () => {
    const saved: Saved = { uploaded: [] };
    const result = await runEnrichmentBatch(
      [target({ sourceId: "s1" })],
      library,
      makeDeps(saved, { llmError: { code: "llm_invalid_output", retryable: true } }),
      "m",
      "v",
    );
    expect(result).toMatchObject({ processed: 1, succeeded: 0, failed: 1 });
    expect(result.saves).toHaveLength(0);
    expect(result.failures[0]).toMatchObject({
      errorCode: "llm_invalid_output",
      retryable: true,
    });
  });

  it("skips the uploads lookup when no playlist id is stored", async () => {
    const saved: Saved = { uploaded: [] };
    let uploadsCalled = 0;
    const deps = makeDeps(saved);
    const result = await runEnrichmentBatch(
      [target({ sourceId: "s1", uploadsPlaylistId: null, lastUploadAt: "2026-01-01T00:00:00.000Z" })],
      library,
      {
        ...deps,
        fetchUploads: async (...args) => {
          uploadsCalled += 1;
          return deps.fetchUploads(...args);
        },
      },
      "m",
      "v",
    );
    expect(uploadsCalled).toBe(0);
    expect(result.succeeded).toBe(1);
    expect(result.saves[0].save.signals).toMatchObject({
      lastUploadAt: "2026-01-01T00:00:00.000Z",
    });
  });
});
