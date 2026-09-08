import { describe, expect, it } from "vitest";

import {
  CATEGORIES,
  CategorySchema,
  isValidCategory,
} from "@/lib/categories";

describe("controlled category vocabulary", () => {
  it("contains exactly the 25 MVP categories", () => {
    expect(CATEGORIES).toHaveLength(25);
    expect(CATEGORIES).toContain("Woodworking");
    expect(CATEGORIES).toContain("Engineering");
    expect(CATEGORIES).toContain("Other");
  });

  it("accepts every controlled category", () => {
    for (const category of CATEGORIES) {
      expect(CategorySchema.safeParse(category).success).toBe(true);
      expect(isValidCategory(category)).toBe(true);
    }
  });

  it("rejects LLM-invented top-level categories", () => {
    for (const invented of ["Knitting", "woodworking", "WOODWORKING", ""]) {
      expect(CategorySchema.safeParse(invented).success).toBe(false);
      expect(isValidCategory(invented)).toBe(false);
    }
  });
});
