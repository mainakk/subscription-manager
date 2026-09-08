import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { revokeToken } from "@/lib/youtube/oauth";
import { decryptRefreshToken } from "@/lib/youtube/token-crypto";

/**
 * Disconnects YouTube: best-effort remote revocation, then wipes the stored
 * refresh token and marks the connection disconnected. Local source records
 * are kept (full data deletion is a separate M4 flow).
 */
export async function POST() {
  let user: { id: string } | null = null;
  try {
    user = await getAuthenticatedUser();
  } catch {
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const { data } = await admin
    .from("platform_connections")
    .select("encrypted_refresh_token")
    .eq("user_id", user.id)
    .eq("platform", "youtube")
    .limit(1);
  const encrypted = (data?.[0] as { encrypted_refresh_token: string | null } | undefined)
    ?.encrypted_refresh_token;

  if (encrypted) {
    try {
      await revokeToken(decryptRefreshToken(encrypted));
    } catch {
      // Advisory only; the wipe below is what matters.
    }
  }

  const { error } = await admin
    .from("platform_connections")
    .update({ status: "disconnected", encrypted_refresh_token: null, last_error: null })
    .eq("user_id", user.id)
    .eq("platform", "youtube");
  if (error) {
    return NextResponse.json({ error: "disconnect_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
