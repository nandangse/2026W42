-- 0124_saamaan_warehouse.sql
--
-- SAAMAAN — the warehouse master, and what "stock" means (Dr Raghu, 3 Sep
-- 2026): "Make Masters settings. In this show warehouses, and in front of
-- the warehouse remarks. In front of it Type — changeable to stock / wip /
-- vendor. For the purpose of the stock it's ONLY the closing stock in the
-- 'Stock' warehouses! So this way when we revamp the warehouses properly
-- it will help."
--
-- The ERP has 18 working warehouses and no notion of which of them hold
-- stock that counts: a Sub-Vendor warehouse, a Work-in-Progress warehouse
-- and the Main Store all sit side by side in Bin. This table is Genie's
-- word on top of the ERP's list: the name is the ERP's, pulled; the type
-- and the remark are ours, kept across every pull.
--
--   kind — Stock | WIP | Vendor | '' (not yet said). Only Stock counts
--          towards an item's closing stock. On the first pull the type is
--          GUESSED from the name and the remark says so, so the closing
--          stock means something on day one and the guess is visible to
--          be corrected.
--
-- Line comments only. Additive and safe to re-run.

create table if not exists public.material_warehouse (
  -- The ERP's own name (Khopoli Main Store - NGSE). The one key.
  warehouse        text primary key,
  warehouse_name   text not null default '',
  company          text not null default '',
  parent_warehouse text not null default '',
  is_group         boolean not null default false,
  disabled         boolean not null default false,
  -- Genie's: what the warehouse is for the purpose of stock.
  kind             text not null default '' check (kind in ('', 'Stock', 'WIP', 'Vendor')),
  remarks          text not null default '',
  kind_by          text,
  kind_at          timestamptz,
  erp_modified     timestamptz,
  pulled_at        timestamptz not null default now()
);
alter table public.material_warehouse enable row level security;

-- ---------- the ask, filed where every ask lives ----------
insert into public.feature_request (title, body, want, status, note, by)
select
  'Saamaan — warehouses in Masters, and closing stock from the Stock ones',
  '<p>break this into two columns at the top. Show closing stock in large '
  'letters, UOM and valuation also of it. Make Masters settings. In this show '
  'warehouses and in front of the warehouse remarks. In front of it Type — '
  'changeable to stock / wip / vendor. For the purpose of the stock it''s ONLY '
  'the closing stock in the "Stock" warehouses! So this way when we revamp the '
  'warehouses properly it will help. (Dr Raghu, 3 Sep 2026)</p>',
  'must', 'done',
  'Shipped as Genie 4.4.1.5 — material_warehouse, the Masters section, phase 7 of the pull, closing stock on the item.',
  'raghu@nandan.co.in'
where not exists (
  select 1 from public.feature_request where title = 'Saamaan — warehouses in Masters, and closing stock from the Stock ones'
);
