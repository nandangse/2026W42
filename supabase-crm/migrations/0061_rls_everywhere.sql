-- 0061 — SHUT THE FRONT DOOR ON THE CRM
-- (Supabase security notice, 06 Sep 2026: "Table publicly accessible — anyone
-- with your project URL can read, edit, and delete all data in this table
-- because Row-Level Security is not enabled." Project: CRM, ixzwpgexrumdirtqzoxz.)
--
-- WHY THIS IS SAFE TO DO WHOLESALE. The CRM never speaks to Supabase from a
-- browser. `crmDb()` builds one client, server-side, with CRM_SUPABASE_SERVICE_KEY,
-- and there is no createBrowserClient anywhere in src/crm or src/components/crm.
-- The service role bypasses RLS, so shutting every table to anon and
-- authenticated takes nothing away from the application — it only takes it
-- away from a stranger holding the project URL, which is public by design.
--
-- THE ANON KEY IS NOT A SECRET. It ships in every page that uses it. The only
-- thing standing between it and 57,000 companies, 139,000 people and every
-- quotation this house has written is RLS — and on some of these tables there
-- was nothing standing there at all.
--
-- REVOKE FROM public, NOT MERELY anon. A grant to PUBLIC is inherited by anon
-- and authenticated both; revoking the two roles while PUBLIC still holds the
-- privilege leaves the door open and the ledger saying it is shut. That was
-- the lesson of hrms_idp_login on the Genie side, 7 Sep, and it is why this
-- names all three.
--
-- Safe to run twice. It ends by PROVING itself.

do $$
declare r record;
begin
  for r in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', r.tablename);
    execute format('revoke all on public.%I from public, anon, authenticated', r.tablename);
  end loop;

  -- views inherit nothing; they are granted separately and must be revoked too
  for r in
    select viewname as name from pg_views where schemaname = 'public'
    union all
    select matviewname from pg_matviews where schemaname = 'public'
  loop
    execute format('revoke all on public.%I from public, anon, authenticated', r.name);
  end loop;
end $$;

-- Sequences and functions travel with the tables they serve.
revoke all on all sequences in schema public from public, anon, authenticated;

-- And nothing NEW should arrive open, either.
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;

create table if not exists public.genie_migration (name text primary key, at timestamptz default now());
insert into public.genie_migration (name) values ('0061_rls_everywhere') on conflict (name) do nothing;

notify pgrst, 'reload schema';

-- ── PROVE IT ──────────────────────────────────────────────────────────────
-- Both counts must come back 0. A table listed here is still reachable with
-- the anon key that ships in the browser.
select 'tables still without RLS' as check, count(*) as must_be_zero
  from pg_tables t
  join pg_class c on c.relname = t.tablename
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
 where t.schemaname = 'public' and c.relrowsecurity = false
union all
select 'objects anon can still touch', count(*)
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC');
