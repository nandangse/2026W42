-- 0011: the opportunity's own date (Genie 3.23.1.24)
--
-- The ERP's "Opportunity Date" — the business date the enquiry arrived,
-- distinct from created_at (the system's write time). Carried for all
-- ~22.7k imported opportunities by the 26 Aug backfill; the form dates
-- new ones on save.

alter table opportunity add column if not exists opportunity_on date;
