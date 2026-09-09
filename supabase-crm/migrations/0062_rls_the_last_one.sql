-- 0062 — the one table 0061 could not reach, and a check that NAMES it
--
-- 0061 came back "tables still without RLS: 1". Mine, and an ordinary blunder:
-- the DO block enabled RLS on every table that existed WHEN IT RAN, and then
-- three lines later the migration created `genie_migration` — after the loop
-- had already passed. The ledger table that records the migration was the one
-- table the migration missed.
--
-- IT ALSO COUNTED WHEN IT SHOULD HAVE NAMED. "1" sent us both hunting; the
-- name would have ended it in a second. A check that reports a number tells
-- you that you have a problem. A check that reports a name tells you what it
-- is. This one names them.
--
-- Safe to run twice.

do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', r.tablename);
    execute format('revoke all on public.%I from public, anon, authenticated', r.tablename);
  end loop;
end $$;

insert into public.genie_migration (name) values ('0062_rls_the_last_one') on conflict (name) do nothing;

notify pgrst, 'reload schema';

-- ── PROVE IT, BY NAME ─────────────────────────────────────────────────────
-- Nothing should come back at all. Any row here is a table still reachable
-- with the anon key that ships in the browser, and it is named so you can see
-- which.
select c.relname as table_still_open, 'RLS not enabled' as why
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
union all
select table_name, 'granted to ' || grantee
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC')
 order by 1;
