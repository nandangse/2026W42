-- 0135_hrms_salary_structure.sql
--
-- THE SALARY RATE LIST (Dr Raghu, 4 Sep 2026): "in this HRIS make a Salary
-- Rate List ... Make a sheet called Salary Structure 2025-06 ... Put the old
-- rates in this and the status will be Overwritten. Then we will have
-- Salary Structure 2026-09 and the status will be Live."
--
-- A STRUCTURE is one dated sheet of rates for the whole roll; one is Live
-- at a time, the earlier ones Overwritten, a new one Draft until it is made
-- Live. A RATE is one person's line in it. The payroll run's Generate reads
-- the Live structure when no rate list is uploaded.
--
-- ASCII only, additive, safe to re-run.

create table if not exists public.hrms_salary_structure (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,          -- 2025-06, 2026-09
  title         text not null,                 -- Salary Structure 2025-06
  status        text not null default 'Draft', -- Draft | Live | Overwritten
  effective_from date,
  note          text,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.hrms_salary_structure enable row level security;
revoke all on public.hrms_salary_structure from anon, authenticated;

create table if not exists public.hrms_salary_rate (
  id                uuid primary key default gen_random_uuid(),
  structure_id      uuid not null references public.hrms_salary_structure(id) on delete cascade,
  employee_id       text not null,
  name              text,
  type              text,
  department        text,
  designation       text,
  reporting_manager text,
  basic_da          numeric not null default 0,
  hra               numeric not null default 0,
  fixed_allowance   numeric not null default 0,
  conveyance        numeric not null default 0,
  medical_allowance numeric not null default 0,
  gross             numeric not null default 0,
  per_day           numeric not null default 0,
  note              text,
  updated_by        text,
  updated_at        timestamptz not null default now(),
  unique (structure_id, employee_id)
);
create index if not exists hrms_salary_rate_emp_idx on public.hrms_salary_rate (employee_id);
alter table public.hrms_salary_rate enable row level security;
revoke all on public.hrms_salary_rate from anon, authenticated;
