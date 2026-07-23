-- 0002_erp_tables.sql
-- ERP-derived tables. These are the ONLY tables that uploads replace/update.
-- Data enters exclusively via POST /api/upload (Excel). Jobs are archived,
-- never deleted.
--
-- Note on column names: a few spec names collide with SQL / PostgREST reserved
-- words ("start", "offset"). Those are renamed to safe equivalents
-- (start_date, offset_days) and mapped back in the TypeScript layer. Every
-- other name matches the spec verbatim.

create table if not exists public.jobs (
  id            text primary key,                 -- 10-digit ERP job id
  tag           text,
  fam           text,
  cust          text,
  val           numeric default 0,
  tdd           date,
  otd           date,
  start_date    date,
  proj          text,
  stat          text,
  pct           numeric default 0,
  note          text,
  own           text,
  mgmt          date,                             -- Management Target Date (raghu-only edits)
  tp            numeric default 0,
  tpv           numeric default 0,
  tpp           numeric default 0,
  kit           numeric default 0,                -- ERP "Kitting percentage" (drives the fixed formula)
  active        boolean not null default true,
  archived_at   timestamptz,
  updated_batch uuid
);

create index if not exists jobs_active_idx on public.jobs (active);
create index if not exists jobs_proj_idx on public.jobs (proj);
create index if not exists jobs_tdd_idx on public.jobs (tdd);

create table if not exists public.projects (
  id          text primary key,                   -- NGSE-PROJ-…
  mgr         text,
  committed   date,
  exp_end     date,
  so          text,
  stage       text,
  job_numbers text[]
);

-- ERP tasks originating from ToDo uploads. source_key is the proven merge key:
--   job_id || '||' || left(title, 60)
create table if not exists public.erp_tasks (
  id         uuid primary key default gen_random_uuid(),
  job_id     text references public.jobs (id) on delete set null,
  source_key text not null unique,
  title      text,
  detail     text,
  who        text,
  due        date,
  cat        text,
  esc        text default 'None',
  done       boolean not null default false
);

create index if not exists erp_tasks_job_idx on public.erp_tasks (job_id);

-- Every morning snapshot is retained (history; enables "as of" questions later).
create table if not exists public.import_batches (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('jobs', 'projects', 'tasks', 'pre')),
  filename    text,
  uploaded_by text,
  uploaded_at timestamptz not null default now(),
  row_count   integer default 0,
  summary     jsonb
);

create index if not exists import_batches_kind_time_idx
  on public.import_batches (kind, uploaded_at desc);
