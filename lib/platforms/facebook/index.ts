import { listSources } from "@/lib/platforms/facebook/client";
import { registerAdapter } from "@/lib/platforms/registry";

registerAdapter({
  platform: "facebook",
  capabilities: {
    readSources: true,
    unsubscribe: false,
    localOnlyUnsubscribe: true,
    readContent: false,
  },
  listSources,
  unsubscribe: async () => {
    throw new Error("Facebook Page removal is local-only.");
  },
  refreshToken: async (refreshToken) => ({
    accessToken: refreshToken,
    refreshToken,
    expiresAt: null,
  }),
});
