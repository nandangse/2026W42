-- CRM 0041 — the quote SUBMITS (30 Aug 2026)
-- "Submit to Raghu for Review · Submit to Client. On submitting, Edit
--  becomes Amend." The status enum learns 'submitted'; the quote remembers
--  when and by whom.
-- NOTE: run the ALTER TYPE line on its own if your editor wraps statements
-- in a transaction — Postgres wants enum additions outside one.
alter type quotation_status add value if not exists 'submitted';

alter table quotation add column if not exists submitted_at        timestamptz;
alter table quotation add column if not exists submitted_by        text;
alter table quotation add column if not exists review_requested_at timestamptz;
alter table quotation add column if not exists subject             text;
