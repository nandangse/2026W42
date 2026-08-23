-- 0064_hrms_loan.sql
--
-- LOAN REQUESTS (Dr Raghu, 23 Aug 2026): "build this where its related to
-- salary and loan approvals". RJ Approval - Commercial is the desk where
-- anything with money attached gets the owner's word, and there are two such
-- things: what a person will be PAID (the appraisal, 0061-0063) and what the
-- company LENDS them.
--
-- One row per request. HR raises it on the person's behalf -- or the future
-- Loan Application module writes the same row -- and it stands as REQUESTED
-- until the owner approves or declines it. The repayment plan is kept
-- alongside the amount because "approved" without "over how many months" is
-- not an approval anybody can act on.
--
-- ASCII only, additive, safe to re-run.

create table if not exists public.hrms_loan (
  id            uuid primary key default gen_random_uuid(),
  employee_id   text not null,
  amount        numeric not null,
  /** Salary Advance, Personal Loan, Medical, Festival, Other. */
  kind          text not null default 'Loan',
  reason        text,
  /** How it comes back: months of deduction, and from when. */
  months        integer,
  from_month    text,
  status        text not null default 'Requested',
  requested_by  text,
  requested_at  timestamptz not null default now(),
  decided_by    text,
  decided_at    timestamptz,
  decision_note text,
  updated_at    timestamptz not null default now()
);

create index if not exists hrms_loan_status_idx on public.hrms_loan (status, requested_at desc);
create index if not exists hrms_loan_person_idx on public.hrms_loan (employee_id);

comment on table public.hrms_loan is
  'A loan or salary advance asked for by (or on behalf of) one employee. '
  'Requested -> Approved/Declined by the owner in RJ Approval - Commercial.';

alter table public.hrms_loan enable row level security;
revoke all on public.hrms_loan from anon, authenticated;
