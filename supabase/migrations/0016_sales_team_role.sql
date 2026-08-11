-- 0016_sales_team_role.sql
-- The "Sales team" role. Sales Genie access is role-based now: the owner,
-- admins and sales-team members get in — the per-person sales_access grant
-- (0013) stays honoured as a legacy fallback but is no longer managed in the
-- admin UI. Also: deleting a My Sales Plan to-do becomes admin-only.
-- Additive and safe to re-run.

-- 1. allow the new role value
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'planner', 'project_owner', 'user', 'sales', 'viewer', 'uploader'));

-- 2. sales-team members read the boards and work tasks like users do
create or replace function public.is_reader()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.jwt_role() in ('admin','planner','project_owner','user','sales','viewer'), false);
$$;

create or replace function public.is_tasker()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.jwt_role() in ('admin','planner','project_owner','user','sales'), false);
$$;

-- 3. Sales Genie access = owner, admin, sales team, or a legacy explicit grant
create or replace function public.has_sales_plan_access()
returns boolean language sql stable security definer set search_path = public as $$
  select (
    coalesce(public.is_owner(), false)
    or coalesce(public.jwt_role() in ('admin','sales'), false)
    or exists (select 1 from public.sales_access s where s.person_id = auth.uid())
  )
  and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.disabled);
$$;

-- 4. deleting a to-do in My Sales Plan is admin-only (creating/editing stays open)
drop policy if exists sp_member_delete on public.sp_todos;
create policy sp_member_delete on public.sp_todos
  for delete to authenticated
  using (public.has_sales_plan_access() and public.is_admin());
