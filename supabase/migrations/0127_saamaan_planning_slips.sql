-- 0127_saamaan_planning_slips.sql
--
-- SAAMAAN: material planning on the MRP, the kitting register, and issue
-- slips with escalation (Dr Raghu, 3 Sep 2026).
--
--   material_mrp_plan  - the order quantity typed against an item on a run.
--                        Kept quietly on every change; there is no Save.
--   material_slip      - an issue slip (to the store) or a purchase slip
--                        (to purchase): from one person to one person,
--                        with a status and an escalation level.
--   material_slip_line - the lines: project, job, item group, item, the
--                        quantity to release, and what has been released.
--   material_setting   - who the store keeper, purchase and the COO are,
--                        for the slips and the escalation ladder.
--   material_issue     - gains slip_id: which slip carried the tick.
--
-- Plain comments on purpose. Additive and safe to re-run.

create table if not exists public.material_mrp_plan (
  mrp_id      uuid not null references public.material_mrp (id) on delete cascade,
  item_code   text not null,
  order_qty   numeric,
  updated_by  text,
  updated_at  timestamptz not null default now(),
  primary key (mrp_id, item_code)
);
alter table public.material_mrp_plan enable row level security;

create table if not exists public.material_slip (
  id                uuid primary key default gen_random_uuid(),
  slip_no           text not null unique,
  kind              text not null default 'store',
  mrp_id            uuid,
  from_email        text,
  to_email          text,
  status            text not null default 'open',
  escalation_level  integer not null default 0,
  escalated_at      timestamptz,
  escalation_note   text not null default '',
  created_at        timestamptz not null default now(),
  done_at           timestamptz,
  note              text not null default ''
);
create index if not exists material_slip_status_idx on public.material_slip (status, created_at);
alter table public.material_slip enable row level security;

create table if not exists public.material_slip_line (
  id            uuid primary key default gen_random_uuid(),
  slip_id       uuid not null references public.material_slip (id) on delete cascade,
  project_id    text not null default '',
  job_no        text not null default '',
  item_group    text not null default '',
  item_code     text not null default '',
  item_name     text not null default '',
  qty           numeric not null default 0,
  uom           text not null default '',
  rate          numeric,
  amount        numeric,
  released_qty  numeric not null default 0,
  released_at   timestamptz,
  released_by   text,
  issue_ids     jsonb not null default '[]'::jsonb
);
create index if not exists material_slip_line_slip_idx on public.material_slip_line (slip_id);
alter table public.material_slip_line enable row level security;

create table if not exists public.material_setting (
  key         text primary key,
  value       text not null default '',
  updated_by  text,
  updated_at  timestamptz not null default now()
);
alter table public.material_setting enable row level security;

alter table public.material_issue add column if not exists slip_id uuid;
create index if not exists material_issue_slip_idx on public.material_issue (slip_id);

insert into public.feature_request (title, body, want, status, note, by)
select
  'Saamaan - MRP planning, kitting register, issue slips with escalation',
  '<p>On the MRP, a collapsible planning block per item: current stock (live), required, kitted, needed, in order, balance, to order, an order box filled from the calculation by a button, and its valuation; the value of the MRP run on top; always live, no save. Every tick also lands in a kitting register. Submit to store turns the ticks into an issue slip from one person to one, project then item group then item and quantity; submit to purchase likewise. A slip not done escalates a day later to the project manager, then the COO, then Raghu, each time as a task, and the slip says issue not done. (Dr Raghu, 3 Sep 2026)</p>',
  'must', 'done',
  'Shipped as Genie 4.4.2.0 - material_mrp_plan, material_slip, material_slip_line, material_setting; Kitting and Issue slips sections; the daily escalation cron.',
  'raghu@nandan.co.in'
where not exists (
  select 1 from public.feature_request where title = 'Saamaan - MRP planning, kitting register, issue slips with escalation'
);
