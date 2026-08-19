-- 0036_escalation_closeout.sql
--
-- Closing an escalated task now costs a sentence: what is being done so it
-- does not happen again.
--
-- Decided by Dr Raghu, for ALL THREE LEVELS -- L1, L2 and L3 alike. The point
-- is not the paperwork, it is that an escalation which is expensive to close
-- is an escalation people think twice about raising. A record of causes is the
-- second benefit, not the first.
--
-- WHY A TABLE RATHER THAN A COLUMN
--
-- A column on manual_tasks and another on erp_tasks would be two columns to
-- keep in step, and the ERP ones are wiped and re-created by every ToDo
-- upload -- the note would vanish with the row it lived on. This table is
-- keyed by (task_id, task_kind) and outlives both.
--
-- COMPULSORY IS ENFORCED HERE, NOT ONLY IN THE FORM
--
-- The length check is what makes "compulsory" true. A required field in React
-- is a suggestion the moment anything writes around it, and this is exactly
-- the field somebody will want to skip at six o'clock. Fifteen characters is
-- deliberately low: it stops "ok" and "done" without turning a genuine short
-- answer -- "added to QC checklist" -- into a fight with the form.
--
-- Additive and safe to re-run.

create table if not exists public.task_closeout (
  id         uuid primary key default gen_random_uuid(),
  task_id    text not null,
  task_kind  text not null check (task_kind in ('erp', 'manual')),
  /** The level it carried when it was closed, frozen -- the task's own esc
      can be edited afterwards, and this has to stay the reason it was asked
      for. */
  esc        text,
  body       text not null,
  by         text,
  at         timestamptz not null default now(),
  constraint task_closeout_body_len check (length(btrim(body)) >= 15),
  constraint task_closeout_once unique (task_id, task_kind)
);

comment on table public.task_closeout is
  'Why an escalated task will not recur. Required to close one, at every level.';

create index if not exists task_closeout_at_idx on public.task_closeout (at desc);

alter table public.task_closeout enable row level security;

-- Everyone signed in reads them: the whole value is that the answers are
-- visible on the Escalations table, not filed somewhere.
drop policy if exists task_closeout_read on public.task_closeout;
create policy task_closeout_read on public.task_closeout
  for select to authenticated
  using (true);

-- Writes go through /api/tasks with the service key, which is what checks that
-- the task is actually escalated and actually being closed. No client-side
-- insert policy, so nothing can write a close-out without going past that.
