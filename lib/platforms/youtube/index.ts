import {
  deleteSubscription,
  listSources,
} from "@/lib/platforms/youtube/client";
import { registerAdapter } from "@/lib/platforms/registry";
import { getOAuthConfig, refreshAccessToken } from "@/lib/youtube/oauth";

/**
 * Registers the YouTube platform adapter.
 * Imported for its side effect by server code that performs YouTube
 * operations (M2: the bulk-unsubscribe route). Registry wiring stays out
 * of client bundles.
 */
registerAdapter({
  platform: "youtube",
  capabilities: {
    readSources: true,
    unsubscribe: true,
    readContent: true,
  },
  listSources: (ctx) => listSources(ctx),
  unsubscribe: (ctx, subscriptionExternalId) =>
    deleteSubscription(ctx, subscriptionExternalId),
  refreshToken: async (refreshToken) => {
    const config = getOAuthConfig(process.env.NEXT_PUBLIC_SITE_URL);
    const tokens = await refreshAccessToken(config, refreshToken);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: null,
    };
  },
});
