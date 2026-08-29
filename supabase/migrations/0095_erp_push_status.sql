-- 0095: the corrections queue learns its FATE (Dr Raghu, 29 Aug 2026):
-- each line now records whether the API push PUSHED it, the ERP REJECTED it
-- (with the ERP's own words), or the job was NOT FOUND there — and who
-- pressed the button, when. The screen filters on exactly this.
--
-- Line comments only. Safe to re-run.

alter table public.erp_update add column if not exists push_status text;
alter table public.erp_update add column if not exists push_error  text;
alter table public.erp_update add column if not exists pushed_at   timestamptz;
alter table public.erp_update add column if not exists pushed_by   text;
