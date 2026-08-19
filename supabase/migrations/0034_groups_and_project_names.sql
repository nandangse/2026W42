-- 0034_groups_and_project_names.sql
--
-- Two unrelated things, both small, shipped together because both are one
-- column each and neither is worth a migration of its own.
--
-- 1. THE THREE GROUPS -- LC, Stratcom, Management.
--
--    Decided by Dr Raghu: only raghu@nandan.co.in may tick them, and EVERY
--    STRATCOM MEMBER IS AN LC MEMBER. That second rule is enforced here as a
--    trigger rather than left to the UI, because a rule that lives only in a
--    React form is a rule that lapses the first time somebody writes through
--    the API. Ticking Stratcom ticks LC; un-ticking LC un-ticks Stratcom.
--
--    These are NOT roles. `role` says what you may DO (write a plan, upload,
--    administer); these say which room you are in. Delivered Jobs is gated on
--    LC, and the two forward-looking cards on the Job Delivery Board are gated
--    on Stratcom. Mixing the two into `role` would have meant inventing an
--    "LC planner" and an "LC admin" and every other combination.
--
-- 2. PROJECT NAME AND CUSTOMER.
--
--    The projects table has carried id, manager, stage, dates and the sales
--    order since 0002, but never the project's NAME or its customer -- the
--    upload parser simply never read those two columns. Adding them here so
--    the next Data Analysis / Open Projects upload can fill them.
--
--    Blank until an upload supplies them. Deliberately NOT backfilled from the
--    jobs on the project: a name guessed from a job description is a name
--    somebody will quote back at a customer.
--
-- Additive and safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. groups
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists lc         boolean not null default false;
alter table public.profiles add column if not exists stratcom   boolean not null default false;
alter table public.profiles add column if not exists management boolean not null default false;

comment on column public.profiles.lc         is 'Leadership Circle. Gates the Delivered Jobs workspace. Every Stratcom member is one.';
comment on column public.profiles.stratcom   is 'Strategy Committee. Gates the forward-looking cards on the Job Delivery Board. Implies lc.';
comment on column public.profiles.management is 'Management. Independent of the other two.';

-- Stratcom implies LC, in both directions, whatever wrote the row.
create or replace function public.profiles_group_rules()
returns trigger
language plpgsql
as $$
begin
  if new.stratcom then
    new.lc := true;          -- every Stratcom member is an LC member
  elsif not new.lc then
    new.stratcom := false;   -- ...so dropping LC drops Stratcom with it
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_group_rules_trg on public.profiles;
create trigger profiles_group_rules_trg
  before insert or update of lc, stratcom on public.profiles
  for each row execute function public.profiles_group_rules();

-- Make anything already ticked obey the rule (a no-op on a fresh install).
update public.profiles set lc = true where stratcom and not lc;

-- Only the owner may set them.
--
-- Postgres cannot restrict UPDATE to named columns in a policy, so this is a
-- trigger: existing writers pass through untouched unless one of the three
-- flags actually changed. An admin must still be able to change somebody's
-- role, department and reporting line, which is why the whole table is not
-- simply locked.
--
-- THE auth.uid() TEST IS LOAD-BEARING, not belt-and-braces. Every /api route
-- writes with the SERVICE KEY, where there is no JWT at all -- auth.email() is
-- null, so is_owner() is null, so a bare is_owner() check here would reject
-- every flag change ever made, the owner's own included, and the tick boxes
-- would be dead on arrival.
--
-- So: a write carrying a JWT is a browser writing directly and must be the
-- owner. A write with no JWT is the server, which has already established who
-- is asking -- /api/admin/users calls requireOwner() before it touches these
-- three columns. The rule is enforced once on each path, not half on each.
create or replace function public.profiles_groups_owner_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.lc, new.stratcom, new.management)
     is distinct from (old.lc, old.stratcom, old.management)
     and auth.uid() is not null
     and not coalesce(public.is_owner(), false) then
    raise exception 'Only the owner may change LC / Stratcom / Management';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_groups_owner_only_trg on public.profiles;
create trigger profiles_groups_owner_only_trg
  before update on public.profiles
  for each row execute function public.profiles_groups_owner_only();

-- ---------------------------------------------------------------------------
-- 2. project name + customer
-- ---------------------------------------------------------------------------

alter table public.projects add column if not exists name text;
alter table public.projects add column if not exists cust text;

comment on column public.projects.name is 'The project name as the ERP export carries it. Blank until an upload supplies it -- never guessed from a job.';
comment on column public.projects.cust is 'The customer as the ERP export carries it. Blank until an upload supplies it.';

-- apply_projects, extended to carry them.
--
-- BLANK-FILL, not overwrite. An export that has no name column sends '' for
-- every project, and a plain `set name = excluded.name` would wipe every name
-- already stored the first time somebody uploads the older export. Same rule
-- the job merge has always used: a value that was not supplied is not a value
-- of blank.
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

  insert into public.projects (id, mgr, committed, exp_end, so, stage, name, cust, job_numbers)
  select
    p ->> 'id',
    p ->> 'mgr',
    nullif(p ->> 'committed', '')::date,
    nullif(p ->> 'expEnd', '')::date,
    p ->> 'so',
    p ->> 'stage',
    nullif(p ->> 'name', ''),
    nullif(p ->> 'cust', ''),
    '{}'::text[]
  from jsonb_array_elements(p_projects) p
  on conflict (id) do update set
    mgr = excluded.mgr, committed = excluded.committed,
    exp_end = excluded.exp_end, so = excluded.so, stage = excluded.stage,
    name = coalesce(excluded.name, projects.name),
    cust = coalesce(excluded.cust, projects.cust);

  -- blank-fill only — never overwrite a non-null job value
  update public.jobs j set
    own = coalesce(nullif(j.own, ''), p.mgr),
    otd = coalesce(j.otd, p.committed),
    tdd = coalesce(j.tdd, p.exp_end)
  from public.projects p
  where j.proj = p.id;
end;
$$;
