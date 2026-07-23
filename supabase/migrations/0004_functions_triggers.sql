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
