-- 0033_batch_kind_employees.sql
--
-- The Employee Master upload could not record its batch.
--
-- 0020 widened import_batches.kind to admit 'delivered' when the Delivered
-- Jobs report was added. 0024 added the employee master four migrations later
-- and did not do the same, so every HR upload parsed, applied all 364 rows,
-- and THEN failed on the audit line -- reporting a completed upload as a
-- failure.
--
-- The application-side half of this is in upload-merge.ts: a batch stamp that
-- cannot be written is now a warning on the summary, not an exception. Losing
-- one timestamp is a great deal cheaper than telling somebody their upload
-- failed when the data is already in.
--
-- ASCII only, safe to re-run.

alter table public.import_batches drop constraint if exists import_batches_kind_check;

alter table public.import_batches add constraint import_batches_kind_check
  check (kind in ('jobs', 'projects', 'tasks', 'pre', 'delivered', 'employees'));

comment on constraint import_batches_kind_check on public.import_batches is
  'Every upload kind the Morning Update page can produce. ADD TO THIS whenever '
  'a new card is added, or that card will apply its data and then fail on the '
  'audit row.';
