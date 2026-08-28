-- 0089: the Design Plans grid, second cut (Dr Raghu, 28 Aug 2026):
-- BOM and Manuf-drawing completion percentages per project, a MANUAL row
-- order (arrows, no column sorting), and THIS WEEK'S WORKING — the design
-- room's own week list: date, designer, work to be done.
--
-- Line comments only. Safe to re-run.

alter table public.vishwa_project add column if not exists bom_pct    numeric;
alter table public.vishwa_project add column if not exists manuf_pct  numeric;
alter table public.vishwa_project add column if not exists sort_order integer;

create table if not exists public.vishwa_week_work (
  id       uuid primary key default gen_random_uuid(),
  on_date  date not null,
  designer text not null default '',
  work     text not null default '',
  by       text,
  at       timestamptz not null default now()
);
create index if not exists vishwa_week_work_date on public.vishwa_week_work (on_date);

alter table public.vishwa_week_work enable row level security;
drop policy if exists vishwa_week_work_read on public.vishwa_week_work;
create policy vishwa_week_work_read on public.vishwa_week_work
  for select to authenticated using (true);

-- Writes go through /api/vishwakarma/projects with the service key, behind
-- the Vishwakarma grant.
