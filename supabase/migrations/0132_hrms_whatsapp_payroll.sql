-- 0132_hrms_whatsapp_payroll.sql
--
-- Two asks of 4 Sep 2026 (Dr Raghu):
--
--   1. "Add the queue called WhatsApp and let it send from there ... send
--      one message to everybody with a template. Make a system message with
--      the way that we can do the template. I would like to send the
--      attendance of this month to them."
--      -> a SYSTEM template, kind 'whatsapp', seeded so the shape of a
--         template with variables is on the screen before he writes his own.
--         Its body is a placeholder he will replace; the variables are the
--         point. Seeded once; never overwritten.
--
--   2. "make a table of the payroll: Month, Year, Date run, run by,
--      approved by. Approval is by Raghu."
--      -> the salary sheet row IS the run (uploaded_by / uploaded_at); it
--         gains approved_by / approved_at, the owner's.
--
-- ASCII only, additive, safe to re-run.

alter table public.hrms_salary_sheet add column if not exists approved_by text;
alter table public.hrms_salary_sheet add column if not exists approved_at timestamptz;
alter table public.hrms_salary_sheet add column if not exists run_note    text;

comment on column public.hrms_salary_sheet.approved_by is
  'The owner''s approval of the month''s run. Set from Run Monthly Payroll; only Raghu.';

insert into public.hrms_text_master (key, title, body, note, kind, subject, version, updated_by)
values (
  'attendance_whatsapp',
  'Attendance of the month (WhatsApp)',
  'Dear {{first_name}},' || chr(10) || chr(10) ||
  'Your attendance for {{month}}: {{attendance_days}} days present, {{paid_days}} days paid.' || chr(10) || chr(10) ||
  'If this does not match your own count, reply here or raise it at genie.nandan.co.in/hrms/query within 3 days.' || chr(10) || chr(10) ||
  '- Nandan GSE HR',
  'SYSTEM TEMPLATE - the way a WhatsApp template is written. {{first_name}}, {{name}}, {{employee_id}} come from the record; {{month}}, {{attendance_days}}, {{paid_days}}, {{net_pay}}, {{gross}} come from the chosen month''s salary sheet. Edit the words; keep the curly variables.',
  'whatsapp',
  null,
  1,
  'system'
)
on conflict (key) do nothing;
