-- 0202_warehouse_ignore.sql
--
-- A WAREHOUSE GENIE IGNORES (Dr Raghu, 6 Oct 2026: “In this type, put a
-- type saying ignore. For the moment, whatever is there in the warehouse
-- that is under ignored should not be considered in valuation, in either
-- raw material stock, WIP, or finished goods, at least in the Genie. Later
-- on, we will find a method to clean this up totally, backload it back into
-- the ERP, and make the data right.”)
--
-- Genie leaves an Ignore warehouse out of every figure it adds up — RM,
-- WIP, finished goods and the total — and says how much it left out. The
-- ERP is not touched.
--
-- Additive, safe to re-run. No straight apostrophes in these comments: the
-- Supabase SQL editor misreads them.

alter table public.material_warehouse drop constraint if exists material_warehouse_kind_check;
alter table public.material_warehouse add constraint material_warehouse_kind_check
  check (kind in ('', 'Stock', 'WIP', 'Vendor', 'Finished goods', 'Ignore'));
