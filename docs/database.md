# Database (M0, extended in M4)

Migrations: `supabase/migrations/0001_init.sql` (schema) +
`0002_add_engineering_category.sql` (taxonomy addition — the pattern for
future category changes: new migration, never edit applied ones).
All changes via migrations; no ad-hoc production mutations.

## Tables

- `categories(slug pk, name unique, sort_order)` — 25-row controlled
  vocabulary, publicly readable. Mirrors `lib/categories.ts`.
- `platform_connections` — one row per (user, platform), including Facebook. Holds
  `encrypted_refresh_token` (opaque ciphertext/vault ref, M1 decides
  Vault vs app-level AES-GCM), `status`, `scopes`, `last_sync_at`,
  `last_error`. Unique `(user_id, platform)`.
- `sources` — normalized `Source`. `external_id` = platform-native id
  (YouTube channelId or managed Facebook Page id),
  `subscription_external_id` = YouTube subscription resource id required
  for `subscriptions.delete`. Unique `(user_id, platform, external_id)`.
  `status`: active | unsubscribed | unavailable_externally.
  Facebook rows are managed Pages discovered through `/me/accounts`; Groups,
  followed Pages, and arbitrary public profiles are not represented.
- `source_enrichments` — one row per source: controlled `category_slug`,
  free-form `subcategory`, `topics[3..8]`, `description<=560`,
  `confidence 0..1`, `model`, `prompt_version`.
- `source_recommendations` — `verdict` KEEP | REVIEW | UNSUBSCRIBE,
  `reason<=560`, `signals` jsonb (computed evidence, M3).
- `user_action_batches` + `user_actions` — bulk-unsubscribe audit.
  Per-item `success`, `external_status`, `error_code`, `snapshot`.

## Ownership & RLS

RLS enabled on all tables. `categories` readable by all; every other table
restricts to `auth.uid() = user_id` (directly, or via `sources` join for
enrichments/recommendations). Service-role bypasses RLS and must scope by
`user_id` in code.

## Verification (remote project, no local Docker)

The Supabase CLI works against the linked project without local Docker:

```
npx supabase migration list   # pending vs applied
npx supabase db push          # apply pending supabase/migrations/*.sql
npx supabase db query --linked "<read-only SQL>"
```

Verify seed rows, constraints, and RLS with read-only queries (e.g.
`select slug, name, sort_order from public.categories order by
sort_order`). Prefer this over a direct Postgres connection, which needs
`SUPABASE_DB_PASSWORD`.
