import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const FACEBOOK_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
] as const;
export const FACEBOOK_STATE_COOKIE = "fb_oauth_state";
const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION ?? "v23.0";
const AUTH_URL = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;
const TOKEN_URL = `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`;

export interface FacebookOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

export function getFacebookOAuthConfig(siteUrl: string | undefined): FacebookOAuthConfig {
  if (!process.env.FACEBOOK_APP_ID) throw new Error("Missing FACEBOOK_APP_ID.");
  if (!process.env.FACEBOOK_APP_SECRET) throw new Error("Missing FACEBOOK_APP_SECRET.");
  if (!siteUrl) throw new Error("Missing NEXT_PUBLIC_SITE_URL.");
  return {
    appId: process.env.FACEBOOK_APP_ID,
    appSecret: process.env.FACEBOOK_APP_SECRET,
    redirectUri: `${siteUrl.replace(/\/$/, "")}/api/facebook/callback`,
  };
}

export function generateFacebookState(): string {
  return randomBytes(16).toString("hex");
}

export function facebookStatesMatch(query: string | null, cookie: string | null): boolean {
  if (!query || !cookie) return false;
  const a = Buffer.from(query);
  const b = Buffer.from(cookie);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function buildFacebookAuthUrl(config: FacebookOAuthConfig, state: string): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", FACEBOOK_SCOPES.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

const TokenSchema = z.object({ access_token: z.string(), token_type: z.string().optional() });

export async function exchangeFacebookCode(
  config: FacebookOAuthConfig,
  code: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const shortUrl = new URL(TOKEN_URL);
  shortUrl.searchParams.set("client_id", config.appId);
  shortUrl.searchParams.set("client_secret", config.appSecret);
  shortUrl.searchParams.set("redirect_uri", config.redirectUri);
  shortUrl.searchParams.set("code", code);
  const shortResponse = await fetchFn(shortUrl);
  if (!shortResponse.ok) throw new Error(`Facebook token exchange failed (${shortResponse.status})`);
  const shortToken = TokenSchema.parse(await shortResponse.json()).access_token;
  const longUrl = new URL(TOKEN_URL);
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", config.appId);
  longUrl.searchParams.set("client_secret", config.appSecret);
  longUrl.searchParams.set("fb_exchange_token", shortToken);
  const longResponse = await fetchFn(longUrl);
  if (!longResponse.ok) throw new Error(`Facebook long-lived token exchange failed (${longResponse.status})`);
  return TokenSchema.parse(await longResponse.json()).access_token;
}

export async function revokeFacebookToken(token: string, fetchFn: typeof fetch = fetch): Promise<void> {
  try {
    const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me/permissions`);
    url.searchParams.set("access_token", token);
    await fetchFn(url, { method: "DELETE" });
  } catch {
    // Local token deletion remains authoritative.
  }
}

export { GRAPH_VERSION };
