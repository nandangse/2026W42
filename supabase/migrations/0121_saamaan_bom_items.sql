-- 0121_saamaan_bom_items.sql
--
-- SAAMAAN — the BOM lines (Dr Raghu, 2 Sep 2026): "Now its make the BOM
-- pull in. Lets make an app called BOM. In this you will have BOM No - Item
-- ID - Item Group - Item - Qty UOM - Rate - Description (from Item) -
-- Remarks - Status - Last Modified by - Modified Date - Supplier. will ask
-- more later as needed." And: "I am concerned with the jobs in process
-- right now."
--
-- WHAT THE ERP HOLDS ON A LINE, read off the BOM Item child doctype's meta
-- and a live row before this was shaped: item_code, item_name, qty, uom,
-- stock_qty, stock_uom, rate, amount, a Text Editor description, and
-- Nandan's own bom_status (Draft | Released | Modified | Ordered |
-- Received | Partially Received | …), bom_remark and custom_item_group.
-- There is NO supplier on the line: Supplier is read off the item's own
-- supplier_items in the Item mirror when the screen draws the row.
--
-- SCOPE IS THE JOBS IN PROCESS. The pull takes the lines of every BOM that
-- is not cancelled on a project whose status is "Jobs in Process" — 50
-- projects, 61 live BOMs on the day. A project that leaves "in process"
-- leaves this table on the next pull, and its lines with it: this is the
-- working set, not the archive. The archive is the ERP.
--
-- Line comments only. Additive and safe to re-run.

create table if not exists public.material_bom_item (
  -- The ERP child row's own name (001cd762eb). One row per line.
  row_id            text primary key,
  bom_id            text not null,
  idx               integer not null default 0,
  item_code         text not null default '',
  item_name         text not null default '',
  -- The line's own Item Group link, where somebody set it.
  item_group        text not null default '',
  qty               numeric,
  uom               text not null default '',
  stock_qty         numeric,
  stock_uom         text not null default '',
  rate              numeric,
  amount            numeric,
  -- The line's own description — rich text, as the ERP holds it. The
  -- screen prefers the ITEM's description from the mirror, per the ask,
  -- and falls back to this where the item is not an RM item.
  description       text not null default '',
  bom_status        text not null default '',
  bom_remark        text not null default '',
  -- A sub-assembly's own BOM, where the line points at one.
  bom_no            text not null default '',
  is_sub_assembly   boolean not null default false,
  sourced_by_supplier boolean not null default false,
  source_warehouse  text not null default '',
  erp_modified      timestamptz,
  erp_modified_by   text not null default '',
  erp               jsonb not null default '{}'::jsonb,
  pulled_at         timestamptz not null default now()
);
create index if not exists material_bom_item_bom_idx  on public.material_bom_item (bom_id, idx);
create index if not exists material_bom_item_item_idx on public.material_bom_item (item_code);
alter table public.material_bom_item enable row level security;

-- ---------- the ask, filed where every ask lives ----------
insert into public.feature_request (title, body, want, status, note, by)
select
  'Saamaan — BOM, the lines of the jobs in process',
  '<p>Now its make the BOM pull in. Lets make an app called BOM. In this you '
  'will have BOM No - Item ID - Item Group - Item - Qty UOM - Rate - '
  'Description (from Item) - Remarks - Status - Last Modified by - Modified '
  'Date - Supplier. will ask more later as needed. (Dr Raghu, 2 Sep 2026)</p>'
  '<p>"I am concerned with the jobs in process right now." So the lines of '
  'every live BOM on a project in process, and only those.</p>',
  'must', 'done',
  'Shipped as Genie 4.4.0.4 — material_bom_item, phase 6 of the pull, and the BOM section.',
  'raghu@nandan.co.in'
where not exists (
  select 1 from public.feature_request where title = 'Saamaan — BOM, the lines of the jobs in process'
);
