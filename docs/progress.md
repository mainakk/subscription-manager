# Progress Record

Product spec: `docs/product.md`. Architecture milestones: `docs/architecture.md`.

## Done

- **M0 Scaffold** (`61a1398`) — Next.js 16 + TS strict + Tailwind v4 + shadcn baseline,
  Supabase client/server/admin wiring, initial migration, Auth shell
  (`/login`, `/auth/callback`), controlled category vocabulary, adapter
  interface + registry, Zod validation schemas, Vitest suites.
- **M1 YouTube connection + import + dashboard** (`81d39db`) — OAuth connect/callback
  (minimal `youtube.readonly` + `youtube.force-ssl`, AES-256-GCM refresh token),
  paginated `POST /api/youtube/sync` with channel enrichment and status
  reconciliation, `/dashboard` with connection panel, auto-import, manual sync,
  disconnect, plain source list.
- **M2 Browse + safe bulk unsubscribe + history** (`ebaa07e`) — `SourcesExplorer`
  (multi-token search, platform + status filters, name/newest/oldest sorts,
  multi-select of `active` only), `POST /api/sources/unsubscribe` (max 50,
  ownership re-validated, sequential adapter deletes, per-item audit to
  `user_actions`, local state only on confirmed success, 404 = `already_gone`
  success, unknown ids reported without audit rows), `/history` batch + item
  detail. No schema changes.
- **M3 AI enrichment + recommendations + cleanup summary** (`e9a4371`, plus
  `a35951d` / `9fd2623` enrich-loop fixes) — OpenAI-compatible chat completions
  (`lib/ai/enrich.ts`, `temperature 0.2`, `json_object`, 1 repair retry,
  prose/fence-tolerant parse), prompt forbids inventing watch history,
  `playlistItems.list` upload evidence into `sources.last_upload_at`,
  `POST /api/sources/enrich` chunked (default 10, max 25, concurrency 3,
  circuit breaker halts on all-fail chunk), dashboard loops until `remaining`
  is 0, `force: true` re-runs. Dashboard: AI Cleanup panel, category +
  recommendation filters/sorts, enriched cards. No schema changes.

## In progress (uncommitted, being tested)

AI enrichment validation errors on small-model output — long
descriptions/reasons rejected by the 280-char Zod cap:

- `lib/validation.ts` — new `MAX_AI_TEXT_LENGTH = 560`, applied to
  `EnrichmentSchema.description` and `RecommendationSchema.reason`.
- `lib/ai/enrich.ts` — `ENRICHMENT_PROMPT_VERSION` `v1` → `v2`; prompt states
  the hard limit explicitly while keeping "one or two sentences" guidance.
- `tests/validation.test.ts` — boundary tests (accept at limit, reject at
  limit+1) for both fields.
- `package.json` / `package-lock.json`, `AGENTS.md`, `docs/product.md` show as
  modified — `git diff --ignore-cr-at-eol` confirms only the three files above
  have real changes; the rest is line-ending noise. Do not commit the noise.

User is currently running the AI enrichment + recommendations model run to
verify the fix. Next step after green run: commit the three files only.

## In progress (uncommitted) — Engineering category

Model run surfaced `[enrich-debug] schema validation failed ... received
'Engineering'` — the 24-item vocabulary had no bucket for engineering
channels (Technology/Science too coarse). Change:

- `lib/categories.ts` — added `Engineering` (slug `engineering`, after
  Education); prompt version `v2` → `v3` since the taxonomy change alters
  model behavior and rows record `prompt_version` for traceability.
- `supabase/migrations/0002_add_engineering_category.sql` — inserts the seed
  row (sort 24, moves `Other` to 25), idempotent via `on conflict`.
  Applied via `npx supabase db push` and verified (25 rows, `engineering`
  at 24, `other` at 25).
- Tests updated to 25 (`tests/categories.test.ts`,
  `tests/ai-enrich.test.ts` + slug assertion).
- Docs updated: `AGENTS.md`, `docs/product.md` (renumbered),
  `docs/database.md`, `README.md`.

## M4 Polish (next)

Scope: sorting, platform filter (single-option now, proves extensibility),
disconnect/delete data, quota/error UX, Vercel deploy.

Status assessed 2026-09-08:

- [x] Sorting — done (`name`, `newest`, `oldest`, `category`,
  `recommendation` in `lib/sources/filter.ts` + `FilterBar`).
- [x] Platform filter (single-option) — done (`all` / `youtube` in
  `FilterBar`; `filterSources` already scopes by `platform`).
- [x] Disconnect / delete data — `POST /api/youtube/disconnect` (revoke +
  token wipe, keeps sources) plus new `POST /api/account/delete-data`:
  best-effort grant revocation, then deletes all owned rows via
  `executeDeleteUserData` (`lib/account/delete-user-data.ts`) — batches,
  sources (enrichments/recommendations/actions cascade), connections —
  returning counts. Auth account is kept (empty library on next sign-in).
  UI: `DeleteDataButton` two-step inline confirm in a dashboard
  "Data & privacy" section. No schema changes (deletes only).
- [x] Quota / error UX — shared `lib/error-messages.ts`
  (`requestErrorMessage`, `enrichFailureMessage`, allowlisted
  `KNOWN_SYNC_ERROR_CODES`) now used by `SyncButton`, `EnrichPanel`
  (route errors + per-item failure reasons instead of raw codes), the
  dashboard `?sync=<code>` banner (AutoSync passes the code through),
  and the humanized connection `last_error` line.
- [x] Vercel deploy — `docs/deploy.md` runbook (env vars, OAuth redirect
  URI, Supabase Auth URLs, smoke checklist) linked from README. No
  `vercel.json` needed (Next.js preset); production build verified.
  Actual first deploy + smoke run still manual (see report).
