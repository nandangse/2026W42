-- 0098: RAGHU'S BRIEF on the appraisal cycle row (Dr Raghu, 29 Aug 2026):
-- the AI pointers written before the sit-down — kept, so the interview
-- opens with it and parts of it can travel into the feedback.
--
-- Line comments only. Safe to re-run.

alter table public.hrms_appraisal add column if not exists brief text;
alter table public.hrms_appraisal add column if not exists brief_at timestamptz;
