-- 0130_hrms_fnf.sql
--
-- FULL AND FINAL SETTLEMENT (Dr Raghu, 4 Sep 2026): "lets build the full and
-- final settlement in HRMS NOW. Page 1 will have the table. Then have add
-- new. What's needed is: Done On, Resignation Letter Date, Exit Date,
-- Calling for F&F Date, Loan closing balance, Pending Expenses, TDS of the
-- year, Advance paid and then to be paid. It should create 1) Resignation
-- 2) Resignation acceptance 3) Relieving letter 4) Checklist of closing
-- activities with remarks 5) Full and final calculations 6) Full and final
-- letter with payment details. Communication: check his personal mobile and
-- pull all communication with HR."
--
-- One row per settlement. The dates and the money HR types are columns;
-- the arithmetic is worked out on read (src/lib/fnf.ts) from the record's
-- pay heads and these inputs, with a per-line override where HR knows
-- better; the checklist is a JSON list with a remark and a tick per line;
-- the six documents are rendered from the row, and the text of the three
-- letters is kept here so a letter once issued does not change under the
-- person.
--
-- ASCII only, safe to re-run.

create table if not exists public.hrms_fnf (
  id               uuid primary key default gen_random_uuid(),
  fnf_no           text unique,
  employee_id      text not null,
  name             text not null default '',
  designation      text,
  department       text,
  emp_type         text,
  doj              date,

  -- the dates HR enters
  done_on          date,
  resignation_date date,
  exit_date        date,
  fnf_call_date    date,
  notice_days      integer not null default 30,
  reason           text,

  -- the money HR enters
  loan_closing     numeric not null default 0,
  pending_expenses numeric not null default 0,
  tds_year         numeric not null default 0,
  advance_paid     numeric not null default 0,
  advance_to_pay   numeric not null default 0,

  -- what the record said the day the settlement was opened (editable)
  last_gross       numeric not null default 0,
  basic_da         numeric not null default 0,
  paid_days        numeric,
  month_days       integer,
  leave_balance    numeric not null default 0,
  gratuity_years   numeric not null default 0,

  -- per-line overrides: {leave_encash, gratuity, bonus, notice_recovery, pf, pt}
  overrides        jsonb not null default '{}'::jsonb,
  other_earn       jsonb not null default '[]'::jsonb,
  other_ded        jsonb not null default '[]'::jsonb,

  checklist        jsonb not null default '[]'::jsonb,
  remarks          text,

  -- the letters, as issued
  resignation_text text,
  acceptance_text  text,
  relieving_text   text,

  status           text not null default 'Open',
  payment_mode     text,
  payment_ref      text,
  payment_date     date,
  paid_amount      numeric,

  created_by       text,
  created_at       timestamptz not null default now(),
  updated_by       text,
  updated_at       timestamptz not null default now()
);

create index if not exists hrms_fnf_employee_idx on public.hrms_fnf (employee_id);

comment on table public.hrms_fnf is
  'Full and final settlements -- one row per leaver: the dates, the money HR enters, the checklist, the letters as issued, and the payment.';

alter table public.hrms_fnf enable row level security;
revoke all on public.hrms_fnf from anon, authenticated;
