import { describe, expect, it } from "vitest";

import {
  YOUTUBE_SCOPES,
  buildAuthUrl,
  generateState,
  getOAuthConfig,
  statesMatch,
} from "@/lib/youtube/oauth";

const config = {
  clientId: "test-client-id",
  clientSecret: "test-secret",
  redirectUri: "http://localhost:3000/api/youtube/callback",
};

describe("YouTube OAuth helpers", () => {
  it("builds a consent URL with offline access and both YouTube scopes", () => {
    const url = new URL(buildAuthUrl(config, "STATE123"));
    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("STATE123");
    const scopes = url.searchParams.get("scope")?.split(" ") ?? [];
    expect(scopes).toEqual([...YOUTUBE_SCOPES]);
  });

  it("generates unique 128-bit states", () => {
    const a = generateState();
    const b = generateState();
    expect(a).toHaveLength(32);
    expect(a).not.toBe(b);
  });

  it("compares states safely and fails closed", () => {
    expect(statesMatch("abc", "abc")).toBe(true);
    expect(statesMatch("abc", "abd")).toBe(false);
    expect(statesMatch("abc", "abcd")).toBe(false);
    expect(statesMatch(null, "abc")).toBe(false);
    expect(statesMatch("abc", null)).toBe(false);
  });

  it("requires env config without leaking values", () => {
    const previousId = process.env.GOOGLE_CLIENT_ID;
    const previousSecret = process.env.GOOGLE_CLIENT_SECRET;
    try {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      expect(() => getOAuthConfig("http://localhost:3000")).toThrow(
        /GOOGLE_CLIENT_ID/,
      );
    } finally {
      if (previousId !== undefined) process.env.GOOGLE_CLIENT_ID = previousId;
      if (previousSecret !== undefined)
        process.env.GOOGLE_CLIENT_SECRET = previousSecret;
    }
  });
});
