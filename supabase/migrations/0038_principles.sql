-- 0038_principles.sql
--
-- The principles the company is run on, in one place everybody can open.
--
-- WHY A TABLE AND NOT A PAGE OF TEXT IN THE CODE
--
-- A principle hard-coded in a React file can only be changed by a deploy, so
-- it never gets changed -- and a list of principles nobody has edited in a
-- year is a list nobody is using. These are Dr Raghu's to write and rewrite
-- from the screen.
--
-- Only the owner may write them, for the same reason the FY targets are his
-- alone: a principle the board can edit is not a principle. Everybody signed
-- in reads them.
--
-- Seeded with nothing. An empty page that says "none written yet" is honest;
-- a page seeded with plausible-sounding management copy would put words in
-- his mouth that the whole company would then read as his.
--
-- Additive and safe to re-run.

create table if not exists public.principles (
  id         uuid primary key default gen_random_uuid(),
  /** Display order. Gaps are fine -- reordering rewrites these. */
  ord        integer not null default 0,
  title      text not null,
  /** The explanation. A principle without one is a slogan. */
  body       text not null default '',
  active     boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  constraint principles_title_len check (length(btrim(title)) >= 3)
);

comment on table public.principles is
  'How the company is run, in Dr Raghu''s words. Owner writes, everybody reads.';

create index if not exists principles_ord_idx on public.principles (active, ord);

alter table public.principles enable row level security;

drop policy if exists principles_read on public.principles;
create policy principles_read on public.principles
  for select to authenticated
  using (true);

-- Only the owner. Same helper the goals tier and the FY targets use.
drop policy if exists principles_write on public.principles;
create policy principles_write on public.principles
  for all
  using (coalesce(public.is_owner(), false))
  with check (coalesce(public.is_owner(), false));
