-- 0028_quotation_stands_alone.sql  (CRM project)
--
-- A quotation may stand WITHOUT an opportunity (Dr Raghu, 29 Aug 2026:
-- "update the quotations… overwrite and merge"): the ERP's own 2,481
-- dashboard quotations are merging in, and many carry no enquiry link in
-- the ERP either. The add-form still asks for one — this only lets the
-- MERGED rows exist as they truly are.
--
-- Line comments only. Safe to re-run.

alter table quotation alter column opportunity_id drop not null;
