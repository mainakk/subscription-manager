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
