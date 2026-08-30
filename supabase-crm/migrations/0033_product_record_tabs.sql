-- CRM 0033 — the product record grows its tabs (30 Aug 2026)
-- Quotations history, a pricing ladder where the first row is the Approved
-- one, training per product family, notes, and merge. Dr Raghu's spec:
-- "have tabs… show quotations… pricing… training about product family…
--  keep the provision to merge products."

-- notes and attachments may now hang on a product
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'record_link'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%target_type%';
  if c is not null then execute format('alter table record_link drop constraint %I', c); end if;
end $$;
alter table record_link add constraint record_link_target_type_check
  check (target_type in ('company','person','lead','opportunity','quotation','installed_unit','product'));

-- merge machinery: a product retires the same way a company does
alter table product add column if not exists deleted_at     timestamptz;
alter table product add column if not exists merged_into_id uuid references product(id);

-- every ERP quotation line that carried this item, one row each
create table if not exists product_quote (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references product(id) on delete cascade,
  qtn_no      text not null,
  line_no     int  not null default 0,
  client      text,
  quoted_on   date,
  qty         numeric(14,2),
  rate        numeric(16,2),
  amount      numeric(16,2),
  currency    text not null default 'INR',
  source      text not null default 'erp',
  created_at  timestamptz not null default now(),
  unique (product_id, qtn_no, line_no)
);
create index if not exists product_quote_pid_idx on product_quote (product_id, quoted_on desc);

-- the pricing ladder — the approved row leads, and is the default on a quote
create table if not exists product_price (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references product(id) on delete cascade,
  priced_on   date not null default current_date,
  currency    text not null default 'INR',
  amount      numeric(16,2) not null,
  remarks     text,
  approved_by text,
  is_approved boolean not null default false,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists product_price_pid_idx on product_price (product_id, is_approved desc, priced_on desc);

-- training material per product family, written once, read on every product
create table if not exists product_family_training (
  item_group  text primary key,
  content     text,
  updated_by  text,
  updated_at  timestamptz not null default now()
);
