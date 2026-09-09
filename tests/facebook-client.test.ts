import { describe, expect, it, vi } from "vitest";

import { listManagedPages, listSources } from "@/lib/platforms/facebook/client";

describe("Facebook Page client", () => {
  it("discovers managed Pages and follows pagination", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: "1", name: "Woodshop", link: "https://www.facebook.com/woodshop" }],
        paging: { next: "https://graph.facebook.com/v23.0/me/accounts?page=2" },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: "2", name: "Garden", category: "Home" }],
      }), { status: 200 }));
    const pages = await listManagedPages({ accessToken: "token" }, { fetchFn });
    expect(pages.map((page) => page.id)).toEqual(["1", "2"]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("normalizes managed Pages without presenting unsupported capabilities", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: "1", name: "Woodshop", category: "Community" }],
    }), { status: 200 }));
    const batches: unknown[] = [];
    for await (const batch of listSources({ accessToken: "token" }, { fetchFn })) {
      batches.push(batch);
    }
    expect(batches).toHaveLength(1);
  });
});
