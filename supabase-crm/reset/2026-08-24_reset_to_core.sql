-- ============================================================================
-- NANDAN CRM — ONE-TIME RESET — 24 Aug 2026
--
-- Drops everything 0001_crm_foundation.sql created, so 0001_core.sql can
-- rebuild the database on the handover model. Run ONCE, BEFORE 0001_core.sql.
--
-- Why this is allowed to exist: the additive-only rule protects data, and on
-- 24 Aug 2026 this project held none — one profile row and the seed lookups,
-- all of which 0001_core.sql re-creates. Verified before writing this file:
-- customer 0 rows, contact 0, deal 0, crm_audit 0.
--
-- This file must never grow a successor. From 0001_core.sql onward the
-- additive-only rule is absolute.
-- ============================================================================

drop table if exists
  deal_stage_history, deal, contact_phone, contact, address, customer,
  industry, sector, stage, number_series, crm_audit, crm_user
cascade;

drop function if exists deal_stage_log() cascade;
drop function if exists next_number(text) cascade;
drop function if exists crm_touch() cascade;
