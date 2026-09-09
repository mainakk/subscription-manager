import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { FACEBOOK_STATE_COOKIE, exchangeFacebookCode, facebookStatesMatch, getFacebookOAuthConfig } from "@/lib/facebook/oauth";
import { encryptRefreshToken } from "@/lib/youtube/token-crypto";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("error") === "access_denied") redirect("/dashboard?facebook_oauth=denied");
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) redirect("/login?next=%2Fdashboard");
  const store = await cookies();
  const state = store.get(FACEBOOK_STATE_COOKIE)?.value ?? null;
  store.set(FACEBOOK_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  const code = url.searchParams.get("code");
  if (!code || !facebookStatesMatch(url.searchParams.get("state"), state)) redirect("/dashboard?facebook_oauth=error");
  try {
    const token = await exchangeFacebookCode(getFacebookOAuthConfig(process.env.NEXT_PUBLIC_SITE_URL), code);
    const admin = createAdminClient();
    const { error } = await admin.from("platform_connections").upsert({
      user_id: user.id, platform: "facebook", status: "connected",
      scopes: ["pages_show_list", "pages_read_engagement"],
      external_account_id: null, encrypted_refresh_token: encryptRefreshToken(token),
      access_token_expires_at: null, last_error: null,
    }, { onConflict: "user_id,platform" });
    if (error) throw new Error("connection_upsert_failed");
  } catch {
    redirect("/dashboard?facebook_oauth=error");
  }
  redirect("/dashboard?facebook_connected=1");
}
