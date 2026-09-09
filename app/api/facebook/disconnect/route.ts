import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { revokeFacebookToken } from "@/lib/facebook/oauth";
import { decryptRefreshToken } from "@/lib/youtube/token-crypto";

export async function POST() {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  let admin: ReturnType<typeof createAdminClient>;
  try { admin = createAdminClient(); } catch { return NextResponse.json({ error: "misconfigured" }, { status: 500 }); }
  const { data } = await admin.from("platform_connections").select("encrypted_refresh_token")
    .eq("user_id", user.id).eq("platform", "facebook").limit(1);
  const encrypted = (data?.[0] as { encrypted_refresh_token: string | null } | undefined)?.encrypted_refresh_token;
  if (encrypted) {
    try { await revokeFacebookToken(decryptRefreshToken(encrypted)); } catch { /* local wipe remains authoritative */ }
  }
  const { error } = await admin.from("platform_connections").update({ status: "disconnected", encrypted_refresh_token: null, last_error: null })
    .eq("user_id", user.id).eq("platform", "facebook");
  if (error) return NextResponse.json({ error: "disconnect_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
