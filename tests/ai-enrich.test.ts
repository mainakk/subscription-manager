import { describe, expect, it } from "vitest";

import {
  buildEnrichmentMessages,
  enrichWithLlm,
  extractJsonObject,
  getAiConfig,
  type EnrichInput,
} from "@/lib/ai/enrich";
import { CATEGORIES, categorySlug } from "@/lib/categories";
import llmFixture from "@/tests/fixtures/llm-enrichment.json";

const config = {
  apiKey: "test-key",
  baseUrl: "https://llm.example.test/v1",
  model: "test-model",
};

const baseInput: EnrichInput = {
  name: "Bourbon Moth Woodworking",
  providerDescription: "Traditional hardwood furniture and joinery shop projects.",
  subscriberCount: 850000,
  videoCount: 412,
  lastUploadAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
  recentVideoTitles: ["Shaker Table Build", "Dovetails by Hand"],
  libraryTotal: 120,
  topCategories: [
    { category: "Woodworking", count: 9 },
    { category: "Cooking", count: 7 },
  ],
};

function chatFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
}

describe("enrichment prompt", () => {
  it("pins the controlled vocabulary and forbids watch-history claims", () => {
    const [system, user] = buildEnrichmentMessages(baseInput);
    expect(system.content).toContain("Woodworking");
    expect(system.content).toContain("Other");
    expect(system.content).toMatch(/watch history/i);
    expect(system.content).toMatch(/NEVER claim/);
    expect(user.content).toContain("Bourbon Moth Woodworking");
    expect(user.content).toContain("Shaker Table Build");
    expect(user.content).toContain("active within the last month");
  });

  it("describes stale uploads honestly", () => {
    const [, user] = buildEnrichmentMessages({
      ...baseInput,
      lastUploadAt: new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString(),
      recentVideoTitles: [],
    });
    expect(user.content).toMatch(/months ago/);
    expect(user.content).toContain("Recent video titles: unknown");
  });
});

describe("enrichWithLlm", () => {
  it("parses a valid flat payload", async () => {
    const out = await enrichWithLlm(baseInput, config, chatFetch(llmFixture.valid));
    expect(out.enrichment).toMatchObject({
      category: "Woodworking",
      subcategory: "Furniture",
      confidence: 0.91,
    });
    expect(out.enrichment.topics).toHaveLength(3);
    expect(out.recommendation).toMatchObject({ verdict: "KEEP" });
  });

  it("strips markdown fences", async () => {
    const out = await enrichWithLlm(baseInput, config, chatFetch(llmFixture.fenced));
    expect(out.enrichment.category).toBe("Cooking");
    expect(out.recommendation.verdict).toBe("REVIEW");
  });

  it("repairs an invalid reply once, then succeeds", async () => {
    const calls: string[][] = [];
    const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
      calls.push(body.messages.map((m) => m.content));
      const attempt = calls.length;
      return new Response(
        JSON.stringify(attempt === 1 ? llmFixture.notJson : llmFixture.valid),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;
    const out = await enrichWithLlm(baseInput, config, fetchFn);
    expect(calls).toHaveLength(2);
    expect(calls[1].at(-1)).toMatch(/ONLY the corrected JSON/);
    expect(out.enrichment.category).toBe("Woodworking");
  });

  it("throws after two invalid replies without persisting anything", async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls += 1;
      return new Response(JSON.stringify(llmFixture.invalidCategory), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    await expect(enrichWithLlm(baseInput, config, fetchFn)).rejects.toMatchObject({
      name: "EnrichmentError",
      code: "llm_invalid_output",
    });
    expect(calls).toBe(2);
  });

  it("maps 401 to a non-retryable unauthorized error", async () => {
    await expect(
      enrichWithLlm(baseInput, config, chatFetch({ error: "bad key" }, 401)),
    ).rejects.toMatchObject({ code: "llm_unauthorized", retryable: false });
  });

  it("accepts prose-wrapped JSON via balanced-object extraction", async () => {
    const payload = `{"category": "Woodworking", "subcategory": "Furniture", "topics": ["joinery", "hand tools", "shop projects"], "description": "Builds hardwood furniture and demonstrates traditional joinery.", "confidence": 0.9, "verdict": "KEEP", "reason": "Active creator with a focused catalog."}`;
    const body = {
      choices: [
        {
          message: {
            content: `Sure! Here is my analysis:\n\`\`\`json\n${payload}\n\`\`\`\nHope that helps!`,
          },
        },
      ],
    };
    const out = await enrichWithLlm(baseInput, config, chatFetch(body));
    expect(out.enrichment).toMatchObject({
      category: "Woodworking",
      subcategory: "Furniture",
    });
    expect(out.recommendation).toMatchObject({ verdict: "KEEP" });
  });
});

describe("extractJsonObject", () => {
  it("returns pure JSON unchanged", () => {
    expect(extractJsonObject('{"a": 1}')).toBe('{"a": 1}');
  });

  it("finds the object inside prose and fences", () => {
    expect(
      extractJsonObject('Here you go:\n```json\n{"a": 1}\n```\nBye!'),
    ).toBe('{"a": 1}');
  });

  it("takes the first balanced object when several are present", () => {
    expect(extractJsonObject('{"a": 1} and {"b": 2}')).toBe('{"a": 1}');
  });

  it("ignores braces inside strings and handles escapes", () => {
    expect(extractJsonObject('Note {"text": "a {b} \\"quoted\\" c"} end')).toBe(
      '{"text": "a {b} \\"quoted\\" c"}',
    );
  });

  it("returns null for missing or unbalanced braces", () => {
    expect(extractJsonObject("no braces here")).toBeNull();
    expect(extractJsonObject('{"a": 1')).toBeNull();
  });
});

describe("AI config", () => {
  it("returns null without a key and names variables without leaking values", () => {
    const previous = process.env.OPENAI_API_KEY;
    try {
      delete process.env.OPENAI_API_KEY;
      expect(getAiConfig()).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    }
  });
});

describe("category slugs", () => {
  it("maps all 25 controlled names to distinct DB slugs", () => {
    const slugs = CATEGORIES.map(categorySlug);
    expect(new Set(slugs).size).toBe(25);
    expect(slugs.every((s) => /^[a-z0-9-]+$/.test(s))).toBe(true);
    expect(categorySlug("DIY & Home Improvement")).toBe("diy-home-improvement");
    expect(categorySlug("Art & Design")).toBe("art-design");
    expect(categorySlug("Engineering")).toBe("engineering");
    expect(categorySlug("Other")).toBe("other");
  });
});
