-- 0043_floor_summary.sql
--
-- What the floor is saying about a job, in one paragraph.
--
-- Three voice notes is three separate accounts of the same job. Somebody
-- reading the page wants the position, not a transcript each -- so Genie reads
-- the last three together and writes the state of play, and the recordings sit
-- underneath for anybody who wants to hear it said.
--
-- Written when a note is recorded, not when the page is read. A summary
-- generated per page load would be an Anthropic call for every job on screen,
-- every time anybody opened the tab -- slow, expensive, and different each
-- time for no reason.
--
-- On `jobs` rather than its own table: there is exactly one current summary per
-- job, it is replaced rather than accumulated, and a table with a single row
-- per job and no history is a column.
--
-- Additive and safe to re-run.

alter table public.jobs add column if not exists floor_summary    text;
alter table public.jobs add column if not exists floor_summary_at timestamptz;

comment on column public.jobs.floor_summary is
  'Genie''s read of the last three voice notes. Rewritten whenever a new one is recorded.';
comment on column public.jobs.floor_summary_at is
  'When it was last rewritten -- so a summary older than the newest note can be spotted.';
