-- 0117_job_gst.sql
--
-- GST ON THE JOB (Dr Raghu, 2 Sep 2026: "Make another Field called GST /
-- Balance Due = Value * GST - Advance").
--
-- The rate, as a percentage — 18 for most of what Nandan builds. NULL until
-- somebody says, like every other commercial field: a defaulted 18 on a job
-- that is actually 5, or exempt, is a wrong invoice value forecast with
-- confidence.
alter table public.jobs add column if not exists gst numeric;

comment on column public.jobs.gst is
  'GST rate as a percentage (18 = 18%). Genie''s own; the ERP''s custom_gst_rate is read separately.';
