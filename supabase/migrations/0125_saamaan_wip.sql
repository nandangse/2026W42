-- 0125_saamaan_wip.sql
--
-- SAAMAAN: WIP, one warehouse per live job (Dr Raghu, 3 Sep 2026). Each
-- live job number on the board is a WIP, named WIP_<job number>: the
-- warehouse where that job's work in progress is kept. This is Genie's
-- WIP, separate from the ERP's WIP warehouses, and not to be confused
-- with them.
--
-- The starred columns come from Genie's own board (jobs), the BOM mirror
-- and the RBOM: job no, customer tag, project, the ERP BOM, the RBOM,
-- value, throughput and kitting owner. They are refreshed on every read.
-- The rest (kitted, pending, TVC, throughput calc) are Genie's to fill
-- later and are never touched by a refresh.
--
-- Plain comments on purpose. Additive and safe to re-run.

create table if not exists public.material_wip (
  job_no               text primary key,
  warehouse            text not null default '',
  customer_tag         text not null default '',
  project_id           text not null default '',
  customer             text not null default '',
  product_family       text not null default '',
  bom_no_erp           text not null default '',
  rbom_no              text not null default '',
  value                numeric,
  nos_kitted           integer,
  value_kitted         numeric,
  nos_pending          integer,
  value_pending        numeric,
  tvc_pct              numeric,
  throughput_calc      numeric,
  throughput_erp_pct   numeric,
  throughput_erp_value numeric,
  kitting_pct          numeric,
  kitting_owner        text not null default '',
  live                 boolean not null default true,
  refreshed_at         timestamptz not null default now(),
  note                 text not null default ''
);
create index if not exists material_wip_project_idx on public.material_wip (project_id);
alter table public.material_wip enable row level security;

insert into public.feature_request (title, body, want, status, note, by)
select
  'Saamaan - WIP, one warehouse per live job',
  '<p>Make a side app called WIP. In this each live job number will be a WIP. Create a table WIP_jobnumber - the warehouse where the WIP will be kept. Separate from the ERP WIP. Columns: Job No, Customer tag, Project No, BOM No (ERP), RBOM No, Value, Nos kitted, Value kitted, Nos Pending, Value pending, TVC %, Throughput (calc), Throughput (ERP), Kitting Owner. Pull as much as possible from Genie. Job no opens the same lightbox as the other Genie apps. (Dr Raghu, 3 Sep 2026)</p>',
  'must', 'done',
  'Shipped as Genie 4.4.1.6 - material_wip and the WIP section in Saamaan.',
  'raghu@nandan.co.in'
where not exists (
  select 1 from public.feature_request where title = 'Saamaan - WIP, one warehouse per live job'
);
