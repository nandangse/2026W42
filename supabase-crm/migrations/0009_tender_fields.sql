-- ============================================================================
-- NANDAN CRM — 0009 — THE TENDER, UNFOLDED
-- Dr Raghu, 26 Aug 2026: ticking Is Tender opens the tender's own fields —
-- the set the ERP carried, back in one place: reference, source and link,
-- the issued/due/submission dates, the Drive doors, suitability, the
-- project's type and value band, involvement, delivery period, details.
--
-- Additive. Run AFTER 0008. Idempotent — safe to re-run.
-- ============================================================================

alter table opportunity add column if not exists tender_support        text;      -- Type of Support for Closing
alter table opportunity add column if not exists tender_reference      text;
alter table opportunity add column if not exists tender_source         text;
alter table opportunity add column if not exists tender_source_link    text;
alter table opportunity add column if not exists tender_issued_on      date;      -- Date issued tender
alter table opportunity add column if not exists tender_due_on         date;      -- Due date of tender
alter table opportunity add column if not exists tender_submission     text;      -- Tender submission
alter table opportunity add column if not exists tender_doc_url        text;      -- Drive: tender documents
alter table opportunity add column if not exists tender_prep_folder    text;      -- Drive: preparation folder
alter table opportunity add column if not exists product_suitability_pct smallint default 50
  check (product_suitability_pct is null or (product_suitability_pct between 0 and 100));
alter table opportunity add column if not exists tender_timeframe      text;      -- Time Frame of Tender Submission
alter table opportunity add column if not exists project_type          text;      -- Type of the Project
alter table opportunity add column if not exists tender_involvement    text;
alter table opportunity add column if not exists project_value_band    text;      -- Value of the Project
alter table opportunity add column if not exists delivery_period       text;      -- Deliver Period
alter table opportunity add column if not exists tender_details        text;

create index if not exists opp_tender_due_idx on opportunity (tender_due_on)
  where is_tender = true;

-- ---------------------------------------------------------------------------
-- Fix from 0007 (Bernie's error, caught 26 Aug): the person key was created
-- as a PARTIAL unique index, which Postgres refuses to use for upserts. A
-- full unique index allows many NULLs anyway, so the WHERE clause bought
-- nothing and broke ON CONFLICT. Replaced here.
-- ---------------------------------------------------------------------------
drop index if exists person_erp_name_uq;
create unique index if not exists person_erp_name_uq on person (erp_name);
