-- 0046_job_owners.sql
--
-- Three more owners on a job: production, kitting and design.
--
-- jobs.own is the PLANNING owner -- the person who owns the DATE, and the only
-- one the ERP knows about. Quality arrived in 0040. These three complete the
-- set, because "who do I ring about this" has four different answers depending
-- on what has gone wrong, and today the only way to find out is to ask.
--
-- SEPARATE COLUMNS, not one "owners" text field. Two names in a box cannot be
-- filtered, counted, notified or reassigned; four names in a box is a note to
-- self. Each of these is a person the system can eventually send something to.
--
-- Genie's own, like quality_owner: the ERP has no column for any of them, so
-- /api/job-field marks them genieOnly and never queues them for export. They
-- survive the morning upload because apply_jobs names the columns it writes.
--
-- Additive and safe to re-run.

alter table public.jobs add column if not exists production_owner text;
alter table public.jobs add column if not exists kitting_owner    text;
alter table public.jobs add column if not exists design_owner     text;

comment on column public.jobs.production_owner is 'Who owns building it. Genie''s own field -- not from the ERP.';
comment on column public.jobs.kitting_owner    is 'Who owns getting the material in. Genie''s own field.';
comment on column public.jobs.design_owner     is 'Who owns the drawings and the release. Genie''s own field.';
