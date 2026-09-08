import { describe, expect, it } from "vitest";

import {
  listChannels,
  listSources,
  listSubscriptions,
  withRetry,
  YouTubeApiError,
} from "@/lib/platforms/youtube/client";
import {
  buildSourceUpserts,
  normalizeSubscription,
  planSyncTransitions,
} from "@/lib/platforms/youtube/normalize";
import {
  ChannelItemSchema,
  SubscriptionItemSchema,
} from "@/lib/platforms/youtube/schema";
import fixture from "@/tests/fixtures/youtube-subscriptions.json";

const ctx = { accessToken: "test-access-token" };
const noRetry = { retry: false } as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Routes mock requests the way the real API is called. */
function fixtureFetch(pages = fixture.subscriptionsPages): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : input.toString(),
    );
    if (url.pathname.endsWith("/subscriptions")) {
      const token = url.searchParams.get("pageToken");
      const page = token ? pages[1] : pages[0];
      return jsonResponse(page);
    }
    if (url.pathname.endsWith("/channels")) {
      return jsonResponse({ items: fixture.channels });
    }
    throw new Error(`unexpected URL ${url.toString()}`);
  }) as typeof fetch;
}

describe("YouTube response parsing", () => {
  it("parses fixture subscriptions and channels", () => {
    for (const page of fixture.subscriptionsPages) {
      for (const item of page.items) {
        expect(() => SubscriptionItemSchema.parse(item)).not.toThrow();
      }
    }
    for (const channel of fixture.channels) {
      expect(() => ChannelItemSchema.parse(channel)).not.toThrow();
    }
  });
});

describe("normalizeSubscription", () => {
  it("merges subscription + channel metadata", () => {
    const sub = SubscriptionItemSchema.parse(fixture.subscriptionsPages[0].items[0]);
    const channel = ChannelItemSchema.parse(fixture.channels[0]);
    const normalized = normalizeSubscription(sub, channel);
    expect(normalized).toMatchObject({
      externalId: "UCwood1",
      subscriptionExternalId: "SUBSCRIPTION-ID-1",
      name: "Bourbon Moth Woodworking",
      url: "https://www.youtube.com/channel/UCwood1",
      imageUrl: "https://yt3.ggpht.com/wood1-medium",
      providerDescription:
        "Traditional hardwood furniture and joinery shop projects.",
      videoCount: 412,
      subscriberCount: 850000,
    });
    expect(normalized.metadata).toMatchObject({
      uploadsPlaylistId: "UUwood1uploads",
      totalItemCount: 412,
      newItemCount: 3,
    });
  });

  it("degrades gracefully on missing/bad provider data", () => {
    // Blank channel description -> null; invalid videoCount -> null.
    const sub = SubscriptionItemSchema.parse(fixture.subscriptionsPages[0].items[1]);
    const channel = ChannelItemSchema.parse(fixture.channels[1]);
    const cooking = normalizeSubscription(sub, channel);
    expect(cooking.providerDescription).toBeNull();
    expect(cooking.videoCount).toBeNull();

    // Hidden subscriber count -> null; invalid date -> null.
    const techSub = SubscriptionItemSchema.parse(
      fixture.subscriptionsPages[1].items[0],
    );
    const techChannel = ChannelItemSchema.parse(fixture.channels[2]);
    const tech = normalizeSubscription(techSub, techChannel);
    expect(tech.subscribedAt).toBeNull();
    expect(tech.subscriberCount).toBeNull();
    expect(tech.videoCount).toBe(75);
  });
});

describe("listSources pagination", () => {
  it("walks all pages and enriches with channel metadata", async () => {
    const pages = [];
    for await (const page of listSources(ctx, {
      fetchFn: fixtureFetch(),
      retry: false,
    })) {
      pages.push(page);
    }
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(2);
    expect(pages[1]).toHaveLength(1);
    expect(pages.flat().map((s) => s.externalId)).toEqual([
      "UCwood1",
      "UCcook2",
      "UCtech3",
    ]);
  });
});

describe("YouTube error mapping", () => {
  async function errorCode(status: number, reason: string): Promise<YouTubeApiError> {
    const fetchFn = (async () =>
      jsonResponse({ error: { code: status, errors: [{ reason }] } }, status)) as typeof fetch;
    try {
      await listSubscriptions(ctx, undefined, { fetchFn, retry: false });
    } catch (err) {
      if (err instanceof YouTubeApiError) return err;
      throw err;
    }
    throw new Error("expected YouTubeApiError");
  }

  it("maps 401, quota, rate-limit, and 404 distinctly", async () => {
    expect((await errorCode(401, "authError")).code).toBe("unauthenticated");
    expect((await errorCode(403, "quotaExceeded")).code).toBe("quota_exhausted");
    expect((await errorCode(403, "rateLimitExceeded")).code).toBe("rate_limited");
    expect((await errorCode(404, "notFound")).code).toBe("not_found");
  });

  it("marks only transient failures retryable", async () => {
    const quota = await errorCode(403, "quotaExceeded");
    expect(quota.retryable).toBe(false);
    const rateLimited = await errorCode(403, "rateLimitExceeded");
    expect(rateLimited.retryable).toBe(true);

    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw rateLimited;
        return "ok";
      },
      { sleep: async () => {} },
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
    await expect(
      withRetry(async () => {
        throw quota;
      }, { sleep: async () => {} }),
    ).rejects.toBe(quota);
  });

  it("lists channels in a single batched call", async () => {
    const seen: string[] = [];
    const fetchFn = (async (input: string | URL | Request) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : input.toString(),
      );
      seen.push(url.searchParams.get("id") ?? "");
      return jsonResponse({ items: fixture.channels });
    }) as typeof fetch;
    const channels = await listChannels(ctx, ["UCwood1", "UCcook2"], {
      fetchFn,
      ...noRetry,
    });
    expect(channels).toHaveLength(3);
    expect(seen).toHaveLength(1);
  });
});

describe("sync upserts and transitions", () => {
  it("builds upsert payloads without status", () => {
    const sub = SubscriptionItemSchema.parse(fixture.subscriptionsPages[0].items[0]);
    const channel = ChannelItemSchema.parse(fixture.channels[0]);
    const upserts = buildSourceUpserts(
      [normalizeSubscription(sub, channel)],
      "user-1",
      "2026-09-08T00:00:00.000Z",
    );
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      user_id: "user-1",
      platform: "youtube",
      external_id: "UCwood1",
      subscription_external_id: "SUBSCRIPTION-ID-1",
    });
    expect("status" in upserts[0]).toBe(false);
  });

  it("plans reactivation and missing transitions", () => {
    const seen = new Set(["A", "B"]);
    const result = planSyncTransitions(seen, [
      { external_id: "A", status: "active" },
      { external_id: "B", status: "unavailable_externally" },
      { external_id: "C", status: "active" },
      { external_id: "D", status: "unsubscribed" },
      { external_id: "A2", status: "unsubscribed" },
    ]);
    // A seen+active: untouched. B seen+unavailable: reactivate.
    // C active but unseen: mark missing. D unsubscribed+unseen: untouched.
    expect(result.toReactivate).toEqual(["B"]);
    expect(result.toMarkMissing).toEqual(["C"]);
    // Re-subscribed on YouTube after an app-side unsubscribe: honor YouTube.
    const resub = planSyncTransitions(new Set(["A2"]), [
      { external_id: "A2", status: "unsubscribed" },
    ]);
    expect(resub.toReactivate).toEqual(["A2"]);
  });
});
