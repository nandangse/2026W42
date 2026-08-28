-- 0077: one column — the Management Review file's link, kept on Kuber's
-- Upload Files screen (Dr Raghu, 28 Aug 2026) so the sheet this module
-- mirrors is always one click from the books that replace it, tab by tab.
-- Line comments only. Additive and safe to re-run.

alter table public.app_settings add column if not exists kuber_review_link text;
