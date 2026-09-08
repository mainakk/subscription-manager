import {
  ChannelsListResponseSchema,
  MyChannelResponseSchema,
  SubscriptionsListResponseSchema,
  type ChannelItem,
  type SubscriptionItem,
} from "@/lib/platforms/youtube/schema";
import type {
  NormalizedSource,
  PlatformAdapterContext,
} from "@/lib/platforms/types";

const SUBSCRIPTIONS_URL = "https://www.googleapis.com/youtube/v3/subscriptions";
const CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";

export type FetchFn = typeof fetch;
export type SleepFn = (ms: number) => Promise<void>;

const defaultSleep: SleepFn = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export type YouTubeErrorCode =
  | "unauthenticated"
  | "quota_exhausted"
  | "rate_limited"
  | "not_found"
  | "bad_request"
  | "provider_error";

/** Normalized YouTube API failure. Never carries tokens or secrets. */
export class YouTubeApiError extends Error {
  readonly status: number;
  readonly code: YouTubeErrorCode;
  readonly youtubeReason: string | null;

  constructor(status: number, code: YouTubeErrorCode, youtubeReason: string | null) {
    super(`YouTube API request failed (status ${status}, code ${code})`);
    this.name = "YouTubeApiError";
    this.status = status;
    this.code = code;
    this.youtubeReason = youtubeReason;
  }

  /** True for transient failures worth retrying with backoff. */
  get retryable(): boolean {
    if (this.status === 429) return true;
    if (this.status >= 500) return true;
    return this.code === "rate_limited";
  }
}

interface YouTubeErrorBody {
  error?: {
    code?: number;
    errors?: { reason?: string }[];
  };
}

function toYouTubeError(status: number, body: YouTubeErrorBody): YouTubeApiError {
  const reason = body?.error?.errors?.[0]?.reason ?? null;
  if (status === 401 || status === 403 && reason === "authError") {
    return new YouTubeApiError(status, "unauthenticated", reason);
  }
  if (
    reason === "quotaExceeded" ||
    reason === "dailyLimitExceeded" ||
    reason === "dailyLimitExceededUnreg"
  ) {
    return new YouTubeApiError(status, "quota_exhausted", reason);
  }
  if (
    status === 429 ||
    reason === "rateLimitExceeded" ||
    reason === "userRateLimitExceeded"
  ) {
    return new YouTubeApiError(status, "rate_limited", reason);
  }
  if (status === 404 || reason === "subscriptionNotFound") {
    return new YouTubeApiError(status, "not_found", reason);
  }
  if (status >= 400 && status < 500) {
    return new YouTubeApiError(status, "bad_request", reason);
  }
  return new YouTubeApiError(status, "provider_error", reason);
}

async function youtubeGet(
  url: string,
  ctx: PlatformAdapterContext,
  fetchFn: FetchFn,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchFn(url, {
      headers: { Authorization: `Bearer ${ctx.accessToken}` },
    });
  } catch (err) {
    throw new YouTubeApiError(
      0,
      "provider_error",
      err instanceof Error ? err.message : "network_error",
    );
  }
  if (!response.ok) {
    let body: YouTubeErrorBody = {};
    try {
      body = (await response.json()) as YouTubeErrorBody;
    } catch {
      // Non-JSON error body; status alone determines the mapping.
    }
    throw toYouTubeError(response.status, body);
  }
  return (await response.json()) as unknown;
}

/** Retries transient YouTube failures with exponential backoff + jitter. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: { maxAttempts?: number; baseDelayMs?: number; sleep?: SleepFn },
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const sleep = options?.sleep ?? defaultSleep;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (
        attempt >= maxAttempts ||
        !(err instanceof YouTubeApiError) ||
        !err.retryable
      ) {
        throw err;
      }
      const delay = baseDelayMs * 2 ** (attempt - 1) + Math.random() * 250;
      await sleep(delay);
    }
  }
}

export interface ListOptions {
  fetchFn?: FetchFn;
  /** Disable retry (used by tests for deterministic error mapping). */
  retry?: boolean;
  sleep?: SleepFn;
}

function runWithRetry<T>(
  fn: () => Promise<T>,
  options: ListOptions | undefined,
): Promise<T> {
  if (options?.retry === false) return fn();
  return withRetry(fn, { sleep: options?.sleep });
}

export interface SubscriptionsPage {
  items: SubscriptionItem[];
  nextPageToken?: string;
}

/** One page of the user's subscriptions (max 50). */
export async function listSubscriptions(
  ctx: PlatformAdapterContext,
  pageToken: string | undefined,
  options?: ListOptions,
): Promise<SubscriptionsPage> {
  const fetchFn = options?.fetchFn ?? fetch;
  const url = new URL(SUBSCRIPTIONS_URL);
  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("mine", "true");
  url.searchParams.set("maxResults", "50");
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  const json = await runWithRetry(
    () => youtubeGet(url.toString(), ctx, fetchFn),
    options,
  );
  const parsed = SubscriptionsListResponseSchema.parse(json);
  return { items: parsed.items, nextPageToken: parsed.nextPageToken };
}

/** Channel metadata for up to 50 channel ids per call; larger inputs are chunked. */
export async function listChannels(
  ctx: PlatformAdapterContext,
  channelIds: string[],
  options?: ListOptions,
): Promise<ChannelItem[]> {
  if (channelIds.length === 0) return [];
  const fetchFn = options?.fetchFn ?? fetch;
  const out: ChannelItem[] = [];
  for (let i = 0; i < channelIds.length; i += 50) {
    const chunk = channelIds.slice(i, i + 50);
    const url = new URL(CHANNELS_URL);
    url.searchParams.set("part", "snippet,statistics,contentDetails");
    url.searchParams.set("id", chunk.join(","));
    url.searchParams.set("maxResults", "50");
    const json = await runWithRetry(
      () => youtubeGet(url.toString(), ctx, fetchFn),
      options,
    );
    out.push(...ChannelsListResponseSchema.parse(json).items);
  }
  return out;
}

/** The authenticated user's own channel id (stored as external_account_id). */
export async function getMyChannelId(
  ctx: PlatformAdapterContext,
  options?: ListOptions,
): Promise<string> {
  const fetchFn = options?.fetchFn ?? fetch;
  const url = new URL(CHANNELS_URL);
  url.searchParams.set("part", "id");
  url.searchParams.set("mine", "true");
  url.searchParams.set("maxResults", "1");
  const json = await runWithRetry(
    () => youtubeGet(url.toString(), ctx, fetchFn),
    options,
  );
  const id = MyChannelResponseSchema.parse(json).items[0]?.id;
  if (!id) {
    throw new YouTubeApiError(404, "not_found", "noOwnChannel");
  }
  return id;
}

/**
 * Permanently removes a subscription. Throws YouTubeApiError("not_found")
 * when the subscription is already gone (callers decide how to count that).
 */
export async function deleteSubscription(
  ctx: PlatformAdapterContext,
  subscriptionExternalId: string,
  options?: ListOptions,
): Promise<void> {
  const fetchFn = options?.fetchFn ?? fetch;
  const url = new URL(SUBSCRIPTIONS_URL);
  url.searchParams.set("id", subscriptionExternalId);
  await runWithRetry(
    async () => {
      let response: Response;
      try {
        response = await fetchFn(url.toString(), {
          method: "DELETE",
          headers: { Authorization: `Bearer ${ctx.accessToken}` },
        });
      } catch (err) {
        throw new YouTubeApiError(
          0,
          "provider_error",
          err instanceof Error ? err.message : "network_error",
        );
      }
      if (response.status === 204 || response.status === 200) return;
      let body: YouTubeErrorBody = {};
      try {
        body = (await response.json()) as YouTubeErrorBody;
      } catch {
        // Non-JSON error body.
      }
      throw toYouTubeError(response.status, body);
    },
    options,
  );
}

/**
 * Async generator over normalized subscription pages.
 * Each yield is one subscriptions page enriched with channel metadata.
 */
export async function* listSources(
  ctx: PlatformAdapterContext,
  options?: ListOptions,
): AsyncIterable<NormalizedSource[]> {
  // Lazy import avoids a module cycle between client and normalize.
  const { normalizeSubscription } = await import(
    "@/lib/platforms/youtube/normalize"
  );
  let pageToken: string | undefined;
  for (;;) {
    const page = await listSubscriptions(ctx, pageToken, options);
    const channels = await listChannels(
      ctx,
      page.items.map((item) => item.snippet.resourceId.channelId),
      options,
    );
    const byId = new Map(channels.map((channel) => [channel.id, channel]));
    yield page.items.map((item) =>
      normalizeSubscription(item, byId.get(item.snippet.resourceId.channelId)),
    );
    if (!page.nextPageToken) return;
    pageToken = page.nextPageToken;
  }
}
