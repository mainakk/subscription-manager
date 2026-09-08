/**
 * AES-256-GCM refresh-token encryption (app-level, Vercel-compatible).
 *
 * SERVER-ONLY by convention: imported exclusively by Route Handlers
 * (kept free of `import "server-only"` so Vitest can exercise it).
 *
 * Rationale over Supabase Vault: no extra infrastructure, works on any
 * Postgres, key rotation is a redeploy. Revisit if compliance ever
 * requires HSM-backed keys.
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const PREFIX = "v1";

/** Loads the 32-byte base64 key. Names the variable, never logs key material. */
export function getEncryptionKey(): Buffer {
  const raw = process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("Missing YOUTUBE_TOKEN_ENCRYPTION_KEY.");
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw.trim(), "base64");
  } catch {
    throw new Error("YOUTUBE_TOKEN_ENCRYPTION_KEY is not valid base64.");
  }
  if (key.length !== KEY_BYTES) {
    throw new Error("YOUTUBE_TOKEN_ENCRYPTION_KEY must decode to 32 bytes.");
  }
  return key;
}

/** Encrypts a refresh token to `v1.<iv-b64url>.<ciphertext+tag-b64url>`. */
export function encryptRefreshToken(
  plaintext: string,
  key: Buffer = getEncryptionKey(),
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  if (tag.length !== TAG_BYTES) {
    throw new Error("Unexpected GCM auth tag length.");
  }
  const payload = Buffer.concat([ciphertext, tag]).toString("base64url");
  return `${PREFIX}.${iv.toString("base64url")}.${payload}`;
}

/** Decrypts a payload produced by encryptRefreshToken. Throws on any tampering. */
export function decryptRefreshToken(
  payload: string,
  key: Buffer = getEncryptionKey(),
): string {
  const parts = payload.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) {
    throw new Error("Malformed encrypted token payload.");
  }
  // Constant-time prefix check defense-in-depth (GCM auth is the real guarantee).
  if (!timingSafeEqual(Buffer.from(parts[0]), Buffer.from(PREFIX))) {
    throw new Error("Malformed encrypted token payload.");
  }
  const iv = Buffer.from(parts[1], "base64url");
  const combined = Buffer.from(parts[2], "base64url");
  if (iv.length !== IV_BYTES || combined.length <= TAG_BYTES) {
    throw new Error("Malformed encrypted token payload.");
  }
  const ciphertext = combined.subarray(0, combined.length - TAG_BYTES);
  const tag = combined.subarray(combined.length - TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8",
  );
}
