-- 0074: the project layer starts planning for itself (Genie 3.23.1.21)
--
-- · projects.description — the written read on what the project is.
--   apply_projects (the morning import) never touches it, so it survives
--   every upload.
-- · project_plans / project_milestones — LITERAL TWINS of plans/milestones,
--   keyed by project id. Twins rather than shared tables only because
--   plans.job_id carries a foreign key to jobs. Direction (Dr Raghu,
--   26 Aug 2026): planning moves progressively UP to project level, so the
--   shapes stay identical on purpose — same columns, same RLS, same API.

alter table public.projects add column if not exists description text;

create table if not exists public.project_plans (
  project_id   text primary key references public.projects (id) on delete cascade,
  start_date   date,
  baseline_on  date,
  baseline_end date
);

create table if not exists public.project_milestones (
  id          uuid primary key default gen_random_uuid(),
  project_id  text not null references public.projects (id) on delete cascade,
  idx         integer not null,
  title       text,
  days        integer default 1,
  preds       integer[] default '{}',
  crew        jsonb default '{}'::jsonb,
  shift       text default 'D',
  offset_days integer default 0,
  done        boolean not null default false,
  done_on     date,
  unique (project_id, idx)
);

create index if not exists project_milestones_proj on public.project_milestones (project_id);

alter table public.project_plans      enable row level security;
alter table public.project_milestones enable row level security;

-- read by readers, write by planner+admin — same rule as the job layer
drop policy if exists project_plans_rw on public.project_plans;
create policy project_plans_rw on public.project_plans
  for all using (public.is_reader())
  with check (public.is_planner_or_admin());

drop policy if exists project_milestones_rw on public.project_milestones;
create policy project_milestones_rw on public.project_milestones
  for all using (public.is_reader())
  with check (public.is_planner_or_admin());
