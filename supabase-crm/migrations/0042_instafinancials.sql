-- CRM 0042 — InstaFinancials on the company (30 Aug 2026)
-- Raghu buys the InstaSummary (75 credits a pull); everyone reads it in the
-- company's IFS tab. The CIN lives on the company once known.
alter table company add column if not exists cin         text;
alter table company add column if not exists ifs_summary jsonb;
alter table company add column if not exists ifs_at      timestamptz;
alter table company add column if not exists ifs_by      text;
