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

/** Subcategory/topics are free-form; only the top level is controlled. */
export const SubcategorySchema = z.string().trim().min(1).max(60);
export const TopicSchema = z.string().trim().min(1).max(40);
export const TopicsSchema = z.array(TopicSchema).min(3).max(8);
