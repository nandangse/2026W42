-- 0075_kuber_uploads.sql
--
-- Kuber's first working screen: the Tally XML uploads (Dr Raghu, 28 Aug 2026).
--
-- Two files a day walk in from Tally — the Masters export and the
-- Transactions export. Each upload is a row here and an object in the
-- kuber-uploads bucket; the Drive sync then carries it into the Tally folder
-- on Google Drive, inside a "date - initials" subfolder, so who uploaded what
-- and when is auditable from the Drive alone, forever.
--
-- Line comments only in this file: 0074 taught us that "image/*" inside a
-- block comment nests in Postgres and never closes.
--
-- Additive and safe to re-run.

create table if not exists public.kuber_upload (
  id        uuid primary key default gen_random_uuid(),
  -- masters = the Tally XML Masters export; transactions = the vouchers.
  kind      text not null check (kind in ('masters', 'transactions')),
  -- The date the export is OF, chosen on the screen — not the upload moment.
  for_date  date not null,
  name      text not null,
  path      text not null,
  bytes     bigint,
  by        text,
  -- The uploader's initials, frozen at upload time — they name the Drive
  -- subfolder ("2026-08-28 - RJ") even if the profile's initials change later.
  initials  text,
  at        timestamptz not null default now(),
  -- Stamped by scripts/drive-sync.mjs once the copy is in the Drive folder.
  drive_synced_at timestamptz
);

comment on table public.kuber_upload is
  'Tally XML uploads (Masters / Transactions). Objects in the kuber-uploads bucket; the Drive sync mirrors them into the Tally folder as date-initials subfolders.';

create index if not exists kuber_upload_date_idx on public.kuber_upload (for_date desc, at desc);
create index if not exists kuber_upload_unsynced_idx on public.kuber_upload (drive_synced_at) where drive_synced_at is null;

alter table public.kuber_upload enable row level security;

drop policy if exists kuber_upload_read on public.kuber_upload;
create policy kuber_upload_read on public.kuber_upload
  for select to authenticated
  using (true);

-- Writes go through /api/kuber/upload with the service key, which checks the
-- caller holds the Kuber grant and removes an object whose row failed to save.

insert into storage.buckets (id, name, public)
values ('kuber-uploads', 'kuber-uploads', false)
on conflict (id) do nothing;
