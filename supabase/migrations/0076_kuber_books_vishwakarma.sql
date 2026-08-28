-- 0076_kuber_books_vishwakarma.sql
--
-- Two births in one file (Dr Raghu, 28 Aug 2026):
--
-- 1. VISHWAKARMA — the design module's door, the same email-keyed grant as
--    every other module. The divine engineer beside the treasurer.
--
-- 2. KUBER'S BOOKS — the tables behind "build Kuber properly":
--    the parsed Tally truth (ledgers, vouchers, lines, bills) plus the
--    registers a CFO keeps OUTSIDE Tally: bank guarantees, fixed deposits,
--    insurance, payment planning, and the manual lines of the 13-week cash
--    flow. Every one of these carries a TIME FRAME column — due, expiry,
--    maturity, plan date — because that is what he asked to see.
--
-- The Tally tables are a SNAPSHOT: each upload wipes and refills them; the
-- books belong to Tally, Kuber reads them. The registers are Kuber's own and
-- are never touched by an upload.
--
-- Line comments only. Additive and safe to re-run.

-- ---------- Vishwakarma's door ----------
create table if not exists vishwakarma_access (
  email      text primary key,
  granted_by text,
  created_at timestamptz not null default now()
);
alter table vishwakarma_access enable row level security;

-- ---------- the parsed Tally truth ----------
create table if not exists public.kuber_ledger (
  id        uuid primary key,
  name      text not null,
  parent    text not null default '',
  opening   numeric not null default 0,
  closing   numeric not null default 0,
  loaded_at timestamptz
);
create index if not exists kuber_ledger_name_idx on public.kuber_ledger (name);
create index if not exists kuber_ledger_parent_idx on public.kuber_ledger (parent);

create table if not exists public.kuber_voucher (
  id        uuid primary key,
  date      date,
  vtype     text not null default '',
  vno       text not null default '',
  party     text not null default '',
  narration text not null default '',
  loaded_at timestamptz
);
create index if not exists kuber_voucher_date_idx on public.kuber_voucher (date desc);
create index if not exists kuber_voucher_party_idx on public.kuber_voucher (party);

create table if not exists public.kuber_voucher_line (
  id         uuid primary key,
  voucher_id uuid not null,
  ledger     text not null,
  amount     numeric not null default 0
);
create index if not exists kuber_vline_voucher_idx on public.kuber_voucher_line (voucher_id);
create index if not exists kuber_vline_ledger_idx on public.kuber_voucher_line (ledger);

-- The raw bill-wise events, kept so the open bills can be rebuilt on the
-- server from first principles after every upload.
create table if not exists public.kuber_opening_bill (
  id          uuid primary key default gen_random_uuid(),
  ledger      text not null,
  bill        text not null,
  bill_date   date,
  amount      numeric not null default 0,
  credit_days integer
);
create index if not exists kuber_obill_ledger_idx on public.kuber_opening_bill (ledger);

create table if not exists public.kuber_bill_alloc (
  id          uuid primary key default gen_random_uuid(),
  voucher_id  uuid,
  ledger      text not null,
  bill        text not null,
  billtype    text not null default '',
  amount      numeric not null default 0,
  credit_days integer,
  date        date
);
create index if not exists kuber_alloc_ledger_idx on public.kuber_bill_alloc (ledger);

-- The computed OPEN bills — what receivables, payables, the report card and
-- the cash flow all read. kind: receivable = they owe us, payable = we owe.
create table if not exists public.kuber_bill (
  id          uuid primary key,
  party       text not null,
  party_group text,
  bill        text not null,
  bill_date   date,
  due_date    date,
  kind        text not null check (kind in ('receivable', 'payable')),
  amount      numeric not null default 0,
  loaded_at   timestamptz
);
create index if not exists kuber_bill_kind_idx on public.kuber_bill (kind, due_date);
create index if not exists kuber_bill_party_idx on public.kuber_bill (party);

-- ---------- the CFO's own registers ----------
create table if not exists public.kuber_bg (
  id            uuid primary key default gen_random_uuid(),
  bg_no         text not null default '',
  bank          text not null default '',
  favouring     text not null default '',
  purpose       text not null default '',
  amount        numeric not null default 0,
  margin_amount numeric,
  issue_date    date,
  expiry_date   date,
  claim_expiry  date,
  status        text not null default 'live' check (status in ('live', 'released', 'expired', 'invoked')),
  note          text not null default '',
  by            text,
  at            timestamptz not null default now()
);
create index if not exists kuber_bg_expiry_idx on public.kuber_bg (expiry_date);

create table if not exists public.kuber_fd (
  id              uuid primary key default gen_random_uuid(),
  fd_no           text not null default '',
  bank            text not null default '',
  principal       numeric not null default 0,
  rate            numeric,
  start_date      date,
  maturity_date   date,
  maturity_amount numeric,
  lien_for        text not null default '',
  status          text not null default 'live' check (status in ('live', 'matured', 'closed')),
  note            text not null default '',
  by              text,
  at              timestamptz not null default now()
);
create index if not exists kuber_fd_maturity_idx on public.kuber_fd (maturity_date);

create table if not exists public.kuber_insurance (
  id          uuid primary key default gen_random_uuid(),
  policy_no   text not null default '',
  insurer     text not null default '',
  policy_type text not null default '',
  covering    text not null default '',
  sum_insured numeric not null default 0,
  premium     numeric,
  start_date  date,
  expiry_date date,
  status      text not null default 'live' check (status in ('live', 'renewed', 'lapsed', 'claimed')),
  note        text not null default '',
  by          text,
  at          timestamptz not null default now()
);
create index if not exists kuber_ins_expiry_idx on public.kuber_insurance (expiry_date);

-- Payment planning: the deliberate list of what WILL be paid and when —
-- feeds the 13-week cash flow and answers "what goes out this week".
create table if not exists public.kuber_payment_plan (
  id        uuid primary key default gen_random_uuid(),
  plan_date date not null,
  party     text not null default '',
  amount    numeric not null default 0,
  purpose   text not null default '',
  bill_ref  text not null default '',
  status    text not null default 'planned' check (status in ('planned', 'approved', 'paid', 'dropped')),
  paid_on   date,
  note      text not null default '',
  by        text,
  at        timestamptz not null default now()
);
create index if not exists kuber_plan_date_idx on public.kuber_payment_plan (plan_date);

-- Manual cash-flow lines: salaries, rent, statutory, EMIs — the flows the
-- bills never show. weekly = repeats every week across the 13-week horizon.
create table if not exists public.kuber_cash_item (
  id        uuid primary key default gen_random_uuid(),
  date      date not null,
  direction text not null check (direction in ('in', 'out')),
  label     text not null default '',
  amount    numeric not null default 0,
  weekly    boolean not null default false,
  note      text not null default '',
  by        text,
  at        timestamptz not null default now()
);
create index if not exists kuber_cash_date_idx on public.kuber_cash_item (date);

-- ---------- one posture for all of them ----------
do $$
declare t text;
begin
  foreach t in array array[
    'kuber_ledger','kuber_voucher','kuber_voucher_line','kuber_opening_bill',
    'kuber_bill_alloc','kuber_bill','kuber_bg','kuber_fd','kuber_insurance',
    'kuber_payment_plan','kuber_cash_item'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
  end loop;
end $$;

-- Writes go through /api/kuber/* with the service key, which checks the
-- caller holds the Kuber grant.
