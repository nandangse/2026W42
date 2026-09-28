-- 0171_manpower_plan.sql
--
-- MANPOWER PLANNING — people against jobs, day by day.
--
-- Dr Raghu, 28 Sep 2026: "there the guy should be able to TYPE the workers
-- name. This will come from the manpower records in HRMS. They can also drag
-- and drop ... then in today, have a place where the production guy can write
-- what happened ... this will also help because in Genie it will show the
-- person which jobs he is working on and what's to be done."
--
-- WHY A ROW PER PERSON PER JOB PER DAY, and not a list inside the existing
-- crew JSON. The whole point is to be able to turn the board around and ask
-- it a PERSON's question -- "what am I on this week" -- and a name buried in
-- a JSON blob on a job's row cannot be asked that without reading every job.
-- One row, two indexes, and the question can be asked from either end.
--
-- THE OLD COUNTS ARE NOT TOUCHED (his decision, 28 Sep 2026: names and counts
-- live side by side). job_manpower holds 585 days of crew counts with nobody's
-- name against them; inventing names for those would be fabricating a record
-- of who worked where. A day shows names where names were assigned and the
-- old count where they were not, and the labour-cost arithmetic keeps reading
-- job_manpower exactly as it did.
--
-- HALF EACH WHEN SOMEBODY IS IN TWO PLACES (his rule): a man on two jobs on
-- one day counts half a man-day to each. Stored as the plain fact -- he is on
-- both -- and halved when counted, because the fact is that he was on both
-- and the arithmetic is a separate question.
--
-- ASCII only, additive, safe to re-run.

create table if not exists public.job_crew_person (
  id          uuid primary key default gen_random_uuid(),
  job_id      text not null,
  day         date not null,
  emp_id      text not null,                 -- hrms_employees.id
  emp_name    text not null,                 -- kept as written, so a leaver still reads
  trade       text,                          -- fitter/helper/welder/painter/electrician/hydraulic
  note        text,                          -- what this person is to do on this job
  noted_by    text,
  updated_at  timestamptz not null default now(),
  unique (job_id, day, emp_id)
);

-- the two directions the board is read from
create index if not exists job_crew_person_day on public.job_crew_person (day, job_id);
create index if not exists job_crew_person_who on public.job_crew_person (emp_id, day);

-- what actually happened, per job per day
create table if not exists public.job_day_note (
  job_id      text not null,
  day         date not null,
  text        text not null default '',
  noted_by    text,
  updated_at  timestamptz not null default now(),
  primary key (job_id, day)
);

comment on table public.job_crew_person is
  'Who is on which job on which day. Named assignment; job_manpower keeps the '
  'older count-only record and both are shown.';
comment on table public.job_day_note is
  'What the production side says happened on a job on a day.';
