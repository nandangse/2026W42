-- 0111_ims_door.sql
--
-- IMS — the Integrated Management System, Genie's SEVENTH door (Dr Raghu,
-- 2 Sep 2026: "IMS separate fork. Build." then, on seeing it: "no need to
-- create supabase. Put it in the genie.").
--
-- IN GENIE'S OWN DATABASE, like Seva, HRMS, Kuber and Vishwakarma. The CRM's
-- separate project was the exception, not the pattern — and a seventh module
-- that needed its own project, its own keys and its own migration folder
-- would be a seventh thing to keep in step for no gain. One database, one
-- backup, one set of credentials.
--
-- THE DOOR IS ALSO THE ROLE. One row per person: whether they may open /ims
-- at all, and what they may do once inside. Two tables for one question is
-- how they end up disagreeing.
--
--   ims_admin  — the Management Representative. Everything.
--   dept_head  — approves their OWN department's documents, writes registers.
--   auditor    — reads everything including drafts (they must); plans audits.
--   member     — reads APPROVED documents only; records; works their tasks.
--
-- The owner is implicitly ims_admin and needs no row, as with every module.
-- The Admin page's tick creates the row as a `member` — the least somebody
-- could be — and the MR promotes from inside IMS → Settings. A door grant is
-- not a role.
--
-- Additive and safe to re-run.

create table if not exists public.ims_access (
  email      text primary key,
  role       text not null default 'member'
             check (role in ('ims_admin', 'dept_head', 'auditor', 'member')),
  department text,
  granted_by text,
  created_at timestamptz not null default now()
);

-- Re-runnable: the two columns arrive even where an earlier 0111 ran first.
alter table public.ims_access add column if not exists role       text not null default 'member';
alter table public.ims_access add column if not exists department text;
do $$ begin
  alter table public.ims_access add constraint ims_access_role_chk
    check (role in ('ims_admin', 'dept_head', 'auditor', 'member'));
exception when duplicate_object then null; end $$;

-- RLS on, no policies — the door is read by the route handlers with the
-- service key, never by a browser.
alter table public.ims_access enable row level security;

-- ---------- the ask, filed where every ask lives ----------
insert into public.feature_request (title, body, want, status, note, by)
select
  'IMS — the Integrated Management System',
  '<p>IMS separate fork. Build. (Dr Raghu, 2 Sep 2026)</p>'
  '<p>Then, on seeing it: "no need to create supabase. Put it in the genie." '
  'So it lives in Genie''s own database, like every module but the CRM.</p>'
  '<p>ISO 9001, 14001, 45001, 27001, AWS D1.1 and EN 1090-2 EXC3, plus the '
  'non-ISO schemes. Phase 1: certificates vault with expiry alerts, the '
  'controlled-document engine with revision control and database-issued '
  'numbering, the dynamic register engine with five seeded registers, the '
  'certification journey, shared task and calendar engines, the standards '
  'library on a private bucket, and roles.</p>',
  'must', 'done',
  'Shipped as Genie 4.3.0.0 — the seventh door.',
  'raghu@nandan.co.in'
where not exists (
  select 1 from public.feature_request where title = 'IMS — the Integrated Management System'
);
