-- 0102: DELIVERED TARGETS in the settings (Dr Raghu, 30 Aug 2026): the
-- monthly target the run-rate box measures against — 10 Cr value, 4 Cr
-- throughput to start; editable without a deploy once the column exists.
--
-- Line comments only. Safe to re-run.

alter table public.app_settings add column if not exists delivered_targets jsonb;
update public.app_settings
  set delivered_targets = '{"value_cr": 10, "tp_cr": 4}'::jsonb
  where id = true and delivered_targets is null;
