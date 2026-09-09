import type { NormalizedSource, PlatformAdapterContext } from "@/lib/platforms/types";
import { PagesResponseSchema, type FacebookPage } from "./schema";
import { GRAPH_VERSION } from "@/lib/facebook/oauth";

const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;
export class FacebookApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  constructor(code: string, retryable = false) {
    super(`Facebook API request failed (${code})`);
    this.name = "FacebookApiError";
    this.code = code;
    this.retryable = retryable;
  }
}

async function graphGet(url: string, token: string, fetchFn: typeof fetch): Promise<unknown> {
  const request = new URL(url);
  request.searchParams.set("access_token", token);
  let response: Response;
  try {
    response = await fetchFn(request);
  } catch {
    throw new FacebookApiError("provider_error", true);
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new FacebookApiError("reconnect_required");
    if (response.status === 429 || response.status >= 500) throw new FacebookApiError("provider_error", true);
    throw new FacebookApiError("bad_request");
  }
  return response.json();
}

export async function listManagedPages(
  ctx: PlatformAdapterContext,
  options?: { fetchFn?: typeof fetch },
): Promise<FacebookPage[]> {
  const fetchFn = options?.fetchFn ?? fetch;
  const pages: FacebookPage[] = [];
  let next: string | undefined = `${GRAPH_URL}/me/accounts?fields=id,name,link,picture,category,access_token&limit=100`;
  while (next) {
    const parsed = PagesResponseSchema.parse(await graphGet(next, ctx.accessToken, fetchFn));
    pages.push(...parsed.data);
    next = parsed.paging?.next;
  }
  return pages;
}

export async function* listSources(
  ctx: PlatformAdapterContext,
  options?: { fetchFn?: typeof fetch },
): AsyncIterable<NormalizedSource[]> {
  const pages = await listManagedPages(ctx, options);
  yield pages.map((page) => ({
    externalId: page.id,
    subscriptionExternalId: null,
    name: page.name,
    url: page.link ?? `https://www.facebook.com/${page.id}`,
    imageUrl: page.picture?.data?.url ?? null,
    providerDescription: page.category ? `Facebook Page · ${page.category}` : "Facebook Page",
    subscribedAt: null,
    videoCount: null,
    subscriberCount: null,
    lastUploadAt: null,
    metadata: { category: page.category ?? null, managed: true },
  }));
}
