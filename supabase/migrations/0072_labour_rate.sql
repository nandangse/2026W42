-- 0072_labour_rate.sql
--
-- LABOUR RATES (Dr Raghu, 25 Aug 2026): one day-rate per trade, set in
-- Admin -> Settings. With the manpower ledger now rolling every day, cost
-- falls out: headcount x rate per day, summable per job, per week, per
-- delivery. Rates are money, so every screen that shows the cost masks it
-- under the value permission like every other rupee figure.
--
-- ASCII only, additive, safe to re-run.

create table if not exists public.labour_rate (
  trade      text primary key,
  day_rate   numeric(10,2) not null default 0,
  updated_by text,
  updated_at timestamptz not null default now()
);

insert into public.labour_rate (trade) values
  ('fitter'), ('helper'), ('welder'), ('painter'), ('electrician'), ('hydraulic')
on conflict (trade) do nothing;

comment on table public.labour_rate is
  'Day rate per trade, set in Admin. Multiplied with job_manpower to give '
  'labour cost per job per day.';
