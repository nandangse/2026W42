-- 0094: two new instruments (Dr Raghu, 28 Aug 2026): BOUNCED CHEQUES and
-- PAYMENTS TO RELEASE — the queue of cheques that came back and the queue of
-- payments cleared to go out. Bank Reconciliation joins when the statement
-- data does; these two are typed registers like the BGs.
--
-- Line comments only. Safe to re-run.

create table if not exists public.kuber_bounce (
  id        uuid primary key default gen_random_uuid(),
  date      date,
  party     text not null default '',
  cheque_no text not null default '',
  bank      text not null default '',
  amount    numeric not null default 0,
  reason    text not null default '',
  status    text not null default 'received back',
  note      text not null default '',
  by        text,
  at        timestamptz not null default now()
);

create table if not exists public.kuber_release (
  id          uuid primary key default gen_random_uuid(),
  party       text not null default '',
  amount      numeric not null default 0,
  purpose     text not null default '',
  approved_by text not null default '',
  release_on  date,
  status      text not null default 'waiting',
  note        text not null default '',
  by          text,
  at          timestamptz not null default now()
);

alter table public.kuber_bounce enable row level security;
alter table public.kuber_release enable row level security;
drop policy if exists kuber_bounce_read on public.kuber_bounce;
create policy kuber_bounce_read on public.kuber_bounce
  for select to authenticated using (true);
drop policy if exists kuber_release_read on public.kuber_release;
create policy kuber_release_read on public.kuber_release
  for select to authenticated using (true);

-- Writes go through /api/kuber/register with the service key, behind the
-- Kuber grant.
