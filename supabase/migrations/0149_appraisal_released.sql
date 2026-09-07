-- 0149_appraisal_released.sql — Genie 5.0.6.0 (7 Sep 2026)
--
-- RELEASED (Dr Raghu, 7 Sep 2026): "in this also give status — Not Done,
-- IDP Done, Manager IDP completed, Appraisal Finalised, Released. Have a
-- cell called released."
--
-- Finalised is his decision; released is the moment the person is told.
-- Two different days, and the table must show which one a person is on.
alter table public.hrms_appraisal add column if not exists released_at timestamptz;
alter table public.hrms_appraisal add column if not exists released_by text;

create table if not exists public.genie_migration (name text primary key, applied_at timestamptz not null default now());
insert into public.genie_migration (name) values ('0149_appraisal_released') on conflict (name) do nothing;
