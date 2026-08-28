-- 0085: Design Plans becomes a PROJECT grid (Dr Raghu, 28 Aug 2026):
-- "Project (Design Stage on next line as a drop down) — Jobs — Design Owner —
-- Project Plan (lightbox) — Next Milestone — No of Issues to Design — Issues
-- — Design Support needed."
--
-- Jobs, milestones and problems are read from the tables that already hold
-- them; the only NEW facts are design's own three words on a project — its
-- design stage, its design owner, and the support it needs — so one thin
-- table carries exactly those.
--
-- Line comments only (Postgres nests /* */). Safe to re-run.

create table if not exists public.vishwa_project (
  project_id     text primary key references public.projects (id) on delete cascade,
  design_stage   text,
  design_owner   text,
  support_needed text,
  by             text,
  at             timestamptz not null default now()
);

alter table public.vishwa_project enable row level security;
drop policy if exists vishwa_project_read on public.vishwa_project;
create policy vishwa_project_read on public.vishwa_project
  for select to authenticated using (true);

-- Writes go through /api/vishwakarma/projects with the service key, which
-- checks the caller holds the Vishwakarma grant.
