-- 0176_job_field_log.sql
--
-- PAST UPDATES -- every change to a job field, with what it was before.
--
-- Dr Raghu, 29 Sep 2026: "these when modified, ensure this is in erp also /
-- The previous record should be ADDED to the top in past updates", and again
-- on 30 September for the phone page: "Current update also make it editable.
-- Whenever edited add the data into the previous updates."
--
-- WHAT WAS MISSING. /api/job-field has always written the change into
-- erp_update -- but that is a QUEUE, not a history: a second edit before the
-- export overwrites the first, by design, because the ERP must receive the
-- latest value and not three edits to replay in order. So the trail of what
-- a job's status said last week existed nowhere.
--
-- A job's Current Update is the one field on Genie that is prose, and the
-- prose is the record: "W30 : Ord rcd", then "W36 : Panels at paint". Losing
-- the earlier line loses the only account of how the job actually went.
--
-- EVERY FIELD, not only the note. The same table answers "who moved the
-- target date, and from what" without a second design, and that question
-- gets asked more often than any other.
--
-- ASCII only, additive, safe to re-run.

create table if not exists job_field_log (
  id          bigserial primary key,
  job_id      text        not null,
  field       text        not null,
  label       text,
  old_value   text,
  new_value   text,
  by_email    text,
  by_name     text,
  at          timestamptz not null default now()
);

create index if not exists job_field_log_job_idx   on job_field_log (job_id, at desc);
create index if not exists job_field_log_field_idx on job_field_log (job_id, field, at desc);

comment on table job_field_log is
  'Every edit made to a job through /api/job-field: the field, what it said before, '
  'what it says now and who changed it. erp_update is a QUEUE and collapses repeated '
  'edits; this is the history and never collapses. Read newest first for Past updates.';

alter table job_field_log enable row level security;

-- Read for anyone signed in; writes go through the service role in the route,
-- which has already checked that the caller is a planner.
drop policy if exists job_field_log_read on job_field_log;
create policy job_field_log_read on job_field_log
  for select to authenticated using (true);
