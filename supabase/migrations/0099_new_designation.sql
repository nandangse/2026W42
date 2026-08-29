-- 0099: NEW DESIGNATION on the appraisal (Dr Raghu, 29 Aug 2026): defaults
-- to the current one, changed at the desk when the promotion is part of the
-- decision.
--
-- Line comments only. Safe to re-run.

alter table public.hrms_appraisal add column if not exists new_designation text;
