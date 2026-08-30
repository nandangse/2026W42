-- CRM 0046 — remarks on a consultation (30 Aug 2026)
-- The Conversations done table carries a Remarks column Dr Raghu can type
-- into after reading one.
alter table consult_chat add column if not exists remarks text;
