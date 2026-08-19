-- 0039_principle_doc.sql
--
-- Principles, rebuilt. 0038 had this wrong.
--
-- 0038 gave Dr Raghu an empty list and a "+ Add a principle" button, which is
-- not a feature -- it is homework. What he actually wants: he types the thinking
-- roughly, in whatever order it arrives, and Genie organises it into something
-- with a spine that everybody else can read and open up.
--
-- So the unit stored here is not a principle. It is a DOCUMENT: what he typed,
-- and what Genie made of it. Two columns, both kept.
--
--   raw        exactly what he wrote. Never rewritten, never lost.
--   structured what Genie organised it into, as jsonb.
--
-- KEEPING THE RAW TEXT IS THE POINT. The structure is a rendering of his
-- thinking and can be regenerated -- a better model, a clearer prompt, a change
-- of mind about the grouping. The thinking itself cannot be regenerated from
-- the rendering, so it is stored beside it rather than thrown away once it has
-- been tidied.
--
-- VERSIONED, never overwritten. One row is active; the others are what the
-- principles used to say. A principle that was in force last year is part of
-- how last year's decisions were made.
--
-- Additive and safe to re-run.

-- 0038's table never held a row -- it shipped empty by design and this replaces
-- it entirely. Dropped rather than left behind: a table nothing reads is a
-- table somebody wires up by mistake in a year.
drop table if exists public.principles;

create table if not exists public.principle_doc (
  id         uuid primary key default gen_random_uuid(),
  version    integer not null default 1,
  raw        text not null,
  structured jsonb not null default '{}'::jsonb,
  /** Which model organised it, so a change in the output can be explained. */
  model      text,
  active     boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  constraint principle_doc_raw_len check (length(btrim(raw)) >= 20)
);

comment on table public.principle_doc is
  'Dr Raghu''s principles: what he wrote, and what Genie organised it into. Versioned; one active.';

create index if not exists principle_doc_active_idx on public.principle_doc (active, created_at desc);

-- Exactly one active version at a time, enforced rather than remembered.
create unique index if not exists principle_doc_one_active
  on public.principle_doc ((true)) where active;

alter table public.principle_doc enable row level security;

-- Everybody signed in reads the principles. That is the entire point of them.
drop policy if exists principle_doc_read on public.principle_doc;
create policy principle_doc_read on public.principle_doc
  for select to authenticated
  using (true);

-- Only the owner writes. Same rule as the FY targets: a principle the board
-- can edit is not a principle.
drop policy if exists principle_doc_write on public.principle_doc;
create policy principle_doc_write on public.principle_doc
  for all
  using (coalesce(public.is_owner(), false))
  with check (coalesce(public.is_owner(), false));
