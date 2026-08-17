-- 0031_erp_update_queue.sql
--
-- The ERP Update queue.
--
-- Genie has always been downstream of the ERP: the morning file arrives and
-- the board is redrawn. Editing a job here has therefore only ever been a note
-- of intent, kept in a JavaScript array that died with the browser tab. That
-- is why "Update to ERP" could show a session's changes and nothing more.
--
-- This makes the queue real, so somebody can take a day's corrections and put
-- them back into the ERP in one pass rather than remembering them.
--
-- Three rules the table exists to enforce:
--
--   ONLY WHAT CHANGED. A row is written when a value actually differs from
--   what was there. Re-typing 40% over 40% queues nothing.
--
--   ONE PENDING ROW PER JOB AND FIELD. Editing the same field three times
--   before an export leaves ONE line carrying the latest value, not three to
--   apply in order. What Pankaj needs is the answer, not the history.
--
--   THE JOB ID LEADS. Every export line starts with it, so a row can be found
--   and overwritten in the ERP without matching on anything softer.
--
-- ASCII only, safe to re-run.

create table if not exists public.erp_update (
  id          uuid primary key default gen_random_uuid(),
  job_id      text not null,
  -- the column as Genie names it (tdd, kit, pct, note, escalation, amt_needed)
  field       text not null,
  -- and as the ERP names it, so the export needs no lookup table
  label       text not null,
  old_value   text,
  new_value   text,
  changed_by  text,
  changed_at  timestamptz not null default now(),
  -- null while it still has to go into the ERP
  exported_at timestamptz,
  exported_by text
);

create index if not exists erp_update_pending_idx
  on public.erp_update (job_id, field) where exported_at is null;
create index if not exists erp_update_changed_idx
  on public.erp_update (changed_at desc);

alter table public.erp_update enable row level security;

-- Everyone signed in can see what is queued -- it is a list of corrections to
-- this company's own data, and hiding it only means two people make the same
-- one. Writing goes through /api/job-field under the service role.
drop policy if exists erp_update_read on public.erp_update;
create policy erp_update_read on public.erp_update
  for select to authenticated
  using (true);

comment on table public.erp_update is
  'Field changes made in Genie that still have to be applied in the ERP. One '
  'pending row per job and field, carrying the latest value; cleared by '
  'marking it exported once it has been uploaded.';
