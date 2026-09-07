-- 0150_appraisal_effective_from.sql — Genie 5.0.7.0 (7 Sep 2026)
--
-- Dr Raghu, 7 Sep 2026, on the workers' revision: "this will make it common
-- to increase the rate from 1st August 2026 for everyone in the records.
-- Before this, all arrears are given as Interim bonus."
--
-- The day a new rate starts is not the day it was decided. Payroll needs the
-- first, the record keeps the second.
alter table public.hrms_appraisal add column if not exists effective_from date;

create table if not exists public.genie_migration (name text primary key, applied_at timestamptz not null default now());
insert into public.genie_migration (name) values ('0150_appraisal_effective_from') on conflict (name) do nothing;
