-- 0211 — after the audit of 9 Oct 2026: no table in Genie’s database is
-- open to the browser’s key by accident (item S14).
--
-- Thirteen tables were created with no “enable row level security” and no
-- revoke: hrms_salary_history (0097), genie_backup (0169), hrms_mass_mail
-- (0151), consult_kb and consult_kb_upload (0104), audit_query (0172),
-- labour_rate (0072), job_manpower (0071), job_crew_person and job_day_note
-- (0171), plan_belief and plan_signoff (0103), seva_master (0107). Live they
-- answer 401 or zero rows — somebody locked them by hand in the dashboard —
-- but a database rebuilt from this folder would open them again, and the
-- next table somebody forgets will be open from its first day.
--
-- THIS IS NOT THE CRM’S 0061. The CRM never speaks to the database as the
-- signed-in user, so it could revoke everything from everybody. Genie does:
-- /api/board, /api/plan and their kin read and write as the user through
-- supabaseServer(), and the planning tables’ own policies (0005–0016) are
-- what let them. So this migration
--   1. enables RLS on every public table that lacks it — a table with RLS on
--      and no policy is closed to anon and authenticated, and the service
--      key is unaffected;
--   2. revokes anon, authenticated and PUBLIC only on tables that have NO
--      policy at all, so the ledger and the privileges say the same thing;
--   3. leaves every table that has policies exactly as it is.
--
-- Safe to run twice. It ends by naming anything still open.

do $$
declare r record;
begin
  for r in
    select c.relname as tablename
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
  loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;

  for r in
    select t.tablename
      from pg_tables t
     where t.schemaname = 'public'
       and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename)
  loop
    execute format('revoke all on public.%I from public, anon, authenticated', r.tablename);
  end loop;
end $$;

create table if not exists public.genie_migration (name text primary key, at timestamptz default now());
alter table public.genie_migration enable row level security;
revoke all on public.genie_migration from public, anon, authenticated;
insert into public.genie_migration (name) values ('0211_audit_rls_everywhere') on conflict (name) do nothing;

notify pgrst, 'reload schema';

-- PROVE IT, BY NAME. Nothing should come back. A row here is a table still
-- reachable with the key that ships in the browser, and it is named.
select c.relname as table_still_open, 'RLS not enabled' as why
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
union all
select g.table_name, 'no policy, yet granted to ' || g.grantee
  from information_schema.role_table_grants g
 where g.table_schema = 'public' and g.grantee in ('anon', 'authenticated', 'PUBLIC')
   and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = g.table_name)
 order by 1;
