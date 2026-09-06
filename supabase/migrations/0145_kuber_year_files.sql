-- 0145_kuber_year_files.sql — Genie 5.0.1.3 (6 Sep 2026)
--
-- Dr Raghu: "in Kuber uploads, make a year wise upload too. Year - XML
-- Masters - XML Transactions - Audited Financials - GST reports. For this
-- year, keep adding month wise, so latest is to be taken. Suresh and me can
-- upload. 2025-26, 2024-25 etc upto 2005. This will help to get more data
-- as needed for review."
--
-- One row per file. The file itself sits on Google Drive under the linked
-- Tally folder, in a subfolder named for the year; this table is the
-- register: which year, which kind, which month (current year only), who,
-- when, and the Drive link. The latest row per (fy, kind[, month]) is the
-- one the grid shows; earlier ones stay as history.

create table if not exists public.kuber_year_file (
  id uuid primary key default gen_random_uuid(),
  fy text not null,                       -- '2025-26'
  month int check (month between 1 and 12), -- only for the running year
  kind text not null check (kind in ('masters','transactions','audited','gst')),
  name text not null,
  bytes bigint,
  drive_id text,
  drive_link text,
  note text,
  by_email text not null,
  initials text,
  at timestamptz not null default now()
);
create index if not exists kuber_year_file_fy_idx on public.kuber_year_file (fy, kind, at desc);
alter table public.kuber_year_file enable row level security;
revoke all on public.kuber_year_file from anon, authenticated;

-- ledger (0143): this migration records itself, whichever runs first
create table if not exists public.genie_migration (name text primary key, applied_at timestamptz not null default now());
insert into public.genie_migration (name) values ('0145_kuber_year_files') on conflict (name) do nothing;
