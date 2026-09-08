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

Use this conceptual architecture:

```
UI
  |
  v
Application/domain logic
  |
  +-----------------------+
  |                       |
  v                       v
Source repository     Platform adapters
                          |
                 +--------+--------+
                 |        |        |
              YouTube    RSS     Reddit...
                         
  |
  v
AI enrichment/recommendation layer
  |
  v
PostgreSQL / Supabase
```

The UI should not directly call YouTube APIs.

The UI should not directly handle OAuth tokens.

External platform logic belongs behind platform adapters.

---

# Technology

Use:

* Next.js
* TypeScript
* React
* Tailwind CSS
* shadcn/ui
* Supabase

  * PostgreSQL
  * Authentication
* YouTube Data API
* Google OAuth
* OpenAI-compatible LLM API for AI enrichment
* Vercel-compatible deployment

Prefer server-side code for secrets, OAuth, external API calls, and privileged database operations.

Use strict TypeScript.

Avoid introducing additional infrastructure unless there is a demonstrated need.

---

# Repository Structure

Aim for a structure similar to:

```
app/
  ...

components/
  ...

lib/
  ai/
  auth/
  db/
  platforms/
    youtube/
    rss/
  sources/
  validation/

supabase/
  migrations/

docs/
  product.md
  architecture.md
  database.md

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

---

# Database

Use migrations.

Do not manually mutate production database state through ad-hoc application code.

Database schema should enforce ownership relationships wherever practical.

Users must only be able to access their own sources, connections, recommendations, and actions.

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

Do not rewrite unrelated code.

Do not introduce abstractions speculatively.

Do not add dependencies unless necessary.

---

# Testing

Business logic should have tests.

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
