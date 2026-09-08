"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Runs one import right after a fresh OAuth connection
 * (/dashboard?connected=1), then drops the query param.
 * Failures redirect to ?sync=error so a refresh cannot loop.
 */
export function AutoSync() {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetch("/api/youtube/sync", { method: "POST" })
      .then((res) => {
        router.replace(res.ok ? "/dashboard" : "/dashboard?sync=error");
        router.refresh();
      })
      .catch(() => {
        router.replace("/dashboard?sync=error");
      });
  }, [router]);

  return <p className="text-sm text-muted-foreground">Importing your subscriptions…</p>;
}
