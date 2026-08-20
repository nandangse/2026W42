-- 0041_principle_files.sql
--
-- Documents attached to the principles.
--
-- The principles page carries Dr Raghu's thinking as text. Some of it already
-- exists as documents -- Breakthrough 2027, the manifesto, a one-pager somebody
-- has to sign -- and asking him to retype those into the box would lose the
-- formatting, the diagrams and the point.
--
-- NOT IN THE DATABASE. The files go in a Storage bucket, which is object
-- storage billed apart from the database; this table holds a name, a path and
-- a size, all of them small. The same split the voice notes use, for the same
-- reason: rows stay cheap and the objects can be served straight to a browser.
--
-- PRIVATE BUCKET, SIGNED LINKS. These are internal documents about how the
-- company is run. A public bucket would put them on a URL that works for
-- anyone who has it, forever, including after somebody leaves.
--
-- Additive and safe to re-run.

create table if not exists public.principle_file (
  id     uuid primary key default gen_random_uuid(),
  /** The name as uploaded, shown to readers. */
  name   text not null,
  /** A short line saying what it is. Optional -- a good filename often says it. */
  note   text not null default '',
  path   text not null,
  mime   text,
  bytes  bigint,
  ord    integer not null default 0,
  by     text,
  at     timestamptz not null default now(),
  constraint principle_file_name_len check (length(btrim(name)) >= 1)
);

comment on table public.principle_file is
  'Documents shown alongside the principles. The files themselves live in the principle-docs bucket.';

create index if not exists principle_file_ord_idx on public.principle_file (ord, at desc);

alter table public.principle_file enable row level security;

-- Everybody signed in reads the list. A document nobody can open is not a
-- document, and the whole purpose of the page is that the company reads it.
drop policy if exists principle_file_read on public.principle_file;
create policy principle_file_read on public.principle_file
  for select to authenticated
  using (true);

-- Writes go through /api/principles/files with the service key, which checks
-- the caller is the owner. No client-side write policy, so a browser cannot go
-- around that check.

-- The bucket. Private, like the voice notes.
insert into storage.buckets (id, name, public)
values ('principle-docs', 'principle-docs', false)
on conflict (id) do nothing;
