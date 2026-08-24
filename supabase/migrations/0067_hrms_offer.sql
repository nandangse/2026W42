-- 0067_hrms_offer.sql
--
-- OFFER LETTERS (Dr Raghu, 24 Aug 2026). The letter that starts an
-- employment, built over six pages: who they are, what the role is, what we
-- pay, the terms, our own notes, and the mail that goes out.
--
-- WHY THE OFFER KEEPS ITS OWN COPY OF EVERYTHING. The role definition, the
-- competencies, the salary structure and the terms are all snapshotted onto
-- the offer row rather than referenced. An offer is a document that was SENT
-- to somebody on a date; if the Roles register is edited next month, the
-- letter in that person's inbox does not change, and neither should our
-- record of it. References would quietly rewrite history.
--
-- The candidate is not an employee yet, so nothing here touches
-- hrms_employees. On joining, `employee_id` is filled in and the two are
-- linked -- that is the only join between the pipeline and the master.
--
-- ASCII only, additive, safe to re-run.

create table if not exists public.hrms_offer (
  id             uuid primary key default gen_random_uuid(),
  offer_no       text unique,

  -- ---- page 1: the person ----
  name           text not null default '',
  email          text,
  mobile         text,
  address        text,
  resume_name    text,
  resume_path    text,
  /** What was read out of the resume, kept so a wrong prefill can be traced. */
  resume_read    jsonb,
  discussion_notes text,
  offer_date     date,
  designation    text,
  /** One or more roles from the register, newline-separated like the master. */
  roles          text,
  reporting_to   text,
  joining_date   date,
  probation_months integer default 3,

  -- ---- page 2: the role, as this offer states it ----
  role_doc       jsonb,
  competencies   jsonb,

  -- ---- page 3: the money ----
  type           text,
  agreed_gross   numeric,
  /** The full structure as computed when the offer was made. */
  salary         jsonb,

  -- ---- page 4 and 5 ----
  terms          text,
  internal_notes text,

  -- ---- page 6: the mail ----
  send_to        text,
  send_from      text default 'hr@nandan.co.in',
  send_cc        text default 'raghu@nandan.co.in',
  covering_letter text,
  sent_at        timestamptz,
  sent_by        text,

  -- ---- where it got to ----
  /** Draft -> Sent -> Accepted -> Joined. Or Expired / Declined. */
  status         text not null default 'Draft',
  valid_days     integer not null default 3,
  accepted_at    timestamptz,
  declined_at    timestamptz,
  joined_at      timestamptz,
  /** Filled when the offer becomes a person on the master. */
  employee_id    text,

  created_by     text,
  created_at     timestamptz not null default now(),
  updated_by     text,
  updated_at     timestamptz not null default now()
);

create index if not exists hrms_offer_status_idx on public.hrms_offer (status, offer_date desc);
create index if not exists hrms_offer_name_idx   on public.hrms_offer (lower(name));

comment on table public.hrms_offer is
  'One offer of employment. Carries its own copy of the role, salary and terms '
  'as they stood when it was sent, because the letter in the candidate''s inbox '
  'does not change when the registers do.';

alter table public.hrms_offer enable row level security;
revoke all on public.hrms_offer from anon, authenticated;

-- The split behind the agreed gross (Dr Raghu, 24 Aug 2026): the gross and
-- the basic percentage are the two things typed; the rest adjusts, and any
-- line can still be corrected by hand. Kept so a letter reprints identically.
alter table public.hrms_offer
  add column if not exists components jsonb,
  add column if not exists basic_pct  numeric;
