import { describe, expect, it } from "vitest";

import type { SourceRow } from "@/lib/db/types";
import type { EnrichmentMeta } from "@/lib/sources/filter";
import { buildCleanupSummary } from "@/lib/sources/summary";

const NOW = new Date("2026-09-08T00:00:00.000Z").getTime();
const MONTH = 30 * 24 * 3600 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

function row(id: string, last_upload_at: string | null): SourceRow {
  return {
    id,
    name: id,
    user_id: "u",
    platform: "youtube",
    external_id: id,
    subscription_external_id: id,
    url: "https://example.test",
    image_url: null,
    provider_description: null,
    status: "active",
    subscribed_at: null,
    unsubscribed_at: null,
    video_count: null,
    subscriber_count: null,
    last_upload_at,
    metadata: {},
    last_synced_at: null,
  };
}

describe("buildCleanupSummary", () => {
  it("counts verdicts and flags uploads older than 6 months", () => {
    const sources = [
      row("a", iso(NOW - MONTH)),
      row("b", iso(NOW - 7 * MONTH)),
      row("c", null),
    ];
    const meta: EnrichmentMeta = {
      enrichments: {
        a: {
          categorySlug: "woodworking",
          categoryName: "Woodworking",
          subcategory: "Furniture",
          topics: [],
          description: "x",
          confidence: 1,
        },
        b: {
          categorySlug: "cooking",
          categoryName: "Cooking",
          subcategory: "S",
          topics: [],
          description: "y",
          confidence: 1,
        },
      },
      recommendations: {
        a: { verdict: "KEEP", reason: "ok" },
        b: { verdict: "UNSUBSCRIBE", reason: "stale" },
      },
    };
    expect(buildCleanupSummary(sources, meta, NOW)).toEqual({
      total: 3,
      enriched: 2,
      unenriched: 1,
      keep: 1,
      review: 0,
      unsubscribe: 1,
      stale: 1,
    });
  });

  it("handles an empty library", () => {
    expect(
      buildCleanupSummary([], { enrichments: {}, recommendations: {} }, NOW),
    ).toEqual({
      total: 0,
      enriched: 0,
      unenriched: 0,
      keep: 0,
      review: 0,
      unsubscribe: 0,
      stale: 0,
    });
  });
});
