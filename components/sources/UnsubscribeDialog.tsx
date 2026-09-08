"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import type { SourceRow } from "@/lib/db/types";

interface UnsubscribeDialogProps {
  open: boolean;
  sources: SourceRow[];
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Explicit review step before any destructive call. */
export function UnsubscribeDialog({
  open,
  sources,
  pending,
  error,
  onCancel,
  onConfirm,
}: UnsubscribeDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    function onKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsubscribe-title"
        className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="unsubscribe-title" className="text-lg font-semibold">
          Unsubscribe from these {sources.length}{" "}
          {sources.length === 1 ? "source" : "sources"}?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This removes the selected subscriptions from your YouTube account.
          It cannot be undone automatically — you would have to resubscribe
          manually.
        </p>
        <ul className="mt-4 max-h-48 space-y-1 overflow-y-auto rounded-md border border-input p-3 text-sm">
          {sources.map((source) => (
            <li key={source.id} className="truncate">
              {source.name}
            </li>
          ))}
        </ul>
        {error ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            ref={confirmRef}
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={pending || sources.length === 0}
          >
            {pending ? "Unsubscribing…" : "Confirm unsubscribe"}
          </Button>
        </div>
      </div>
    </div>
  );
}
