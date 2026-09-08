import { z } from "zod";

import {
  CategorySchema,
  SubcategorySchema,
  TopicsSchema,
} from "@/lib/categories";

/** Validated shape of AI enrichment output. Every LLM response must pass this. */
export const EnrichmentSchema = z.object({
  category: CategorySchema,
  subcategory: SubcategorySchema,
  topics: TopicsSchema,
  description: z.string().trim().min(1).max(280),
  confidence: z.number().min(0).max(1),
});

export type Enrichment = z.infer<typeof EnrichmentSchema>;

export const RecommendationVerdictSchema = z.enum([
  "KEEP",
  "REVIEW",
  "UNSUBSCRIBE",
]);

export type RecommendationVerdict = z.infer<typeof RecommendationVerdictSchema>;

export const RecommendationSchema = z.object({
  verdict: RecommendationVerdictSchema,
  reason: z.string().trim().min(1).max(280),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;

/**
 * Parses unknown LLM output. Returns the typed value or throws a ZodError.
 * Callers must catch and treat failures as "unenriched", never persist raw text.
 */
export function parseEnrichment(value: unknown): Enrichment {
  return EnrichmentSchema.parse(value);
}

export function parseRecommendation(value: unknown): Recommendation {
  return RecommendationSchema.parse(value);
}
