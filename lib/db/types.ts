import type { Platform, SourceStatus } from "@/lib/platforms/types";

/** Row shapes mirroring supabase/migrations/0001_init.sql. */

export interface PlatformConnectionRow {
  id: string;
  user_id: string;
  platform: Platform;
  status: "connected" | "expired" | "revoked" | "disconnected";
  scopes: string[];
  external_account_id: string | null;
  /** Ciphertext/token reference. Raw tokens are never exposed to the browser. */
  encrypted_refresh_token: string | null;
  access_token_expires_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
}

export interface SourceRow {
  id: string;
  user_id: string;
  platform: Platform;
  external_id: string;
  subscription_external_id: string | null;
  name: string;
  url: string;
  image_url: string | null;
  provider_description: string | null;
  status: SourceStatus;
  subscribed_at: string | null;
  unsubscribed_at: string | null;
  video_count: number | null;
  subscriber_count: number | null;
  last_upload_at: string | null;
  metadata: Record<string, unknown>;
  last_synced_at: string | null;
}

export interface SourceEnrichmentRow {
  id: string;
  source_id: string;
  category_slug: string;
  subcategory: string;
  topics: string[];
  description: string;
  confidence: number;
  model: string;
  prompt_version: string;
  created_at: string;
}

export interface SourceRecommendationRow {
  id: string;
  source_id: string;
  verdict: "KEEP" | "REVIEW" | "UNSUBSCRIBE";
  reason: string;
  signals: Record<string, unknown>;
  model: string;
  created_at: string;
}

export interface UserActionBatchRow {
  id: string;
  user_id: string;
  platform: Platform;
  type: "bulk_unsubscribe";
  total_count: number;
  success_count: number;
  failure_count: number;
  status: "pending" | "completed" | "completed_with_failures" | "failed";
  created_at: string;
}

export interface UserActionRow {
  id: string;
  batch_id: string;
  source_id: string;
  user_id: string;
  action_type: string;
  success: boolean;
  external_status: number | null;
  error_code: string | null;
  error_message: string | null;
  snapshot: Record<string, unknown>;
  created_at: string;
}
