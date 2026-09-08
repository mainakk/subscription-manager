import { z } from "zod";

/**
 * Controlled top-level category vocabulary (M0).
 * The LLM must never invent top-level categories outside this list.
 * Single source of truth in code; mirrored by the categories DB seed table.
 */
export const CATEGORIES = [
  "Cooking",
  "Woodworking",
  "DIY & Home Improvement",
  "Technology",
  "Programming",
  "Business",
  "Finance",
  "News",
  "Science",
  "Education",
  "Fitness",
  "Cycling",
  "Travel",
  "Automotive",
  "Gaming",
  "Music",
  "Art & Design",
  "Photography",
  "Fashion",
  "Lifestyle",
  "Comedy",
  "Entertainment",
  "Sports",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CategorySchema = z.enum(CATEGORIES);

export function isValidCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

/**
 * DB slug for a controlled category name. Must stay in sync with the
 * `categories` seed table in supabase/migrations/0001_init.sql
 * (covered by tests over all 24 names).
 */
const CATEGORY_SLUGS: Record<Category, string> = {
  Cooking: "cooking",
  Woodworking: "woodworking",
  "DIY & Home Improvement": "diy-home-improvement",
  Technology: "technology",
  Programming: "programming",
  Business: "business",
  Finance: "finance",
  News: "news",
  Science: "science",
  Education: "education",
  Fitness: "fitness",
  Cycling: "cycling",
  Travel: "travel",
  Automotive: "automotive",
  Gaming: "gaming",
  Music: "music",
  "Art & Design": "art-design",
  Photography: "photography",
  Fashion: "fashion",
  Lifestyle: "lifestyle",
  Comedy: "comedy",
  Entertainment: "entertainment",
  Sports: "sports",
  Other: "other",
};

export function categorySlug(category: Category): string {
  return CATEGORY_SLUGS[category];
}

/** Reverse lookup for display; null for unknown slugs. */
export function categoryNameForSlug(slug: string): Category | null {
  return CATEGORIES.find((name) => CATEGORY_SLUGS[name] === slug) ?? null;
}

/** Subcategory/topics are free-form; only the top level is controlled. */
export const SubcategorySchema = z.string().trim().min(1).max(60);
export const TopicSchema = z.string().trim().min(1).max(40);
export const TopicsSchema = z.array(TopicSchema).min(3).max(8);
