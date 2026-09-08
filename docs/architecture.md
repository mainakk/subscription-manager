# Architecture (M0)

Corrected layering (the `AGENTS.md` diagram is superseded by this):

```
UI (App Router: Server Components + minimal Client Components)
  |
  v
Application logic (Route Handlers / Server Actions, lib/)
  |
  +---> Source repository (Supabase Postgres via lib/supabase/*, lib/db/*)
  +---> Platform adapters (lib/platforms/*; YouTube in M1)
  +---> AI enrichment layer (M3; validated structured output only)
  |
  v
PostgreSQL (Supabase, RLS-enforced)
```

## Rules

- UI never calls YouTube APIs and never handles OAuth tokens.
- Browser uses the anon key + user JWT with RLS. Privileged work (tokens,
  bulk mutations) uses Route Handlers/Server Actions with the service-role
  client (`lib/supabase/admin.ts`) after `getAuthenticatedUser()`, scoped by
  `user_id` in code.
- AI output is validated with Zod (`lib/validation.ts`) before persistence.
  Malformed output is stored as "unenriched", never as raw text.
- Destructive flows (M2): select -> review -> explicit confirm -> per-item
  external execution -> per-item audit rows -> local state update only on
  confirmed success -> success/failure summary with retry.

## M0 scope

Next.js 16 App Router + TS strict + Tailwind v4 + shadcn/ui baseline
(`components.json`, `lib/utils.ts`, `components/ui/button.tsx`), Supabase
client/server/admin wiring, initial migration, Auth shell
(`/login`, `/auth/callback`), controlled category vocabulary,
adapter interface + registry, Zod validation schemas, Vitest suites.

Deferred to M1+: YouTube OAuth, sync, dashboard list, bulk unsubscribe,
AI enrichment calls, background jobs (none in MVP; synchronous paginated
sync while libraries are small).

## M1 scope (YouTube connection + import + dashboard)

- OAuth: `GET /api/youtube/connect` builds the Google consent URL
  (minimal scopes `youtube.readonly` + `youtube.force-ssl`, offline access,
  single-use `state` cookie); `GET /api/youtube/callback` validates state,
  exchanges the code server-side, and stores only the AES-256-GCM encrypted
  refresh token (`lib/youtube/token-crypto.ts`, key from
  `YOUTUBE_TOKEN_ENCRYPTION_KEY`). No openid/email/profile scopes: identity
  stays with Supabase Auth.
- Sync: `POST /api/youtube/sync` refreshes the access token per run (never
  persisted), walks `subscriptions.list` pages, enriches each page via
  batched `channels.list`, and upserts `sources` by
  `(user_id, platform, external_id)`. Status transitions are reconciled, not
  overwritten: unseen active rows become `unavailable_externally`,
  reappearing rows reactivate. `subscriptions.delete` exists in the client
  for M2; no unsubscribe route in M1.
- Dashboard: `/dashboard` (server component + RLS reads) with connection
  panel, one-shot auto-import after connect, manual sync, disconnect
  (best-effort remote revocation + local token wipe), and a plain source
  list. Search/filter/sort/selection/bulk actions are M2.
- YouTube HTTP lives behind `lib/platforms/youtube/client.ts` with typed
  errors (`unauthenticated` / `quota_exhausted` / `rate_limited` /
  `not_found`), retry for transient failures only, and fixture-driven unit
  tests. Adapter registry wiring is deferred to M2 (first multi-scope use).

## M2 scope (browse + safe bulk unsubscribe + history)

- Explorer: `SourcesExplorer` (client) over server-fetched rows —
  multi-token search (name/description/URL), platform + status filters,
  name/newest/oldest sorts, all client-side. Category/recommendation
  filters wait for M3 enrichment data. Only `active` sources are
  selectable.
- Bulk unsubscribe: select → review dialog (capability warning + explicit
  confirm) → `POST /api/sources/unsubscribe` (Zod body, max 50, ownership
  re-validated server-side) → `executeBulkUnsubscribe`
  (`lib/sources/unsubscribe.ts`) runs external deletes sequentially via the
  registered adapter, audits every item to `user_actions`, updates local
  state only on confirmed success, and reports per-item outcomes with
  retry for retryable failures. Already-gone (404) counts as success with
  a note; unknown ids are reported without audit rows (FK).
- History: `/history` lists `user_action_batches` with per-batch item
  detail. No schema changes in M2 (0001 tables as designed).

## M3 scope (AI enrichment + recommendations + cleanup summary)

- LLM access is OpenAI-compatible chat completions (`lib/ai/enrich.ts`),
  configured by `OPENAI_API_KEY` (+ optional `OPENAI_BASE_URL`,
  `ENRICHMENT_MODEL`); no key means `ai_not_configured`, never a mock
  presented as real. One call per source, `temperature 0.2`,
  `response_format json_object`, flat 7-key payload validated by Zod with
  exactly one repair retry; persistent failure leaves the source
  unenriched (absence of a row) and is reported per item.
- The prompt forbids inventing watch history: verdicts may only cite
  upload recency, output volume, audience scale, description
  specificity, and library fit. Single-pass design — code-computed topic
  overlap is stored in recommendation `signals` after the fact, never
  claimed by the verdict.
- Upload evidence comes from `playlistItems.list` (1 quota unit/channel,
  latest date + up to 5 titles) and refreshes `sources.last_upload_at`;
  sources without an uploads playlist id skip the lookup.
- `POST /api/sources/enrich` processes chunks (default 10, max 25) with
  concurrency 3; the dashboard loops until `remaining` is 0, so long
  libraries never hit serverless timeouts. `force: true` re-runs
  already-enriched rows (prompt iteration). No schema changes in M3.
- Dashboard: AI Cleanup panel (analyzed/verdict/stale counts + Analyze
  button with progress), category + recommendation filters and sorts,
  enriched cards (category line, AI description, topic chips, verdict +
  reason). Search also covers subcategory, topics, and category slugs.
