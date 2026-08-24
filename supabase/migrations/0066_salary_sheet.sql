-- 0066_salary_sheet.sql
--
-- FINALIZED SALARY SHEETS (Dr Raghu, 23 Aug 2026): one row per month --
-- April 2026, the file that was uploaded, the status, how many Staff and how
-- many Labour and what each group cost, the totals, then the four figures
-- read out of the file itself (earned pay, deductions, net payable, paid to
-- bank), and the date RJ froze it.
--
-- WHY THE AGGREGATES ARE STORED RATHER THAN RECOMPUTED: a frozen salary
-- sheet is a historical fact. If April's totals were recomputed from today's
-- employee master, a person changing type in September would silently
-- restate April -- and April has already been paid. The numbers are taken
-- once, at upload, from the file and from the master AS IT STOOD, and then
-- they stop moving.
--
-- The parsed lines are kept in `rows` so the sheet can be opened and read
-- per person; the original file stays in storage untouched, because a
-- parsed copy is evidence of what we understood, not of what was sent.
--
-- ASCII only, additive, safe to re-run.

create table if not exists public.hrms_salary_sheet (
  id            uuid primary key default gen_random_uuid(),
  month         integer not null,
  year          integer not null,
  file_name     text,
  file_path     text,
  uploaded_by   text,
  uploaded_at   timestamptz,
  /** Not uploaded -> Draft -> Frozen. Only the owner freezes. */
  status        text not null default 'Draft',
  staff_count   integer,
  staff_value   numeric,
  labour_count  integer,
  labour_value  numeric,
  total_count   integer,
  total_salary  numeric,
  earned_pay    numeric,
  deductions    numeric,
  net_payable   numeric,
  paid_to_bank  numeric,
  /** What the parser understood: header row, column mapping, what it could not place. */
  mapping       jsonb,
  rows          jsonb not null default '[]'::jsonb,
  note          text,
  frozen_by     text,
  frozen_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (month, year)
);

create index if not exists hrms_salary_sheet_period_idx
  on public.hrms_salary_sheet (year desc, month desc);

comment on table public.hrms_salary_sheet is
  'One finalised salary sheet per month. Uploaded as a file, parsed to totals, '
  'and frozen by the owner -- after which it is a read-only record of what was paid.';

alter table public.hrms_salary_sheet enable row level security;
revoke all on public.hrms_salary_sheet from anon, authenticated;
