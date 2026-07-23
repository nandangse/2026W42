-- 0003_app_tables.sql
-- App-owned planning layer. NEVER touched by uploads (§6 zero-data-loss).
-- These tables survive every upload untouched.

create table if not exists public.plans (
  job_id       text primary key references public.jobs (id) on delete cascade,
  start_date   date,
  baseline_on  date,
  baseline_end date
);

create table if not exists public.milestones (
  id          uuid primary key default gen_random_uuid(),
  job_id      text not null references public.jobs (id) on delete cascade,
  idx         integer not null,
  title       text,
  days        integer default 1,
  preds       integer[] default '{}',
  crew        jsonb default '{}'::jsonb,   -- {fitter,helper,welder,painter,electrician,hydraulic}
  shift       text default 'D',
  offset_days integer default 0,
  done        boolean not null default false,
  done_on     date,
  unique (job_id, idx)
);

create index if not exists milestones_job_idx on public.milestones (job_id);

create table if not exists public.baseline_milestones (
  job_id     text not null references public.jobs (id) on delete cascade,
  idx        integer not null,
  title      text,
  start_date date,
  end_date   date,
  primary key (job_id, idx)
);

-- Manual tasks: same shape as erp_tasks minus source_key, plus created_by.
create table if not exists public.manual_tasks (
  id         uuid primary key default gen_random_uuid(),
  job_id     text references public.jobs (id) on delete set null,
  title      text,
  detail     text,
  who        text,
  due        date,
  cat        text,
  esc        text default 'None',
  done       boolean not null default false,
  created_by text
);

create index if not exists manual_tasks_job_idx on public.manual_tasks (job_id);

create table if not exists public.task_comments (
  id        uuid primary key default gen_random_uuid(),
  task_id   uuid not null,
  task_kind text not null check (task_kind in ('erp', 'manual')),
  by        text,
  at        timestamptz not null default now(),
  body      text
);

create index if not exists task_comments_task_idx
  on public.task_comments (task_kind, task_id);

create table if not exists public.materials (
  id     uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs (id) on delete cascade,
  item   text not null,
  qty    text,
  status text not null default 'Pending' check (status in ('Pending', 'Received')),
  custom boolean not null default false
);

create index if not exists materials_job_idx on public.materials (job_id);

create table if not exists public.family_templates (
  family     text primary key,
  milestones jsonb not null default '[]'::jsonb
);

-- Single-row settings. priority_order is the manual board ordering.
create table if not exists public.settings (
  id             integer primary key default 1 check (id = 1),
  priority_order text[] default '{}'
);
