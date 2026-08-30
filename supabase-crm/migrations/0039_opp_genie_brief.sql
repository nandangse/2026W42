-- CRM 0039 — the opportunity KEEPS its Genie brief (30 Aug 2026)
-- "in the opportunity there must have been a genie — show that here,
--  without running this again and again."
alter table opportunity add column if not exists genie_brief    text;
alter table opportunity add column if not exists genie_brief_at timestamptz;
