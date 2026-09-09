import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { FacebookApiError, listManagedPages } from "@/lib/platforms/facebook/client";
import { decryptRefreshToken } from "@/lib/youtube/token-crypto";

export async function POST() {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  let admin: ReturnType<typeof createAdminClient>;
  try { admin = createAdminClient(); } catch { return NextResponse.json({ error: "misconfigured" }, { status: 500 }); }
  const { data } = await admin.from("platform_connections").select("encrypted_refresh_token,status")
    .eq("user_id", user.id).eq("platform", "facebook").limit(1);
  const row = data?.[0] as { encrypted_refresh_token: string | null; status: string } | undefined;
  if (!row?.encrypted_refresh_token || row.status !== "connected") return NextResponse.json({ error: "not_connected" }, { status: 400 });
  try {
    const pages = await listManagedPages({ accessToken: decryptRefreshToken(row.encrypted_refresh_token) });
    const syncedAt = new Date().toISOString();
    const rows = pages.map((page) => ({
      user_id: user.id, platform: "facebook" as const, external_id: page.id,
      subscription_external_id: null, name: page.name, url: page.link ?? `https://www.facebook.com/${page.id}`,
      image_url: page.picture?.data?.url ?? null,
      provider_description: page.category ? `Facebook Page · ${page.category}` : "Facebook Page",
      subscribed_at: null, video_count: null, subscriber_count: null, last_upload_at: null,
      metadata: { category: page.category ?? null, managed: true }, last_synced_at: syncedAt,
    }));
    if (rows.length) {
      const { error } = await admin.from("sources").upsert(rows, { onConflict: "user_id,platform,external_id" });
      if (error) throw new Error("db_upsert_failed");
    }
    const seen = new Set(rows.map((row) => row.external_id));
    const { data: existing } = await admin.from("sources").select("external_id,status")
      .eq("user_id", user.id).eq("platform", "facebook");
    const missing = ((existing ?? []) as { external_id: string; status: string }[])
      .filter((row) => row.status === "active" && !seen.has(row.external_id))
      .map((row) => row.external_id);
    if (missing.length) {
      const { error } = await admin.from("sources").update({ status: "unavailable_externally" })
        .eq("user_id", user.id).eq("platform", "facebook").in("external_id", missing);
      if (error) throw new Error("db_mark_missing_failed");
    }
    const returning = ((existing ?? []) as { external_id: string; status: string }[])
      .filter((row) => (row.status === "unavailable_externally" || row.status === "unsubscribed") && seen.has(row.external_id))
      .map((row) => row.external_id);
    if (returning.length) {
      const { error } = await admin.from("sources").update({ status: "active", unsubscribed_at: null })
        .eq("user_id", user.id).eq("platform", "facebook").in("external_id", returning);
      if (error) throw new Error("db_reactivate_failed");
    }
    await admin.from("platform_connections").update({ last_sync_at: syncedAt, last_error: null, status: "connected" })
      .eq("user_id", user.id).eq("platform", "facebook");
    return NextResponse.json({ totalSeen: rows.length, upserted: rows.length, markedUnavailable: missing.length, reactivated: returning.length, syncedAt });
  } catch (error) {
    const code = error instanceof FacebookApiError && error.code === "reconnect_required" ? "reconnect_required" : "sync_failed";
    await admin.from("platform_connections").update({ last_error: code }).eq("user_id", user.id).eq("platform", "facebook");
    return NextResponse.json({ error: code, retryable: code === "sync_failed" }, { status: code === "reconnect_required" ? 409 : 502 });
  }
}
