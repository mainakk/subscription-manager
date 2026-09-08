import { describe, expect, it } from "vitest";

import { getAdapter, registerAdapter } from "@/lib/platforms/registry";
import type { PlatformAdapter } from "@/lib/platforms/types";

const stub: PlatformAdapter = {
  platform: "youtube",
  capabilities: {
    readSources: true,
    unsubscribe: true,
    readContent: true,
  },
  async *listSources() {
    yield [];
  },
  async unsubscribe() {},
  async refreshToken() {
    return { accessToken: "x", refreshToken: null, expiresAt: null };
  },
};

describe("platform adapter registry", () => {
  it("throws for unregistered platforms", () => {
    expect(() => getAdapter("youtube")).toThrow(
      /No adapter registered for platform/,
    );
  });

  it("returns the registered adapter", () => {
    registerAdapter(stub);
    expect(getAdapter("youtube")).toBe(stub);
  });
});
