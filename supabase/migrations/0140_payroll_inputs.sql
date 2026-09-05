-- 0140_payroll_inputs.sql
--
-- THE PAYROLL RUN'S INPUTS, EACH A FORM (Dr Raghu, 5 Sep 2026): "ESSL
-- Attendance output by Vishwas; Salary Rates from Vinay in the Appraisals
-- itself; Leave Encashment, Loan, Advance etc from the Muster sheet, uploaded
-- as CSV; Advance by Suresh in PDF from Tally sent on 1st to Vinay; Loan by
-- Suresh in PDF from Tally; Lunch in the muster; Site allowance in muster.
-- Show each of these as a Form, Upload and Submit! this will make it auditable."
--
-- One row per input per run: who submitted it and when, with a note. The
-- files themselves stay in hrms_payroll_file, keyed by kind. ASCII, additive.

create table if not exists public.hrms_payroll_input (
  id           uuid primary key default gen_random_uuid(),
  sheet_id     uuid not null references public.hrms_salary_sheet(id) on delete cascade,
  key          text not null,               -- essl | rates | muster | advance | loan | lunch | site
  submitted_by text,
  submitted_at timestamptz,
  note         text not null default '',
  meta         jsonb,
  updated_at   timestamptz not null default now(),
  unique (sheet_id, key)
);
alter table public.hrms_payroll_input enable row level security;
revoke all on public.hrms_payroll_input from anon, authenticated;
