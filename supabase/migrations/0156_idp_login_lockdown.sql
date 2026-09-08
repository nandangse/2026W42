-- 0156 — SHUT hrms_idp_login TO THE PUBLIC KEY.  RUN THIS IN THE **GENIE**
-- PROJECT (the one whose URL is in NEXT_PUBLIC_SUPABASE_URL — not CRM, and
-- not the new empty HRMS project).
--
-- Found 8 Sep 2026 while testing what the anon key can reach. hrms_idp_login
-- was readable with the PUBLIC anon key — the one that ships inside the
-- browser JavaScript of genie.nandan.co.in. All 195 rows, and the columns
-- include pw_temp: the PLAINTEXT temporary password HR issued. Anyone who
-- opened the site, read the page source and took that key could list every
-- employee's personal e-mail and password, sign in at /idp as any of them,
-- and read that man's salary slip, IDP and HRIS record.
--
-- The first draft of this file revoked from anon and authenticated only.
-- That is not enough: a grant made to PUBLIC is not undone by revoking from
-- anon, because anon inherits it. PUBLIC is revoked here too.
--
-- Nothing in Genie breaks: /api/idp/login, /api/hrms/idp-passwords and the
-- mass-mail merge all reach this table with the SERVICE key, which bypasses
-- RLS and keeps its own grants.

alter table public.hrms_idp_login enable row level security;
alter table public.hrms_idp_login force  row level security;
revoke all on public.hrms_idp_login from public, anon, authenticated;

comment on table public.hrms_idp_login is
  'IDP sign-in for people with no Genie login. SERVICE-ROLE ONLY — it holds pw_hash, pw_salt and the plaintext pw_temp. Never grant anon, authenticated or PUBLIC on this table.';

-- ── the same rule for every other HRMS table, so this cannot recur ──
do $$
declare t text;
begin
  for t in
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'hrms\_%'
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ── PROVE IT. This must come back with rls_on = true and no anon grant. ──
select c.relname            as table_name,
       c.relrowsecurity     as rls_on,
       has_table_privilege('anon',   'public.' || c.relname, 'SELECT') as anon_can_read,
       has_table_privilege('public', 'public.' || c.relname, 'SELECT') as public_can_read
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'hrms_idp_login';
