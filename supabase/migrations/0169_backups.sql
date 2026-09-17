/*
  0169 — BACKUPS WE OWN.

  Dr Raghu, 17 Sep 2026: "can we have a backup of the codebase kept as a file
  in Google Drive? Make a cron job that saves the codebase as a single zip.
  This should be for disaster recovery also. Have a place in my admin —
  Backups: Backup Code, Backup Database ... keep this in a way where we can
  see the link and the size. ONLY raghu."

  This has been the oldest open must-have on the register, and it is the one
  that matters most: everything else in Genie can be rebuilt from the code
  and the data. Nothing can rebuild the code and the data.

  IT GOES TO HIS DRIVE, NOT OURS. A backup living in the same account as the
  thing it backs up is not a backup — it is a second copy of the same risk.
  The folder is his, the link is his, and Genie only writes into it.

  WHAT IS RECORDED IS WHAT CAN BE CHECKED: the file's own Drive link, its
  size in bytes, how long it took, and what failed if anything did. A backup
  nobody can see the size of is a backup nobody knows is empty — which is
  exactly how people discover, on the worst day, that it has been writing
  nought bytes for a month.
*/

create table if not exists public.genie_backup (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('code', 'db')),
  at         timestamptz not null default now(),
  by_email   text not null,
  ok         boolean not null default false,
  bytes      bigint,
  files      int,
  seconds    numeric,
  drive_id   text,
  drive_link text,
  name       text,
  note       text,
  error      text
);

create index if not exists genie_backup_recent on public.genie_backup (kind, at desc);

comment on table public.genie_backup is
  'Every backup run: where it landed, how big it was, and what went wrong. A size nobody records is a size nobody checks.';

/* The two folders he nominates, and nothing else about them. */
alter table public.app_settings
  add column if not exists backup_code_folder text,
  add column if not exists backup_db_folder   text;

comment on column public.app_settings.backup_code_folder is
  'Google Drive folder id for the code archives. Taken from a folder link he pastes in Admin.';
