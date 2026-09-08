-- M4: add the Engineering top-level category (LLM was inventing it for
-- engineering channels; Technology/Science proved too coarse).
-- Keeps `Other` last in sort order. Mirrors lib/categories.ts.
-- Idempotent so re-runs and already-seeded databases stay consistent.

update public.categories set sort_order = 25 where slug = 'other';

insert into public.categories (slug, name, sort_order) values
  ('engineering', 'Engineering', 24)
on conflict (slug) do update set name = excluded.name, sort_order = excluded.sort_order;
