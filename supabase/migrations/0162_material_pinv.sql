-- 0162 — Purchase Invoices: what the supplier actually billed
-- (Dr Raghu, 8 Sep 2026: "can you also pull in the purchase invoice from the
-- ERP?").
--
-- Saamaan already holds the promise (Purchase Order, 0136) and the arrival
-- (GRN, 0157). The invoice is the third fact and the only one that carries
-- MONEY OWED: what was billed, against which bill number and date, when it
-- falls due, and whether it has been paid. Without it the room can say what
-- was ordered and what came, but not what is owed for it.
--
-- 23,895 of them in the ERP as this is written.
--
-- Mirrored exactly as the ERP holds it, like everything else in this room:
-- nothing here is typed by hand, and `erp` keeps the whole document so a
-- field nobody thought to name is still there when it is wanted.
--
-- Safe to run twice.

create table if not exists public.material_pinv (
  name             text primary key,                 -- the ERP's own name, e.g. NGSE/PUR/INV/1601
  supplier         text,
  supplier_name    text,
  status           text,                             -- Unpaid, Paid, Overdue, Return…
  docstatus        integer default 0,
  posting_date     date,
  posting_time     text,
  due_date         date,                             -- when the money is owed
  bill_no          text,                             -- the supplier's OWN invoice number
  bill_date        date,                             -- and its date
  grand_total      numeric,
  net_total        numeric,
  taxes            numeric,
  outstanding      numeric,                          -- still unpaid, the ERP's own figure
  currency         text,
  project          text,
  is_paid          boolean default false,
  is_return        boolean default false,
  update_stock     boolean default false,
  total_qty        numeric,
  owner            text,
  remarks          text,
  erp_modified     text,
  erp              jsonb,                            -- the whole document, as it came
  pulled_at        timestamptz
);

create index if not exists material_pinv_supplier_idx on public.material_pinv (supplier);
create index if not exists material_pinv_date_idx     on public.material_pinv (posting_date desc);
create index if not exists material_pinv_due_idx      on public.material_pinv (due_date);
create index if not exists material_pinv_status_idx   on public.material_pinv (status);
create index if not exists material_pinv_project_idx  on public.material_pinv (project);
create index if not exists material_pinv_bill_idx     on public.material_pinv (bill_no);

create table if not exists public.material_pinv_item (
  row_name         text primary key,                 -- the child row's own name
  pinv_name        text not null,
  idx              integer default 0,
  item_code        text,
  item_name        text,
  qty              numeric,
  received_qty     numeric,
  uom              text,
  rate             numeric,
  amount           numeric,
  net_amount       numeric,
  taxable_value    numeric,
  warehouse        text,
  purchase_order   text,                             -- back to the PO it bills
  po_detail        text,
  purchase_receipt text,                             -- and to the GRN it answers
  pr_detail        text,
  item_group       text,
  project          text,
  pulled_at        timestamptz
);

create index if not exists material_pinv_item_pinv_idx on public.material_pinv_item (pinv_name);
create index if not exists material_pinv_item_item_idx on public.material_pinv_item (item_code);
create index if not exists material_pinv_item_po_idx   on public.material_pinv_item (purchase_order);
create index if not exists material_pinv_item_grn_idx  on public.material_pinv_item (purchase_receipt);

-- Read through the service role only, exactly as the rest of Saamaan's mirror:
-- the browser key must not reach a table of what this house owes and to whom.
alter table public.material_pinv      enable row level security;
alter table public.material_pinv_item enable row level security;
revoke all on public.material_pinv      from public, anon, authenticated;
revoke all on public.material_pinv_item from public, anon, authenticated;

create table if not exists public.genie_migration (name text primary key, at timestamptz default now());
insert into public.genie_migration (name) values ('0162_material_pinv') on conflict (name) do nothing;

notify pgrst, 'reload schema';

-- ── prove it ──
select 'material_pinv' as t, count(*) from public.material_pinv
union all
select 'material_pinv_item', count(*) from public.material_pinv_item;
