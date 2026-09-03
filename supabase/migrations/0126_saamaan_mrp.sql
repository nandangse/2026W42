-- 0126_saamaan_mrp.sql
--
-- SAAMAAN: MRP, Material Resource Planning (Dr Raghu, 3 Sep 2026). An MRP
-- run has a number, a name, a date and the person who made it, and a set
-- of live jobs chosen once and kept. GENERATE sums the RBOMs of those jobs
-- into a grid of items by jobs; a tick on a cell issues that quantity of
-- that item into the job WIP warehouse, on that date, by that person.
-- Stock is NOT reduced by an issue yet; that is the next step.
--
--   material_mrp       - the runs.
--   material_mrp_job   - the jobs chosen on a run.
--   material_issue     - every issue into a WIP: the entries the ticks make.
--                        One row per tick, so a partial issue and the one
--                        that completes it are both on record.
--
-- Plain comments on purpose. Additive and safe to re-run.

create table if not exists public.material_mrp (
  id            uuid primary key default gen_random_uuid(),
  mrp_no        text not null unique,
  name          text not null default '',
  run_date      date not null default (now() at time zone 'Asia/Kolkata')::date,
  by            text,
  created_at    timestamptz not null default now(),
  generated_at  timestamptz,
  status        text not null default 'open',
  note          text not null default ''
);
alter table public.material_mrp enable row level security;

create table if not exists public.material_mrp_job (
  mrp_id    uuid not null references public.material_mrp (id) on delete cascade,
  job_no    text not null,
  added_by  text,
  added_at  timestamptz not null default now(),
  primary key (mrp_id, job_no)
);
alter table public.material_mrp_job enable row level security;

create table if not exists public.material_issue (
  id            uuid primary key default gen_random_uuid(),
  job_no        text not null,
  warehouse     text not null default '',
  item_code     text not null,
  item_name     text not null default '',
  qty           numeric not null,
  uom           text not null default '',
  rate          numeric,
  amount        numeric,
  rbom_id       text not null default '',
  rbom_item_id  uuid,
  mrp_id        uuid,
  issued_by     text,
  issued_at     timestamptz not null default now(),
  note          text not null default ''
);
create index if not exists material_issue_job_item_idx on public.material_issue (job_no, item_code);
create index if not exists material_issue_mrp_idx on public.material_issue (mrp_id);
alter table public.material_issue enable row level security;

insert into public.feature_request (title, body, want, status, note, by)
select
  'Saamaan - MRP, Material Resource Planning',
  '<p>On top MRP no, run name, date, by. Jobs to add opens a lightbox of all projects and their jobs, select all / unselect all, saved for next time. The chosen jobs as buttons, hover for two lines, click for the lightbox. GENERATE sums the RBOMs of all the jobs: item groups collapsible on the left, jobs across the top under their project with TDD, kitted, pending and kitting percent, collapsible to the job no alone. Each cell holds qty and UOM per the RBOM and a tick; ticked, it makes an entry in the WIP of that job on that date by that person of that qty, turns green and shows the date. Added, pending, percent and valuation move on top. Stock is not reduced yet. Each job is one unit; kitted and pending by count, percent by value; draft items come too; a number box beside the tick for a partial issue. (Dr Raghu, 3 Sep 2026)</p>',
  'must', 'done',
  'Shipped as Genie 4.4.1.9 - material_mrp, material_mrp_job, material_issue and the MRP section.',
  'raghu@nandan.co.in'
where not exists (
  select 1 from public.feature_request where title = 'Saamaan - MRP, Material Resource Planning'
);
