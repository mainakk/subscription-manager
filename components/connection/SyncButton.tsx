"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { requestErrorMessage } from "@/lib/error-messages";

export function SyncButton({ label = "Sync now" }: { label?: string }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/youtube/sync", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(requestErrorMessage(body?.error ?? "sync_failed"));
      } else {
        router.refresh();
      }
    } catch {
      setError("Import failed. Check your connection and try again.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={onSync} disabled={syncing}>
        {syncing ? "Importing…" : label}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
