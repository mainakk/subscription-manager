import { NextResponse } from "next/server";

import {
  executeDeleteUserData,
  type DeleteUserDataDeps,
} from "@/lib/account/delete-user-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { revokeToken } from "@/lib/youtube/oauth";
import { decryptRefreshToken } from "@/lib/youtube/token-crypto";

/**
 * Deletes all local data owned by the caller: sources (enrichments,
 * recommendations, and action items cascade), action batches, and
 * platform connections. Revokes the YouTube grant best-effort first so
 * no usable credential is left behind. The auth account is kept — the
 * user signs in to an empty library. Irreversible: the UI confirms
 * explicitly before calling.
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
  const userId = user.id;

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const { data: connectionData } = await admin
    .from("platform_connections")
    .select("encrypted_refresh_token")
    .eq("user_id", userId)
    .eq("platform", "youtube")
    .limit(1);
  const stored = (connectionData?.[0] as { encrypted_refresh_token: string | null } | undefined)
    ?.encrypted_refresh_token;

  let revoked = false;
  if (stored) {
    try {
      await revokeToken(decryptRefreshToken(stored));
      revoked = true;
    } catch {
      // Advisory only; local deletion below is what matters.
    }
  }

  const deps: DeleteUserDataDeps = {
    deleteActionBatches: async () => {
      const { data, error } = await admin
        .from("user_action_batches")
        .delete()
        .eq("user_id", userId)
        .select("id");
      if (error) throw new Error("db_delete_failed");
      return data?.length ?? 0;
    },
    deleteSources: async () => {
      const { data, error } = await admin
        .from("sources")
        .delete()
        .eq("user_id", userId)
        .select("id");
      if (error) throw new Error("db_delete_failed");
      return data?.length ?? 0;
    },
    deleteConnections: async () => {
      const { data, error } = await admin
        .from("platform_connections")
        .delete()
        .eq("user_id", userId)
        .select("id");
      if (error) throw new Error("db_delete_failed");
      return data?.length ?? 0;
    },
  };

  try {
    const deleted = await executeDeleteUserData(deps);
    return NextResponse.json({ deleted, revoked });
  } catch {
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
