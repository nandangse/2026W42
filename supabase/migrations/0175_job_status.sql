-- 0175_job_status.sql
--
-- THE ERP'S STATUS — the six-value one Genie never stored.
--
-- Dr Raghu, 30 Sep 2026: "sorry not stage - STATUS!!! map these" — and the
-- list is exactly six: Jobs in Process, Partially Delivered, Delivered,
-- Status Quo, Cancelled, Installation Stage.
--
-- THE ERP HAS TWO FIELDS AND GENIE KEPT ONE. `job_status` is the detailed
-- stage -- "S: Order Received", "P: Assembly Fabrication - 75%", twenty-two
-- of them -- and Genie stores it as `stat`. `status` is the six-value
-- classifier, and Genie has only ever used it as a FILTER when talking to
-- the ERP; it was never written down.
--
-- WHICH IS WHY INSTALLATION JOBS WAS EMPTY. The screen had to guess at the
-- classification from `stat` and from the active flag, because the field
-- that actually says it was thrown away on arrival. A job standing at a
-- customer's site is the same job with the same number and the same data;
-- only what matters about it changes. That is a status, and it belongs in a
-- column.
--
-- ASCII only, additive, safe to re-run.

alter table jobs           add column if not exists status text;
alter table delivered_jobs add column if not exists status text;

create index if not exists jobs_status_idx on jobs (status);

comment on column jobs.status is
  'The ERP Jobmaster status: Jobs in Process | Partially Delivered | Delivered | '
  'Status Quo | Cancelled | Installation Stage. The classifier. `stat` holds the '
  'finer job_status stage underneath it.';
