# Subscription Manager

An AI-powered control panel for your information diet — see everything you subscribe to, understand what each source is about, and safely clean up the rest.

## Overview

People accumulate hundreds of subscriptions, follows, feeds, and channels over time, ending up with information overload, redundant content, and forgotten interests. This project gives users one place to review what they follow, understand each source through AI-generated descriptions and recommendations, and remove low-value subscriptions with explicit confirmation and per-item reporting.

YouTube is the first supported platform. The domain model is platform-independent (`Source`, not "channel"), so RSS, social, podcast, and newsletter sources can be added later without re-architecting.

## Current Status

MVP complete and deployed to Vercel (runbook: `docs/deploy.md`).
Implemented and working:

- Sign-in with Google or email magic link (Supabase Auth)
- YouTube connection via Google OAuth (minimal `youtube.readonly` + `youtube.force-ssl` scopes)
- YouTube subscription sync into normalized `sources` records
- Dashboard with search, category / recommendation / status / platform filters, sorting, and multi-select
- AI enrichment per source: controlled category, subcategory, topics, concise description, confidence
- AI recommendations: `KEEP` / `REVIEW` / `UNSUBSCRIBE`, each with a reason
- AI Cleanup summary panel (analyzed / verdict / stale counts)
- Bulk unsubscribe with review dialog, explicit confirmation, per-item success/failure reporting, and retry of failures
- Action history: an audit log of every bulk operation with per-item outcomes
- Data & privacy: one-click deletion of all owned rows (sources, analysis, history, connection) with explicit confirm
- Consistent quota/error UX: actionable messages with retry guidance on sync, analysis, and per-item failures

AI analysis requires an OpenAI-compatible API key. Without one, the app runs normally but shows setup guidance instead of the Analyze button.

## How It Works

Sign in → connect YouTube → sync subscriptions → run AI analysis → browse categorized sources and recommendations → select low-value sources → review and confirm → bulk unsubscribe with per-item results → review history.

## Tech Stack

- Next.js 16 (App Router), React 19, TypeScript 5 (`strict`)
- Tailwind CSS v4, shadcn/ui
- Supabase (Postgres, Auth, Row Level Security)
- YouTube Data API v3, Google OAuth 2.0
- OpenAI-compatible chat-completions API for enrichment (endpoint and model are configurable)
- Vitest for unit tests

## Getting Started

### Prerequisites

- Node.js and npm
- A Supabase project
- A Google Cloud project with the YouTube Data API v3 enabled (only needed for YouTube sync)
- An OpenAI-compatible API key (only needed for AI enrichment)

### 1. Install dependencies

```bash
npm install
```

> On Windows PowerShell, `npm`/`npx` resolve to blocked `.ps1` shims — prefix commands with `cmd /c`, e.g. `cmd /c "npm run dev"`.

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in the values (see [Environment Variables](#environment-variables)). Generate the YouTube token-encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 3. Set up Supabase

1. Create a project and copy its URL, anon key, and service-role key into `.env.local`.
2. In Authentication → Providers, enable **Google** (OAuth client ID/secret) and **Email** (magic link) sign-in.
3. Link the CLI to your project and apply the migration:

```bash
npx supabase link
npx supabase db push
```

### 4. Set up Google OAuth for YouTube

1. In Google Cloud Console, add this authorized redirect URI to your OAuth client:

```
<NEXT_PUBLIC_SITE_URL>/api/youtube/callback
```

(e.g. `http://localhost:3000/api/youtube/callback` for local development.)
2. No extra configuration is needed for scopes: the app requests only `youtube.readonly` and `youtube.force-ssl`.

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in, connect YouTube from the dashboard, and sync.

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key (browser-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service-role key — server only, never exposed to the browser |
| `NEXT_PUBLIC_SITE_URL` | For YouTube | App base URL; used to build the OAuth callback URL |
| `GOOGLE_CLIENT_ID` | For YouTube | Google OAuth client ID for the YouTube connection |
| `GOOGLE_CLIENT_SECRET` | For YouTube | Google OAuth client secret — server only |
| `YOUTUBE_TOKEN_ENCRYPTION_KEY` | For YouTube | 32 random bytes, base64-encoded; encrypts stored refresh tokens (AES-256-GCM) |
| `OPENAI_API_KEY` | For AI analysis | API key for the OpenAI-compatible enrichment endpoint |
| `OPENAI_BASE_URL` | No | Endpoint base URL (default `https://api.openai.com/v1`); point at any compatible endpoint |
| `ENRICHMENT_MODEL` | No | Model name sent to the endpoint (default `gpt-4o-mini`); recorded per row for traceability |
| `ENRICH_DEBUG` | No | Set to `1` to log model-output validation diagnostics (server console only) |

Never commit `.env.local` or any real credentials. When checking configuration, refer to variable names only — never print values.

## Project Structure

```
app/                      # Routes: dashboard, history, login, auth callback
  api/youtube/            # OAuth connect/callback, sync, disconnect
  api/sources/            # Bulk unsubscribe, AI enrichment
  api/account/            # Delete all owned data
  dashboard/ history/ login/
components/
  sources/                # Explorer, cards, filters, bulk bar, dialogs, AI panel
  connection/ layout/ ui/ # Sync/disconnect/delete-data buttons, nav, shadcn primitives
lib/
  account/                # Delete-user-data orchestration
  platforms/youtube/      # YouTube API client, schemas, normalization
  youtube/                # OAuth flow, AES-256-GCM token crypto
  sources/                # Filter/sort, bulk-unsubscribe and enrichment orchestration
  ai/                     # OpenAI-compatible enrichment client and prompt
  supabase/               # Browser/server/admin clients, session helpers
  error-messages.ts       # Shared user-facing failure text
  db/                     # Database row types
supabase/migrations/      # Versioned SQL migrations (0001_init, 0002 categories)
tests/ (+ fixtures/)      # Vitest suites
docs/                     # product.md, architecture.md, database.md, deploy.md, progress.md
proxy.ts                  # Supabase session handling (Next.js 16 convention)
```

## AI Architecture

AI is an enrichment and advisory layer — never the source of truth. External APIs and the database are authoritative for factual state.

- The model returns a single flat JSON object per source; anything else is discarded.
- Every response is validated with Zod (`lib/validation.ts`); persistent validation failure leaves the source unenriched rather than persisting raw model text.
- Top-level categories come from a controlled 25-item vocabulary the model cannot extend; subcategories and topics are free-form.
- Recommendations are advisory `KEEP` / `REVIEW` / `UNSUBSCRIBE` verdicts with evidence-based reasons. The model has no access to watch history and is instructed never to invent viewing behavior.
- The provider is any OpenAI-compatible chat-completions endpoint (`OPENAI_BASE_URL`); model and prompt version are recorded on every row.

See [`docs/architecture.md`](docs/architecture.md) for details.

## Deploying

Vercel + hosted Supabase, no extra infrastructure. Follow the runbook in
[`docs/deploy.md`](docs/deploy.md) (env vars, OAuth redirect URI, Supabase
Auth URLs, post-deploy smoke check).

## Development

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run test        # vitest run
npm run build       # production build
```

- Keep changes small and coherent; don't rewrite unrelated code.
- All database changes go through versioned migrations in `supabase/migrations/`.
- Never commit secrets, tokens, or user subscription data.
- `AGENTS.md` and `docs/` are the project context — read them before implementing significant features.

## Roadmap

Planned after the YouTube MVP (see [`docs/product.md`](docs/product.md)): additional platform adapters (RSS, Reddit, Instagram, Facebook, TikTok, X, podcasts, newsletters, and others), each exposing its real capabilities (read/unsubscribe support varies by platform), plus a natural-language cleanup interface that translates requests into safe, reviewable operations.

## Security / Privacy

- OAuth credentials and refresh tokens stay server-side; the browser never receives them, and they are never logged or placed in error messages.
- Database access is enforced per-user with Supabase Row Level Security; privileged server code re-verifies the authenticated user and scopes by `user_id`.
- Unsubscribing is destructive: it requires explicit confirmation, executes externally first, updates local state only on confirmed success, and records every item in an audit log.
- AI recommendations never trigger unsubscribes on their own.
