-- 0097: SALARY GROWTH (Dr Raghu, 29 Aug 2026, from the Employee Master tab
-- of the salary workbook): one row per employee per financial year — the
-- gross that year — feeding the 2020→2027 climb on the appraisal card and
-- the Salary Growth listing.
--
-- Line comments only. Safe to re-run.

create table if not exists public.hrms_salary_history (
  id          uuid primary key default gen_random_uuid(),
  employee_id text not null,
  fy          text not null,
  gross       numeric not null default 0,
  by          text,
  at          timestamptz not null default now(),
  unique (employee_id, fy)
);
create index if not exists hrms_salary_history_emp on public.hrms_salary_history (employee_id);
