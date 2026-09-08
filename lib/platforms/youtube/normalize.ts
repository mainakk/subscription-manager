import type {
  ChannelItem,
  SubscriptionItem,
} from "@/lib/platforms/youtube/schema";
import type { NormalizedSource } from "@/lib/platforms/types";

const DESCRIPTION_MAX_LENGTH = 2000;

function safeCount(value: string | number | undefined): number | null {
  if (value === undefined || value === null) return null;
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

function safeDate(value: string | undefined): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString();
}

function firstThumbnail(
  ...sets: ({ medium?: { url: string }; default?: { url: string } } | undefined)[]
): string | null {
  for (const set of sets) {
    if (set?.medium?.url) return set.medium.url;
    if (set?.default?.url) return set.default.url;
  }
  return null;
}

/** Maps one subscription (+ optional channel metadata) to a NormalizedSource. */
export function normalizeSubscription(
  sub: SubscriptionItem,
  channel?: ChannelItem,
): NormalizedSource {
  const channelId = sub.snippet.resourceId.channelId;
  const rawDescription = channel?.snippet?.description?.trim() ?? "";
  return {
    externalId: channelId,
    subscriptionExternalId: sub.id,
    name: sub.snippet.title,
    url: `https://www.youtube.com/channel/${channelId}`,
    imageUrl: firstThumbnail(channel?.snippet?.thumbnails, sub.snippet.thumbnails),
    providerDescription:
      rawDescription.length > 0
        ? rawDescription.slice(0, DESCRIPTION_MAX_LENGTH)
        : null,
    subscribedAt: safeDate(sub.snippet.publishedAt),
    videoCount: safeCount(channel?.statistics?.videoCount),
    subscriberCount:
      channel?.statistics?.hiddenSubscriberCount === true
        ? null
        : safeCount(channel?.statistics?.subscriberCount),
    // M1 ingestion does not fetch per-channel upload playlists (quota cost);
    // upload recency is an M3 enrichment signal.
    lastUploadAt: null,
    metadata: {
      totalItemCount: sub.contentDetails?.totalItemCount ?? null,
      newItemCount: sub.contentDetails?.newItemCount ?? null,
      uploadsPlaylistId:
        channel?.contentDetails?.relatedPlaylists?.uploads ?? null,
      channelPublishedAt: safeDate(channel?.snippet?.publishedAt),
      country: channel?.snippet?.country ?? null,
    },
  };
}

export interface SourceUpsert {
  user_id: string;
  platform: "youtube";
  external_id: string;
  subscription_external_id: string | null;
  name: string;
  url: string;
  image_url: string | null;
  provider_description: string | null;
  subscribed_at: string | null;
  video_count: number | null;
  subscriber_count: number | null;
  last_upload_at: string | null;
  metadata: Record<string, unknown>;
  last_synced_at: string;
}

/**
 * Builds upsert payloads. Status is deliberately excluded: re-imports must
 * not resurrect locally-unsubscribed rows; status transitions are computed
 * by planSyncTransitions() instead.
 */
export function buildSourceUpserts(
  items: NormalizedSource[],
  userId: string,
  syncedAt: string,
): SourceUpsert[] {
  return items.map((item) => ({
    user_id: userId,
    platform: "youtube" as const,
    external_id: item.externalId,
    subscription_external_id: item.subscriptionExternalId,
    name: item.name,
    url: item.url,
    image_url: item.imageUrl,
    provider_description: item.providerDescription,
    subscribed_at: item.subscribedAt,
    video_count: item.videoCount,
    subscriber_count: item.subscriberCount,
    last_upload_at: item.lastUploadAt,
    metadata: item.metadata,
    last_synced_at: syncedAt,
  }));
}

export interface ExistingSourceState {
  external_id: string;
  status: string;
}

export interface SyncTransitions {
  /** Seen-on-YouTube rows stuck in unavailable_externally (re-subscribed externally). */
  toReactivate: string[];
  /** Locally-active rows no longer on YouTube. */
  toMarkMissing: string[];
}

/**
 * Pure sync reconciliation. Rows the user removed via the app
 * (status unsubscribed) are never touched unless they reappear on YouTube.
 */
export function planSyncTransitions(
  seenExternalIds: Set<string>,
  existing: ExistingSourceState[],
): SyncTransitions {
  const toReactivate: string[] = [];
  const toMarkMissing: string[] = [];
  for (const row of existing) {
    const seen = seenExternalIds.has(row.external_id);
    if (seen && row.status === "unavailable_externally") {
      toReactivate.push(row.external_id);
    } else if (seen && row.status === "unsubscribed") {
      // Re-subscribed on YouTube after an app-side unsubscribe: honor YouTube.
      toReactivate.push(row.external_id);
    } else if (!seen && row.status === "active") {
      toMarkMissing.push(row.external_id);
    }
  }
  return { toReactivate, toMarkMissing };
}
