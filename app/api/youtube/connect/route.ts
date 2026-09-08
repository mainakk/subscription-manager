import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  OAUTH_STATE_COOKIE,
  buildAuthUrl,
  generateState,
  getOAuthConfig,
} from "@/lib/youtube/oauth";

/** Starts the Google OAuth consent flow for the YouTube connection. */
export async function GET() {
  let user: { id: string } | null = null;
  try {
    user = await getAuthenticatedUser();
  } catch {
    redirect("/login?next=%2Fdashboard");
  }
  if (!user) {
    redirect("/login?next=%2Fdashboard");
  }

  let authUrl: string;
  try {
    const config = getOAuthConfig(process.env.NEXT_PUBLIC_SITE_URL);
    const state = generateState();
    const cookieStore = await cookies();
    cookieStore.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
    authUrl = buildAuthUrl(config, state);
  } catch {
    redirect("/dashboard?oauth=misconfigured");
  }
  redirect(authUrl);
}
