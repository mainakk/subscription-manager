# AGENTS.md

## Project

This project is an AI-powered personal subscription manager.

The product helps a user understand, organize, and clean up the sources they consume across platforms such as YouTube, RSS, Reddit, Instagram, Facebook, TikTok, X, podcasts, newsletters, and other content platforms.

The first supported platform is YouTube.

The long-term product concept is:

> An AI-powered information-diet manager.

The application should eventually allow a user to answer questions such as:

* What am I subscribed to?
* What topics do I follow?
* What sources are redundant?
* What have I stopped consuming?
* What should I unsubscribe from?
* Show me everything related to woodworking.
* Remove stale subscriptions.
* Find better alternatives to these sources.
* Clean up my subscriptions while preserving my most valuable sources.

---

## Current MVP

Do NOT implement the entire product at once.

The current MVP is:

1. User authentication.
2. YouTube connection via Google OAuth.
3. Import the user's YouTube subscriptions.
4. Store normalized subscription/source data.
5. Display subscriptions in a polished dashboard.
6. Search and filter subscriptions.
7. Categorize subscriptions using AI.
8. Generate a concise AI description for each source.
9. Allow multi-selection.
10. Allow safe bulk unsubscribe.
11. Record destructive actions.
12. Provide clear success/failure reporting.

RSS and other platforms are future integrations and must not complicate the initial implementation.

---

## Product Principles

### 1. User control

The user owns their data and controls destructive actions.

Never silently unsubscribe, delete, or modify external subscriptions.

All destructive operations require explicit confirmation.

### 2. Explainability

AI recommendations must be explainable.

Do not simply display:

"Unsubscribe"

Instead provide a reason such as:

* inactive for 8 months
* rarely watched
* highly redundant with other sources
* outside the user's primary interests

### 3. Reversibility

Where technically possible, destructive actions should be reversible.

Record all external actions in an audit/action table.

### 4. Platform independence

The application must not be architected around YouTube-specific concepts.

Use a normalized `Source` domain model and platform adapters.

YouTube is the first adapter, not the application's fundamental abstraction.

### 5. AI is an enrichment layer

The AI should enrich and analyze normalized source data.

The AI must not become the source of truth for application state.

External APIs and the database are authoritative for factual state.

---

# Architecture

Use this layered architecture (`docs/architecture.md` is authoritative
and supersedes this sketch):

```
UI (App Router: Server Components + minimal Client Components)
  |
  v
Application logic (Route Handlers / Server Actions, lib/)
  |
  +---> Source repository (Supabase Postgres via lib/supabase/*, lib/db/*)
  +---> Platform adapters (lib/platforms/*; YouTube first)
  +---> AI enrichment layer (validated structured output only)
  |
  v
PostgreSQL (Supabase, RLS-enforced)
```

The UI should not directly call YouTube APIs.

The UI should not directly handle OAuth tokens.

External platform logic belongs behind platform adapters.

Remote images from platforms (e.g. YouTube thumbnails) must be
allowlisted in `next.config.ts` (`images.remotePatterns`); do not bypass
the image optimizer with unallowlisted hosts.

---

# Technology

Use (pinned in `package.json`; do not assume older APIs):

* Next.js 16 (App Router)
* TypeScript 5 (`strict`, so `noImplicitAny` applies)
* React 19
* Tailwind CSS v4 (CSS-first config in `app/globals.css`)
* shadcn/ui (`components.json`, `lib/utils.ts`)
* Supabase

  * PostgreSQL
  * Authentication
  * SSR helpers (`@supabase/ssr`) for cookie sessions
* YouTube Data API
* Google OAuth
* OpenAI-compatible LLM API for AI enrichment
* Vercel-compatible deployment
* Vitest for unit tests (`tests/`, `npm run test`)

Prefer server-side code for secrets, OAuth, external API calls, and privileged database operations.

Use strict TypeScript.

Avoid introducing additional infrastructure unless there is a demonstrated need.

Next.js 16 notes (past failures came from assuming older conventions):

* Session handling lives in `proxy.ts` (`export async function proxy`),
  not `middleware.ts` / `middleware`.
* `searchParams`, `params`, and `cookies()` are async — always `await` them.
* There is no global `LayoutProps` type — type layout props explicitly
  (e.g. `{ children: ReactNode }`).

---

# Repository Structure

Aim for a structure similar to (this mirrors the actual repo; the
previous sketch listed directories that were never created):

```
app/
  api/
    youtube/
    sources/
  dashboard/
  history/
  login/
  ...

components/
  connection/
  layout/
  sources/
  ui/

lib/
  categories.ts
  validation.ts
  utils.ts
  db/
  platforms/
    youtube/
  sources/
  supabase/
  youtube/

supabase/
  migrations/

tests/
  fixtures/

docs/
  product.md
  architecture.md
  database.md

proxy.ts
components.json
vitest.config.ts

public/

AGENTS.md
README.md
```

Do not create directories merely to satisfy this example.

Keep the actual structure simple and idiomatic for Next.js.

---

# Domain Model

Use `Source` as the primary domain concept.

A Source is something the user has chosen to consume.

Examples:

* YouTube channel
* RSS feed
* podcast
* newsletter
* Reddit community
* social media account

The first implementation is YouTube.

Do not create a domain model that makes YouTube the permanent center of the system.

Prefer concepts such as:

* Source
* PlatformConnection
* Category
* Topic
* SourceCategory
* SourceTopic
* SourceContent
* SourceRecommendation
* UserAction

over platform-specific models where possible.

Platform-specific identifiers must be stored as external identifiers.

---

# Categories

For the MVP, categories are controlled vocabulary.

Do NOT allow the LLM to invent arbitrary top-level categories.

Initial categories:

* Cooking
* Woodworking
* DIY & Home Improvement
* Technology
* Programming
* Business
* Finance
* News
* Science
* Education
* Engineering
* Fitness
* Cycling
* Travel
* Automotive
* Gaming
* Music
* Art & Design
* Photography
* Fashion
* Lifestyle
* Comedy
* Entertainment
* Sports
* Other

Subcategories and topics may be generated or extended later, but top-level categories must remain controlled.

The category taxonomy should be easy to modify without rewriting application logic.

---

# AI Requirements

AI output must be structured and validated.

Never blindly trust LLM output.

Every AI response must:

1. Use an explicit schema.
2. Be parsed as structured data.
3. Be validated.
4. Handle malformed responses.
5. Have retry/error handling where appropriate.
6. Be safe to persist.

Example enrichment:

```
{
  "category": "Woodworking",
  "subcategory": "Furniture",
  "topics": [
    "joinery",
    "hardwood furniture",
    "hand tools"
  ],
  "description": "Creates traditional woodworking projects...",
  "confidence": 0.94
}
```

Do not put AI-generated text directly into privileged SQL or external API calls.

---

# Security

Security is a first-class requirement.

Never:

* expose OAuth refresh tokens to the browser
* commit secrets
* hardcode API keys
* put secrets in client-side code
* trust user-provided IDs without authorization checks
* trust LLM output without validation
* perform privileged platform operations directly from client components

Use environment variables for secrets.

Use Supabase Row Level Security where appropriate.

Every server-side operation must verify the authenticated user before accessing that user's data.

---

# OAuth

OAuth credentials and refresh tokens must remain server-side.

The browser may receive only the minimum information required for the UI.

Do not store OAuth access/refresh tokens in localStorage.

Do not log OAuth tokens.

Do not include secrets in error messages.

Decided and implemented (do not re-litigate without a new requirement):

* Refresh tokens are encrypted at rest with app-level AES-256-GCM
  (`lib/youtube/token-crypto.ts`), keyed by `YOUTUBE_TOKEN_ENCRYPTION_KEY`
  (32 bytes, base64). No Supabase Vault, no extra infrastructure.
* Access tokens are never persisted. Each sync/unsubscribe run refreshes
  in memory via `refresh_token` grant and discards the access token after.
* Requested YouTube scopes are minimal: `youtube.readonly` and
  `youtube.force-ssl` only. Identity stays with Supabase Auth; never add
  `openid`/`email`/`profile` scopes to the YouTube flow.

---

# External APIs

External APIs are unreliable.

Handle:

* rate limits
* quota exhaustion
* expired credentials
* revoked authorization
* network errors
* malformed responses
* partial failures
* deleted external resources

Do not assume an external API operation succeeded merely because the request was sent.

Update local state only after confirming the external operation succeeded.

---

# Destructive Actions

Unsubscribe is destructive.

The workflow must be:

```
select sources
    ↓
review selection
    ↓
explicit confirmation
    ↓
execute external operations
    ↓
record results
    ↓
update local state
    ↓
display successes/failures
```

Never optimistically remove a source from the database before the external unsubscribe succeeds.

Bulk operations must support partial failure.

For example:

```
17 selected
14 successfully unsubscribed
3 failed
```

Do not report this as:

```
"17 unsubscribed"
```

Decided bulk semantics (implemented in `lib/sources/unsubscribe.ts`):

* Max 50 source IDs per request; larger selections must be split client-side.
* A YouTube 404 (`subscriptionNotFound`) counts as success with an
  `already_gone` note — the goal state (not subscribed) already holds.
* Requested IDs with no row owned by the caller are reported as
  `unknownSourceIds` and never written to the audit table (whose
  `source_id` FK requires a real row).
* Local state (`status = 'unsubscribed'`) changes only after confirmed
  external success, per item.

---

# Database

Use migrations.

Do not manually mutate production database state through ad-hoc application code.

Migration workflow (remote project; there is no local Docker here):

* `npx supabase migration list` — shows pending vs applied migrations.
* `npx supabase db push` — applies pending `supabase/migrations/*.sql`.
* `npx supabase db query --linked "<read-only SQL>"` — verifies tables,
  rows, constraints, and RLS via the Management API. Prefer this over a
  direct Postgres connection, which needs `SUPABASE_DB_PASSWORD`.

Database schema should enforce ownership relationships wherever practical.

Users must only be able to access their own sources, connections, recommendations, and actions.

Sync reconciliation invariant (implemented in
`lib/platforms/youtube/normalize.ts`): re-imports upsert everything
*except* `status`. Status changes only via the seen-set transition —
reactivate reappearing rows, mark unseen active rows
`unavailable_externally`, and never touch app-unsubscribed rows unless
they reappear on YouTube. A sync must never resurrect locally-removed
rows.

Prefer normalized relational data over storing large arbitrary JSON blobs.

JSON/JSONB is appropriate for genuinely flexible metadata and raw provider responses, but do not use JSONB as an excuse to avoid modeling important relationships.

---

# TypeScript

Use strict TypeScript.

Avoid:

```
any
```

unless there is a specific justified reason.

Prefer explicit domain types.

Validate external data at system boundaries.

Use shared schemas/types where appropriate.

Do not duplicate important domain types across server and client.

Strict-mode notes (all three caused real `tsc --noEmit` failures):

* Supabase SSR cookie callbacks need explicit parameter types — import
  `type { CookieOptions }` from `@supabase/ssr` and annotate
  `{ name: string; value: string; options: CookieOptions }[]`.
* Union-typed fetch mocks (`string | URL | Request`) need narrowing
  before touching `.url` — `URL` has no such property.
* `import "server-only"` throws at import time under Vitest's Node
  runtime. Keep it only in modules tests never import (e.g.
  `lib/supabase/admin.ts`); keep `lib/youtube/*` importable and mark
  them server-only by convention comment instead.

---

# UI

The UI should feel like a polished consumer application, not an admin dashboard.

Prioritize:

* clear hierarchy
* fast scanning
* good empty states
* useful loading states
* useful error states
* keyboard accessibility
* responsive design
* clear destructive-action warnings

The main subscription list should support:

* search
* category filtering
* platform filtering
* sorting
* multi-selection
* bulk actions

Avoid unnecessary animations and visual complexity.

---

# Development Workflow

Before implementing a significant feature:

1. Read relevant existing code.
2. Understand the current architecture.
3. Identify affected domain boundaries.
4. Make the smallest coherent change.
5. Run relevant tests/type checks/linting.
6. Inspect the result.
7. Report what changed and what was verified.

Verify with (in this order; all must pass):

```
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run test        # vitest run
npm run build       # production build, catches route/prerender errors
```

Windows shell notes (this repo is developed on PowerShell 5.1):

* `npm`/`npx` resolve to blocked `.ps1` shims — always invoke via
  `cmd /c "npm ..."` / `cmd /c "npx ..."`.
* Use `curl.exe` (not `Invoke-WebRequest`) when asserting HTTP status
  codes — PowerShell follows or swallows redirects inconsistently.
* `next dev` child processes survive `Stop-Process` on the parent.
  Before a smoke test, kill all stale servers
  (`Get-Process -Name node | Stop-Process -Force`) or the new server
  exits with "already running" and probes hit stale code.
* Never use `$home` as a variable name — it is read-only.

Do not rewrite unrelated code.

Do not introduce abstractions speculatively.

Do not add dependencies unless necessary.

---

# Testing

Business logic should have tests.

Tests run with Vitest (`npm run test` / `vitest run`); suites live in
`tests/` with fixtures in `tests/fixtures/`. Keep pure orchestration
testable via injected dependencies (see `lib/sources/unsubscribe.ts`).

Prioritize tests for:

* source normalization
* category validation
* AI response validation
* authorization
* recommendation logic
* unsubscribe workflows
* partial failures
* synchronization behavior

Do not test implementation details unnecessarily.

Prefer testing externally observable behavior.

---

# Git

Make small, coherent commits.

Do not commit:

* `.env`
* secrets
* OAuth credentials
* API keys
* generated personal data
* user subscription data

Before committing, check for accidentally staged secrets.

Never run:

```
git push --force
```

unless explicitly requested by the user.

Never rewrite git history unless explicitly requested.

---

# Dependency Policy

Prefer the existing stack.

Before adding a dependency:

1. Determine whether the existing stack already provides the functionality.
2. Check whether a small local implementation is simpler.
3. Add a dependency only when it materially improves correctness or maintainability.

Do not add libraries merely because they are popular.

---

# Scope Control

The current MVP is YouTube-first.

Do not implement Facebook, Instagram, TikTok, Reddit, X, podcasts, newsletters, or other integrations unless explicitly requested.

Do design the domain so they can be added later.

When a requested feature significantly expands scope, explain the architectural impact before implementing it.

---

# Agent Behavior

When asked to implement something:

* First inspect the repository.
* Read relevant documentation.
* Reuse existing patterns.
* Prefer small changes.
* Do not ask unnecessary questions.
* If an important requirement is ambiguous, state the ambiguity and make a reasonable reversible choice.
* Never hide errors.
* Never silently weaken security.
* Never remove tests just to make them pass.
* Never disable linting/type checking to avoid fixing an issue.
* Never print secret values (env contents, tokens, keys) in outputs,
  logs, or error reports — key names only when checking configuration.

When you discover a better architecture than the current one, explain it before making a large refactor.

---

# Definition of Done

A feature is not complete merely because the code compiles.

For a feature to be considered complete:

* TypeScript passes.
* Linting passes.
* Relevant tests pass.
* Authentication/authorization is correct.
* Errors are handled.
* Loading states exist where appropriate.
* Empty states exist where appropriate.
* Destructive actions are confirmed.
* Secrets are protected.
* The implementation matches the documented architecture.
* No unrelated behavior was broken.
* Schema changes are applied via the migration workflow and verified
  against the linked project (tables, seed rows, constraints, RLS).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
