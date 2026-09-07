-- 0155_salary_structure_frozen.sql — Genie 5.0.15.0 (7 Sep 2026)
--
-- Dr Raghu, 7 Sep 2026: "after uploading, give a facility to freeze it by
-- Raghu. Let me sign my name on it."
--
-- A rate list is what everybody is paid from, and until now it could be
-- edited by anybody with HRMS at any time, for ever. Freezing closes it: the
-- cells stop taking edits, and the sheet carries the name he typed, the hand
-- that typed it and the moment it happened.
--
-- The signature is kept as he wrote it, not as a tick. A name a man typed
-- himself is a different thing from a boolean somebody's code set true.
alter table public.hrms_salary_structure add column if not exists frozen_at  timestamptz;
alter table public.hrms_salary_structure add column if not exists frozen_by  text;
alter table public.hrms_salary_structure add column if not exists signed_as  text;
create index if not exists hrms_salary_structure_frozen_idx on public.hrms_salary_structure (frozen_at desc);

create table if not exists public.genie_migration (name text primary key, applied_at timestamptz not null default now());
insert into public.genie_migration (name) values ('0155_salary_structure_frozen') on conflict (name) do nothing;
