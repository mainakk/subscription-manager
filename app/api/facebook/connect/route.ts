import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { buildFacebookAuthUrl, FACEBOOK_STATE_COOKIE, generateFacebookState, getFacebookOAuthConfig } from "@/lib/facebook/oauth";

export async function GET() {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) redirect("/login?next=%2Fdashboard");
  try {
    const state = generateFacebookState();
    (await cookies()).set(FACEBOOK_STATE_COOKIE, state, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
      path: "/", maxAge: 600,
    });
    redirect(buildFacebookAuthUrl(getFacebookOAuthConfig(process.env.NEXT_PUBLIC_SITE_URL), state));
  } catch {
    redirect("/dashboard?facebook_oauth=misconfigured");
  }
}
