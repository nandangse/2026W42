-- ============================================================================
-- NANDAN CRM — 0007 — IMPORT KEYS
-- The 1.5 lakh contacts are coming (Dr Raghu, 25 Aug 2026), and every future
-- upload must UPDATE what it finds rather than duplicate it. That needs the
-- database to hold the natural keys the imports upsert on. The 61 duplicate
-- persons from round one were merged before this file was written.
--
-- Additive. Run AFTER 0006. Idempotent — safe to re-run.
-- ============================================================================

-- The ERP's contact id is the person's natural key.
create unique index if not exists person_erp_name_uq
  on person (erp_name) where erp_name is not null;

-- One row per number per person — re-imports refresh, never multiply.
create unique index if not exists person_phone_uq
  on person_phone (person_id, number_e164);

-- Companies, opportunities, sales orders and interactions already carry
-- unique keys (erp_name / opportunity_no / so_no / erp_name). Nothing else
-- needed — this file exists so the person side catches up.
