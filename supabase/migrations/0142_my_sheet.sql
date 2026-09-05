-- 0142_my_sheet.sql
--
-- THE EMPLOYEE'S OWN SHEET (Dr Raghu, 5 Sep 2026): "Whoever has filled in the
-- IDP, once they are finalised, they will see a screen ... Dear Name ...
-- Nandan logo ... Data of yours as per Genie ... HRIS Records, Payslips,
-- Leave Register, Loan Register, Employee Handbook, HR Queries, IDP Results,
-- Learning Goals ... buttons Apply for Leave / Advance / Loan / Leave
-- Encashment / Uniform / Shoes / Other Things."
--
-- Applications ride on hrms_query with topic 'Application', so HR sees them
-- where the queries already are. The learning log is the one new table: what
-- the person did towards their goals, dated, theirs to write. ASCII, additive.

create table if not exists public.hrms_learning_log (
  id           uuid primary key default gen_random_uuid(),
  employee_id  text not null,
  email        text not null,
  note         text not null,
  at           timestamptz not null default now()
);
create index if not exists hrms_learning_log_emp_idx on public.hrms_learning_log (employee_id, at desc);
alter table public.hrms_learning_log enable row level security;
revoke all on public.hrms_learning_log from anon, authenticated;
