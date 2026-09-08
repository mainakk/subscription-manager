import type { SourceRow } from "@/lib/db/types";

/**
 * Client-side source filtering/sorting (M2).
 * Runs over already-fetched rows; libraries of a few hundred items stay fast
 * without roundtrips. Category/recommendation filters arrive with M3 data.
 */

export type StatusFilter = "all" | SourceRow["status"];
export type PlatformFilter = "all" | SourceRow["platform"];
export type SourceSort = "name" | "newest" | "oldest";

export interface SourceFilters {
  query: string;
  status: StatusFilter;
  platform: PlatformFilter;
  sort: SourceSort;
}

export const DEFAULT_FILTERS: SourceFilters = {
  query: "",
  status: "all",
  platform: "all",
  sort: "name",
};

/** Multi-token AND search over name, description, and URL. */
export function filterSources(
  sources: SourceRow[],
  filters: Pick<SourceFilters, "query" | "status" | "platform">,
): SourceRow[] {
  const tokens = filters.query.toLowerCase().split(/\s+/).filter(Boolean);
  return sources.filter((source) => {
    if (filters.status !== "all" && source.status !== filters.status) {
      return false;
    }
    if (filters.platform !== "all" && source.platform !== filters.platform) {
      return false;
    }
    if (tokens.length === 0) return true;
    const haystack =
      `${source.name} ${source.provider_description ?? ""} ${source.url}`.toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}

function subscribedTime(source: SourceRow): number | null {
  if (!source.subscribed_at) return null;
  const time = Date.parse(source.subscribed_at);
  return Number.isNaN(time) ? null : time;
}

/** Sorts a copy. Rows without a date sort last in both date orders. */
export function sortSources(sources: SourceRow[], sort: SourceSort): SourceRow[] {
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
  }
  return copy;
}
