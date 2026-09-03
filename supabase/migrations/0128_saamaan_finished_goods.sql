-- 0128_saamaan_finished_goods.sql
--
-- SAAMAAN: one more warehouse type, Finished goods, for delivered items
-- (Dr Raghu, 3 Sep 2026). It does not count towards closing stock; only
-- Stock does. The three warehouses named Finished Goods that nobody has
-- typed yet are set to it here, marked as a guess to be checked.
--
-- Plain comments on purpose. Additive and safe to re-run.

alter table public.material_warehouse drop constraint if exists material_warehouse_kind_check;
alter table public.material_warehouse add constraint material_warehouse_kind_check
  check (kind in ('', 'Stock', 'WIP', 'Vendor', 'Finished goods'));

update public.material_warehouse
   set kind = 'Finished goods', remarks = 'type guessed from the name - check'
 where kind = '' and not is_group and warehouse ilike '%finished goods%';
