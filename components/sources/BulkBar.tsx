"use client";

import { Button } from "@/components/ui/button";

interface BulkBarProps {
  selectedCount: number;
  onUnsubscribe: () => void;
  onClear: () => void;
}

/** Sticky action bar, visible only while a selection exists. */
export function BulkBar({ selectedCount, onUnsubscribe, onClear }: BulkBarProps) {
  if (selectedCount === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-6 py-3">
        <p className="text-sm font-medium" role="status">
          {selectedCount} {selectedCount === 1 ? "source" : "sources"} selected
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClear}>
            Clear
          </Button>
          <Button type="button" variant="destructive" onClick={onUnsubscribe}>
            Unsubscribe
          </Button>
        </div>
      </div>
    </div>
  );
}
