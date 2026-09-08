/**
 * OpenAI-compatible source enrichment (M3).
 *
 * SERVER-ONLY by convention: imported exclusively by Route Handlers
 * (kept free of `import "server-only"` so Vitest can exercise it).
 *
 * Contract: one chat-completions call per source, `response_format`
 * json_object, flat 7-key payload validated by Zod, exactly one repair
 * retry. Persistent failure throws — callers treat the source as
 * unenriched and never persist raw model text.
 *
 * Honesty constraint (see M0 plan §2.3): the model has NO access to the
 * user's watch history. The prompt forbids inventing viewing behavior;
 * verdicts may only cite upload recency, output volume, audience scale,
 * description specificity, and library fit.
 */
import { z } from "zod";

import { CATEGORIES, type Category } from "@/lib/categories";
import {
  MAX_AI_TEXT_LENGTH,
  RecommendationSchema,
  EnrichmentSchema,
  type Recommendation,
  type Enrichment,
} from "@/lib/validation";

export const ENRICHMENT_PROMPT_VERSION = "v3";
const LLM_TIMEOUT_MS = 60_000;
const MAX_TOKENS = 600;

export interface AiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * Reads LLM config from env. Returns null when no key is configured
 * (routes answer `ai_not_configured`); names variables, never values.
 */
export function getAiConfig(): AiConfig | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const baseUrl =
    process.env.OPENAI_BASE_URL?.replace(/\/$/, "") ||
    "https://api.openai.com/v1";
  return {
    apiKey,
    baseUrl,
    model: process.env.ENRICHMENT_MODEL || "gpt-4o-mini",
  };
}

export interface EnrichInput {
  name: string;
  providerDescription: string | null;
  subscriberCount: number | null;
  videoCount: number | null;
  lastUploadAt: string | null;
  recentVideoTitles: string[];
  libraryTotal: number;
  /** Top categories already assigned in this library (name + count). */
  topCategories: { category: Category; count: number }[];
}

export interface EnrichOutput {
  enrichment: Enrichment;
  recommendation: Recommendation;
}

/** Normalized LLM failure. Never carries keys or raw provider text. */
export class EnrichmentError extends Error {
  readonly code: "llm_request_failed" | "llm_unauthorized" | "llm_invalid_output";
  readonly retryable: boolean;

  constructor(code: EnrichmentError["code"], retryable: boolean) {
    super(`AI enrichment failed (${code})`);
    this.name = "EnrichmentError";
    this.code = code;
    this.retryable = retryable;
  }
}

const CombinedSchema = z.object({
  category: EnrichmentSchema.shape.category,
  subcategory: EnrichmentSchema.shape.subcategory,
  topics: EnrichmentSchema.shape.topics,
  description: EnrichmentSchema.shape.description,
  confidence: EnrichmentSchema.shape.confidence,
  verdict: RecommendationSchema.shape.verdict,
  reason: RecommendationSchema.shape.reason,
});

const SYSTEM_PROMPT = `You analyze a YouTube channel for a personal subscription manager. \
Return ONLY a single JSON object with exactly these keys: category, subcategory, topics, \
description, confidence, verdict, reason.

Rules:
- category MUST be exactly one of: ${CATEGORIES.join(" | ")}. Never invent another top-level category.
- subcategory is a short free-form label (e.g. "Furniture", "Sourdough").
- topics: 3-8 short lowercase topic phrases.
- description: one or two sentences describing WHAT the channel publishes \
(hard limit ${MAX_AI_TEXT_LENGTH} characters — longer replies are rejected). \
Content-focused, no marketing language, no second person, no praise.
- confidence: 0-1 self-assessed categorization confidence.
- verdict is KEEP, REVIEW, or UNSUBSCRIBE with reason (hard limit \
${MAX_AI_TEXT_LENGTH} characters — longer replies are rejected) citing concrete evidence.
- You do NOT know the user's watch history. NEVER claim the user has or hasn't watched anything, \
and never invent viewing frequency. Judge only by: upload recency, output volume, audience scale, \
description specificity, and fit within the user's library.
- UNSUBSCRIBE only with concrete evidence (e.g. no uploads in 12+ months combined with narrow \
redundant coverage). When uncertain, choose REVIEW. Active, specific creators are KEEP.`;

function formatCount(value: number | null, singular: string): string {
  if (value === null) return "unknown";
  return `${value.toLocaleString()} ${singular}${value === 1 ? "" : "s"}`;
}

function formatRecency(lastUploadAt: string | null): string {
  if (!lastUploadAt) return "unknown (no recent-upload data)";
  const time = Date.parse(lastUploadAt);
  if (Number.isNaN(time)) return "unknown (no recent-upload data)";
  const months = Math.floor((Date.now() - time) / (30 * 24 * 3600 * 1000));
  const date = new Date(time).toISOString().slice(0, 10);
  if (months <= 0) return `${date} (active within the last month)`;
  if (months === 1) return `${date} (about 1 month ago)`;
  return `${date} (about ${months} months ago)`;
}

/** Builds the [system, user] message pair. Pure and unit-tested. */
export function buildEnrichmentMessages(input: EnrichInput): [
  { role: "system"; content: string },
  { role: "user"; content: string },
] {
  const lines = [
    `Channel name: ${input.name}`,
    `Channel description: ${input.providerDescription?.slice(0, 1000) || "(none provided)"}`,
    `Subscribers: ${formatCount(input.subscriberCount, "subscriber")}`,
    `Total videos: ${formatCount(input.videoCount, "video")}`,
    `Latest upload: ${formatRecency(input.lastUploadAt)}`,
    input.recentVideoTitles.length > 0
      ? `Recent video titles:\n${input.recentVideoTitles.map((t) => `- ${t}`).join("\n")}`
      : "Recent video titles: unknown",
    `User library: ${input.libraryTotal} total sources.`,
  ];
  if (input.topCategories.length > 0) {
    lines.push(
      `Largest categories in this library: ${input.topCategories
        .map((c) => `${c.category} (${c.count})`)
        .join(", ")}.`,
    );
  }
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: lines.join("\n") },
  ];
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return match ? match[1].trim() : trimmed;
}

/**
 * Extracts the first balanced `{…}` object from free-form model output.
 * Small models wrap JSON in prose and fences, which whole-string parsing
 * rejects outright. String-aware so braces inside quoted values don't
 * disturb depth tracking. Returns null when unbalanced (e.g. output cut
 * off by `max_tokens`). Exported for unit tests.
 */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Opt-in diagnostics (`ENRICH_DEBUG=1`): logs why model output failed
 * validation to the server console. Never logs keys; raw snippets are
 * truncated. Off by default.
 */
function debugLog(...args: unknown[]): void {
  const flag = process.env.ENRICH_DEBUG;
  if (flag === "1" || flag?.toLowerCase() === "true") {
    console.warn("[enrich-debug]", ...args);
  }
}

const ChatResponseSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable() }) }))
    .min(1),
});

async function completeOnce(
  config: AiConfig,
  messages: { role: string; content: string }[],
  fetchFn: typeof fetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchFn(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        max_tokens: MAX_TOKENS,
        response_format: { type: "json_object" },
        messages,
      }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
  } catch {
    throw new EnrichmentError("llm_request_failed", true);
  }
  if (response.status === 401) {
    throw new EnrichmentError("llm_unauthorized", false);
  }
  if (!response.ok) {
    throw new EnrichmentError("llm_request_failed", response.status >= 500);
  }
  let json: unknown;
  try {
    json = (await response.json()) as unknown;
  } catch {
    throw new EnrichmentError("llm_invalid_output", true);
  }
  const parsed = ChatResponseSchema.safeParse(json);
  const content = parsed.success ? parsed.data.choices[0].message.content : null;
  if (!content) {
    throw new EnrichmentError("llm_invalid_output", true);
  }
  let payload: unknown;
  try {
    const candidate = extractJsonObject(stripCodeFences(content));
    payload = JSON.parse(candidate ?? content) as unknown;
  } catch {
    debugLog("unparseable model output:", content.slice(0, 500));
    throw new EnrichmentError("llm_invalid_output", true);
  }
  const validated = CombinedSchema.safeParse(payload);
  if (!validated.success) {
    const issues = validated.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    debugLog("schema validation failed:", issues);
    const err = new EnrichmentError("llm_invalid_output", true);
    (err as { validationIssues?: string }).validationIssues = issues;
    throw err;
  }
  const { verdict, reason, ...enrichment } = validated.data;
  return { enrichment, recommendation: { verdict, reason } };
}

/** One source, one call, one repair retry. Throws EnrichmentError. */
export async function enrichWithLlm(
  input: EnrichInput,
  config: AiConfig,
  fetchFn: typeof fetch = fetch,
): Promise<EnrichOutput> {
  const [system, user] = buildEnrichmentMessages(input);
  try {
    return (await completeOnce(
      config,
      [system, user],
      fetchFn,
    )) as EnrichOutput;
  } catch (err) {
    if (!(err instanceof EnrichmentError) || err.code !== "llm_invalid_output") {
      throw err;
    }
    const hint = (err as { validationIssues?: string }).validationIssues;
    const repair = {
      role: "user",
      content: `Your previous reply was not valid JSON matching the schema${hint ? `: ${hint}` : ""}. Reply with ONLY the corrected JSON object, no other text.`,
    };
    return (await completeOnce(
      config,
      [system, user, repair],
      fetchFn,
    )) as EnrichOutput;
  }
}
