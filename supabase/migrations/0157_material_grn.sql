-- 0157 — GRNs: what actually arrived (Dr Raghu, 8 Sep 2026, of Saamaan:
-- "from ERP get in Suppliers, Purchase orders, GRNs").
--
-- Suppliers and Purchase Orders already come across (0136). A purchase order
-- is a promise; the GRN is the arrival, and without it Saamaan can say what
-- was ordered but not what came, from whom, into which warehouse, on which
-- day — nor what was rejected. In the ERP this is the "Purchase Receipt"
-- doctype and its Item child table.
--
-- Mirrored exactly as the ERP holds it, like everything else in this room:
-- nothing here is typed by hand, and `erp` keeps the whole document so a
-- field nobody thought to name is still there when it is wanted.
--
-- Safe to run twice.

create table if not exists public.material_grn (
  name             text primary key,                 -- the ERP's own name, e.g. MAT-PRE-2026-00123
  supplier         text,
  supplier_name    text,
  status           text,
  docstatus        integer default 0,
  posting_date     date,
  posting_time     text,
  grand_total      numeric,
  net_total        numeric,
  taxes            numeric,
  currency         text,
  project          text,
  set_warehouse    text,
  is_return        boolean default false,
  per_billed       numeric,
  total_qty        numeric,
  owner            text,
  remarks          text,
  erp_modified     text,
  erp              jsonb,                            -- the whole document, as it came
  pulled_at        timestamptz
);

create index if not exists material_grn_supplier_idx  on public.material_grn (supplier);
create index if not exists material_grn_date_idx      on public.material_grn (posting_date desc);
create index if not exists material_grn_project_idx   on public.material_grn (project);
create index if not exists material_grn_warehouse_idx on public.material_grn (set_warehouse);

create table if not exists public.material_grn_item (
  row_name         text primary key,                 -- the child row's own name
  grn_name         text not null,
  idx              integer default 0,
  item_code        text,
  item_name        text,
  qty              numeric,                          -- accepted
  received_qty     numeric,                          -- what arrived
  rejected_qty     numeric,                          -- and what was refused
  uom              text,
  rate             numeric,
  amount           numeric,
  warehouse        text,
  rejected_warehouse text,
  purchase_order   text,                             -- back to the PO it answers
  purchase_order_item text,
  batch_no         text,
  serial_no        text,
  project          text,
  pulled_at        timestamptz
);

create index if not exists material_grn_item_grn_idx  on public.material_grn_item (grn_name);
create index if not exists material_grn_item_item_idx on public.material_grn_item (item_code);
create index if not exists material_grn_item_po_idx   on public.material_grn_item (purchase_order);

comment on table public.material_grn is
  'Purchase Receipts (GRNs) mirrored from the ERP. A PO is a promise; this is the arrival. Nothing here is hand-edited — what is wrong here is wrong in the ERP.';
comment on column public.material_grn_item.rejected_qty is
  'What was refused at the gate. Kept because a receipt that only records what was accepted cannot tell you which supplier keeps sending bad material.';

-- ── the same wall every other table in this room stands behind ──
alter table public.material_grn      enable row level security;
alter table public.material_grn_item enable row level security;
revoke all on public.material_grn      from public, anon, authenticated;
revoke all on public.material_grn_item from public, anon, authenticated;

create table if not exists public.genie_migration (name text primary key, at timestamptz default now());
insert into public.genie_migration (name) values ('0157_material_grn') on conflict (name) do nothing;

notify pgrst, 'reload schema';

-- ── prove it ──
select 'material_grn' as t, count(*) from public.material_grn
union all
select 'material_grn_item', count(*) from public.material_grn_item;
