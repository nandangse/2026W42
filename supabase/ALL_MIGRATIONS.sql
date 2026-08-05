-- ============================================================
-- Nandan Works Planning Suite — ALL migrations, in order.
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.
-- ============================================================


-- >>>>> supabase/migrations/0001_init_extensions_profiles.sql
-- 0001_init_extensions_profiles.sql
-- Extensions, the profiles table (role store), and new-user handling.
-- Run migrations strictly in order (0001…000N); stop on any error and repair.

create extension if not exists pgcrypto;      -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- profiles: one row per auth.users, keyed on id = auth.users.id (no separate
-- user_id column — the intern-portal lesson). role drives every RLS policy.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  role       text not null default 'planner'
             check (role in ('admin', 'planner', 'uploader')),
  disabled   boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'App roles keyed to auth.users.id. role ∈ {admin, planner, uploader}.';

-- Auto-create a profile whenever an auth user is created (role comes from the
-- admin-supplied user_metadata.role when present, else defaults to planner).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'planner')
  )
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- >>>>> supabase/migrations/0002_erp_tables.sql
-- 0002_erp_tables.sql
-- ERP-derived tables. These are the ONLY tables that uploads replace/update.
-- Data enters exclusively via POST /api/upload (Excel). Jobs are archived,
-- never deleted.
--
-- Note on column names: a few spec names collide with SQL / PostgREST reserved
-- words ("start", "offset"). Those are renamed to safe equivalents
-- (start_date, offset_days) and mapped back in the TypeScript layer. Every
-- other name matches the spec verbatim.

create table if not exists public.jobs (
  id            text primary key,                 -- 10-digit ERP job id
  tag           text,
  fam           text,
  cust          text,
  val           numeric default 0,
  tdd           date,
  otd           date,
  start_date    date,
  proj          text,
  stat          text,
  pct           numeric default 0,
  note          text,
  own           text,
  mgmt          date,                             -- Management Target Date (raghu-only edits)
  tp            numeric default 0,
  tpv           numeric default 0,
  tpp           numeric default 0,
  kit           numeric default 0,                -- ERP "Kitting percentage" (drives the fixed formula)
  active        boolean not null default true,
  archived_at   timestamptz,
  updated_batch uuid
);

create index if not exists jobs_active_idx on public.jobs (active);
create index if not exists jobs_proj_idx on public.jobs (proj);
create index if not exists jobs_tdd_idx on public.jobs (tdd);

create table if not exists public.projects (
  id          text primary key,                   -- NGSE-PROJ-…
  mgr         text,
  committed   date,
  exp_end     date,
  so          text,
  stage       text,
  job_numbers text[]
);

-- ERP tasks originating from ToDo uploads. source_key is the proven merge key:
--   job_id || '||' || left(title, 60)
create table if not exists public.erp_tasks (
  id         uuid primary key default gen_random_uuid(),
  job_id     text references public.jobs (id) on delete set null,
  source_key text not null unique,
  title      text,
  detail     text,
  who        text,
  due        date,
  cat        text,
  esc        text default 'None',
  done       boolean not null default false
);

create index if not exists erp_tasks_job_idx on public.erp_tasks (job_id);

-- Every morning snapshot is retained (history; enables "as of" questions later).
create table if not exists public.import_batches (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('jobs', 'projects', 'tasks', 'pre')),
  filename    text,
  uploaded_by text,
  uploaded_at timestamptz not null default now(),
  row_count   integer default 0,
  summary     jsonb
);

create index if not exists import_batches_kind_time_idx
  on public.import_batches (kind, uploaded_at desc);


-- >>>>> supabase/migrations/0003_app_tables.sql
-- 0003_app_tables.sql
-- App-owned planning layer. NEVER touched by uploads (§6 zero-data-loss).
-- These tables survive every upload untouched.

create table if not exists public.plans (
  job_id       text primary key references public.jobs (id) on delete cascade,
  start_date   date,
  baseline_on  date,
  baseline_end date
);

create table if not exists public.milestones (
  id          uuid primary key default gen_random_uuid(),
  job_id      text not null references public.jobs (id) on delete cascade,
  idx         integer not null,
  title       text,
  days        integer default 1,
  preds       integer[] default '{}',
  crew        jsonb default '{}'::jsonb,   -- {fitter,helper,welder,painter,electrician,hydraulic}
  shift       text default 'D',
  offset_days integer default 0,
  done        boolean not null default false,
  done_on     date,
  unique (job_id, idx)
);

create index if not exists milestones_job_idx on public.milestones (job_id);

create table if not exists public.baseline_milestones (
  job_id     text not null references public.jobs (id) on delete cascade,
  idx        integer not null,
  title      text,
  start_date date,
  end_date   date,
  primary key (job_id, idx)
);

-- Manual tasks: same shape as erp_tasks minus source_key, plus created_by.
create table if not exists public.manual_tasks (
  id         uuid primary key default gen_random_uuid(),
  job_id     text references public.jobs (id) on delete set null,
  title      text,
  detail     text,
  who        text,
  due        date,
  cat        text,
  esc        text default 'None',
  done       boolean not null default false,
  created_by text
);

create index if not exists manual_tasks_job_idx on public.manual_tasks (job_id);

create table if not exists public.task_comments (
  id        uuid primary key default gen_random_uuid(),
  task_id   uuid not null,
  task_kind text not null check (task_kind in ('erp', 'manual')),
  by        text,
  at        timestamptz not null default now(),
  body      text
);

create index if not exists task_comments_task_idx
  on public.task_comments (task_kind, task_id);

create table if not exists public.materials (
  id     uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs (id) on delete cascade,
  item   text not null,
  qty    text,
  status text not null default 'Pending' check (status in ('Pending', 'Received')),
  custom boolean not null default false
);

create index if not exists materials_job_idx on public.materials (job_id);

create table if not exists public.family_templates (
  family     text primary key,
  milestones jsonb not null default '[]'::jsonb
);

-- Single-row settings. priority_order is the manual board ordering.
create table if not exists public.settings (
  id             integer primary key default 1 check (id = 1),
  priority_order text[] default '{}'
);


-- >>>>> supabase/migrations/0004_functions_triggers.sql
-- 0004_functions_triggers.sql
-- Role helpers used by every RLS policy, plus the Management-Target-Date guard.

-- Current user's role, read past RLS (security definer) to avoid recursion.
create or replace function public.jwt_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.jwt_role() = 'admin', false);
$$;

-- planner or admin — the "can edit the planning layer" tier.
create or replace function public.is_planner_or_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.jwt_role() in ('planner', 'admin'), false);
$$;

-- any authenticated non-uploader — the "can read the boards" tier.
create or replace function public.is_reader()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.jwt_role() in ('planner', 'admin'), false);
$$;

-- The single identity allowed to edit Management Target Date (spec §0.5).
-- Change here (and RAGHU_EMAIL env) if the owner ever changes.
create or replace function public.raghu_email()
returns text language sql immutable as $$
  select 'raghu@nandan.co.in'::text;
$$;

-- Guard: block any change to jobs.mgmt by an authenticated user who is not
-- raghu. Service-role writes (auth.uid() is null — the upload pipeline, which
-- legitimately sets mgmt from the file) are allowed. This is the RLS-tier half
-- of the "API + RLS" enforcement; the /api/job-field route is the other half.
create or replace function public.enforce_mgmt_editor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.mgmt is distinct from old.mgmt
     and auth.uid() is not null
     and lower(coalesce(auth.email(), '')) <> lower(public.raghu_email())
  then
    raise exception 'Only % may edit the Management Target Date', public.raghu_email()
      using errcode = '42501';   -- insufficient_privilege
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_mgmt_guard on public.jobs;
create trigger jobs_mgmt_guard
  before update of mgmt on public.jobs
  for each row execute function public.enforce_mgmt_editor();


-- >>>>> supabase/migrations/0005_rls.sql
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


-- >>>>> supabase/migrations/0006_settings_singleton.sql
-- 0006_settings_singleton.sql
-- Ensure the single settings row exists (family templates + users are seeded by
-- scripts/seed.ts, which needs the templateFor() jsonb from the TS layer).

insert into public.settings (id, priority_order)
values (1, '{}')
on conflict (id) do nothing;


-- >>>>> supabase/migrations/0007_upload_merge_functions.sql
-- 0007_upload_merge_functions.sql
-- The upload merge, expressed as atomic set-based functions. Each RPC call runs
-- in its own transaction, giving the §4 "inside one transaction" guarantee.
-- SECURITY DEFINER + service-role-only callers; the mgmt guard trigger still
-- passes because service-role writes have a null auth.uid().
--
-- Merge semantics (spec §4):
--   apply_jobs     — upsert every row active=true; archive (never delete) jobs
--                    absent from the file; prune priority_order to survivors.
--   apply_projects — upsert projects; blank-fill jobs.own/otd/tdd (never
--                    overwrite non-null).
--   apply_owners   — blank-fill jobs.own only (own/mgmt lesson: own only here).
--   apply_tasks    — upsert erp_tasks on source_key preserving done + comments;
--                    close (done=true, never delete) keys that vanished.

create or replace function public.apply_jobs(p_jobs jsonb, p_batch uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ids text[];
begin
  if p_jobs is null or jsonb_array_length(p_jobs) = 0 then
    return;  -- never archive the whole board on an empty payload
  end if;

  select coalesce(array_agg(j ->> 'id'), '{}') into ids
  from jsonb_array_elements(p_jobs) j;

  insert into public.jobs
    (id, tag, fam, cust, val, tdd, otd, start_date, proj, stat, pct, note,
     own, mgmt, tp, tpv, tpp, kit, active, archived_at, updated_batch)
  select
    j ->> 'id',
    j ->> 'tag',
    j ->> 'fam',
    j ->> 'cust',
    coalesce((j ->> 'val')::numeric, 0),
    nullif(j ->> 'tdd', '')::date,
    nullif(j ->> 'otd', '')::date,
    nullif(j ->> 'start', '')::date,
    j ->> 'proj',
    j ->> 'stat',
    coalesce((j ->> 'pct')::numeric, 0),
    j ->> 'note',
    j ->> 'own',
    nullif(j ->> 'mgmt', '')::date,
    coalesce((j ->> 'tp')::numeric, 0),
    coalesce((j ->> 'tpv')::numeric, 0),
    coalesce((j ->> 'tpp')::numeric, 0),
    coalesce((j ->> 'kit')::numeric, 0),
    true, null, p_batch
  from jsonb_array_elements(p_jobs) j
  on conflict (id) do update set
    tag = excluded.tag, fam = excluded.fam, cust = excluded.cust,
    val = excluded.val, tdd = excluded.tdd, otd = excluded.otd,
    start_date = excluded.start_date, proj = excluded.proj,
    stat = excluded.stat, pct = excluded.pct, note = excluded.note,
    own = excluded.own, mgmt = excluded.mgmt, tp = excluded.tp,
    tpv = excluded.tpv, tpp = excluded.tpp, kit = excluded.kit,
    active = true, archived_at = null, updated_batch = excluded.updated_batch;

  -- jobs that left the export are archived, never deleted (plans stay reachable)
  update public.jobs
    set active = false, archived_at = now()
    where active = true and not (id = any (ids));

  -- priority_order: drop archived ids, keep order (new jobs appended at read time)
  update public.settings
    set priority_order = coalesce((
      select array_agg(x order by ord)
      from unnest(priority_order) with ordinality as t(x, ord)
      where x = any (ids)
    ), '{}')
    where id = 1;
end;
$$;

create or replace function public.apply_projects(p_projects jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_projects is null or jsonb_array_length(p_projects) = 0 then
    return;
  end if;

  insert into public.projects (id, mgr, committed, exp_end, so, stage, job_numbers)
  select
    p ->> 'id',
    p ->> 'mgr',
    nullif(p ->> 'committed', '')::date,
    nullif(p ->> 'expEnd', '')::date,
    p ->> 'so',
    p ->> 'stage',
    '{}'::text[]
  from jsonb_array_elements(p_projects) p
  on conflict (id) do update set
    mgr = excluded.mgr, committed = excluded.committed,
    exp_end = excluded.exp_end, so = excluded.so, stage = excluded.stage;

  -- blank-fill only — never overwrite a non-null job value
  update public.jobs j set
    own = coalesce(nullif(j.own, ''), p.mgr),
    otd = coalesce(j.otd, p.committed),
    tdd = coalesce(j.tdd, p.exp_end)
  from public.projects p
  where j.proj = p.id;
end;
$$;

create or replace function public.apply_owners(p_owners jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_owners is null or p_owners = '{}'::jsonb then
    return;
  end if;

  update public.jobs j set own = o.own
  from (
    select key as id, value ->> 'own' as own
    from jsonb_each(p_owners)
  ) o
  where j.id = o.id
    and coalesce(nullif(j.own, ''), '') = ''
    and coalesce(o.own, '') <> '';
end;
$$;

create or replace function public.apply_tasks(p_tasks jsonb, p_batch uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  keys text[];
begin
  if p_tasks is null then
    return;
  end if;

  -- upsert on source_key = job_id || '||' || left(title, 60); preserve done & esc
  insert into public.erp_tasks (job_id, source_key, title, detail, who, due, cat)
  select
    t ->> 'j',
    (t ->> 'j') || '||' || left(coalesce(t ->> 't', ''), 60),
    t ->> 't',
    t ->> 'd',
    t ->> 'who',
    nullif(t ->> 'due', '')::date,
    t ->> 'cat'
  from jsonb_array_elements(p_tasks) t
  on conflict (source_key) do update set
    job_id = excluded.job_id, title = excluded.title,
    detail = excluded.detail, who = excluded.who,
    due = excluded.due, cat = excluded.cat;

  select coalesce(
    array_agg((t ->> 'j') || '||' || left(coalesce(t ->> 't', ''), 60)), '{}')
    into keys
  from jsonb_array_elements(p_tasks) t;

  -- keys that vanished from the file are closed, never deleted; comments stay
  if array_length(keys, 1) is not null then
    update public.erp_tasks set done = true
      where not (source_key = any (keys)) and done = false;
  end if;
end;
$$;


-- >>>>> supabase/migrations/0008_roles_initials_updated.sql
-- 0008_roles_initials_updated.sql
-- Three changes, all additive and safe to re-run:
--   1. people gain a 2-letter INITIALS key (the handle used for assigning tasks
--      and filtering the boards), a display name, and the ERP owner string that
--      links a login to the "Project Owner" text coming from the Jobmaster.
--   2. two new roles — project_owner and user — plus a read-only viewer.
--   3. jobs carry a last-updated timestamp so the boards can show date + time.

-- ---------------------------------------------------------------------------
-- 1. profiles: initials + identity linkage
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists initials     text;
alter table public.profiles add column if not exists display_name text;
-- the exact string this person appears as in jobs.own / projects.mgr
alter table public.profiles add column if not exists erp_owner    text;

-- initials are the assignment key, so they must be unique and uppercase A–Z
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_initials_fmt') then
    alter table public.profiles
      add constraint profiles_initials_fmt
      check (initials is null or initials ~ '^[A-Z]{2}$');
  end if;
end $$;

create unique index if not exists profiles_initials_key
  on public.profiles (initials) where initials is not null;

create index if not exists profiles_erp_owner_idx
  on public.profiles (lower(erp_owner)) where erp_owner is not null;

-- ---------------------------------------------------------------------------
-- 2. roles: admin | planner | project_owner | user | viewer | uploader
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'planner', 'project_owner', 'user', 'viewer', 'uploader'));

-- Role tiers used by every RLS policy.
--   reader  — may read the boards (everyone except the uploader)
--   editor  — may write the planning layer
--   tasker  — may write tasks/comments (editors plus rank-and-file users)
create or replace function public.is_reader()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    public.jwt_role() in ('admin', 'planner', 'project_owner', 'user', 'viewer'),
    false);
$$;

-- kept for backwards compatibility with existing policies; now means "editor"
create or replace function public.is_planner_or_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.jwt_role() in ('admin', 'planner', 'project_owner'), false);
$$;

create or replace function public.is_editor()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.jwt_role() in ('admin', 'planner', 'project_owner'), false);
$$;

create or replace function public.is_tasker()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    public.jwt_role() in ('admin', 'planner', 'project_owner', 'user'), false);
$$;

-- tasks & comments: rank-and-file users may act on them too (viewers may not)
drop policy if exists manual_tasks_rw on public.manual_tasks;
create policy manual_tasks_rw on public.manual_tasks
  for all using (public.is_reader()) with check (public.is_tasker());

drop policy if exists task_comments_rw on public.task_comments;
create policy task_comments_rw on public.task_comments
  for all using (public.is_reader()) with check (public.is_tasker());

drop policy if exists erp_tasks_update on public.erp_tasks;
create policy erp_tasks_update on public.erp_tasks
  for update using (public.is_tasker()) with check (public.is_tasker());

-- everyone (except uploader) may see who the people are, for the assignee and
-- Project-Owner pickers; only admins manage them
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid() or public.is_reader() or public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. jobs: last updated (date + time)
-- ---------------------------------------------------------------------------
alter table public.jobs add column if not exists updated_at timestamptz;
update public.jobs set updated_at = coalesce(updated_at, now()) where updated_at is null;

-- Re-declare the jobs merge so every upload stamps updated_at. Identical to
-- 0007 in every other respect.
create or replace function public.apply_jobs(p_jobs jsonb, p_batch uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ids text[];
begin
  if p_jobs is null or jsonb_array_length(p_jobs) = 0 then
    return;  -- never archive the whole board on an empty payload
  end if;

  select coalesce(array_agg(j ->> 'id'), '{}') into ids
  from jsonb_array_elements(p_jobs) j;

  insert into public.jobs
    (id, tag, fam, cust, val, tdd, otd, start_date, proj, stat, pct, note,
     own, mgmt, tp, tpv, tpp, kit, active, archived_at, updated_batch, updated_at)
  select
    j ->> 'id',
    j ->> 'tag',
    j ->> 'fam',
    j ->> 'cust',
    coalesce((j ->> 'val')::numeric, 0),
    nullif(j ->> 'tdd', '')::date,
    nullif(j ->> 'otd', '')::date,
    nullif(j ->> 'start', '')::date,
    j ->> 'proj',
    j ->> 'stat',
    coalesce((j ->> 'pct')::numeric, 0),
    j ->> 'note',
    j ->> 'own',
    nullif(j ->> 'mgmt', '')::date,
    coalesce((j ->> 'tp')::numeric, 0),
    coalesce((j ->> 'tpv')::numeric, 0),
    coalesce((j ->> 'tpp')::numeric, 0),
    coalesce((j ->> 'kit')::numeric, 0),
    true, null, p_batch, now()
  from jsonb_array_elements(p_jobs) j
  on conflict (id) do update set
    tag = excluded.tag, fam = excluded.fam, cust = excluded.cust,
    val = excluded.val, tdd = excluded.tdd, otd = excluded.otd,
    start_date = excluded.start_date, proj = excluded.proj,
    stat = excluded.stat, pct = excluded.pct, note = excluded.note,
    own = excluded.own, mgmt = excluded.mgmt, tp = excluded.tp,
    tpv = excluded.tpv, tpp = excluded.tpp, kit = excluded.kit,
    active = true, archived_at = null, updated_batch = excluded.updated_batch,
    -- only bump the stamp when something substantive actually changed
    updated_at = case
      when public.jobs.tag  is distinct from excluded.tag
        or public.jobs.fam  is distinct from excluded.fam
        or public.jobs.cust is distinct from excluded.cust
        or public.jobs.val  is distinct from excluded.val
        or public.jobs.tdd  is distinct from excluded.tdd
        or public.jobs.otd  is distinct from excluded.otd
        or public.jobs.start_date is distinct from excluded.start_date
        or public.jobs.stat is distinct from excluded.stat
        or public.jobs.pct  is distinct from excluded.pct
        or public.jobs.note is distinct from excluded.note
        or public.jobs.own  is distinct from excluded.own
        or public.jobs.mgmt is distinct from excluded.mgmt
        or public.jobs.kit  is distinct from excluded.kit
        or public.jobs.active is distinct from true
      then now() else public.jobs.updated_at end;

  -- jobs that left the export are archived, never deleted (plans stay reachable)
  update public.jobs
    set active = false, archived_at = now(), updated_at = now()
    where active = true and not (id = any (ids));

  -- priority_order: drop archived ids, keep order
  update public.settings
    set priority_order = coalesce((
      select array_agg(x order by ord)
      from unnest(priority_order) with ordinality as t(x, ord)
      where x = any (ids)
    ), '{}')
    where id = 1;
end;
$$;

-- app-side edits (tdd / stat / mgmt) should stamp the job too
create or replace function public.touch_job()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jobs_touch on public.jobs;
create trigger jobs_touch
  before update of tdd, stat, mgmt on public.jobs
  for each row execute function public.touch_job();


-- >>>>> supabase/migrations/0009_touch_job_only_on_change.sql
-- 0009_touch_job_only_on_change.sql
-- Fix: "Last updated" showed the upload time for EVERY job, so it could not
-- tell you which jobs actually changed this morning.
--
-- Cause: apply_jobs carefully bumps updated_at only when a substantive column
-- differs, but its ON CONFLICT DO UPDATE always lists tdd/stat/mgmt in the SET
-- clause — and a `before update of <cols>` trigger fires whenever those columns
-- are assigned, changed or not. The trigger therefore overwrote the timestamp
-- with now() for all 111 rows on every upload.
--
-- Fix: only stamp the row when one of those values genuinely changed. App-side
-- edits (/api/job-field) still stamp correctly, because there the value differs.

create or replace function public.touch_job()
returns trigger language plpgsql as $$
begin
  if new.tdd  is distinct from old.tdd
     or new.stat is distinct from old.stat
     or new.mgmt is distinct from old.mgmt
  then
    new.updated_at = now();
  end if;
  return new;
end;
$$;


-- >>>>> supabase/migrations/0010_goals_layer.sql
-- 0010_goals_layer.sql
-- Goals layer: OPSP → five goals → cascade → tactic, with the To-Do engine.
--
-- PURELY ADDITIVE BY DESIGN. This migration creates new tables and adds only
-- nullable columns to existing ones. It never alters or drops anything the
-- current app reads, so the previous release keeps working unchanged and a
-- rollback is a code revert alone — these tables simply sit unused.

-- ---------------------------------------------------------------------------
-- 1. Masters the cascade reads from
-- ---------------------------------------------------------------------------
create table if not exists public.swimlanes (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  color      text default '#8A94A0',
  sort_order integer default 0
);

create table if not exists public.units (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique,   -- ₹ Cr, %, Jobs, Days, Nos …
  sort_order integer default 0
);

insert into public.swimlanes (name, color, sort_order) values
  ('Growth',     '#0D7A3F', 1),
  ('Operations', '#1B3A5C', 2),
  ('People',     '#7C3AED', 3),
  ('Quality',    '#0D9488', 4),
  ('Cash',       '#D97706', 5)
on conflict (name) do nothing;

insert into public.units (label, sort_order) values
  ('₹ Cr', 1), ('₹ Lakh', 2), ('%', 3), ('Nos', 4), ('Jobs', 5),
  ('Days', 6), ('Weeks', 7), ('Hours', 8), ('Roles', 9), ('Vendors', 10), ('Tonnes', 11)
on conflict (label) do nothing;

-- people master gap-fill (org chart + identity), all nullable
alter table public.profiles add column if not exists reports_to  uuid references public.profiles (id) on delete set null;
alter table public.profiles add column if not exists designation text;
alter table public.profiles add column if not exists department  text;
alter table public.profiles add column if not exists location    text;

create index if not exists profiles_reports_to_idx on public.profiles (reports_to);

-- ---------------------------------------------------------------------------
-- 2. The cascade — one self-referencing table for every level
-- ---------------------------------------------------------------------------
create table if not exists public.goal_node (
  id             uuid primary key default gen_random_uuid(),
  node_type      text not null check (node_type in ('goal','project','objective','key_result','tactic')),
  parent_id      uuid references public.goal_node (id) on delete cascade,
  goal_id        uuid references public.goal_node (id) on delete cascade,  -- denormalised root
  sort_order     integer default 0,
  goal_num       integer,                       -- 1..5 on goals only

  what           text not null default '',
  how            text default '',

  swimlane_id    uuid references public.swimlanes (id) on delete set null,
  period         text default 'FY2026-27',      -- decided now: retrofitting periods later is painful
  start_date     date,
  end_date       date,
  original_end   date,                          -- set once, never overwritten
  push_count     integer not null default 0,    -- times the date was moved
  carry_count    integer not null default 0,    -- days carried without closing

  completion_pct numeric default 0,             -- used only when there are no numbers and no children
  start_no       numeric,
  current_no     numeric,
  target_no      numeric,
  unit_id        uuid references public.units (id) on delete set null,
  weight         numeric not null default 1,    -- present now so value-weighting can be switched on later

  -- optional live feed: when set, current_no is read from the planning data
  -- instead of being typed. See src/lib/goal-metrics.ts.
  metric_source  text,

  status         text not null default 'not_started'
                 check (status in ('not_started','on_track','at_risk','blocked','done')),
  unaligned      boolean not null default false, -- a project with no goal is information, not an error

  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists goal_node_parent_idx on public.goal_node (parent_id);
create index if not exists goal_node_goal_idx   on public.goal_node (goal_id);
create index if not exists goal_node_type_idx   on public.goal_node (node_type);
create index if not exists goal_node_period_idx on public.goal_node (period);

-- owners: goals may have 2, lower levels default to 1
create table if not exists public.goal_node_owner (
  node_id   uuid not null references public.goal_node (id) on delete cascade,
  person_id uuid not null references public.profiles (id) on delete cascade,
  primary key (node_id, person_id)
);
create index if not exists goal_node_owner_person_idx on public.goal_node_owner (person_id);

-- comments stay visible after completion — they are the audit trail of the number
create table if not exists public.goal_node_comment (
  id         uuid primary key default gen_random_uuid(),
  node_id    uuid not null references public.goal_node (id) on delete cascade,
  by         text,
  at         timestamptz not null default now(),
  body       text not null
);
create index if not exists goal_node_comment_node_idx on public.goal_node_comment (node_id);

-- Critical Success Factors live with the OPSP; a goal links to several
create table if not exists public.csf (
  id    uuid primary key default gen_random_uuid(),
  label text not null unique
);
create table if not exists public.goal_csf_link (
  goal_id uuid not null references public.goal_node (id) on delete cascade,
  csf_id  uuid not null references public.csf (id) on delete cascade,
  primary key (goal_id, csf_id)
);

-- OPSP: structured rows alongside the uploaded one-pager
create table if not exists public.opsp_section (
  id         uuid primary key default gen_random_uuid(),
  period     text not null default 'FY2026-27',
  label      text not null,
  body       text default '',
  sort_order integer default 0
);

-- ---------------------------------------------------------------------------
-- 3. Access: granted, not default — and separate from planning access
-- ---------------------------------------------------------------------------
create table if not exists public.goal_access (
  person_id  uuid primary key references public.profiles (id) on delete cascade,
  can_edit   boolean not null default false,   -- false = read the tree only
  granted_at timestamptz not null default now()
);

-- Two DIFFERENT permission checks, kept apart from day one (spec §9):
--   has_goals_access() — may see the tree
--   owns_goal_node()   — always sees their own work, tree or no tree
create or replace function public.has_goals_access()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_admin(), false)
      or exists (select 1 from public.goal_access g where g.person_id = auth.uid());
$$;

create or replace function public.can_edit_goals()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_admin(), false)
      or exists (select 1 from public.goal_access g where g.person_id = auth.uid() and g.can_edit);
$$;

create or replace function public.owns_goal_node(p_node uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.goal_node_owner o
    where o.node_id = p_node and o.person_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
alter table public.swimlanes         enable row level security;
alter table public.units             enable row level security;
alter table public.goal_node         enable row level security;
alter table public.goal_node_owner   enable row level security;
alter table public.goal_node_comment enable row level security;
alter table public.csf               enable row level security;
alter table public.goal_csf_link     enable row level security;
alter table public.opsp_section      enable row level security;
alter table public.goal_access       enable row level security;

-- masters: readable by any signed-in user, admin-managed
drop policy if exists swimlanes_read on public.swimlanes;
create policy swimlanes_read on public.swimlanes for select using (auth.uid() is not null);
drop policy if exists swimlanes_write on public.swimlanes;
create policy swimlanes_write on public.swimlanes for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists units_read on public.units;
create policy units_read on public.units for select using (auth.uid() is not null);
drop policy if exists units_write on public.units;
create policy units_write on public.units for all using (public.is_admin()) with check (public.is_admin());

-- the tree: visible to grantees, PLUS always your own nodes
drop policy if exists goal_node_read on public.goal_node;
create policy goal_node_read on public.goal_node
  for select using (public.has_goals_access() or public.owns_goal_node(id));

drop policy if exists goal_node_write on public.goal_node;
create policy goal_node_write on public.goal_node
  for all using (public.can_edit_goals() or public.owns_goal_node(id))
  with check (public.can_edit_goals() or public.owns_goal_node(id));

drop policy if exists goal_owner_read on public.goal_node_owner;
create policy goal_owner_read on public.goal_node_owner
  for select using (public.has_goals_access() or person_id = auth.uid());
drop policy if exists goal_owner_write on public.goal_node_owner;
create policy goal_owner_write on public.goal_node_owner
  for all using (public.can_edit_goals()) with check (public.can_edit_goals());

drop policy if exists goal_comment_read on public.goal_node_comment;
create policy goal_comment_read on public.goal_node_comment
  for select using (public.has_goals_access() or public.owns_goal_node(node_id));
drop policy if exists goal_comment_write on public.goal_node_comment;
create policy goal_comment_write on public.goal_node_comment
  for all using (public.has_goals_access() or public.owns_goal_node(node_id))
  with check (public.has_goals_access() or public.owns_goal_node(node_id));

drop policy if exists csf_read on public.csf;
create policy csf_read on public.csf for select using (auth.uid() is not null);
drop policy if exists csf_write on public.csf;
create policy csf_write on public.csf for all using (public.can_edit_goals()) with check (public.can_edit_goals());

drop policy if exists goal_csf_read on public.goal_csf_link;
create policy goal_csf_read on public.goal_csf_link for select using (public.has_goals_access());
drop policy if exists goal_csf_write on public.goal_csf_link;
create policy goal_csf_write on public.goal_csf_link for all using (public.can_edit_goals()) with check (public.can_edit_goals());

drop policy if exists opsp_read on public.opsp_section;
create policy opsp_read on public.opsp_section for select using (public.has_goals_access());
drop policy if exists opsp_write on public.opsp_section;
create policy opsp_write on public.opsp_section for all using (public.can_edit_goals()) with check (public.can_edit_goals());

drop policy if exists goal_access_read on public.goal_access;
create policy goal_access_read on public.goal_access
  for select using (person_id = auth.uid() or public.is_admin());
drop policy if exists goal_access_write on public.goal_access;
create policy goal_access_write on public.goal_access
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. Keep updated_at honest, and stamp original_end once
-- ---------------------------------------------------------------------------
create or replace function public.touch_goal_node()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  -- the first end date a node is given is the commitment; never overwrite it
  if new.original_end is null then
    new.original_end = new.end_date;
  end if;
  -- moving the date forward is a push, and it is counted
  if tg_op = 'UPDATE'
     and new.end_date is distinct from old.end_date
     and old.end_date is not null then
    new.push_count = coalesce(old.push_count, 0) + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists goal_node_touch on public.goal_node;
create trigger goal_node_touch
  before insert or update on public.goal_node
  for each row execute function public.touch_goal_node();


-- >>>>> supabase/migrations/0011_owner_tier.sql
-- 0011_owner_tier.sql
-- One owner above the admin tier.
--
-- Until now every admin was equal: all admins had implicit goals access that
-- could not be revoked, and any admin could demote any other. This puts
-- raghu@nandan.co.in at the top — the only account that can govern the other
-- admins, and the only one no admin can remove.
--
-- Additive and reversible: existing admins already hold explicit goal_access
-- rows (the goals seed wrote them), so nobody loses access when the implicit
-- admin shortcut below is removed.

-- The owner. Kept as a function so there is one definition, matching the
-- existing raghu_email() used by the Management-Target-Date guard.
create or replace function public.is_owner()
returns boolean language sql stable as $$
  select lower(coalesce(auth.email(), '')) = lower(public.raghu_email());
$$;

-- Goals access: implicit for the OWNER only. Every other account — admins
-- included — needs an explicit grant, which is what makes the owner able to
-- govern admin access at all.
create or replace function public.has_goals_access()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_owner(), false)
      or exists (select 1 from public.goal_access g where g.person_id = auth.uid());
$$;

create or replace function public.can_edit_goals()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_owner(), false)
      or exists (select 1 from public.goal_access g where g.person_id = auth.uid() and g.can_edit);
$$;

-- Safety net: the owner's own row cannot be disabled, demoted or deleted, by
-- anyone, through any path. The API enforces this too; this is the backstop
-- that survives a mistake in application code.
create or replace function public.protect_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if lower(coalesce(old.email, '')) = lower(public.raghu_email()) then
      raise exception 'The owner account cannot be removed' using errcode = '42501';
    end if;
    return old;
  end if;

  if lower(coalesce(old.email, '')) = lower(public.raghu_email()) then
    if new.role is distinct from old.role then
      raise exception 'The owner account cannot change role' using errcode = '42501';
    end if;
    if coalesce(new.disabled, false) is distinct from coalesce(old.disabled, false)
       and coalesce(new.disabled, false) then
      raise exception 'The owner account cannot be disabled' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_owner on public.profiles;
create trigger profiles_protect_owner
  before update or delete on public.profiles
  for each row execute function public.protect_owner();

-- goal_access rows are managed by the owner. Admins may still read the table.
drop policy if exists goal_access_write on public.goal_access;
create policy goal_access_write on public.goal_access
  for all using (public.is_owner()) with check (public.is_owner());

