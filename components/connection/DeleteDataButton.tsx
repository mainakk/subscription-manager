"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

interface DeleteResponse {
  deleted?: { actionBatches: number; sources: number; connections: number };
  revoked?: boolean;
  error?: string;
}

/**
 * Irreversible local data deletion (M4). Two-step inline confirm:
 * the consequences are listed and deletion requires a second explicit
 * click. Reports what was removed; the auth account itself is kept.
 */
export function DeleteDataButton({ sourceCount }: { sourceCount: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onDelete() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete-data", { method: "POST" });
      const body = (await res.json().catch(() => null)) as DeleteResponse | null;
      if (!res.ok) {
        setError("Deletion failed. Try again.");
        return;
      }
      const deleted = body?.deleted ?? { actionBatches: 0, sources: 0, connections: 0 };
      setDone(
        `Deleted ${deleted.sources} ${deleted.sources === 1 ? "source" : "sources"}, ` +
          `${deleted.actionBatches} history ${deleted.actionBatches === 1 ? "entry" : "entries"}, ` +
          `and ${deleted.connections} ${deleted.connections === 1 ? "connection" : "connections"}` +
          `${body?.revoked ? " (YouTube access revoked)" : ""}.`,
      );
      setConfirming(false);
      router.refresh();
    } catch {
      setError("Deletion failed. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return <p className="text-sm text-muted-foreground">{done}</p>;
  }

  if (!confirming) {
    return (
      <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
        Delete my data…
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        Permanently delete your {sourceCount} imported{" "}
        {sourceCount === 1 ? "source" : "sources"}, AI analysis, history, and
        the YouTube connection? This cannot be undone. Your sign-in stays, so
        you can start over.
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="destructive"
          onClick={onDelete}
          disabled={pending}
        >
          {pending ? "Deleting…" : "Yes, delete everything"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (!pending) {
              setConfirming(false);
              setError(null);
            }
          }}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
