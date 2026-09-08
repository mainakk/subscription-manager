import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  decryptRefreshToken,
  encryptRefreshToken,
  getEncryptionKey,
} from "@/lib/youtube/token-crypto";

function testKey(): Buffer {
  return randomBytes(32);
}

describe("refresh token encryption", () => {
  it("round-trips a refresh token", () => {
    const key = testKey();
    const payload = encryptRefreshToken("1//09refresh-token-value", key);
    expect(payload.startsWith("v1.")).toBe(true);
    expect(decryptRefreshToken(payload, key)).toBe("1//09refresh-token-value");
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const key = testKey();
    const a = encryptRefreshToken("same", key);
    const b = encryptRefreshToken("same", key);
    expect(a).not.toBe(b);
    expect(decryptRefreshToken(a, key)).toBe("same");
    expect(decryptRefreshToken(b, key)).toBe("same");
  });

  it("rejects decryption with the wrong key", () => {
    const payload = encryptRefreshToken("secret", testKey());
    expect(() => decryptRefreshToken(payload, testKey())).toThrow();
  });

  it("rejects tampered payloads", () => {
    const key = testKey();
    const payload = encryptRefreshToken("secret", key);
    const parts = payload.split(".");
    const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -2)}AA`;
    expect(() => decryptRefreshToken(tampered, key)).toThrow();
    expect(() => decryptRefreshToken("garbage", key)).toThrow();
    expect(() => decryptRefreshToken("v0.abc.def", key)).toThrow();
  });

  it("validates the configured key", () => {
    const previous = process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY;
    try {
      process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY = "too-short";
      expect(() => getEncryptionKey()).toThrow(/32 bytes/);
      delete process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY;
      expect(() => getEncryptionKey()).toThrow(/Missing/);
    } finally {
      if (previous === undefined) delete process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY;
      else process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY = previous;
    }
  });
});
