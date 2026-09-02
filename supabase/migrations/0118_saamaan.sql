-- 0118_saamaan.sql
--
-- SAAMAAN — the materials module, Genie's EIGHTH door (Dr Raghu, 2 Sep 2026):
-- "lets make another App now inside Genie. It will be called Saamaan —
-- genie.nandan.co.in/saamaan. make the access from within genie. The
-- database is the same in supabase but show a table distinction by putting
-- material_. the access is currently to me but keep the access from the
-- users in the admin settings too."
--
-- Then, pointing at nandanerp's Item report filtered to RM: "Item table
-- needs to be imported. Item Group like RM. Disabled equals no. All these
-- fields that existed in the main one will need to be imported. Description
-- is rich text. Also import the attachments and the links as it is. I want
-- to create the Bill of Materials subsequently. Hence getting this right is
-- important."
--
-- IN GENIE'S OWN DATABASE, like Seva, HRMS, Kuber, Vishwakarma and the IMS.
-- The distinction is the PREFIX: every table Saamaan owns begins with
-- `material_`, so a glance down the table list says which module a row
-- belongs to without opening it.
--
-- WHAT THE ERP ACTUALLY HOLDS, read off a live Item and the doctype's own
-- meta on 2 Sep 2026 before this table was shaped (the ERP-SYNC rule: field
-- names come from a live document, never guessed):
--   21,916 items in 29 groups named "RM - …", not disabled (22,112 with the
--   disabled ones); 97 non-layout fields on the Item, eight child tables;
--   Nandan's own custom fields — drawing_no (→ Drawing), drawing_pdf /
--   drawing_dwg / custom_drawing_dxf (attachments: 4,199 / 703 / 2,050 of
--   them), kittable (Yes on 21,909), raw_material (→ Raw Material),
--   each_blank, qc_status, custom_item_class, item_short_description,
--   optional_extras, master_reference_product, date_price_updated,
--   bom_status; 14,305 File rows attached to Items; 3,702 descriptions
--   carry HTML and 33 carry an <img> whose src is a path on the ERP.
--
-- Four tables:
--   material_access    — the door: the same email-keyed grant as every
--                        module, owner implicit, nobody else by default.
--   material_item      — the Item master, MIRRORED from the ERP. The
--                        columns are the fields the screens and the coming
--                        Bill of Materials read by name; `erp` is the WHOLE
--                        main document as the ERP returned it, so no field
--                        is lost however the columns are chosen; `children`
--                        holds the eight child tables the same way. The ERP
--                        owns this master: nothing here is hand-edited.
--   material_item_file — every attachment the ERP holds against an Item,
--                        the file_url exactly as the ERP wrote it (a path on
--                        nandanerp.in), which is what "as it is" means.
--   material_pull      — the ledger of pulls: when, who, and what came.
--
-- Line comments only. Additive and safe to re-run.

-- ---------- Saamaan's door ----------
create table if not exists public.material_access (
  email      text primary key,
  granted_by text,
  created_at timestamptz not null default now()
);
-- RLS on, no policies — the door is read by the route handlers with the
-- service key, never by a browser.
alter table public.material_access enable row level security;

-- ---------- the Item master, mirrored ----------
create table if not exists public.material_item (
  -- The ERP's own name IS the item code (N040692). The one key.
  item_code                 text primary key,
  item_name                 text not null default '',
  item_group                text not null default '',
  -- Rich text, exactly as the ERP holds it. Image paths inside are the
  -- ERP's; the screen prefixes the ERP's URL when it draws them.
  description               text not null default '',
  item_short_description    text not null default '',
  optional_extras           text not null default '',
  stock_uom                 text not null default '',
  purchase_uom              text not null default '',
  sales_uom                 text not null default '',
  disabled                  boolean not null default false,
  is_stock_item             boolean not null default false,
  is_purchase_item          boolean not null default false,
  is_sales_item             boolean not null default false,
  include_item_in_manufacturing boolean not null default false,
  is_sub_contracted_item    boolean not null default false,
  is_fixed_asset            boolean not null default false,
  has_variants              boolean not null default false,
  has_batch_no              boolean not null default false,
  has_serial_no             boolean not null default false,
  master_reference_product  boolean not null default false,
  variant_of                text not null default '',
  default_bom               text not null default '',
  bom_status                text not null default '',
  -- Money and quantity are NULL where the ERP holds nothing. Number(null)
  -- is 0 in JavaScript, and a defaulted zero here would read "no rate
  -- recorded" as "free".
  valuation_rate            numeric,
  standard_rate             numeric,
  last_purchase_rate        numeric,
  opening_stock             numeric,
  safety_stock              numeric,
  min_order_qty             numeric,
  lead_time_days            integer,
  shelf_life_in_days        integer,
  weight_per_unit           numeric,
  weight_uom                text not null default '',
  total_projected_qty       numeric,
  gst_hsn_code              text not null default '',
  brand                     text not null default '',
  country_of_origin         text not null default '',
  customs_tariff_number     text not null default '',
  end_of_life               date,
  default_material_request_type text not null default '',
  valuation_method          text not null default '',
  warranty_period           text not null default '',
  customer_code             text not null default '',
  default_item_manufacturer text not null default '',
  default_manufacturer_part_no text not null default '',
  -- Nandan's own fields, the ones the shop actually reads.
  drawing_no                text not null default '',
  drawing_pdf               text not null default '',
  drawing_dwg               text not null default '',
  custom_drawing_dxf        text not null default '',
  image                     text not null default '',
  kittable                  text not null default '',
  raw_material              text not null default '',
  each_blank                text not null default '',
  qc_status                 text not null default '',
  custom_item_class         text not null default '',
  date_price_updated        text not null default '',
  -- Provenance, from the ERP's own audit columns.
  erp_owner                 text not null default '',
  erp_modified_by           text not null default '',
  erp_creation              timestamptz,
  erp_modified              timestamptz,
  -- EVERYTHING the ERP returned for the main document, verbatim.
  erp                       jsonb not null default '{}'::jsonb,
  -- The child tables, keyed by their ERP fieldname: uoms, item_defaults,
  -- supplier_items, reorder_levels, taxes, barcodes, customer_items,
  -- attributes. Each a list of rows as the ERP holds them.
  children                  jsonb not null default '{}'::jsonb,
  -- When this row last came down from the ERP.
  pulled_at                 timestamptz not null default now()
);
create index if not exists material_item_group_idx    on public.material_item (item_group);
create index if not exists material_item_name_idx     on public.material_item (item_name);
create index if not exists material_item_modified_idx on public.material_item (erp_modified);
create index if not exists material_item_disabled_idx on public.material_item (disabled);
alter table public.material_item enable row level security;

-- ---------- the attachments, as they are ----------
create table if not exists public.material_item_file (
  -- The ERP's File name (194c483ab3). One row per attachment.
  file_id           text primary key,
  item_code         text not null,
  file_name         text not null default '',
  -- The ERP's own path (/file/194c483ab3/N040692_MS Bush.pdf or
  -- /files/x.png). Prefixed with the ERP's URL when opened.
  file_url          text not null default '',
  is_private        boolean not null default false,
  -- Which field it hangs on: drawing_pdf, drawing_dwg, custom_drawing_dxf,
  -- image — or empty for a plain attachment.
  attached_to_field text not null default '',
  file_size         bigint,
  erp_modified      timestamptz,
  pulled_at         timestamptz not null default now()
);
create index if not exists material_item_file_item_idx on public.material_item_file (item_code);
alter table public.material_item_file enable row level security;

-- ---------- the ledger of pulls ----------
create table if not exists public.material_pull (
  id         uuid primary key default gen_random_uuid(),
  -- items | children | files — the three phases of one pull.
  phase      text not null,
  found      integer not null default 0,
  written    integer not null default 0,
  removed    integer not null default 0,
  note       text not null default '',
  by         text,
  at         timestamptz not null default now()
);
alter table public.material_pull enable row level security;

-- ---------- the ask, filed where every ask lives ----------
insert into public.feature_request (title, body, want, status, note, by)
select
  'Saamaan — the materials module',
  '<p>lets make another App now inside Genie. It will be called Saamaan — '
  'genie.nandan.co.in/saamaan. make the access from within genie. The '
  'database is the same in supabase but show a table distinction by putting '
  'material_. the access is currently to me but keep the access from the '
  'users in the admin settings too. (Dr Raghu, 2 Sep 2026)</p>'
  '<p>Item table needs to be imported. Item Group like RM. Disabled equals '
  'no. All these fields that existed in the main one will need to be '
  'imported. Description is rich text. Also import the attachments and the '
  'links as it is. I want to create the Bill of Materials subsequently. '
  'Hence getting this right is important.</p>'
  '<p>Phase 0: the door (material_access, owner implicit, a tick on Admin → '
  'module access); the Item master mirrored from the ERP — every field, the '
  'child tables, the attachments and the links, verbatim; a browse with the '
  'rich description drawn; and the pull ledger. The Bill of Materials comes '
  'next, on this base.</p>',
  'must', 'done',
  'Shipped as Genie 4.4.0.0 — the eighth door.',
  'raghu@nandan.co.in'
where not exists (
  select 1 from public.feature_request where title = 'Saamaan — the materials module'
);

-- ---------- one count per group, for the dashboard and the filter ----------
-- A function rather than 29 round trips: the groups are whatever the ERP
-- says they are, and the screen should not need to know their names first.
create or replace function public.material_group_counts()
returns table (item_group text, n bigint)
language sql stable as $$
  select item_group, count(*)::bigint
  from public.material_item
  where not disabled
  group by item_group
  order by item_group
$$;
