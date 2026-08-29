-- 0096: the FINALISED DISCUSSION on the appraisal (Dr Raghu, 29 Aug 2026):
-- date, attendees, link, the MoM, and the Note from Raghu — kept on record;
-- the note travels into the IDP letter when that is built.
--
-- Line comments only. Safe to re-run.

alter table public.hrms_appraisal add column if not exists discussion jsonb;
