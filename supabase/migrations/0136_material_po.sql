-- 0136_material_po.sql
--
-- PURCHASE ORDERS AND SUPPLIERS, PULLED (Dr Raghu, 5 Sep 2026): "we will
-- want Purchase orders to be entered in the Saamaan from Erpnext. I want
-- all the purchase orders to come in. The submission will be done from
-- Erp only. It will be pulled only. Including the items inside. Status.
-- First have the list of the POs. For this also have a sub document
-- called Suppliers. Pull the details of the suppliers also."
--
-- Mirrors, never masters: every row here is the ERP's word, refreshed by
-- the pull, and nothing on the ERP is ever written from here. The PO's
-- whole document rides in `erp`; the typed columns are what the screens
-- sort and filter by. Items are one row per PO line, keyed by the ERP's
-- own child-row name so a re-pull lands on the same row.
--
-- ASCII only, additive, safe to re-run.

create table if not exists public.material_po (
  name              text primary key,              -- NGSE/PO/11430
  supplier          text not null default '',
  supplier_name     text not null default '',
  status            text not null default '',
  docstatus         integer not null default 0,
  transaction_date  date,
  schedule_date     date,
  grand_total       numeric,
  net_total         numeric,
  taxes             numeric,
  currency          text not null default '',
  project           text not null default '',
  per_received      numeric,
  per_billed        numeric,
  advance_paid      numeric,
  set_warehouse     text not null default '',
  owner             text not null default '',
  erp_modified      timestamptz,
  erp               jsonb,
  pulled_at         timestamptz not null default now()
);
create index if not exists material_po_status_idx on public.material_po (status);
create index if not exists material_po_supplier_idx on public.material_po (supplier);
create index if not exists material_po_date_idx on public.material_po (transaction_date desc);
alter table public.material_po enable row level security;
revoke all on public.material_po from anon, authenticated;

create table if not exists public.material_po_item (
  row_name      text primary key,                  -- the ERP child row's name
  po_name       text not null,
  idx           integer not null default 0,
  item_code     text not null default '',
  item_name     text not null default '',
  qty           numeric,
  uom           text not null default '',
  rate          numeric,
  amount        numeric,
  received_qty  numeric,
  billed_amt    numeric,
  warehouse     text not null default '',
  schedule_date date,
  project       text not null default '',
  pulled_at     timestamptz not null default now()
);
create index if not exists material_po_item_po_idx on public.material_po_item (po_name, idx);
create index if not exists material_po_item_code_idx on public.material_po_item (item_code);
alter table public.material_po_item enable row level security;
revoke all on public.material_po_item from anon, authenticated;

create table if not exists public.material_supplier (
  name               text primary key,
  supplier_name      text not null default '',
  supplier_group     text not null default '',
  supplier_type      text not null default '',
  gst_no             text not null default '',
  gst_category       text not null default '',
  country            text not null default '',
  mobile_no          text not null default '',
  email_id           text not null default '',
  primary_address    text not null default '',
  primary_contact    text not null default '',
  payment_terms      text not null default '',
  website            text not null default '',
  bank_name          text not null default '',
  account_no         text not null default '',
  ifsc_code          text not null default '',
  status_of_supplier text not null default '',
  rating_percentage  numeric,
  disabled           boolean not null default false,
  on_hold            boolean not null default false,
  erp_modified       timestamptz,
  erp                jsonb,
  addresses          jsonb not null default '[]'::jsonb,
  contacts           jsonb not null default '[]'::jsonb,
  pulled_at          timestamptz not null default now()
);
alter table public.material_supplier enable row level security;
revoke all on public.material_supplier from anon, authenticated;
