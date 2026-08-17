-- 0030_material_kitting.sql
--
-- Material Kitting: a checklist line grows a date, an owner, a running note,
-- and the ability to BE a task.
--
-- The question this answers, asked by Dr Raghu: "is it possible for it to be a
-- TASK and a kitting material, since it will have a date? It will prevent a
-- lot of duplication."
--
-- Yes -- but not by making every checklist line a task. Eight lines on a
-- hundred and five jobs is eight hundred and forty tasks, and Tasking would
-- become a bill of materials nobody could read. So:
--
--   THE MATERIAL ROW IS THE RECORD. It carries the date and the owner.
--   A ROW CAN BE PROMOTED to a task when somebody actually has to chase it,
--   and the link is kept in task_id.
--   THE TWO ARE THEN HELD IN STEP, both ways, by the API: receiving the
--   material closes its task, and closing the task receives the material.
--
-- That is what prevents the duplication. Two records that merely LOOK the same
-- are not the problem; two records that drift apart are, and a link plus a
-- mirror is what stops that.
--
-- ASCII only, safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. The new columns
-- ---------------------------------------------------------------------------
alter table public.materials add column if not exists due      date;
alter table public.materials add column if not exists who      text;
alter table public.materials add column if not exists note     text;
alter table public.materials add column if not exists task_id  uuid references public.manual_tasks(id) on delete set null;
alter table public.materials add column if not exists updated_at timestamptz not null default now();

comment on column public.materials.due is
  'Receivable date -- when this item is due in. The thing that makes a kitting '
  'line a task.';
comment on column public.materials.task_id is
  'Set when the line has been promoted to a task. The API mirrors status both '
  'ways, so the two can never drift.';

create index if not exists materials_due_idx on public.materials (due) where due is not null;
create index if not exists materials_task_idx on public.materials (task_id) where task_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Three statuses, not two
-- ---------------------------------------------------------------------------
-- 'Pending' becomes 'Yet to receive' -- the same state, said the way the shop
-- floor says it. Renaming BEFORE the constraint changes, or every existing row
-- fails the new check.
alter table public.materials drop constraint if exists materials_status_check;

update public.materials set status = 'Yet to receive' where status = 'Pending';

alter table public.materials
  add constraint materials_status_check
  check (status in ('Yet to receive', 'Received', 'QC Defective'));

alter table public.materials alter column status set default 'Yet to receive';

-- ---------------------------------------------------------------------------
-- 3. Comments on a kitting line
-- ---------------------------------------------------------------------------
-- Same shape as task_comments (by/at/body), so the two read alike wherever
-- they are shown side by side.
create table if not exists public.material_comment (
  id          uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  by          text,
  at          timestamptz not null default now(),
  body        text not null
);

create index if not exists material_comment_idx on public.material_comment (material_id, at desc);

alter table public.material_comment enable row level security;

drop policy if exists material_comment_read on public.material_comment;
create policy material_comment_read on public.material_comment
  for select to authenticated
  using (true);

comment on table public.material_comment is
  'Comments against one kitting line -- where a delay gets explained, next to '
  'the item it is delaying.';
