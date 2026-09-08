/**
 * User-facing messages for operation failures (M4).
 * Server error codes are the stable API; this maps them to human text in
 * one place so SyncButton, the dashboard banner, and EnrichPanel agree.
 * Unknown codes fall back to generic text — never reflected raw into the
 * UI as a sentence.
 */

/** Friendly message for request-level error codes (sync/enrich/unsubscribe). */
export function requestErrorMessage(code: string): string {
  switch (code) {
    case "not_connected":
      return "YouTube is not connected yet.";
    case "reconnect_required":
      return "YouTube access expired. Disconnect and reconnect, then try again.";
    case "quota_exhausted":
      return "YouTube quota exhausted. Quotas reset over time — try again later.";
    case "rate_limited":
      return "YouTube is rate-limiting requests. Wait a minute and try again.";
    case "provider_error":
      return "YouTube returned an error. You can retry — nothing was changed.";
    case "sync_failed":
      return "Import failed before finishing. You can retry safely.";
    case "ai_not_configured":
      return "AI is not configured on the server.";
    case "unauthenticated":
      return "Please sign in again.";
    case "misconfigured":
      return "The server is misconfigured. Check the deployment settings.";
    case "invalid_request":
      return "Invalid request. Reload the page and try again.";
    case "refresh_rejected":
      return "Stored YouTube credentials were rejected. Reconnect to continue.";
    case "access_rejected":
      return "YouTube rejected access. Reconnect to continue.";
    default:
      return "Something went wrong. Try again.";
  }
}

/** Error codes the dashboard `?sync=` banner renders specifically. */
export const KNOWN_SYNC_ERROR_CODES: readonly string[] = [
  "not_connected",
  "reconnect_required",
  "quota_exhausted",
  "rate_limited",
  "provider_error",
  "sync_failed",
  "misconfigured",
];

/** Friendly message for per-item enrichment failure codes. */
export function enrichFailureMessage(code: string): string {
  const prefix = "uploads_failed:";
  const base = code.startsWith(prefix) ? code.slice(prefix.length) : code;
  switch (base) {
    case "quota_exhausted":
      return "YouTube quota exhausted — retry later";
    case "rate_limited":
      return "YouTube rate-limited — retry later";
    case "unauthenticated":
      return "YouTube access expired — reconnect, then retry";
    case "not_found":
      return "video list no longer available";
    case "bad_request":
      return "YouTube rejected the request";
    case "llm_invalid_output":
      return "AI returned an unusable answer";
    case "llm_unauthorized":
      return "AI key rejected — check server config";
    case "llm_request_failed":
      return "AI request failed";
    case "db_failed":
      return "couldn't save the result";
    default:
      return base;
  }
}
