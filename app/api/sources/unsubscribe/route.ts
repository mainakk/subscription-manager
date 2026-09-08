import { NextResponse } from "next/server";

import { getAdapter } from "@/lib/platforms/registry";
import "@/lib/platforms/youtube";
import { YouTubeApiError } from "@/lib/platforms/youtube/client";
import {
  UnsubscribeRequestSchema,
  executeBulkUnsubscribe,
  type ActionRecord,
  type OwnedSource,
  type UnsubscribeDeps,
} from "@/lib/sources/unsubscribe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getOAuthConfig, refreshAccessToken } from "@/lib/youtube/oauth";
import { decryptRefreshToken } from "@/lib/youtube/token-crypto";

/**
 * Bulk unsubscribe. Validates ownership server-side, executes YouTube
 * removals sequentially, audits every item, and updates local state only
 * after confirmed external success. Partial failure is reported per item —
 * never as aggregate success.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const parsed = UnsubscribeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

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

  // Connection must be usable before any batch is created.
  const { data: connectionData } = await admin
    .from("platform_connections")
    .select("status,encrypted_refresh_token")
    .eq("user_id", userId)
    .eq("platform", "youtube")
    .limit(1);
  const connection = (connectionData?.[0] ?? null) as {
    status: string;
    encrypted_refresh_token: string | null;
  } | null;
  if (!connection || !connection.encrypted_refresh_token) {
    return NextResponse.json({ error: "not_connected" }, { status: 400 });
  }
  if (connection.status === "revoked" || connection.status === "expired") {
    return NextResponse.json({ error: "reconnect_required" }, { status: 409 });
  }

  let refreshToken: string;
  try {
    refreshToken = decryptRefreshToken(connection.encrypted_refresh_token);
  } catch {
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  let accessToken: string;
  try {
    const config = getOAuthConfig(process.env.NEXT_PUBLIC_SITE_URL);
    accessToken = (await refreshAccessToken(config, refreshToken)).accessToken;
  } catch (err) {
    const code =
      err instanceof Error && "code" in err ? String((err as { code: unknown }).code) : "";
    if (code === "invalid_grant") {
      try {
        await admin
          .from("platform_connections")
          .update({ status: "revoked", last_error: "refresh_rejected" })
          .eq("user_id", userId)
          .eq("platform", "youtube");
      } catch {
        // Best effort.
      }
      return NextResponse.json({ error: "reconnect_required" }, { status: 409 });
    }
    return NextResponse.json(
      { error: "provider_error", retryable: true },
      { status: 502 },
    );
  }

  const adapter = getAdapter("youtube");
  // batchId is assigned by createBatch before any audit row is written.
  let batchId = "";
  const deps: UnsubscribeDeps = {
    loadOwnedSources: async (ids) => {
      const { data, error } = await admin
        .from("sources")
        .select("id,name,platform,external_id,subscription_external_id,status")
        .eq("user_id", userId)
        .eq("platform", "youtube")
        .in("id", ids);
      if (error) throw new Error("db_load_failed");
      return ((data ?? []) as OwnedSource[]);
    },
    createBatch: async (totalCount) => {
      const { data, error } = await admin
        .from("user_action_batches")
        .insert({
          user_id: userId,
          platform: "youtube",
          type: "bulk_unsubscribe",
          total_count: totalCount,
          success_count: 0,
          failure_count: 0,
          status: "pending",
        })
        .select("id")
        .single();
      if (error || !data) throw new Error("db_batch_failed");
      batchId = (data as { id: string }).id;
      return batchId;
    },
    deleteExternal: async (subscriptionExternalId) => {
      try {
        await adapter.unsubscribe({ accessToken }, subscriptionExternalId);
        return { alreadyGone: false };
      } catch (err) {
        if (err instanceof YouTubeApiError && err.code === "not_found") {
          // Goal state already achieved; count as success with a note.
          return { alreadyGone: true };
        }
        if (err instanceof YouTubeApiError) {
          throw { errorCode: err.code, retryable: err.retryable };
        }
        throw { errorCode: "provider_error", retryable: true };
      }
    },
    markUnsubscribed: async (sourceId, at) => {
      const { error } = await admin
        .from("sources")
        .update({ status: "unsubscribed", unsubscribed_at: at })
        .eq("id", sourceId)
        .eq("user_id", userId);
      if (error) throw new Error("db_update_failed");
    },
    recordAction: async (action: ActionRecord) => {
      const { error } = await admin.from("user_actions").insert({
        batch_id: batchId,
        source_id: action.sourceId,
        user_id: userId,
        action_type: action.actionType,
        success: action.success,
        external_status: action.externalStatus,
        error_code: action.errorCode,
        error_message: action.errorMessage,
        snapshot: action.snapshot,
      });
      if (error) throw new Error("db_audit_failed");
    },
    finalizeBatch: async (id, patch) => {
      const { error } = await admin
        .from("user_action_batches")
        .update({
          success_count: patch.successCount,
          failure_count: patch.failureCount,
          status: patch.status,
        })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw new Error("db_finalize_failed");
    },
  };

  try {
    const result = await executeBulkUnsubscribe(parsed.data.sourceIds, deps);
    return NextResponse.json(result);
  } catch (err) {
    console.error(
      "Bulk unsubscribe failed:",
      err instanceof Error ? err.message : "unknown",
    );
    return NextResponse.json({ error: "unsubscribe_failed" }, { status: 500 });
  }
}
