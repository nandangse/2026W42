-- 0111_ims_door.sql
--
-- IMS — the Integrated Management System, Genie's SEVENTH door (Dr Raghu,
-- 2 Sep 2026: "IMS separate fork. Build.").
--
-- Only the DOOR lives in Genie's database. Everything the IMS holds —
-- standards, clauses, certificates, controlled documents, registers, the
-- certification journey, tasks and the calendar — lives in the IMS's OWN
-- Supabase project (supabase-ims/migrations/), exactly as the CRM's does.
-- The grant belongs here because the Admin screen that makes it is here, and
-- because the email it is keyed to is Genie's.
--
-- Additive and safe to re-run.

-- ---------- IMS's door ----------
-- The same email-keyed grant as every module: owner implicit, nobody else by
-- default, and a missing table reads as "nobody but the owner" — which is the
-- right way for a gate to fail.
create table if not exists ims_access (
  email      text primary key,
  granted_by text,
  created_at timestamptz not null default now()
);
alter table ims_access enable row level security;

-- ---------- the ask, filed where every ask lives ----------
insert into public.feature_request (title, body, want, status, note, by)
select
  'IMS — the Integrated Management System',
  '<p>IMS separate fork. Build. (Dr Raghu, 2 Sep 2026)</p>'
  '<p>ISO 9001, 14001, 45001, 27001, AWS D1.1 and EN 1090-2 EXC3, plus the '
  'non-ISO schemes. Phase 1: certificates vault with expiry alerts, the '
  'controlled-document engine with revision control and database-issued '
  'numbering, the dynamic register engine with five seeded registers, the '
  'certification journey, shared task and calendar engines, the standards '
  'library on a private bucket, and roles.</p>',
  'must', 'done',
  'Shipped as Genie 4.3.0.0 — the seventh door, and the second module with a database of its own.',
  'raghu@nandan.co.in'
where not exists (
  select 1 from public.feature_request where title = 'IMS — the Integrated Management System'
);
