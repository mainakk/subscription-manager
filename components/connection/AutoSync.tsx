"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { KNOWN_SYNC_ERROR_CODES } from "@/lib/error-messages";

/**
 * Runs one import right after a fresh OAuth connection
 * (/dashboard?connected=1), then drops the query param.
 * Failures redirect to ?sync=<code> (allowlisted) so the dashboard can
 * explain that specific failure; a refresh cannot loop.
 */
export function AutoSync() {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetch("/api/youtube/sync", { method: "POST" })
      .then(async (res) => {
        if (res.ok) {
          router.replace("/dashboard");
        } else {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          const code = body?.error;
          router.replace(
            `/dashboard?sync=${code && KNOWN_SYNC_ERROR_CODES.includes(code) ? code : "error"}`,
          );
        }
        router.refresh();
      })
      .catch(() => {
        router.replace("/dashboard?sync=error");
      });
  }, [router]);

  return <p className="text-sm text-muted-foreground">Importing your subscriptions…</p>;
}
