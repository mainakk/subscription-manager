# Database (M0)

Migration: `supabase/migrations/0001_init.sql`. All changes via migrations;
no ad-hoc production mutations.

## Tables

- `categories(slug pk, name unique, sort_order)` — 24-row controlled
  vocabulary, publicly readable. Mirrors `lib/categories.ts`.
- `platform_connections` — one row per (user, platform). Holds
  `encrypted_refresh_token` (opaque ciphertext/vault ref, M1 decides
  Vault vs app-level AES-GCM), `status`, `scopes`, `last_sync_at`,
  `last_error`. Unique `(user_id, platform)`.
- `sources` — normalized `Source`. `external_id` = channelId,
  `subscription_external_id` = YouTube subscription resource id required
  for `subscriptions.delete`. Unique `(user_id, platform, external_id)`.
  `status`: active | unsubscribed | unavailable_externally.
- `source_enrichments` — one row per source: controlled `category_slug`,
  free-form `subcategory`, `topics[3..8]`, `description<=280`,
  `confidence 0..1`, `model`, `prompt_version`.
- `source_recommendations` — `verdict` KEEP | REVIEW | UNSUBSCRIBE,
  `reason<=280`, `signals` jsonb (computed evidence, M3).
- `user_action_batches` + `user_actions` — bulk-unsubscribe audit.
  Per-item `success`, `external_status`, `error_code`, `snapshot`.

## Ownership & RLS

RLS enabled on all tables. `categories` readable by all; every other table
restricts to `auth.uid() = user_id` (directly, or via `sources` join for
enrichments/recommendations). Service-role bypasses RLS and must scope by
`user_id` in code.

## Local verification without Docker

Supabase CLI + Docker are unavailable in this environment, so the migration
has not been applied to a live database. Before M1, apply with either:

```
supabase db push            # linked project, CLI installed
# or paste 0001_init.sql into the Supabase SQL editor (review-only)
```

M1 must confirm the migration applies cleanly before building OAuth/sync
on top of it.
