-- 0086: the PLAYBOOKS (Dr Raghu, 28 Aug 2026): "I will add many documents,
-- it will then make a playbook like a Wiki through the claude… You will act
-- as a categoriser and make the document with a version number as Nandan
-- Design Playbook v 1.1.1."
--
-- Five books, one per module: Design, Sales, Operations, Finance, HR. Each
-- carries its Drive folder, its compiled wiki and its version; every piece
-- of intelligence added is a row, pending until a compile takes it in —
-- by hand from the screen, or by the midnight cron.
--
-- Line comments only (Postgres nests /* */). Safe to re-run.

create table if not exists public.playbook (
  kind        text primary key,
  title       text not null,
  folder_id   text not null default '',
  version     text not null default '1.0.0',
  content     text not null default '',
  compiled_at timestamptz,
  by          text,
  at          timestamptz not null default now()
);

create table if not exists public.playbook_doc (
  id       uuid primary key default gen_random_uuid(),
  kind     text not null references public.playbook (kind) on delete cascade,
  title    text not null,
  category text not null default '',
  link     text not null default '',
  extract  text not null default '',
  status   text not null default 'pending' check (status in ('pending', 'compiled')),
  by       text,
  at       timestamptz not null default now()
);
create index if not exists playbook_doc_kind_idx on public.playbook_doc (kind, status);

-- The five books, with the Drive folders Dr Raghu linked (28 Aug 2026).
-- Finance and HR folders follow when he sends their links — settable from
-- the screen.
insert into public.playbook (kind, title, folder_id) values
  ('design',     'Nandan Design Playbook',     '1LY-NSTH3u443kUP88xNsM8RFO6YLONuR'),
  ('sales',      'Nandan Sales Playbook',      '11V3Xa0hvuwBTqdgTf4NweOZol9gxUWk5'),
  ('operations', 'Nandan Operations Playbook', '1kxLWui6qhBop--_-As0CeeCzguQSk0CP'),
  ('finance',    'Nandan Finance Playbook',    ''),
  ('hr',         'Nandan HR Playbook',         '')
on conflict (kind) do nothing;

alter table public.playbook enable row level security;
alter table public.playbook_doc enable row level security;
drop policy if exists playbook_read on public.playbook;
create policy playbook_read on public.playbook for select to authenticated using (true);
drop policy if exists playbook_doc_read on public.playbook_doc;
create policy playbook_doc_read on public.playbook_doc for select to authenticated using (true);

-- Writes go through /api/playbook with the service key, behind Genie's login.
