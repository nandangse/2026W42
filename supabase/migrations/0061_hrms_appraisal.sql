-- 0061_hrms_appraisal.sql
--
-- THE APPRAISAL DECISION (Dr Raghu, 23 Aug 2026): what the new gross IS,
-- once the discussion has happened. The IDP holds what the person said, the
-- review holds what the manager thinks -- this row holds what was DECIDED,
-- which is a different kind of fact and must not be confused with either.
--
-- ASCII only, additive, safe to re-run.

create table if not exists public.hrms_appraisal (
  employee_id text not null,
  cycle       text not null default '2026-27',
  new_gross   numeric,
  /** Carried alongside so the increment is readable even if pay changes later. */
  prev_gross  numeric,
  note        text,
  decided_by  text,
  decided_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (employee_id, cycle)
);

comment on table public.hrms_appraisal is
  'The decided outcome of an appraisal discussion: the new gross per person '
  'per cycle. Written from the Individual Report Card in HRMS.';

alter table public.hrms_appraisal enable row level security;
revoke all on public.hrms_appraisal from anon, authenticated;
