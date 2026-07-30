-- 0009_touch_job_only_on_change.sql
-- Fix: "Last updated" showed the upload time for EVERY job, so it could not
-- tell you which jobs actually changed this morning.
--
-- Cause: apply_jobs carefully bumps updated_at only when a substantive column
-- differs, but its ON CONFLICT DO UPDATE always lists tdd/stat/mgmt in the SET
-- clause — and a `before update of <cols>` trigger fires whenever those columns
-- are assigned, changed or not. The trigger therefore overwrote the timestamp
-- with now() for all 111 rows on every upload.
--
-- Fix: only stamp the row when one of those values genuinely changed. App-side
-- edits (/api/job-field) still stamp correctly, because there the value differs.

create or replace function public.touch_job()
returns trigger language plpgsql as $$
begin
  if new.tdd  is distinct from old.tdd
     or new.stat is distinct from old.stat
     or new.mgmt is distinct from old.mgmt
  then
    new.updated_at = now();
  end if;
  return new;
end;
$$;
