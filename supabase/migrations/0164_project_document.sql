-- 0164 — THE PROJECT AS A DOCUMENT (Dr Raghu, 9 Sep 2026)
--
-- "Make yourself like a Project Management Professional and design this
-- project box from all the data we have so that all the aspects of PMP are
-- satisfied ... All this is there in the ERP projects, pull it here."
--
-- And then, having seen what the ERP actually holds:
--   "Currently don't import the commercials from the project, we will rebuild
--    it. All the other cells which you think are frivolous put them all in
--    project notes! Have a compact project document which can have
--    intelligence built in — not flab."
--
-- SO NO COMMERCIALS. The ERP's Project carries gross_margin, per_gross_margin,
-- total_costing_amount, total_expense_claim and a dozen more — and they are
-- not worth the columns. Measured over 400 projects: gross_margin equals MINUS
-- the purchase cost in 110 of the 145 cases where it is not zero, and equals
-- value-minus-cost in NONE. total_expense_claim, total_costing_amount and
-- per_gross_margin are populated on ZERO projects; actual_time on one. Importing
-- that would mean importing a number that says every project loses money.
-- The margin gets rebuilt from Genie's own sources — RBOM, labour, the job's
-- overheads — where the figures are real.
--
-- WHAT EARNS A COLUMN. A field earns one if somebody would sort, filter or
-- chase by it. Target-versus-actual pairs earn theirs twice over: a BOM release
-- date on its own is a fact, but a released date beside the date it was DUE is
-- a question — and questions are what a project document is for.
--
-- WHAT DOES NOT. Forty tick-boxes do not deserve forty columns. They go into
-- `gates` as one object, where they can be COUNTED — "14 of 22 done" is
-- intelligence; twenty-two booleans across a screen is flab.
--
-- AND THE REST GOES IN `notes`. ERPNext's own plumbing — the e-mail digest
-- schedule, from_time, day_to_send, collect_progress, naming_series, the
-- duplicated 10pc status — is kept, because a field nobody thought to name is
-- still there when it is wanted, and shown to nobody, because it means nothing
-- to this house.
--
-- Safe to run twice.

alter table public.projects
  -- identity and state
  add column if not exists status          text,
  add column if not exists active          boolean,
  add column if not exists priority        text,
  add column if not exists product_family  text,
  add column if not exists quantity        numeric,
  add column if not exists po_number       text,

  -- time: the plan, and how it is running
  add column if not exists exp_start       date,
  add column if not exists pct_complete    numeric,
  add column if not exists otd_status      text,

  -- design: target beside actual, which is where the questions live
  add column if not exists design_stage    text,
  add column if not exists design_pct      numeric,
  add column if not exists bom_target      date,
  add column if not exists bom_released    date,
  add column if not exists dwg_target      date,
  add column if not exists dwg_released    date,
  add column if not exists approved_bom    text,
  add column if not exists material_pct    numeric,

  -- who answers for what: PMP's stakeholder column, named
  add column if not exists planning_owner    text,
  add column if not exists design_owner      text,
  add column if not exists production_owner  text,
  add column if not exists purchase_owner    text,
  add column if not exists kitting_owner     text,
  add column if not exists quality_owner     text,
  add column if not exists marketing_owner   text,

  -- closing
  add column if not exists aar_needed      boolean,
  add column if not exists aar_done        boolean,

  -- risk and issue, in prose, as the ERP keeps them
  add column if not exists escalations        text,
  add column if not exists escalations_solved text,

  -- the forty tick-boxes, as one countable object
  add column if not exists gates           jsonb,
  -- everything judged flab: kept, never shown
  add column if not exists notes           jsonb,

  add column if not exists erp_modified    text,
  add column if not exists pulled_at       timestamptz;

create index if not exists projects_stage_idx  on public.projects (stage);
create index if not exists projects_status_idx on public.projects (status);

-- ── the issue log: a project's own history of what went wrong ──
create table if not exists public.project_issue (
  id          text primary key,          -- the child row's own name in the ERP
  project_id  text not null,
  idx         integer default 0,
  issue_log   text,
  issue       text,
  issue_date  date,
  customer    text,
  pulled_at   timestamptz default now()
);
create index if not exists project_issue_proj_idx on public.project_issue (project_id);

-- ── the risk register ──
create table if not exists public.project_risk (
  id          text primary key,
  project_id  text not null,
  idx         integer default 0,
  risk        text,
  raised_on   date,
  owner       text,
  body        jsonb,                     -- whatever else the row carried
  pulled_at   timestamptz default now()
);
create index if not exists project_risk_proj_idx on public.project_risk (project_id);

alter table public.project_issue enable row level security;
alter table public.project_risk  enable row level security;
revoke all on public.project_issue from public, anon, authenticated;
revoke all on public.project_risk  from public, anon, authenticated;

create table if not exists public.genie_migration (name text primary key, at timestamptz default now());
insert into public.genie_migration (name) values ('0164_project_document') on conflict (name) do nothing;

notify pgrst, 'reload schema';

-- ── prove it ──
select 'projects columns' as t, count(*) as n
  from information_schema.columns where table_name = 'projects' and table_schema = 'public'
union all select 'project_issue', count(*) from public.project_issue
union all select 'project_risk',  count(*) from public.project_risk;
