-- ============================================================================
-- NANDAN CRM — 0006 — ENQUIRY INFO ON THE OPPORTUNITY
-- The enquiry as it arrived, in the customer's own words — the ERP carried
-- it and the AI will want it. A big text box on the form.
--
-- Additive. Run AFTER 0005. Idempotent — safe to re-run.
-- ============================================================================

alter table opportunity add column if not exists enquiry_info text;
