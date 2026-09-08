import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { PlatformConnectionRow } from "@/lib/db/types";
import { getMyChannelId } from "@/lib/platforms/youtube/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  OAUTH_STATE_COOKIE,
  exchangeCodeForTokens,
  getOAuthConfig,
  statesMatch,
} from "@/lib/youtube/oauth";
import { decryptRefreshToken, encryptRefreshToken } from "@/lib/youtube/token-crypto";

/**
 * Google OAuth callback. Validates state, exchanges the code server-side,
 * and stores only the encrypted refresh token. Raw tokens never reach the browser.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  if (requestUrl.searchParams.get("error") === "access_denied") {
    redirect("/dashboard?oauth=denied");
  }
  const code = requestUrl.searchParams.get("code");
  const queryState = requestUrl.searchParams.get("state");

  let user: { id: string } | null = null;
  try {
    user = await getAuthenticatedUser();
  } catch {
    redirect("/login?next=%2Fdashboard");
  }
  if (!user) {
    redirect("/login?next=%2Fdashboard");
  }

  const cookieStore = await cookies();
  const cookieState = cookieStore.get(OAUTH_STATE_COOKIE)?.value ?? null;
  // Single-use state.
  cookieStore.set(OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  if (!code || !statesMatch(queryState, cookieState)) {
    redirect("/dashboard?oauth=error");
  }

  try {
    const config = getOAuthConfig(process.env.NEXT_PUBLIC_SITE_URL);
    const tokens = await exchangeCodeForTokens(config, code);
    const channelId = await getMyChannelId({ accessToken: tokens.accessToken });

    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("platform_connections")
      .select("encrypted_refresh_token")
      .eq("user_id", user.id)
      .eq("platform", "youtube")
      .limit(1);
    const previous = (existing?.[0] ?? null) as Pick<
      PlatformConnectionRow,
      "encrypted_refresh_token"
    > | null;

    // Google only returns a refresh token on first consent; preserve the
    // stored one when it is absent (prompt=consent makes absence rare).
    let encryptedRefreshToken: string;
    if (tokens.refreshToken) {
      encryptedRefreshToken = encryptRefreshToken(tokens.refreshToken);
    } else if (previous?.encrypted_refresh_token) {
      encryptedRefreshToken = previous.encrypted_refresh_token;
    } else {
      console.error("YouTube OAuth callback: no refresh token issued");
      redirect("/dashboard?oauth=error");
    }

    // Sanity-check the stored value decrypts before persisting.
    decryptRefreshToken(encryptedRefreshToken);

    const { error: upsertError } = await admin
      .from("platform_connections")
      .upsert(
        {
          user_id: user.id,
          platform: "youtube",
          status: "connected",
          scopes: tokens.grantedScopes,
          external_account_id: channelId,
          encrypted_refresh_token: encryptedRefreshToken,
          access_token_expires_at: null,
          last_error: null,
        },
        { onConflict: "user_id,platform" },
      );
    if (upsertError) {
      console.error("YouTube OAuth callback: connection upsert failed");
      redirect("/dashboard?oauth=error");
    }
  } catch (err) {
    // OAuthError/YouTubeApiError carry status codes only — no secrets.
    console.error(
      "YouTube OAuth callback failed:",
      err instanceof Error ? `${err.name}: ${err.message}` : "unknown",
    );
    redirect("/dashboard?oauth=error");
  }

  redirect("/dashboard?connected=1");
}
