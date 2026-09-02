-- 0122_saamaan_bom_value.sql
--
-- SAAMAAN — the BOM's value, as the ERP costs it (Dr Raghu, 3 Sep 2026:
-- "Add a column next to No of items saying BOM value (ERP)").
--
-- The ERP's BOM carries total_cost (raw material + operating + scrap),
-- raw_material_cost and operating_cost. All three come across; the column
-- shows total_cost. NULL where the ERP holds nothing — never a defaulted
-- zero on a money column.
--
-- Line comments only. Additive and safe to re-run.

alter table public.material_bom add column if not exists total_cost        numeric;
alter table public.material_bom add column if not exists raw_material_cost numeric;
alter table public.material_bom add column if not exists operating_cost    numeric;
