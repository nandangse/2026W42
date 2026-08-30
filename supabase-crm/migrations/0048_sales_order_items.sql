-- CRM 0048 — the sales orders get their items (30 Aug 2026)
-- "pl import all sales order no. add fields as needed" — a lines table
-- mirroring the quotation's, plus the PO and tax fields the ERP carries.
create table if not exists sales_order_line (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references sales_order(id) on delete cascade,
  line_no int not null default 1,
  product_id uuid,
  description text,
  specs jsonb,
  item_group text,
  quantity numeric not null default 1,
  uom text,
  unit_price numeric not null default 0,
  amount numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists so_line_so on sales_order_line(sales_order_id);
alter table sales_order add column if not exists po_no text;
alter table sales_order add column if not exists po_date date;
alter table sales_order add column if not exists taxable_value numeric;
alter table sales_order add column if not exists tax_amount numeric;
