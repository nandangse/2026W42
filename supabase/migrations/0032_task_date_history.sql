-- 0032_task_date_history.sql
--
-- A task remembers the date it was FIRST promised, and every move since.
--
-- The problem, seen the moment dragging worked: a task due 11 August was
-- dragged onto the 18th and stopped being late. Nothing recorded that it had
-- ever been late, and nothing recorded that anybody had moved it. Lateness had
-- become a thing you could delete by dragging.
--
-- Goals settled this in 0019 with original_due and push_count -- "carried days
-- and pushes are counted against the date first committed, not the one on
-- screen". Tasks now work the same way:
--
--   ORIGINAL_DUE is the first date ever promised and never changes again.
--   PUSH_COUNT says how many times it has moved.
--   TASK_DATE_LOG says who moved it, when, and from what to what.
--
-- The board reads original_due for lateness. So a task pushed from the 11th to
-- today still reads late, because it is.
--
-- ASCII only, safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. The two columns, on both kinds of task
-- ---------------------------------------------------------------------------
alter table public.manual_tasks add column if not exists original_due date;
alter table public.manual_tasks add column if not exists push_count int not null default 0;
alter table public.erp_tasks    add column if not exists original_due date;
alter table public.erp_tasks    add column if not exists push_count int not null default 0;

-- Everything already on the board is treated as promised on the date it
-- currently carries. That is the only honest reading: nobody recorded a first
-- promise before today, so inventing an earlier one would mark tasks late that
-- nobody ever agreed a date for.
update public.manual_tasks set original_due = due where original_due is null and due is not null;
update public.erp_tasks    set original_due = due where original_due is null and due is not null;

comment on column public.manual_tasks.original_due is
  'The first date ever promised. Never changes. Lateness is measured against '
  'this, not against the date currently on screen.';

create index if not exists manual_tasks_original_due_idx on public.manual_tasks (original_due) where done = false;
create index if not exists erp_tasks_original_due_idx    on public.erp_tasks (original_due) where done = false;

-- ---------------------------------------------------------------------------
-- 2. Every move, logged
-- ---------------------------------------------------------------------------
create table if not exists public.task_date_log (
  id        uuid primary key default gen_random_uuid(),
  task_id   uuid not null,
  -- 'manual' or 'erp'; the two live in different tables and ids can collide
  task_kind text not null check (task_kind in ('manual', 'erp')),
  old_due   date,
  new_due   date,
  by        text,
  at        timestamptz not null default now()
);

create index if not exists task_date_log_task_idx on public.task_date_log (task_kind, task_id, at desc);

alter table public.task_date_log enable row level security;

drop policy if exists task_date_log_read on public.task_date_log;
create policy task_date_log_read on public.task_date_log
  for select to authenticated
  using (true);

comment on table public.task_date_log is
  'Every due-date change on a task: from, to, who and when. Shown beside the '
  'comments, because a date that moved four times is the story of the task.';
