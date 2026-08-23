-- 0050_hrms_roles.sql
--
-- ROLES, JD, KRA, KPI — the register a role is defined in (Dr Raghu, 23 Aug 2026).
--
-- The employee master's Role field points here. That is the whole point of the
-- distinction drawn in 0049: DESIGNATION is what goes on a visiting card and
-- may be anything; ROLE is accountable, and a role is only accountable if
-- somebody has written down what it must deliver and how that is measured.
-- This table is where that is written down.
--
-- STAGE: Draft or Final. A new role is a DRAFT -- it exists, people can be put
-- into it, and it is visibly not yet agreed. Only Dr Raghu makes one Final.
-- The point is not ceremony: a job description that nobody has approved is a
-- suggestion, and an appraisal run against a suggestion is not defensible.
--
-- THE MANAGEMENT EXPECTATION NOTE is a VOICE note, because it is the part
-- nobody writes. What a role is really for, said out loud in thirty seconds,
-- carries more than a paragraph typed reluctantly. It is kept three ways: the
-- audio, because tone carries what words lose; the transcript, because nobody
-- scrubs through audio to find a sentence; and a summary, because the
-- transcript of speech is longer than the thought in it.
--
-- The audio lives in the voice-notes Storage bucket under roles/, exactly as
-- the shop-floor notes do (0040). The table holds a path, never bytes.
--
-- ASCII only, additive, safe to re-run.

create table if not exists public.hrms_role (
  id            uuid primary key default gen_random_uuid(),
  role          text not null unique,
  department    text,
  grade         text,
  reports_to    text,
  job_description text,
  deliverable   text,
  metric        text,
  stage         text not null default 'Draft',
  -- the management expectation note
  voice_path    text,
  voice_seconds integer,
  transcript    text,
  summary       text,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_by    text,
  updated_at    timestamptz not null default now(),
  approved_by   text,
  approved_at   timestamptz
);

alter table public.hrms_role drop constraint if exists hrms_role_stage_check;
alter table public.hrms_role add constraint hrms_role_stage_check
  check (stage in ('Draft', 'Final'));

comment on table public.hrms_role is
  'HRIS: the role register -- JD, deliverable, measurement metric, and the '
  'management expectation note. hrms_employees.role (via the edit overlay) '
  'points at hrms_role.role. Draft until the owner marks it Final.';

comment on column public.hrms_role.voice_path is
  'Path inside the voice-notes bucket, under roles/. The audio is never stored in this table.';

create index if not exists hrms_role_dept_idx  on public.hrms_role (department);
create index if not exists hrms_role_stage_idx on public.hrms_role (stage);

alter table public.hrms_role enable row level security;
revoke all on public.hrms_role from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed from what is already known
-- ---------------------------------------------------------------------------
-- 0049 built a `role` master out of the designations people actually hold.
-- Those become the first draft roles, each carrying the department its holders
-- sit in, so the register opens with the real shape of the company rather than
-- an empty page. Every one is a DRAFT -- none of them has been agreed yet, and
-- saying so is the honest state.
insert into public.hrms_role (role, department, stage, created_by)
select
  m.value,
  (select e.department
     from public.hrms_employees e
    where btrim(coalesce(e.designation, '')) = m.value
      and coalesce(e.department, '') <> ''
    group by e.department
    order by count(*) desc
    limit 1),
  'Draft',
  'migration 0050 (from the designations in use)'
from public.hrms_master m
where m.kind = 'role'
on conflict (role) do nothing;

-- The role master has served its purpose -- roles live here now, with their
-- JD and their metric, and two lists of role names would drift apart within a
-- week. Removed from Module Masters; the register replaces it.
delete from public.hrms_master where kind = 'role';
