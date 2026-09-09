"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function DisconnectButton({ platform = "youtube" }: { platform?: "youtube" | "facebook" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDisconnect() {
    const name = platform === "facebook" ? "Facebook" : "YouTube";
    if (!window.confirm(`Disconnect ${name}? Your imported list stays, but syncing stops.`)) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/${platform}/disconnect`, { method: "POST" });
      if (!res.ok) {
        setError("Disconnect failed. Try again.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Disconnect failed. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={onDisconnect}
        disabled={pending}
      >
        {pending ? "Disconnecting…" : "Disconnect"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
