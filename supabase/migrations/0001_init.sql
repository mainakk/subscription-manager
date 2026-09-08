-- M0 initial schema: platform-independent Source model, YouTube-first.
-- Token encryption mechanism (Supabase Vault vs app-level AES-GCM) is decided in M1
-- when the OAuth flow lands; this migration stores only an opaque
-- encrypted_refresh_token text column that never reaches the browser.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- categories
create table public.categories (
  slug text primary key,
  name text not null unique,
  sort_order integer not null
);

insert into public.categories (slug, name, sort_order) values
  ('cooking', 'Cooking', 1),
  ('woodworking', 'Woodworking', 2),
  ('diy-home-improvement', 'DIY & Home Improvement', 3),
  ('technology', 'Technology', 4),
  ('programming', 'Programming', 5),
  ('business', 'Business', 6),
  ('finance', 'Finance', 7),
  ('news', 'News', 8),
  ('science', 'Science', 9),
  ('education', 'Education', 10),
  ('fitness', 'Fitness', 11),
  ('cycling', 'Cycling', 12),
  ('travel', 'Travel', 13),
  ('automotive', 'Automotive', 14),
  ('gaming', 'Gaming', 15),
  ('music', 'Music', 16),
  ('art-design', 'Art & Design', 17),
  ('photography', 'Photography', 18),
  ('fashion', 'Fashion', 19),
  ('lifestyle', 'Lifestyle', 20),
  ('comedy', 'Comedy', 21),
  ('entertainment', 'Entertainment', 22),
  ('sports', 'Sports', 23),
  ('other', 'Other', 24);

-- ------------------------------------------------------- platform_connections
create table public.platform_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('youtube')),
  status text not null default 'connected'
    check (status in ('connected', 'expired', 'revoked', 'disconnected')),
  scopes text[] not null default '{}',
  external_account_id text,
  -- Opaque ciphertext / vault reference. Raw tokens must never reach the browser.
  encrypted_refresh_token text,
  access_token_expires_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (user_id, platform)
);

-- ------------------------------------------------------------------- sources
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('youtube')),
  -- Platform-native id (YouTube: channelId).
  external_id text not null,
  -- Platform subscription resource id (YouTube subscriptions.delete needs this).
  subscription_external_id text,
  name text not null,
  url text not null,
  image_url text,
  provider_description text,
  status text not null default 'active'
    check (status in ('active', 'unsubscribed', 'unavailable_externally')),
  subscribed_at timestamptz,
  unsubscribed_at timestamptz,
  video_count integer,
  subscriber_count bigint,
  last_upload_at timestamptz,
  metadata jsonb not null default '{}',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, platform, external_id)
);

create index sources_owner_idx on public.sources (user_id, platform, status);

-- -------------------------------------------------------- source_enrichments
create table public.source_enrichments (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources (id) on delete cascade,
  category_slug text not null references public.categories (slug),
  subcategory text not null,
  topics text[] not null,
  description text not null,
  confidence double precision not null check (confidence >= 0 and confidence <= 1),
  model text not null,
  prompt_version text not null,
  created_at timestamptz not null default now(),
  unique (source_id)
);

create index source_enrichments_category_idx
  on public.source_enrichments (category_slug);

-- ------------------------------------------------------ source_recommendations
create table public.source_recommendations (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources (id) on delete cascade,
  verdict text not null check (verdict in ('KEEP', 'REVIEW', 'UNSUBSCRIBE')),
  reason text not null,
  signals jsonb not null default '{}',
  model text not null,
  created_at timestamptz not null default now()
);

create index source_recommendations_verdict_idx
  on public.source_recommendations (verdict);

-- -------------------------------------------------------- user_action_batches
create table public.user_action_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('youtube')),
  type text not null default 'bulk_unsubscribe' check (type = 'bulk_unsubscribe'),
  total_count integer not null check (total_count >= 0),
  success_count integer not null default 0 check (success_count >= 0),
  failure_count integer not null default 0 check (failure_count >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'completed_with_failures', 'failed')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- user_actions
create table public.user_actions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.user_action_batches (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  action_type text not null,
  success boolean not null,
  external_status integer,
  error_code text,
  error_message text,
  snapshot jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index user_actions_batch_idx on public.user_actions (batch_id);
create index user_actions_owner_idx on public.user_actions (user_id);

-- ------------------------------------------------------------------ RLS
alter table public.categories enable row level security;
alter table public.platform_connections enable row level security;
alter table public.sources enable row level security;
alter table public.source_enrichments enable row level security;
alter table public.source_recommendations enable row level security;
alter table public.user_action_batches enable row level security;
alter table public.user_actions enable row level security;

-- Taxonomy is readable by everyone (including unauthenticated landing page).
create policy "categories are publicly readable"
  on public.categories for select
  using (true);

-- Users manage only their own rows. Service-role (server) bypasses RLS and
-- must enforce ownership explicitly in code.
create policy "users manage own platform_connections"
  on public.platform_connections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users manage own sources"
  on public.sources for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users manage own source_enrichments"
  on public.source_enrichments for all
  using (
    exists (
      select 1 from public.sources s
      where s.id = source_enrichments.source_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.sources s
      where s.id = source_enrichments.source_id
        and s.user_id = auth.uid()
    )
  );

create policy "users manage own source_recommendations"
  on public.source_recommendations for all
  using (
    exists (
      select 1 from public.sources s
      where s.id = source_recommendations.source_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.sources s
      where s.id = source_recommendations.source_id
        and s.user_id = auth.uid()
    )
  );

create policy "users manage own user_action_batches"
  on public.user_action_batches for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users manage own user_actions"
  on public.user_actions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
