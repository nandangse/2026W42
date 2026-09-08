-- 0158 — the RBOM as a document of its own (Dr Raghu, 8 Sep 2026:
-- "RBOM needs a link of its own ... this link will make it useful").
--
-- Until now an RBOM existed only inside a lightbox: you could read it, but
-- you could not send anybody to it. A thing that cannot be linked to cannot
-- be discussed, and a Real BOM is exactly the thing a project argues about.
-- So it gets an address, /saamaan/rbom/<no>, and the two things a document
-- needs to be worked on: a conversation, and a release.
--
-- Safe to run twice.

-- ── the conversation ──
-- "Make this like comments. Adding to this will make one by one like
-- comments." So: append-only, one row per remark, never an edited field.
-- A remark against a particular line carries item_code; a remark about the
-- whole RBOM leaves it null.
create table if not exists public.material_rbom_remark (
  id         uuid primary key default gen_random_uuid(),
  rbom_id    text not null,
  item_code  text,                       -- null = about the whole RBOM
  body       text not null,
  by_email   text,
  by_name    text,
  at         timestamptz not null default now()
);
create index if not exists material_rbom_remark_rbom_idx on public.material_rbom_remark (rbom_id, at desc);

-- ── the release ──
-- Release is an event, not a flag: who released it, when, at which revision,
-- and who was told. Kept on the header so the page can say "released today"
-- without recomputing it from the lines.
alter table if exists public.material_rbom
  add column if not exists status        text default 'Draft',
  add column if not exists rev           text,
  add column if not exists released_at   timestamptz,
  add column if not exists released_by   text,
  add column if not exists released_to   jsonb;      -- the addresses the notice went to

comment on column public.material_rbom.status is
  'Draft · WIP · Released. WIP is the middle state he asked for — work has started on it but it is not yet the thing anyone may order against.';
comment on column public.material_rbom_remark.item_code is
  'The line this remark is about, or null when it is about the whole RBOM. Remarks are append-only — a thread, not a field.';

-- WIP joins Draft and Released as a value a line may carry. No constraint is
-- added: the column has always been free text and the three values are a
-- convention the screen enforces, not the database.

alter table public.material_rbom_remark enable row level security;
revoke all on public.material_rbom_remark from public, anon, authenticated;

create table if not exists public.genie_migration (name text primary key, at timestamptz default now());
insert into public.genie_migration (name) values ('0158_rbom_page') on conflict (name) do nothing;

notify pgrst, 'reload schema';

select 'remarks' as t, count(*) from public.material_rbom_remark
union all
select 'rboms', count(*) from public.material_rbom;
