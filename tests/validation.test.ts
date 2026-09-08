import { describe, expect, it } from "vitest";

import {
  MAX_AI_TEXT_LENGTH,
  parseEnrichment,
  parseRecommendation,
} from "@/lib/validation";

const validEnrichment = {
  category: "Woodworking",
  subcategory: "Furniture",
  topics: ["joinery", "hardwood furniture", "hand tools"],
  description: "Creates traditional hardwood furniture projects.",
  confidence: 0.94,
};

describe("AI enrichment validation", () => {
  it("accepts a well-formed enrichment payload", () => {
    expect(parseEnrichment(validEnrichment)).toMatchObject({
      category: "Woodworking",
      confidence: 0.94,
    });
  });

  it("rejects invented categories, bad topics, and out-of-range confidence", () => {
    expect(() =>
      parseEnrichment({ ...validEnrichment, category: "Knitting" }),
    ).toThrow();
    expect(() =>
      parseEnrichment({ ...validEnrichment, topics: ["only-one"] }),
    ).toThrow();
    expect(() =>
      parseEnrichment({ ...validEnrichment, confidence: 1.5 }),
    ).toThrow();
    expect(() => parseEnrichment({ ...validEnrichment })).not.toThrow();
  });

  it("never persists raw text blindly: malformed payloads throw", () => {
    expect(() => parseEnrichment(null)).toThrow();
    expect(() => parseEnrichment("just a string")).toThrow();
    expect(() => parseEnrichment({})).toThrow();
  });

  it("allows free text up to the shared limit and rejects beyond it", () => {
    const ok = "x".repeat(MAX_AI_TEXT_LENGTH);
    const tooLong = "x".repeat(MAX_AI_TEXT_LENGTH + 1);
    expect(() =>
      parseEnrichment({ ...validEnrichment, description: ok }),
    ).not.toThrow();
    expect(() =>
      parseEnrichment({ ...validEnrichment, description: tooLong }),
    ).toThrow();
  });
});

describe("AI recommendation validation", () => {
  it("accepts KEEP/REVIEW/UNSUBSCRIBE with a reason", () => {
    expect(
      parseRecommendation({ verdict: "UNSUBSCRIBE", reason: "No uploads in 11 months." }),
    ).toMatchObject({ verdict: "UNSUBSCRIBE" });
  });

  it("rejects missing reasons and unknown verdicts", () => {
    expect(() =>
      parseRecommendation({ verdict: "UNSUBSCRIBE", reason: "" }),
    ).toThrow();
    expect(() =>
      parseRecommendation({ verdict: "DELETE", reason: "x" }),
    ).toThrow();
  });

  it("allows reasons up to the shared limit and rejects beyond it", () => {
    const ok = "x".repeat(MAX_AI_TEXT_LENGTH);
    const tooLong = "x".repeat(MAX_AI_TEXT_LENGTH + 1);
    expect(() =>
      parseRecommendation({ verdict: "KEEP", reason: ok }),
    ).not.toThrow();
    expect(() =>
      parseRecommendation({ verdict: "KEEP", reason: tooLong }),
    ).toThrow();
  });
});
