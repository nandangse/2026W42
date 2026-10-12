-- 0227 — SEVA: SERVICE ORDER (Genie 6.7.0.0)
--
-- Dr Raghu, 12 Oct 2026: "one more submodule called Service Order. When the
-- customer gives a purchase order … tag it to either a quotation, an AMC, a
-- customer, or a job … upload the PDF … make up a line item so that it is
-- split in two parts: spares, service … send to accounts for billing … the
-- quotations can get converted to a service order, because a lot of them come
-- verbally or on WhatsApp … sometimes the PO is given after the work is done,
-- so we don't hold it … in the quotation a button Create a service order …
-- our own numbering starting from NGSE/PO/SER/ … tagged with the customer's
-- PO number and the quotation number … the table shows both amounts … assigned
-- to a manager to execute."

create sequence if not exists public.seva_so_seq start 1;

create table if not exists public.seva_service_order (
  id              uuid primary key default gen_random_uuid(),
  so_no           text not null unique default ('NGSE/PO/SER/' || lpad(nextval('public.seva_so_seq')::text, 4, '0')),
  so_date         date not null default (now() at time zone 'Asia/Kolkata')::date,
  customer        text not null default '',
  -- how the order came: a formal PO, or on the word — verbal, WhatsApp, mail — or a PO to follow after the work
  po_mode         text not null default 'Purchase order' check (po_mode in ('Purchase order','Verbal','WhatsApp','E-mail','PO to follow')),
  customer_po_no  text,
  customer_po_date date,
  quotation       text,          -- NGSE/QTN/…
  amc             text,          -- AMS000…
  job_id          text,
  issue           text,          -- ISS-… when it is a ticket's work
  manager_id      text,          -- the employee number of the manager who executes it
  manager_name    text,
  status          text not null default 'New' check (status in ('New','Executing','Work done','Sent to accounts','Invoiced','Closed','Cancelled')),
  spares_amount   numeric not null default 0,   -- kept equal to the lines by the API
  service_amount  numeric not null default 0,
  notes           text not null default '',
  sent_to_accounts_at timestamptz,
  sent_to_accounts_by text,
  invoice_no      text,
  invoice_date    date,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists seva_so_customer_idx on public.seva_service_order (customer);
create index if not exists seva_so_quotation_idx on public.seva_service_order (quotation);
create index if not exists seva_so_status_idx on public.seva_service_order (status);
alter table public.seva_service_order enable row level security;
revoke all on public.seva_service_order from anon, authenticated;

create table if not exists public.seva_so_line (
  id          uuid primary key default gen_random_uuid(),
  so_id       uuid not null references public.seva_service_order(id) on delete cascade,
  kind        text not null check (kind in ('spares','service')),
  item_code   text,
  description text not null default '',
  qty         numeric not null default 1,
  uom         text,
  rate        numeric not null default 0,
  amount      numeric not null default 0,
  sort        integer not null default 0
);
create index if not exists seva_so_line_so_idx on public.seva_so_line (so_id, sort);
alter table public.seva_so_line enable row level security;
revoke all on public.seva_so_line from anon, authenticated;

create table if not exists public.seva_so_file (
  id          uuid primary key default gen_random_uuid(),
  so_id       uuid not null references public.seva_service_order(id) on delete cascade,
  kind        text not null default 'Purchase order',   -- Purchase order, WhatsApp / mail, Work report, Other
  name        text not null,
  mime        text,
  bytes       integer,
  path        text not null,      -- private bucket seva-orders
  uploaded_by text,
  uploaded_at timestamptz not null default now()
);
create index if not exists seva_so_file_so_idx on public.seva_so_file (so_id);
alter table public.seva_so_file enable row level security;
revoke all on public.seva_so_file from anon, authenticated;
insert into storage.buckets (id, name, public) values ('seva-orders', 'seva-orders', false) on conflict (id) do nothing;

-- what happened to it, in order
create table if not exists public.seva_so_log (
  id      uuid primary key default gen_random_uuid(),
  so_id   uuid not null references public.seva_service_order(id) on delete cascade,
  body    text not null,
  by      text,
  at      timestamptz not null default now()
);
create index if not exists seva_so_log_so_idx on public.seva_so_log (so_id, at desc);
alter table public.seva_so_log enable row level security;
revoke all on public.seva_so_log from anon, authenticated;

insert into public.feature_request (title, body, want, status, note, by)
select 'Seva — Service Order: NGSE/PO/SER numbering, tagged to quotation / AMC / customer / job, spares and service, send to accounts for billing', '<p>"Make one more submodule called Service Order … tag it to a quotation, an AMC, a customer, or a job … upload the PDF … split in two parts, spares and service … Send to accounts for billing … in the quotation a button Create a service order … numbering from NGSE/PO/SER/ … assigned to a particular manager." (Dr Raghu, 12 Oct 2026.)</p>', 'must', 'done', 'Shipped as Genie 6.7.0.0.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title like 'Seva — Service Order:%');

insert into public.genie_migration (name) values ('0227_seva_service_order') on conflict (name) do nothing;
