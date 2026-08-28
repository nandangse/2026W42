-- 0080: the Management Review link says WHO set it and WHEN (Dr Raghu,
-- 28 Aug 2026) — a link nobody signs is a link nobody trusts.
-- Line comments only. Additive and safe to re-run.

alter table public.app_settings add column if not exists kuber_review_link_by text;
alter table public.app_settings add column if not exists kuber_review_link_at timestamptz;
