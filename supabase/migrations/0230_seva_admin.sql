-- 0230 — SEVA ADMIN: EXPENSE CLAIM, OD SLIP, TICKET BOOKING, PAYMENT TO TEAM — paid in Kuber, read back here (Genie 6.9.0.0)
--
-- Dr Raghu, 12 Oct 2026: "Make another section, which is going to be Admin …
-- Expense claim, OD slip, Ticket booking, Payment to team. Whatever they are
-- doing in the Google Sheet should come here. Aakash can put in his person's
-- name, date, amount, and what it is related to — an AMC, a job, a customer …
-- they send it from here. It will go directly in to Kuber to Suresh's team …
-- once they approve it, automatically the feedback will be done out here, so
-- by default it will only show whatever is pending to be paid out. They can go
-- back and audit whatever has been paid and when. The service team will not
-- log on to Kuber, and the accounts team does not need to log on to Seva."
-- And: "up to 31st October we will make sure it all gets tallied. From 1st
-- November there will be an opening balance, and from there the ledger … the
-- service person can see it himself, the service manager can see it."

create sequence if not exists public.seva_admin_seq start 1;

create table if not exists public.seva_admin_entry (
  id            uuid primary key default gen_random_uuid(),
  no            text not null unique default ('SAD-' || lpad(nextval('public.seva_admin_seq')::text, 5, '0')),
  kind          text not null check (kind in ('expense','od','ticket','payment')),
  employee_id   text not null,
  person_name   text not null default '',
  on_date       date not null,
  amount        numeric not null default 0,
  related_kind  text check (related_kind in ('AMC','Job','Customer','Ticket','Service order','Other')),
  related_ref   text,          -- AMS…, the job number, ISS…, NGSE/PO/SER/…
  customer      text,
  description   text not null default '',
  from_place    text,          -- OD slip and ticket booking
  to_place      text,
  travel_mode   text,          -- ticket booking: Train, Bus, Flight, Cab …
  return_on     date,
  status        text not null default 'draft' check (status in ('draft','sent','approved','paid','dropped')),
  plan_id       uuid,          -- the kuber_payment_plan row it became
  paid_on       date,
  sent_at       timestamptz,
  sent_by       text,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists seva_admin_emp_idx on public.seva_admin_entry (employee_id, on_date);
create index if not exists seva_admin_status_idx on public.seva_admin_entry (status);
alter table public.seva_admin_entry enable row level security;
revoke all on public.seva_admin_entry from anon, authenticated;

create table if not exists public.seva_admin_file (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references public.seva_admin_entry(id) on delete cascade,
  name        text not null,
  mime        text,
  bytes       integer,
  path        text not null,      -- private bucket seva-admin
  uploaded_by text,
  uploaded_at timestamptz not null default now()
);
create index if not exists seva_admin_file_entry_idx on public.seva_admin_file (entry_id);
alter table public.seva_admin_file enable row level security;
revoke all on public.seva_admin_file from anon, authenticated;
insert into storage.buckets (id, name, public) values ('seva-admin', 'seva-admin', false) on conflict (id) do nothing;

-- the opening balance each service person carries to the ledger (1 Nov 2026 by default)
create table if not exists public.seva_ledger_opening (
  employee_id  text primary key,
  person_name  text not null default '',
  as_of        date not null default '2026-11-01',
  amount       numeric not null default 0,   -- positive: money with the person (advance not yet spent); negative: owed to him
  note         text not null default '',
  updated_by   text,
  updated_at   timestamptz not null default now()
);
alter table public.seva_ledger_opening enable row level security;
revoke all on public.seva_ledger_opening from anon, authenticated;

insert into public.feature_request (title, body, want, status, note, by)
select 'Seva — Admin: expense claim, OD slip, ticket booking, payment to team — paid in Kuber, read back; ledger from 1 Nov', '<p>"Make another section, which is going to be Admin … Expense claim, OD slip, Ticket booking, Payment to team … it will go directly in to Kuber to Suresh''s team … once they approve it, automatically the feedback will be done out here … From 1st November there will be an opening balance, and from there the ledger … the service person can see it himself." (Dr Raghu, 12 Oct 2026.)</p>', 'must', 'done', 'Shipped as Genie 6.9.0.0 — the IDP''s own Travel & Expense, filled by the person, is to be looked at with him.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title like 'Seva — Admin: expense claim%');

insert into public.genie_migration (name) values ('0230_seva_admin') on conflict (name) do nothing;
