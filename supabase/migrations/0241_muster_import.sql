-- 0241 — the attendance musters pulled from the HR sheet (Dr Raghu, 16 Oct
-- 2026: "should have more months"). One row per attendance month that no
-- payroll run in Genie carries; the run's own muster always wins.
create table if not exists public.hrms_muster_import (
  id            uuid primary key default gen_random_uuid(),
  year          integer not null,
  month         integer not null check (month between 1 and 12),
  tab           text not null,                 -- the sheet tab it came from, e.g. "Muster July 2025"
  people        integer not null default 0,
  days          integer not null default 0,
  muster        jsonb not null,                -- the parsed Muster, same shape as hrms_salary_sheet.muster
  source_sheet  text,
  warnings      text[] not null default '{}',
  imported_at   timestamptz not null default now(),
  imported_by   text,
  unique (year, month)
);
alter table public.hrms_muster_import enable row level security;
revoke all on public.hrms_muster_import from public, anon, authenticated;

insert into public.feature_request (title, body, want, status, note, by)
select 'Attendance Muster — more months, by person, and on the Genie door', '<p>"SHOULD HAVE MORE MONTHS. ALSO CAN BE ABLE TO SHOW ONE PERSON ONLY. HAVE A LINK AT TOP BY PERSON / BY MONTH. MOVE THIS DATA SUMMARY TO PERICLAW AS NEEDED SO QUESTION CAN BE ASKED" (Dr Raghu, 16 Oct 2026.)</p>', 'must', 'done', 'Shipped as Genie 6.11.2.0 — months pulled from the HR sheet''s Muster tabs (Apr 2024 onwards) on a button; By month / By person at the top; hrms_attendance tool on the MCP door behind the HRMS gate.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title like 'Attendance Muster — more months%');
insert into public.genie_migration (name) values ('0241_muster_import') on conflict (name) do nothing;
