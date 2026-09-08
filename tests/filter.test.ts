import { describe, expect, it } from "vitest";

import type { SourceRow } from "@/lib/db/types";
import {
  DEFAULT_FILTERS,
  filterSources,
  sortSources,
  type EnrichmentMeta,
} from "@/lib/sources/filter";

function row(overrides: Partial<SourceRow> & { id: string; name: string }): SourceRow {
  return {
    user_id: "user-1",
    platform: "youtube",
    external_id: overrides.id,
    subscription_external_id: `sub-${overrides.id}`,
    url: `https://www.youtube.com/channel/${overrides.id}`,
    image_url: null,
    provider_description: null,
    status: "active",
    subscribed_at: null,
    unsubscribed_at: null,
    video_count: null,
    subscriber_count: null,
    last_upload_at: null,
    metadata: {},
    last_synced_at: null,
    ...overrides,
  } as SourceRow;
}

const sources = [
  row({
    id: "a",
    name: "Bourbon Moth Woodworking",
    provider_description: "Traditional joinery and furniture",
    subscribed_at: "2020-01-01T00:00:00.000Z",
  }),
  row({
    id: "b",
    name: "Example Cooking Channel",
    provider_description: "Home recipes",
    subscribed_at: "2022-06-01T00:00:00.000Z",
    status: "unsubscribed",
  }),
  row({
    id: "c",
    name: "Silent Tech",
    provider_description: null,
    subscribed_at: null,
  }),
];

describe("filterSources", () => {
  it("matches all query tokens across name and description", () => {
    const result = filterSources(sources, {
      ...DEFAULT_FILTERS,
      query: "woodworking joinery",
    });
    expect(result.map((s) => s.id)).toEqual(["a"]);
  });

  it("is case-insensitive and requires every token", () => {
    expect(
      filterSources(sources, { ...DEFAULT_FILTERS, query: "BOURBON" }).map((s) => s.id),
    ).toEqual(["a"]);
    expect(
      filterSources(sources, { ...DEFAULT_FILTERS, query: "woodworking recipes" }),
    ).toHaveLength(0);
  });

  it("filters by status and platform", () => {
    expect(
      filterSources(sources, { ...DEFAULT_FILTERS, status: "active" }).map((s) => s.id),
    ).toEqual(["a", "c"]);
    expect(
      filterSources(sources, { ...DEFAULT_FILTERS, status: "unsubscribed" }).map(
        (s) => s.id,
      ),
    ).toEqual(["b"]);
    expect(
      filterSources(sources, { ...DEFAULT_FILTERS, platform: "youtube" }),
    ).toHaveLength(3);
  });
});

describe("sortSources", () => {
  it("sorts by name", () => {
    expect(sortSources(sources, "name").map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts by subscription date with undated rows last", () => {
    expect(sortSources(sources, "newest").map((s) => s.id)).toEqual(["b", "a", "c"]);
    expect(sortSources(sources, "oldest").map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input", () => {
    const input = [...sources];
    sortSources(input, "newest");
    expect(input.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });
});

const meta: EnrichmentMeta = {
  enrichments: {
    a: {
      categorySlug: "woodworking",
      categoryName: "Woodworking",
      subcategory: "Furniture",
      topics: ["joinery", "hand tools"],
      description: "Builds furniture.",
      confidence: 0.9,
    },
    b: {
      categorySlug: "cooking",
      categoryName: "Cooking",
      subcategory: "Sourdough",
      topics: ["sourdough", "bread baking"],
      description: "Bakes bread.",
      confidence: 0.8,
    },
  },
  recommendations: {
    a: { verdict: "KEEP", reason: "Active." },
    b: { verdict: "UNSUBSCRIBE", reason: "Stale." },
  },
};

describe("enrichment-aware filtering", () => {
  it("searches topics, subcategories, and category slugs", () => {
    expect(
      filterSources(sources, { ...DEFAULT_FILTERS, query: "sourdough" }, meta).map(
        (s) => s.id,
      ),
    ).toEqual(["b"]);
    expect(
      filterSources(sources, { ...DEFAULT_FILTERS, query: "furniture joinery" }, meta).map(
        (s) => s.id,
      ),
    ).toEqual(["a"]);
  });

  it("filters by category slug", () => {
    expect(
      filterSources(sources, { ...DEFAULT_FILTERS, category: "cooking" }, meta).map(
        (s) => s.id,
      ),
    ).toEqual(["b"]);
  });

  it("filters by verdict and surfaces unanalyzed sources", () => {
    expect(
      filterSources(sources, { ...DEFAULT_FILTERS, verdict: "UNSUBSCRIBE" }, meta).map(
        (s) => s.id,
      ),
    ).toEqual(["b"]);
    expect(
      filterSources(sources, { ...DEFAULT_FILTERS, verdict: "unanalyzed" }, meta).map(
        (s) => s.id,
      ),
    ).toEqual(["c"]);
  });
});

describe("enrichment-aware sorting", () => {
  it("sorts by category with unenriched rows last", () => {
    expect(sortSources(sources, "category", meta).map((s) => s.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("sorts cleanup-first by verdict with unanalyzed rows last", () => {
    expect(sortSources(sources, "recommendation", meta).map((s) => s.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });
});
