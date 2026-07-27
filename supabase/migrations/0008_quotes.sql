-- 0008_quotes.sql
-- Quote of the day. Seeded from the 600-quote workbook and extendable by an
-- admin upload (same sheet shape). App-owned: uploads of ERP data never touch it.

create table if not exists public.quotes (
  id         uuid primary key default gen_random_uuid(),
  body       text not null,
  author     text,                      -- real author, or the house name for originals
  category   text,
  source     text,
  original   boolean not null default false,  -- true = Dr Raghu's own wording
  seq        integer,                   -- stable ordering for the daily cycle
  created_at timestamptz not null default now()
);

-- makes re-uploading the same workbook a no-op
create unique index if not exists quotes_body_key on public.quotes (md5(body));
create index if not exists quotes_seq_idx on public.quotes (seq, created_at);

alter table public.quotes enable row level security;

-- every signed-in user (including the uploader role) may read the daily quote
drop policy if exists quotes_read on public.quotes;
create policy quotes_read on public.quotes
  for select using (auth.uid() is not null);

-- writes are admin-only (the upload route additionally uses the service role)
drop policy if exists quotes_write on public.quotes;
create policy quotes_write on public.quotes
  for all using (public.is_admin())
  with check (public.is_admin());
