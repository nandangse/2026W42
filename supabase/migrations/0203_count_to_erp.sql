-- 0203_count_to_erp.sql
--
-- THE COUNT GOES BACK TO THE ERP (Dr Raghu, 6 Oct 2026: “if he leaves it
-- blank, ignore it … this has to go back into the ERP, so that the count
-- between the two has to be perfect … so that the ERP is not confused”).
--
--   material_count       which ERP Stock Reconciliation carries the sheet,
--                        its state (draft, submitted), who and when, and
--                        the instant it was posted for.
--   material_count_line  where on the shelf the item was found (“make the
--                        location”), and the quantity sent to the ERP.
--   material_count_erp   every ask made of the ERP for a sheet and what
--                        the ERP answered.
--   material_warehouse   a new type, Stores (the service stores), which
--                        with Stock and Vendor makes up the RM stock.
--
-- Additive, safe to re-run. No straight apostrophes in these comments: the
-- Supabase SQL editor misreads them.

alter table public.material_count add column if not exists erp_reco        text;
alter table public.material_count add column if not exists erp_reco_state  text;
alter table public.material_count add column if not exists erp_reco_by     text;
alter table public.material_count add column if not exists erp_reco_at     timestamptz;
alter table public.material_count add column if not exists erp_posting_at  timestamptz;

alter table public.material_count_line add column if not exists location   text not null default '';
alter table public.material_count_line add column if not exists posted_qty numeric;

create table if not exists public.material_count_erp (
  id        uuid primary key default gen_random_uuid(),
  count_id  uuid not null references public.material_count(id) on delete cascade,
  action    text not null,            -- draft, submit, refused
  voucher   text,
  lines     integer not null default 0,
  answer    text not null default '',
  by_email  text,
  at        timestamptz not null default now()
);
create index if not exists material_count_erp_count on public.material_count_erp (count_id, at desc);
alter table public.material_count_erp enable row level security;

alter table public.material_warehouse drop constraint if exists material_warehouse_kind_check;
alter table public.material_warehouse add constraint material_warehouse_kind_check
  check (kind in ('', 'Stock', 'Stores', 'WIP', 'Vendor', 'Finished goods', 'Ignore'));
