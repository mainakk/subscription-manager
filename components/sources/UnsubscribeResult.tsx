"use client";

import { Button } from "@/components/ui/button";
import type { SourceRow } from "@/lib/db/types";
import type { BulkResult } from "@/lib/sources/unsubscribe";

interface UnsubscribeResultProps {
  result: BulkResult;
  sources: SourceRow[];
  onRetry: (sourceIds: string[]) => void;
  onDone: () => void;
}

function nameFor(sources: SourceRow[], sourceId: string): string {
  return sources.find((s) => s.id === sourceId)?.name ?? sourceId;
}

/**
 * Honest per-item outcome. Never claims aggregate success when items failed.
 */
export function UnsubscribeResult({ result, sources, onRetry, onDone }: UnsubscribeResultProps) {
  const retryable = result.failures.filter((f) => f.retryable);
  return (
    <div className="rounded-lg border border-border bg-card p-4" role="status">
      <p className="font-medium">
        {result.successCount} unsubscribed successfully
        {result.failureCount > 0 ? `, ${result.failureCount} failed` : ""}
      </p>
      {result.failures.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm">
          {result.failures.map((item) => (
            <li key={item.sourceId} className="flex flex-wrap gap-x-2">
              <span className="font-medium">{nameFor(sources, item.sourceId)}</span>
              <span className="text-destructive">{item.errorCode}</span>
              {item.retryable ? (
                <span className="text-muted-foreground">(retryable)</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {result.unknownSourceIds.length > 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {result.unknownSourceIds.length} selected{" "}
          {result.unknownSourceIds.length === 1 ? "item was" : "items were"} no
          longer available and {result.unknownSourceIds.length === 1 ? "was" : "were"} skipped.
        </p>
      ) : null}
      <div className="mt-4 flex gap-2">
        {retryable.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => onRetry(retryable.map((f) => f.sourceId))}
          >
            Retry failed ({retryable.length})
          </Button>
        ) : null}
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
