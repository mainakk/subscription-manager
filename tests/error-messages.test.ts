import { describe, expect, it } from "vitest";

import {
  enrichFailureMessage,
  KNOWN_SYNC_ERROR_CODES,
  requestErrorMessage,
} from "@/lib/error-messages";

describe("requestErrorMessage", () => {
  it("maps quota and reconnect codes to actionable text", () => {
    expect(requestErrorMessage("quota_exhausted")).toMatch(/quota/i);
    expect(requestErrorMessage("reconnect_required")).toMatch(/reconnect/i);
    expect(requestErrorMessage("rate_limited")).toMatch(/wait a minute/i);
  });

  it("covers every known sync banner code", () => {
    for (const code of KNOWN_SYNC_ERROR_CODES) {
      expect(requestErrorMessage(code)).not.toBe("Something went wrong. Try again.");
    }
  });

  it("falls back to generic text for unknown codes", () => {
    expect(requestErrorMessage("bogus_code")).toBe("Something went wrong. Try again.");
    expect(requestErrorMessage("")).toBe("Something went wrong. Try again.");
  });
});

describe("enrichFailureMessage", () => {
  it("strips the uploads_failed prefix and explains the cause", () => {
    expect(enrichFailureMessage("uploads_failed:quota_exhausted")).toBe(
      "YouTube quota exhausted — retry later",
    );
    expect(enrichFailureMessage("quota_exhausted")).toBe(
      "YouTube quota exhausted — retry later",
    );
  });

  it("maps AI and db failure codes", () => {
    expect(enrichFailureMessage("llm_invalid_output")).toMatch(/unusable/i);
    expect(enrichFailureMessage("db_failed")).toMatch(/save/i);
  });

  it("passes unknown codes through unchanged", () => {
    expect(enrichFailureMessage("weird_code")).toBe("weird_code");
  });
});
