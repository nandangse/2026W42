-- 0053_hrms_idp.sql
--
-- IDP DISCUSSION - INDIVIDUAL, at genie.nandan.co.in/idp (Dr Raghu, 23 Aug 2026).
--
-- NOT AN HRMS PAGE. HRMS is for three people; this is for everybody who works
-- here. Somebody signs into Genie as they always do, goes to /idp, and fills
-- in their own. They see their own and nothing else -- no list, no colleague,
-- no way to reach another person's. HR and the owner read them through HRIS.
--
-- ONE SITTING. "Once you start it has to be completed else you will begin all
-- over again." So a session records when it was STARTED and when it was
-- SUBMITTED, and an abandoned one is simply never submitted -- the next visit
-- starts a fresh one. Answers are saved as they are typed so a closed laptop
-- does not lose ninety minutes of thinking, but an unsubmitted session is not
-- an IDP and is never read as one.
--
-- CONSENT IS RECORDED, not assumed. The person is told exactly who can read
-- it -- Management, HR and their HoD -- and the tick is stored with the words
-- they agreed to and the moment they agreed. A consent whose wording nobody
-- kept is not evidence of anything.
--
-- ASCII only, additive, safe to re-run.

create table if not exists public.hrms_idp (
  id            uuid primary key default gen_random_uuid(),
  /** hrms_employees.id where the person is on the master; null if not matched. */
  employee_id   text,
  /** Always present -- the Genie login that filled it in. */
  person_email  text not null,
  person_name   text,
  /** Which round this belongs to, e.g. '2026-27'. */
  cycle         text not null default '2026-27',

  consent_at    timestamptz,
  consent_text  text,
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz,

  /** The written answers, keyed by question id. */
  answers       jsonb not null default '{}'::jsonb,
  /** The self-ratings, keyed by dimension. */
  ratings       jsonb not null default '{}'::jsonb,

  /** What the role expects, copied in at the moment of filling. */
  role_at_time  text,
  role_summary  text,

  updated_at    timestamptz not null default now()
);

comment on table public.hrms_idp is
  'IDP Discussion - Individual. One row per person per attempt. A row with no '
  'submitted_at was abandoned and is not an IDP. Written by the person '
  'themselves at /idp; read by HR and the owner through HRIS.';
comment on column public.hrms_idp.consent_text is
  'The exact words consented to, kept with the tick. A consent whose wording '
  'nobody kept is not evidence of anything.';
comment on column public.hrms_idp.role_summary is
  'The Management Expectation Note summary for their role, as it stood when '
  'they filled this in. Copied rather than joined: the role may be rewritten '
  'later, and what they were answering against must not change afterwards.';

create index if not exists hrms_idp_person_idx on public.hrms_idp (lower(person_email), cycle);
create index if not exists hrms_idp_emp_idx    on public.hrms_idp (employee_id);
create index if not exists hrms_idp_open_idx   on public.hrms_idp (person_email) where submitted_at is null;

alter table public.hrms_idp enable row level security;
revoke all on public.hrms_idp from anon, authenticated;
-- Reached only through /api/idp, which resolves the caller first and can
-- therefore never hand somebody another person's answers.
