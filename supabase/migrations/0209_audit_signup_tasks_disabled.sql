-- 0209 — after the audit of 9 Oct 2026: a sign-up is nobody, a viewer cannot
-- delete, a disabled login is disabled in the database too (items S0, S4).
--
-- S0. handle_new_user() took the role from the sign-up’s own metadata, which
-- the browser controls, and fell back to “planner”. With sign-ups open in the
-- dashboard, anyone could make themselves an admin. The trigger now writes
-- viewer + disabled and ignores the metadata entirely. Admin → Users still
-- works: that route upserts role and disabled=false into profiles itself
-- after creating the auth user (src/app/api/admin/users/route.ts), so an
-- account somebody made on purpose is not touched by this.
--   The dashboard switch — Authentication → “Allow new users to sign up” OFF
--   — is the real gate and is Dr Raghu’s to flip. This makes a sign-up
--   harmless even while it is on.
--
-- S4. manual_tasks and task_comments had one policy FOR ALL USING is_reader()
-- WITH CHECK is_tasker(). Postgres judges DELETE by USING alone, so a viewer
-- holding the browser’s JWT could delete tasks and comments straight through
-- PostgREST. Four policies now, one per verb. And jwt_role() — the helper
-- behind every is_*() — answered for a disabled profile exactly as for a
-- live one, so a disabled person’s existing token kept working against the
-- database. It answers null for them now, which every is_*() reads as false.
--
-- Safe to run twice.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, disabled)
  values (new.id, coalesce(new.email, ''), 'viewer', true)
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.jwt_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles
   where id = auth.uid() and not coalesce(disabled, false);
$$;

drop policy if exists manual_tasks_rw on public.manual_tasks;
drop policy if exists manual_tasks_select on public.manual_tasks;
drop policy if exists manual_tasks_insert on public.manual_tasks;
drop policy if exists manual_tasks_update on public.manual_tasks;
drop policy if exists manual_tasks_delete on public.manual_tasks;
create policy manual_tasks_select on public.manual_tasks for select using (public.is_reader());
create policy manual_tasks_insert on public.manual_tasks for insert with check (public.is_tasker());
create policy manual_tasks_update on public.manual_tasks for update using (public.is_tasker()) with check (public.is_tasker());
create policy manual_tasks_delete on public.manual_tasks for delete using (public.is_tasker());

drop policy if exists task_comments_rw on public.task_comments;
drop policy if exists task_comments_select on public.task_comments;
drop policy if exists task_comments_insert on public.task_comments;
drop policy if exists task_comments_update on public.task_comments;
drop policy if exists task_comments_delete on public.task_comments;
create policy task_comments_select on public.task_comments for select using (public.is_reader());
create policy task_comments_insert on public.task_comments for insert with check (public.is_tasker());
create policy task_comments_update on public.task_comments for update using (public.is_tasker()) with check (public.is_tasker());
create policy task_comments_delete on public.task_comments for delete using (public.is_tasker());

create table if not exists public.genie_migration (name text primary key, at timestamptz default now());
insert into public.genie_migration (name) values ('0209_audit_signup_tasks_disabled') on conflict (name) do nothing;

notify pgrst, 'reload schema';

-- PROVE IT: eight rows, one per verb per table; no row named “_rw”.
select tablename, policyname, cmd
  from pg_policies
 where tablename in ('manual_tasks', 'task_comments')
 order by 1, 2;
