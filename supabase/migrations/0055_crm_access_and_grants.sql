-- 0055_crm_access_and_grants.sql
--
-- 1. THE CRM BECOMES A GRANT RATHER THAN ONE HARD-CODED ADDRESS.
--
--    /crm has been open to raghu@nandan.co.in alone, checked in code. The
--    grant now lives in a table, so somebody can be added from Admin without
--    a deploy -- the same arrangement HRMS has had since 0047, and for the
--    same reason: who may see something is an operating decision, not a
--    release.
--
--    IN GENIE'S DATABASE, NOT THE CRM'S. The CRM keeps its own database and
--    cannot read this one -- but the admin page that grants it lives here,
--    the login it grants lives here, and a grant list the granting screen
--    cannot read would be a strange thing to build.
--
-- 2. THREE PEOPLE INTO HRMS, on Dr Raghu's instruction (23 Aug 2026):
--    vinaym@ (Vinay Mande, HR Manager), tushar@ (already granted at 0047) and
--    aridnani125@gmail.com. The last has no Genie login yet, which is exactly
--    why this table is keyed by EMAIL -- the grant waits for the account.
--
-- ASCII only, additive, safe to re-run.

create table if not exists public.crm_access (
  email      text primary key,
  granted_by text,
  granted_at timestamptz not null default now()
);

comment on table public.crm_access is
  'Who may open /crm. Email-keyed so a grant can precede the account, as with '
  'hrms_access. The owner is admitted implicitly and is not stored here.';

alter table public.crm_access enable row level security;
revoke all on public.crm_access from anon, authenticated;
-- no policies: the check runs server-side with the service key

insert into public.crm_access (email, granted_by)
values ('raghu@nandan.co.in', 'migration 0055')
on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- HRMS grants
-- ---------------------------------------------------------------------------
insert into public.hrms_access (email, granted_by)
values
  ('vinaym@nandan.co.in',    'migration 0055 — Vinay Mande, HR Manager'),
  ('tushar@nandan.co.in',    'migration 0055'),
  ('aridnani125@gmail.com',  'migration 0055 — no Genie login yet; the grant waits for the account')
on conflict (email) do nothing;
