import type { SourceRow } from "@/lib/db/types";

/**
 * Client-side source filtering/sorting (M2; enriched in M3).
 * Runs over already-fetched rows; libraries of a few hundred items stay fast
 * without roundtrips.
 */

export type StatusFilter = "all" | SourceRow["status"];
export type PlatformFilter = "all" | SourceRow["platform"];
export type VerdictFilter = "all" | "KEEP" | "REVIEW" | "UNSUBSCRIBE" | "unanalyzed";
export type SourceSort = "name" | "newest" | "oldest" | "category" | "recommendation";

/** Serializable enrichment views passed from the server to client components. */
export interface EnrichmentView {
  categorySlug: string;
  categoryName: string;
  subcategory: string;
  topics: string[];
  description: string;
  confidence: number;
}

export interface RecommendationView {
  verdict: "KEEP" | "REVIEW" | "UNSUBSCRIBE";
  reason: string;
}

export interface EnrichmentMeta {
  enrichments: Record<string, EnrichmentView>;
  recommendations: Record<string, RecommendationView>;
}

export const EMPTY_META: EnrichmentMeta = { enrichments: {}, recommendations: {} };

export interface SourceFilters {
  query: string;
  status: StatusFilter;
  platform: PlatformFilter;
  category: string;
  verdict: VerdictFilter;
  sort: SourceSort;
}

export const DEFAULT_FILTERS: SourceFilters = {
  query: "",
  status: "all",
  platform: "all",
  category: "all",
  verdict: "all",
  sort: "name",
};

/** Multi-token AND search over name, descriptions, URL, and AI topics. */
export function filterSources(
  sources: SourceRow[],
  filters: Pick<SourceFilters, "query" | "status" | "platform" | "category" | "verdict">,
  meta: EnrichmentMeta = EMPTY_META,
): SourceRow[] {
  const tokens = filters.query.toLowerCase().split(/\s+/).filter(Boolean);
  return sources.filter((source) => {
    if (filters.status !== "all" && source.status !== filters.status) {
      return false;
    }
    if (filters.platform !== "all" && source.platform !== filters.platform) {
      return false;
    }
    const enrichment = meta.enrichments[source.id];
    if (filters.category !== "all" && enrichment?.categorySlug !== filters.category) {
      return false;
    }
    const verdict = meta.recommendations[source.id]?.verdict;
    if (filters.verdict === "unanalyzed" && verdict !== undefined) {
      return false;
    }
    if (
      filters.verdict !== "all" &&
      filters.verdict !== "unanalyzed" &&
      verdict !== filters.verdict
    ) {
      return false;
    }
    if (tokens.length === 0) return true;
    const haystack = [
      source.name,
      source.provider_description ?? "",
      source.url,
      enrichment?.subcategory ?? "",
      enrichment?.categorySlug ?? "",
      (enrichment?.topics ?? []).join(" "),
    ]
      .join(" ")
      .toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}

function subscribedTime(source: SourceRow): number | null {
  if (!source.subscribed_at) return null;
  const time = Date.parse(source.subscribed_at);
  return Number.isNaN(time) ? null : time;
}

/** Cleanup-first verdict order for the recommendation sort. */
const VERDICT_RANK: Record<string, number> = {
  UNSUBSCRIBE: 0,
  REVIEW: 1,
  KEEP: 2,
};

/** Sorts a copy. Unenriched/undated rows sort last in category/date orders. */
export function sortSources(
  sources: SourceRow[],
  sort: SourceSort,
  meta: EnrichmentMeta = EMPTY_META,
): SourceRow[] {
  const copy = [...sources];
  switch (sort) {
    case "name":
      copy.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "newest":
      copy.sort((a, b) => {
        const ta = subscribedTime(a);
        const tb = subscribedTime(b);
        if (ta === null && tb === null) return a.name.localeCompare(b.name);
        if (ta === null) return 1;
        if (tb === null) return -1;
        return tb - ta || a.name.localeCompare(b.name);
      });
      break;
    case "oldest":
      copy.sort((a, b) => {
        const ta = subscribedTime(a);
        const tb = subscribedTime(b);
        if (ta === null && tb === null) return a.name.localeCompare(b.name);
        if (ta === null) return 1;
        if (tb === null) return -1;
        return ta - tb || a.name.localeCompare(b.name);
      });
      break;
    case "category":
      copy.sort((a, b) => {
        const ca = meta.enrichments[a.id]?.categorySlug ?? "\uffff";
        const cb = meta.enrichments[b.id]?.categorySlug ?? "\uffff";
        return ca.localeCompare(cb) || a.name.localeCompare(b.name);
      });
      break;
    case "recommendation":
      copy.sort((a, b) => {
        const ra = meta.recommendations[a.id]?.verdict;
        const rb = meta.recommendations[b.id]?.verdict;
        const na = ra === undefined ? 3 : (VERDICT_RANK[ra] ?? 3);
        const nb = rb === undefined ? 3 : (VERDICT_RANK[rb] ?? 3);
        return na - nb || a.name.localeCompare(b.name);
      });
      break;
  }
  return copy;
}
