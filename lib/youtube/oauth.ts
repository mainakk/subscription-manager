/**
 * Server-side Google OAuth helpers for the YouTube connection.
 *
 * SERVER-ONLY by convention: imported exclusively by Route Handlers
 * (kept free of `import "server-only"` so Vitest can exercise the pure
 * helpers; the service-role guard in lib/supabase/admin.ts remains).
 */
import { randomBytes, timingSafeEqual } from "node:crypto";

import { z } from "zod";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl",
] as const;

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export const OAUTH_STATE_COOKIE = "yt_oauth_state";
const OAUTH_STATE_BYTES = 16;

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Reads OAuth config from env. Names the missing variable, never its value. */
export function getOAuthConfig(siteUrl: string | undefined): OAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId) throw new Error("Missing GOOGLE_CLIENT_ID.");
  if (!clientSecret) throw new Error("Missing GOOGLE_CLIENT_SECRET.");
  if (!siteUrl) throw new Error("Missing NEXT_PUBLIC_SITE_URL.");
  return {
    clientId,
    clientSecret,
    redirectUri: `${siteUrl.replace(/\/$/, "")}/api/youtube/callback`,
  };
}

/** Builds the Google consent URL (offline access so a refresh token is issued). */
export function buildAuthUrl(config: OAuthConfig, state: string): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", [...YOUTUBE_SCOPES].join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "false");
  url.searchParams.set("state", state);
  return url.toString();
}

/** 128-bit random CSRF state, hex-encoded. */
export function generateState(): string {
  return randomBytes(OAUTH_STATE_BYTES).toString("hex");
}

/** Constant-time state comparison. Fails closed on missing/mismatched lengths. */
export function statesMatch(queryState: string | null, cookieState: string | null): boolean {
  if (!queryState || !cookieState) return false;
  const a = Buffer.from(queryState, "utf8");
  const b = Buffer.from(cookieState, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const TokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  grantedScopes: string[];
}

/** Normalized OAuth/token endpoint failure. Never carries client secrets. */
export class OAuthError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(`Google OAuth request failed (${code})`);
    this.name = "OAuthError";
    this.code = code;
  }
}

interface TokenErrorBody {
  error?: string;
}

async function parseTokenResponse(response: Response): Promise<TokenSet> {
  const json = (await response.json()) as unknown;
  if (!response.ok) {
    const code =
      (json as TokenErrorBody)?.error ?? `http_${response.status}`;
    throw new OAuthError(code);
  }
  const parsed = TokenResponseSchema.parse(json);
  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token ?? null,
    grantedScopes:
      parsed.scope && parsed.scope.length > 0
        ? parsed.scope.split(" ")
        : [...YOUTUBE_SCOPES],
  };
}

/** Exchanges an authorization code for tokens (callback route). */
export async function exchangeCodeForTokens(
  config: OAuthConfig,
  code: string,
  fetchFn: typeof fetch = fetch,
): Promise<TokenSet> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });
  const response = await fetchFn(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  return parseTokenResponse(response);
}

/** Refreshes an access token. Throws OAuthError("invalid_grant") when revoked. */
export async function refreshAccessToken(
  config: OAuthConfig,
  refreshToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<TokenSet> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetchFn(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  return parseTokenResponse(response);
}

/** Best-effort token revocation (disconnect flow). Never throws. */
export async function revokeToken(
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  try {
    await fetchFn(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    });
  } catch {
    // Revocation is advisory; the local wipe below is what matters.
  }
}
