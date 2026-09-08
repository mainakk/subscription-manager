import Image from "next/image";

import type { SourceRow } from "@/lib/db/types";
import type {
  EnrichmentView,
  RecommendationView,
} from "@/lib/sources/filter";
import { cn } from "@/lib/utils";

export function statusLabel(status: SourceRow["status"]): string {
  switch (status) {
    case "active":
      return "Active";
    case "unsubscribed":
      return "Unsubscribed";
    case "unavailable_externally":
      return "Unavailable on YouTube";
  }
}

function formatCount(value: number | null, singular: string): string | null {
  if (value === null) return null;
  return `${value.toLocaleString()} ${singular}${value === 1 ? "" : "s"}`;
}

interface SourceCardProps {
  source: SourceRow;
  selected: boolean;
  onToggle: (id: string) => void;
  enrichment?: EnrichmentView | null;
  recommendation?: RecommendationView | null;
}

function verdictBadgeClass(verdict: RecommendationView["verdict"]): string {
  switch (verdict) {
    case "KEEP":
      return "bg-secondary text-secondary-foreground";
    case "REVIEW":
      return "border border-input text-muted-foreground";
    case "UNSUBSCRIBE":
      return "border border-destructive/50 text-destructive";
  }
}

/** Only active sources are selectable; others are display-only. */
export function SourceCard({
  source,
  selected,
  onToggle,
  enrichment,
  recommendation,
}: SourceCardProps) {
  const selectable = source.status === "active";
  const counts = [
    formatCount(source.subscriber_count, "subscriber"),
    formatCount(source.video_count, "video"),
  ].filter((c): c is string => c !== null);

  return (
    <li
      className={cn(
        "flex gap-3 rounded-lg border border-border bg-card p-4",
        selected && "border-primary ring-1 ring-primary",
      )}
    >
      <input
        type="checkbox"
        aria-label={`Select ${source.name}`}
        checked={selected}
        disabled={!selectable}
        onChange={() => onToggle(source.id)}
        className="mt-1 h-4 w-4 shrink-0 accent-primary disabled:opacity-30"
      />
      {source.image_url ? (
        <Image
          src={source.image_url}
          alt=""
          width={64}
          height={64}
          className="h-16 w-16 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div aria-hidden className="h-16 w-16 shrink-0 rounded-full bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="truncate font-medium">{source.name}</h2>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-xs",
              source.status === "active"
                ? "bg-secondary text-secondary-foreground"
                : "border border-input text-muted-foreground",
            )}
          >
            {statusLabel(source.status)}
          </span>
        </div>
        {enrichment ? (
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {enrichment.categoryName} · {enrichment.subcategory}
          </p>
        ) : null}
        {enrichment?.description ?? source.provider_description ? (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {enrichment?.description ?? source.provider_description}
          </p>
        ) : null}
        {enrichment && enrichment.topics.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {enrichment.topics.slice(0, 4).map((topic) => (
              <span
                key={topic}
                className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
              >
                {topic}
              </span>
            ))}
            {enrichment.topics.length > 4 ? (
              <span className="px-1 py-0.5 text-xs text-muted-foreground">
                +{enrichment.topics.length - 4} more
              </span>
            ) : null}
          </div>
        ) : null}
        {recommendation ? (
          <div className="mt-2 flex flex-col gap-1">
            <span
              className={cn(
                "w-fit shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                verdictBadgeClass(recommendation.verdict),
              )}
            >
              AI: {recommendation.verdict}
            </span>
            <p className="text-xs text-muted-foreground">{recommendation.reason}</p>
          </div>
        ) : null}
        {counts.length > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">{counts.join(" · ")}</p>
        ) : null}
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          Open on YouTube
        </a>
      </div>
    </li>
  );
}
