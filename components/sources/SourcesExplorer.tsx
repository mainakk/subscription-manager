"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { BulkBar } from "@/components/sources/BulkBar";
import { FilterBar } from "@/components/sources/FilterBar";
import { SourceCard } from "@/components/sources/SourceCard";
import { UnsubscribeDialog } from "@/components/sources/UnsubscribeDialog";
import { UnsubscribeResult } from "@/components/sources/UnsubscribeResult";
import type { SourceRow } from "@/lib/db/types";
import {
  DEFAULT_FILTERS,
  EMPTY_META,
  filterSources,
  sortSources,
  type EnrichmentMeta,
  type SourceFilters,
} from "@/lib/sources/filter";
import type { BulkResult } from "@/lib/sources/unsubscribe";

function requestErrorMessage(code: string): string {
  switch (code) {
    case "not_connected":
      return "YouTube is not connected.";
    case "reconnect_required":
      return "YouTube access expired. Disconnect and reconnect, then try again.";
    case "invalid_request":
      return "Too many items selected at once (max 50). Select fewer and retry.";
    default:
      return "Unsubscribe failed before starting. Try again.";
  }
}

/** Search/filter/sort + multi-select + bulk unsubscribe (M2; enriched in M3). */
export function SourcesExplorer({
  sources,
  meta = EMPTY_META,
}: {
  sources: SourceRow[];
  meta?: EnrichmentMeta;
}) {
  const router = useRouter();
  const [filters, setFilters] = useState<SourceFilters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);

  const visible = useMemo(
    () => sortSources(filterSources(sources, filters, meta), filters.sort, meta),
    [sources, filters, meta],
  );
  const selectableVisible = useMemo(
    () => visible.filter((s) => s.status === "active"),
    [visible],
  );
  const selectedSources = useMemo(
    () =>
      selected.flatMap((id) => {
        const found = sources.find((s) => s.id === id);
        return found ? [found] : [];
      }),
    [selected, sources],
  );
  const allVisibleSelected =
    selectableVisible.length > 0 &&
    selectableVisible.every((s) => selected.includes(s.id));

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  function toggleSelectAllVisible() {
    setSelected((prev) => {
      const ids = selectableVisible.map((s) => s.id);
      const allSelected = ids.every((id) => prev.includes(id));
      if (allSelected) {
        return prev.filter((id) => !ids.includes(id));
      }
      return [...new Set([...prev, ...ids])];
    });
  }

  async function run(sourceIds: string[]) {
    setPending(true);
    setDialogError(null);
    try {
      const res = await fetch("/api/sources/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceIds }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setDialogError(requestErrorMessage(body?.error ?? "unsubscribe_failed"));
        return;
      }
      const outcome = (await res.json()) as BulkResult;
      const succeeded = new Set(outcome.successes.map((s) => s.sourceId));
      setSelected((prev) => prev.filter((id) => !succeeded.has(id)));
      setDialogOpen(false);
      setResult(outcome);
      if (outcome.successCount > 0) {
        router.refresh();
      }
    } catch {
      setDialogError("Network error. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (sources.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-input p-8 text-center">
        <p className="font-medium">No subscriptions imported yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Run a sync to import your YouTube subscriptions.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-20">
      {result ? (
        <UnsubscribeResult
          result={result}
          sources={sources}
          onRetry={(ids) => run(ids)}
          onDone={() => {
            setResult(null);
            setSelected([]);
            router.refresh();
          }}
        />
      ) : null}

      <FilterBar
        filters={filters}
        onChange={(next) => setFilters(next)}
        visibleCount={visible.length}
        totalCount={sources.length}
      />

      {selectableVisible.length > 0 ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleSelectAllVisible}
            className="h-4 w-4 accent-primary"
          />
          Select all {selectableVisible.length} active in view
        </label>
      ) : null}

      {visible.length === 0 ? (
        <div className="rounded-md border border-dashed border-input p-8 text-center">
          <p className="font-medium">No sources match</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Adjust the search or filters.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {visible.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              selected={selected.includes(source.id)}
              onToggle={toggle}
              enrichment={meta.enrichments[source.id] ?? null}
              recommendation={meta.recommendations[source.id] ?? null}
            />
          ))}
        </ul>
      )}

      <BulkBar
        selectedCount={selected.length}
        onUnsubscribe={() => {
          setDialogError(null);
          setDialogOpen(true);
        }}
        onClear={() => setSelected([])}
      />
      <UnsubscribeDialog
        open={dialogOpen}
        sources={selectedSources}
        pending={pending}
        error={dialogError}
        onCancel={() => {
          if (!pending) setDialogOpen(false);
        }}
        onConfirm={() => run(selected)}
      />
    </div>
  );
}
