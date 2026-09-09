-- Facebook Page discovery/sync. Facebook does not expose a supported API for
-- importing followed Pages, Groups, or arbitrary public profiles.
alter table public.platform_connections
  drop constraint if exists platform_connections_platform_check;
alter table public.platform_connections
  add constraint platform_connections_platform_check
  check (platform in ('youtube', 'facebook'));

alter table public.sources
  drop constraint if exists sources_platform_check;
alter table public.sources
  add constraint sources_platform_check
  check (platform in ('youtube', 'facebook'));

alter table public.user_action_batches
  drop constraint if exists user_action_batches_platform_check;
alter table public.user_action_batches
  add constraint user_action_batches_platform_check
  check (platform in ('youtube', 'facebook'));
