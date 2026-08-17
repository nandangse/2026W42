-- 0023_escalation_reason.sql
-- An escalation without a reason is just a raised voice.
--
-- Escalating a task moves it in front of a supervisor, a leader or the
-- management group. Whoever it lands on needs to know WHY without having to
-- chase the person who raised it — otherwise the first thing every escalation
-- costs is a phone call.
--
-- Compulsory in the UI whenever a level above None is chosen. Nullable in the
-- schema, because every task raised before today has no reason to give and
-- backfilling one would be inventing it.

alter table public.manual_tasks add column if not exists esc_why text;
alter table public.erp_tasks    add column if not exists esc_why text;

comment on column public.manual_tasks.esc_why is
  'Why this was escalated. Required by the UI when esc is above None.';
comment on column public.erp_tasks.esc_why is
  'Why this was escalated. Required by the UI when esc is above None.';
