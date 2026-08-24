-- ============================================================================
-- NANDAN CRM — 0004 — PRODUCT ON THE OPPORTUNITY
-- Dr Raghu, 24 Aug 2026: "put in Products (where the product family can
-- come in)". The ERP's opportunities carried a Product Group — AGSE -
-- Ambulift, MHE- Trollies — that is a FAMILY, not a SKU. The opportunity
-- gets both: the family as text (backfilled from the ERP export), and a
-- link to the real catalogue for when the catalogue is seeded.
--
-- Additive. Run AFTER 0003. Idempotent — safe to re-run.
-- ============================================================================

alter table opportunity add column if not exists product_family text;
alter table opportunity add column if not exists product_id uuid references product(id);
create index if not exists opp_product_idx on opportunity (product_id);
create index if not exists opp_family_idx  on opportunity (product_family);
