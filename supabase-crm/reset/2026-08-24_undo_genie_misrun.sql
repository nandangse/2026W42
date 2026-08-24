-- ============================================================================
-- ⚠ RUN THIS ON THE **GENIE** PROJECT — kpcwgsgqzhfajjhapvlf — AND ONLY THERE.
--
-- On 24 Aug 2026 the CRM's reset + 0001_core + 0002_sales_settings were run
-- against the Genie project by mistake. Verified before writing this file:
-- none of these names existed in Genie before the mis-run (no Genie migration
-- defines them), and every one of these tables holds only the CRM seed rows
-- (profile 1, sector 7, stage 14, number_series 3, all others 0). Nothing of
-- Genie's was dropped by the mis-run, because the reset's drop list matched
-- nothing that existed.
--
-- This file removes everything the mis-run created. It names each object
-- explicitly — no wildcard, so it cannot reach anything else.
-- ============================================================================

drop view if exists v_mailbox_safe, v_owner_concentration, v_funnel, v_response_sla;

drop table if exists
  whatsapp_agent, whatsapp_config, mailbox,
  activity, attachment, record_link, note, task,
  call_log, ai_draft, message, channel_account,
  amc_contract_unit, amc_contract, installed_unit,
  quotation_line, quotation, terms_template,
  opportunity_stage_history, opportunity,
  product_option, product, lead,
  person_phone, person, address, company,
  crm_audit, industry, sector, stage, number_series, profile
cascade;

drop function if exists rotate_mailbox_credential(uuid, text) cascade;
drop function if exists store_mailbox_credential(text, text) cascade;
drop function if exists recalc_quotation() cascade;
drop function if exists opportunity_stage_log() cascade;
drop function if exists next_number(text) cascade;
drop function if exists crm_touch() cascade;

drop type if exists
  mailbox_status, connection_security,
  unit_status, task_status, direction, channel_type,
  quotation_status, lead_status, lead_source, pipeline_type
cascade;

-- The pgcrypto / pg_trgm / supabase_vault extensions are left alone: enabling
-- them was harmless and Genie may use the first two already.
