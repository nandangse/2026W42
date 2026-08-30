-- CRM 0032 — the product catalogue wears Dr Raghu's fields (30 Aug 2026)
-- "Item Group, Item, Item ID, Description (rich), Image, Attachments,
--  Approved Price INR, Last Quoted, Average Quoted in 1 year, Alternate USD,
--  Delivery Period, Throughput %, Optional Extras, Purchase Item, Notes."
-- Products are for SALE only; Purchase Item is a text link to the ERP's
-- purchase item code, never a purchase-side import.

alter table product add column if not exists item_group          text;
alter table product add column if not exists image               text;
alter table product add column if not exists attachments         jsonb not null default '[]'::jsonb;
alter table product add column if not exists approved_price_inr  numeric(16,2);
alter table product add column if not exists last_quoted_price   numeric(16,2);
alter table product add column if not exists last_quoted_on      date;
alter table product add column if not exists avg_quoted_price_1y numeric(16,2);
alter table product add column if not exists alt_price_usd       numeric(16,2);
alter table product add column if not exists delivery_period     text;
alter table product add column if not exists throughput_pct      numeric(5,2);
alter table product add column if not exists optional_extras     text;
alter table product add column if not exists purchase_item       text;
alter table product add column if not exists notes               text;
-- the ERP's own modified stamp, so a future refresh can walk a cursor
alter table product add column if not exists erp_modified        timestamptz;
alter table product add column if not exists updated_at          timestamptz not null default now();

create index if not exists product_item_group_idx on product (item_group);
