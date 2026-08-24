-- 0071_job_manpower.sql
--
-- MANPOWER ALLOCATION, DAY BY DAY (Dr Raghu, 24 Aug 2026): who is actually
-- standing at each job today -- fitters, helpers, welders, painters,
-- electricians, hydraulic hands. Recorded from On Floor, shown on the Job
-- Plan and the walk sheet, and KEPT per day as a work study.
--
-- One row per job per day, because the point is the ledger, not the moment:
-- "this has to match with the attendance" only works if yesterday's claim
-- is still there to be checked against yesterday's muster. Nothing here is
-- ever overwritten by a later day; today's edit touches today's row alone.
--
--   crew: { "fitter": 2, "helper": 1, "welder": 0, "painter": 0,
--           "electrician": 0, "hydraulic": 0 }
--
-- ASCII only, additive, safe to re-run.

create table if not exists public.job_manpower (
  job_id     text not null,
  day        date not null,
  crew       jsonb not null default '{}'::jsonb,
  noted_by   text,
  updated_at timestamptz not null default now(),
  primary key (job_id, day)
);

create index if not exists job_manpower_day_idx on public.job_manpower (day desc);

comment on table public.job_manpower is
  'Actual manpower standing at each job, one row per job per day. The day-wise '
  'work study: checked against attendance and against the On Floor count.';
