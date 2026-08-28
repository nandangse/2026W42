-- 0074_task_files_provenance.sql
--
-- Two asks from Dr Raghu, 28 Aug 2026:
--
-- 1. The task lightbox must say who raised the task and WHEN. created_by has
--    been there since 0003; the clock has not. Old rows stay honestly blank —
--    inventing a created_at for them would be a lie the lightbox repeats
--    forever.
--
-- 2. A task can carry a photo or a file. Same arrangement as job_photo
--    (0042): the object lives in a private bucket, the table holds a path
--    and who put it there. And the same standing intention: these mirror to
--    the Google Drive folders ("Photos from Genie" / "Files from Genie")
--    by the sync script on the Mac that mounts the Drive — the row keeps
--    drive_synced_at so the script knows what it has already carried over.
--
-- Additive and safe to re-run.

alter table public.manual_tasks add column if not exists created_at timestamptz default now();
-- New rows stamp themselves; rows from before today have no honest answer.

create table if not exists public.task_file (
  id        uuid primary key default gen_random_uuid(),
  task_id   text not null,
  task_kind text not null check (task_kind in ('erp', 'manual')),
  name      text not null,
  path      text not null,
  mime      text,
  bytes     bigint,
  /** True when the mime says image/* — the Drive sync routes photos and files
      to their two different folders on this flag. */
  is_photo  boolean not null default false,
  by        text,
  at        timestamptz not null default now(),
  /** Stamped by the Drive sync script once the copy is in the Drive folder. */
  drive_synced_at timestamptz
);

comment on table public.task_file is
  'Photos and files attached to a task. Objects live in the task-files bucket; the Drive sync mirrors them to "Photos from Genie" / "Files from Genie".';

create index if not exists task_file_task_idx on public.task_file (task_kind, task_id, at desc);
create index if not exists task_file_unsynced_idx on public.task_file (drive_synced_at) where drive_synced_at is null;

alter table public.task_file enable row level security;

drop policy if exists task_file_read on public.task_file;
create policy task_file_read on public.task_file
  for select to authenticated
  using (true);

-- Writes go through /api/task-file with the service key, which checks the
-- caller and removes an object whose row failed to save.

insert into storage.buckets (id, name, public)
values ('task-files', 'task-files', false)
on conflict (id) do nothing;

-- Job photos ride the same Drive sync (their migration 0042 promised the move
-- to Drive would be a copy plus one column — this is the column).
alter table public.job_photo add column if not exists drive_synced_at timestamptz;
create index if not exists job_photo_unsynced_idx on public.job_photo (drive_synced_at) where drive_synced_at is null;
