-- 0058_employee_competency.sql
--
-- COMPETENCIES ON THE PERSON, not only on the role (Dr Raghu, 23 Aug 2026).
--
-- The role says what the job needs. This says what THIS PERSON is expected to
-- have — which is not always the same thing, and the difference is usually
-- the interesting part:
--
--   · somebody carries an ability the role does not require. A fitter who
--     drives the forklift, a storekeeper who handles cash. It is real, it is
--     used, and it should be on their record rather than in somebody's head.
--   · somebody is being grown into an ability their role does not need yet,
--     because they are being prepared for the next one.
--   · a role's requirement does not fit one holder, and HR needs to say so
--     for that person without rewriting the role for everybody in it.
--
-- SO A PERSON'S LIST = THEIR ROLES' REQUIREMENTS + WHAT IS ADDED HERE, and
-- what is added here can also OVERRIDE the level the role asks for. The role
-- list is not copied onto the person: roles change, and a copy would go
-- stale silently.
--
-- `source` says where a line came from, so removing something added by hand
-- never removes something the role requires -- and the screen can show the
-- difference rather than pretending they are the same.
--
-- ASCII only, additive, safe to re-run.

create table if not exists public.hrms_employee_competency (
  employee_id text not null,
  competency  text not null references public.hrms_competency (name) on update cascade on delete cascade,
  /** What this person is expected at, 1 to 5. Overrides the role's level. */
  level       integer not null default 3,
  /** Why it is on their record. */
  reason      text,
  added_by    text,
  added_at    timestamptz not null default now(),
  primary key (employee_id, competency)
);

alter table public.hrms_employee_competency drop constraint if exists hrms_employee_competency_level_check;
alter table public.hrms_employee_competency add constraint hrms_employee_competency_level_check
  check (level between 1 and 5);

comment on table public.hrms_employee_competency is
  'Competencies added to a PERSON on top of what their roles require, or '
  'overriding the level a role asks of them. A person''s full list is their '
  'roles'' requirements plus these -- the role list is never copied onto the '
  'person, because roles change and a copy would go stale silently.';

create index if not exists hrms_employee_competency_comp_idx
  on public.hrms_employee_competency (competency);

alter table public.hrms_employee_competency enable row level security;
revoke all on public.hrms_employee_competency from anon, authenticated;
