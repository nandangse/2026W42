-- 0005_rls.sql
-- Row-level security. The service-role key (upload pipeline, admin user mgmt,
-- seed/acceptance scripts) bypasses RLS by design. Everything a logged-in
-- user's browser reaches goes through the user-scoped client, so these
-- policies are the real access contract.
--
-- Tiers:
--   reader  = planner or admin  → may read every board table
--   planner+admin               → may write the planning layer
--   admin                       → templates + (via service role) users
--   uploader                    → reads NOTHING here; its only view is the
--                                 service-role /api/upload-status endpoint.
--
-- Re-runnable: every policy is dropped-if-exists before (re)creation.

alter table public.profiles            enable row level security;
alter table public.jobs                enable row level security;
alter table public.projects            enable row level security;
alter table public.erp_tasks           enable row level security;
alter table public.import_batches      enable row level security;
alter table public.plans               enable row level security;
alter table public.milestones          enable row level security;
alter table public.baseline_milestones enable row level security;
alter table public.manual_tasks        enable row level security;
alter table public.task_comments       enable row level security;
alter table public.materials           enable row level security;
alter table public.family_templates    enable row level security;
alter table public.settings            enable row level security;

-- ---- profiles ----
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid() or public.is_admin());

-- ---- ERP-derived: read-only to readers; writes are service-role only ----
drop policy if exists jobs_read on public.jobs;
create policy jobs_read on public.jobs
  for select using (public.is_reader());
-- job-field edits (tdd | stat | mgmt) go through the user client; mgmt is
-- additionally trigger-guarded to raghu.
drop policy if exists jobs_update on public.jobs;
create policy jobs_update on public.jobs
  for update using (public.is_planner_or_admin())
  with check (public.is_planner_or_admin());

drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects
  for select using (public.is_reader());

drop policy if exists erp_tasks_read on public.erp_tasks;
create policy erp_tasks_read on public.erp_tasks
  for select using (public.is_reader());
-- toggling ERP task done / esc happens through the user client.
drop policy if exists erp_tasks_update on public.erp_tasks;
create policy erp_tasks_update on public.erp_tasks
  for update using (public.is_planner_or_admin())
  with check (public.is_planner_or_admin());

drop policy if exists import_batches_read on public.import_batches;
create policy import_batches_read on public.import_batches
  for select using (public.is_reader());

-- ---- App-owned planning layer: read by readers, write by planner+admin ----
drop policy if exists plans_rw on public.plans;
create policy plans_rw on public.plans
  for all using (public.is_reader())
  with check (public.is_planner_or_admin());

drop policy if exists milestones_rw on public.milestones;
create policy milestones_rw on public.milestones
  for all using (public.is_reader())
  with check (public.is_planner_or_admin());

drop policy if exists baseline_rw on public.baseline_milestones;
create policy baseline_rw on public.baseline_milestones
  for all using (public.is_reader())
  with check (public.is_planner_or_admin());

drop policy if exists manual_tasks_rw on public.manual_tasks;
create policy manual_tasks_rw on public.manual_tasks
  for all using (public.is_reader())
  with check (public.is_planner_or_admin());

drop policy if exists task_comments_rw on public.task_comments;
create policy task_comments_rw on public.task_comments
  for all using (public.is_reader())
  with check (public.is_planner_or_admin());

drop policy if exists materials_rw on public.materials;
create policy materials_rw on public.materials
  for all using (public.is_reader())
  with check (public.is_planner_or_admin());

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings
  for select using (public.is_reader());
drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings
  for all using (public.is_planner_or_admin())
  with check (public.is_planner_or_admin());

-- ---- templates: admin only writes ----
drop policy if exists templates_read on public.family_templates;
create policy templates_read on public.family_templates
  for select using (public.is_reader());
drop policy if exists templates_write on public.family_templates;
create policy templates_write on public.family_templates
  for all using (public.is_admin())
  with check (public.is_admin());
