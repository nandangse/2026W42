-- 0088: the DESIGN PLAN (Dr Raghu, 28 Aug 2026): "this plan is similar like
-- the main plan but is only related to Design. I would want Design to make
-- this here, and this should come in the project there."
--
-- Design's own dated ladder per project — Kickoff, GAD, TBOM, Manuf
-- Drawings, Full BOM, As-Built Checks, and whatever else the designer adds —
-- bracketed by the project's START and COMPLETION dates, which are the
-- planning layer's and NOT design's to change. Main Genie's project timeline
-- shows these stages alongside the plan.
--
-- Line comments only. Safe to re-run.

create table if not exists public.vishwa_design_plan (
  id         uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects (id) on delete cascade,
  idx        integer not null,
  title      text not null,
  on_date    date,
  done       boolean not null default false,
  by         text,
  at         timestamptz not null default now(),
  unique (project_id, idx)
);
create index if not exists vishwa_design_plan_proj on public.vishwa_design_plan (project_id);

alter table public.vishwa_design_plan enable row level security;
drop policy if exists vishwa_design_plan_read on public.vishwa_design_plan;
create policy vishwa_design_plan_read on public.vishwa_design_plan
  for select to authenticated using (true);

-- Writes go through /api/vishwakarma/projects with the service key, behind
-- the Vishwakarma grant.
