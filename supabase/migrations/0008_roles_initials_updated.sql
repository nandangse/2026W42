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
-- 2. roles: admin | planner | project_owner | user | sales | viewer | uploader
-- ---------------------------------------------------------------------------
-- 'sales' arrived later, in 0016. It is listed HERE too so that re-running the
-- migrations end to end still works: without it, this line re-applies the old
-- narrower constraint to a database that by now holds sales accounts, and the
-- whole run dies on
--     check constraint "profiles_role_check" of relation "profiles" is violated
-- Re-runnability is the property that makes ALL_MIGRATIONS.sql usable at all,
-- so the list here tracks the widest it ever becomes. 0016 then re-adds the
-- identical constraint, which is a no-op.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'planner', 'project_owner', 'user', 'sales', 'viewer', 'uploader'));

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
