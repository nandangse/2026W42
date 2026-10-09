-- 0210 — after the audit of 9 Oct 2026: the Kuber books are behind Kuber’s
-- door in the database as well as in the API (item S5).
--
-- Every kuber_* table carried a policy “for select to authenticated using
-- (true)” (0075, 0076, 0079, 0087, 0091–0094, 0179). The API checks the
-- Kuber tick; the database did not — any signed-in Genie login holding the
-- browser’s JWT could read the whole ledger, every voucher and every line
-- straight through PostgREST.
--
-- WHY THIS TAKES NOTHING FROM THE APP. Every /api/kuber route, the CFO and
-- Board reports and the Tally upload read and write through adminClient()
-- — the service key, which bypasses RLS. No browser component queries a
-- kuber_* table directly (0076 says so; grep confirms it today). So the
-- policies are dropped and the roles revoked, as 0048, 0136 and 0157 do for
-- their tables. From PUBLIC too, not only anon and authenticated — the
-- hrms_idp_login lesson of 7 Sep (0156).
--
-- Safe to run twice.

do $$
declare r record;
begin
  for r in
    select tablename from pg_tables
     where schemaname = 'public' and tablename like 'kuber\_%' escape '\'
  loop
    execute format('alter table public.%I enable row level security', r.tablename);
    execute format('drop policy if exists %I on public.%I', r.tablename || '_read', r.tablename);
    execute format('revoke all on public.%I from public, anon, authenticated', r.tablename);
  end loop;
end $$;

create table if not exists public.genie_migration (name text primary key, at timestamptz default now());
insert into public.genie_migration (name) values ('0210_audit_kuber_closed') on conflict (name) do nothing;

notify pgrst, 'reload schema';

-- PROVE IT: nothing should come back.
select tablename as kuber_table_still_open, policyname
  from pg_policies
 where tablename like 'kuber\_%' escape '\'
union all
select table_name, 'granted to ' || grantee
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name like 'kuber\_%' escape '\'
   and grantee in ('anon', 'authenticated', 'PUBLIC')
 order by 1;
