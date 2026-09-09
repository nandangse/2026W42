-- 0165 — WHAT A JOB ACTUALLY EARNS (Dr Raghu, 9 Sep 2026)
--
-- "It will take the Project cost minus RM — from RBOM, minus labour — from
--  labour, minus transport and OHs which is also there in the JOB, minus any
--  other expense costs or claims assigned to job or project, giving the gross
--  margin and gross margin %. We need to set this for the jobs."
--
-- THREE OF THE FOUR HAD NOWHERE TO LIVE. Measured before building: the RBOM
-- carries 4,459 priced lines, so raw material is real. But `wip_labour` is
-- populated on ZERO jobs of 114 live, `invested` on zero, and transport,
-- overheads and expense claims had no column anywhere in Genie. This adds
-- them, and a small ledger for the claims.
--
-- AND THE MARGIN MUST NEVER PRETEND. A margin computed with three of four
-- costs missing reports a magnificent profit — which is precisely the fault I
-- criticised in the ERP's own gross_margin two hours ago, only inverted. So
-- every cost line is NULLABLE and null means "not known", never zero: the
-- screen counts how many of the four are actually in and says so beside the
-- number. A margin with one input is a guess wearing a percentage sign.
--
-- Safe to run twice.

alter table public.jobs
  -- "transport and OHs which is also there in the JOB" — it was not, so here it is
  add column if not exists transport   numeric,
  add column if not exists overheads   numeric,
  -- what the RBOM said when this margin was last worked out, so a figure can
  -- be explained a month later even after the BOM has moved on
  add column if not exists rm_at_calc  numeric,
  add column if not exists costed_at   timestamptz,
  add column if not exists costed_by   text;

-- ── expenses and claims, against a job OR a project ──
-- Both, because he said both: some costs are known against one machine and
-- some only against the whole order. A project-level entry is spread across
-- its live jobs by value when a job's own margin is worked out, and is never
-- double-counted with a job-level one.
create table if not exists public.job_cost_entry (
  id          uuid primary key default gen_random_uuid(),
  job_id      text,
  project_id  text,
  kind        text not null,            -- transport | labour | overhead | claim | other
  label       text not null,
  amount      numeric not null,
  incurred_on date,
  note        text,
  created_at  timestamptz not null default now(),
  created_by  text,
  -- one or the other, never neither: an expense against nothing cannot be counted
  constraint job_cost_entry_has_a_home check (job_id is not null or project_id is not null)
);

create index if not exists job_cost_entry_job_idx  on public.job_cost_entry (job_id);
create index if not exists job_cost_entry_proj_idx on public.job_cost_entry (project_id);

alter table public.job_cost_entry enable row level security;
revoke all on public.job_cost_entry from public, anon, authenticated;

create table if not exists public.genie_migration (name text primary key, at timestamptz default now());
insert into public.genie_migration (name) values ('0165_job_margin') on conflict (name) do nothing;

notify pgrst, 'reload schema';

-- ── prove it ──
select 'jobs.transport'  as t, count(*) as n from information_schema.columns
  where table_schema='public' and table_name='jobs' and column_name in ('transport','overheads','rm_at_calc','costed_at','costed_by')
union all
select 'job_cost_entry', count(*) from public.job_cost_entry;
