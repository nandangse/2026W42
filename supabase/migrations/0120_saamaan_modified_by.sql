-- 0120_saamaan_modified_by.sql
--
-- SAAMAAN — who last touched the project and the BOM (Dr Raghu, 2 Sep
-- 2026: "make a sub unit called Projects. In that put this data for now:
-- Project - Item - Project Name - BOM - Last Modified By - Last Modified
-- On").
--
-- 0119 brought the ERP's `modified` for projects and BOMs but not its
-- `modified_by`. One column on each, filled by the next pull.
--
-- Line comments only. Additive and safe to re-run.

alter table public.material_project add column if not exists erp_modified_by text not null default '';
alter table public.material_bom     add column if not exists erp_modified_by text not null default '';
