-- 0133_hrms_payroll_run.sql
--
-- THE PAYROLL RUN AS A DOCUMENT (Dr Raghu, 4 Sep 2026): "On creating a new
-- payroll run a new document will open up ... Upload Documents (multiple)
-- ... saved in the drive folder HR-Payroll run-Month Year ... Press
-- Generate ... Salary register ... attendance muster ... send messages to
-- people ... kept in the communications tab ... Any replies given by them
-- to this link is to be also pulled and kept in this."
--
-- The run is still the hrms_salary_sheet row. It gains: where its Drive
-- folder is, the parsed muster and rates it was generated from, and when.
-- Its uploads get a table of their own. Communication learns a DIRECTION
-- (out / in), the run it belongs to, and the provider's message id so a
-- reply pulled twice is kept once.
--
-- ASCII only, additive, safe to re-run.

alter table public.hrms_salary_sheet add column if not exists drive_folder_id   text;
alter table public.hrms_salary_sheet add column if not exists drive_folder_link text;
alter table public.hrms_salary_sheet add column if not exists muster            jsonb;
alter table public.hrms_salary_sheet add column if not exists rates             jsonb;
alter table public.hrms_salary_sheet add column if not exists generated_at      timestamptz;
alter table public.hrms_salary_sheet add column if not exists generated_by      text;
alter table public.hrms_salary_sheet add column if not exists wa_batch_id       text;

create table if not exists public.hrms_payroll_file (
  id           uuid primary key default gen_random_uuid(),
  sheet_id     uuid not null references public.hrms_salary_sheet(id) on delete cascade,
  kind         text not null default 'other',
  name         text not null,
  mime         text,
  size         integer,
  drive_id     text,
  drive_link   text,
  parsed       jsonb,
  uploaded_by  text,
  uploaded_at  timestamptz not null default now()
);
create index if not exists hrms_payroll_file_sheet_idx on public.hrms_payroll_file (sheet_id, uploaded_at desc);
alter table public.hrms_payroll_file enable row level security;
revoke all on public.hrms_payroll_file from anon, authenticated;

alter table public.hrms_communication add column if not exists direction   text not null default 'out';
alter table public.hrms_communication add column if not exists run_id      uuid;
alter table public.hrms_communication add column if not exists external_id text;
create unique index if not exists hrms_communication_external_idx on public.hrms_communication (external_id) where external_id is not null;
create index if not exists hrms_communication_run_idx on public.hrms_communication (run_id, sent_at desc);

-- The attendance message, designed from the one HR was pasting by hand in
-- the muster sheet, with Genie's own query form in place of the Google Form.
-- Only the system-owned copy is touched; once somebody edits it, it is theirs.
update public.hrms_text_master set
  title = 'Attendance of the month (WhatsApp)',
  body =
    'Dear {{name}},' || chr(10) || chr(10) ||
    'Please find the record of your attendance for {{month}}.' || chr(10) || chr(10) ||
    'Emp. No. {{employee_id}} - {{category}}' || chr(10) ||
    'Present days - {{present_days}}' || chr(10) ||
    'Absent days - {{absent_days}}' || chr(10) ||
    'Week off - {{week_off}}' || chr(10) ||
    'MO & ST (monthly off & statutory holiday) - {{mo_st}}' || chr(10) ||
    'Payable days - {{paid_days}}' || chr(10) ||
    'Comp. off - {{compoff}}' || chr(10) ||
    'OT - {{ot}}' || chr(10) ||
    'Late marks - {{late_marks}}' || chr(10) ||
    'Salary advance - {{advance}}' || chr(10) ||
    'Leave encashment - {{leave_encash}}' || chr(10) ||
    'Loan deduction - {{loan_deduction}}' || chr(10) || chr(10) ||
    'If there is any correction in the attendance, OT or any other line, please reply here on WhatsApp right away, or raise it at https://genie.nandan.co.in/hrms/query' || chr(10) || chr(10) ||
    'Thank you!' || chr(10) || 'HR, Nandan GSE',
  note = 'SYSTEM TEMPLATE - the attendance message a payroll run sends. {{name}}, {{employee_id}} from the record; {{month}}, {{category}}, {{present_days}}, {{absent_days}}, {{week_off}}, {{mo_st}}, {{paid_days}}, {{compoff}}, {{ot}}, {{late_marks}}, {{advance}}, {{leave_encash}}, {{loan_deduction}} from the uploaded muster. Edit the words; keep the curly variables.',
  version = version + 1
where key = 'attendance_whatsapp' and updated_by = 'system';
