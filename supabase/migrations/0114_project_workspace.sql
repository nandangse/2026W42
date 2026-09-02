-- 0114_project_workspace.sql
--
-- THE PROJECT'S OWN ROOM (Dr Raghu, 2 Sep 2026):
--   "In the project make the tabs — Product details, TDS, Jobs, Commercials
--    (only for project managers), Project Charter, RBOM (Real Bill of
--    Materials), Real Issues Solving, Risk Statement, PCD, Milestones,
--    Checklist, Design Section, After Action Report (Project Closure)."
--
-- ONE ENGINE, MANY FACES — the same call that made IMS thirty-nine tables
-- instead of a hundred. Thirteen tabs are not thirteen features. Three of
-- them already have their data (Product details and Commercials from the
-- ERP's own record, Jobs from the jobs table), and the remaining ten are two
-- shapes wearing ten names:
--
--   A NARRATIVE  — Charter, TDS, PCD, Risk Statement, Design Section, After
--                  Action Report. One body of text per project per section.
--   A LIST       — RBOM, Real Issues Solving, Milestones, Checklist. Rows
--                  with a label, a number, a date, an owner and a state.
--
-- Building them as ten tables would mean ten migrations, ten routes and ten
-- screens that drift apart; building them as two means a new section later is
-- a row in a constant, not a deploy.

create table if not exists public.project_doc (
  id         uuid primary key default gen_random_uuid(),
  project_id text not null,
  /** charter | tds | pcd | risk | design | aar | product */
  section    text not null,
  body       text not null default '',
  updated_by text,
  updated_at timestamptz not null default now(),
  constraint project_doc_one_per_section unique (project_id, section)
);

create table if not exists public.project_row (
  id         uuid primary key default gen_random_uuid(),
  project_id text not null,
  /** rbom | issue | milestone | checklist */
  section    text not null,
  seq        int  not null default 0,
  label      text not null default '',
  detail     text not null default '',
  /** RBOM carries a quantity and a unit; the rest leave them null. */
  qty        numeric,
  uom        text,
  /** A milestone's date, an issue's target, a checklist item's due date. */
  due        date,
  owner      text,
  /** open | doing | done | dropped — one vocabulary for every list. */
  state      text not null default 'open'
             check (state in ('open', 'doing', 'done', 'dropped')),
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);

create index if not exists project_doc_proj_idx on public.project_doc (project_id);
create index if not exists project_row_proj_idx on public.project_row (project_id, section, seq);

-- RLS ON AND FORCED, WITH NO POLICIES. Genie hands every signed-in person an
-- anon-key session and PostgREST serves any table no policy stops -- so a
-- table left open here would be a project's commercial notes and its risk
-- register readable straight out of the browser. Everything goes through
-- /api/project-tab, which checks the role first.
alter table public.project_doc enable row level security;
alter table public.project_doc force row level security;
alter table public.project_row enable row level security;
alter table public.project_row force row level security;
