-- 0183 — THE 13-WEEK CASH FLOW, HIS HEADS
--
-- Dr Raghu, 30 Sep 2026, giving the sheet's own twelve heads and where each
-- one is to come from. Three of them had nowhere to live yet.
--
-- WEEKS RUN SUNDAY TO SATURDAY, because his sheet's W40 runs 27/09 to 03/10
-- and 27 September 2026 is a Sunday. Genie was starting weeks on Monday,
-- which put every figure one day out against the sheet he reads.

-- ---------------------------------------------------------------- INFLOW
-- "Advance Payment — from a NEW payment table we will form for the advance
--  from customer. With dates. No connection to ERP. Fully in Genie."
-- It carries the two small heads under it as well: "Bank Loan — he can enter
-- this in the Advance payment as to Bank Loan or inflows" and "Other Income
-- — as to other inflows (could be FD, etc)". One table, three kinds, because
-- they are the same act: somebody expects money in, on a date.
create table if not exists cash_expected (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'advance',   -- advance | bank_loan | other_income
  party       text,
  amount      numeric not null default 0,
  expected_on date not null,
  confidence  text default 'likely',             -- likely | committed | hoped
  note        text,
  received    boolean not null default false,
  received_on date,
  by_email    text,
  at          timestamptz not null default now()
);
create index if not exists cash_expected_on on cash_expected (expected_on);
create index if not exists cash_expected_kind on cash_expected (kind, expected_on);

-- "Follow Up Payment: the delivered items where bills are pending to be paid.
--  we will fix up a date for when the payment can come and also whats the
--  challenge."
-- The bill itself lives in kuber_bill and is rebuilt from Tally on every
-- upload, so nothing may be written there. This holds only what Genie knows
-- and Tally cannot: when we think it will actually come, and why it has not.
-- Until a row exists the bill falls in week one, which is where an overdue
-- rupee belongs.
create table if not exists collection_followup (
  id          uuid primary key default gen_random_uuid(),
  party       text not null,
  bill        text not null,
  expected_on date,
  challenge   text,
  by_email    text,
  at          timestamptz not null default now(),
  unique (party, bill)
);

-- --------------------------------------------------------------- OUTFLOW
-- Salaries & wages, EMI, Statutory, Monthly Regular Expenses and PDC are all
-- Suresh's entries. They already share one table; what they did not have was
-- a head, so five separate lines on his sheet arrived as one lump.
alter table kuber_cash_item add column if not exists head text;
alter table kuber_cash_item add column if not exists party text;
alter table kuber_cash_item add column if not exists cheque_no text;
update kuber_cash_item set head = case when direction = 'in' then 'other_in' else 'regular' end where head is null;
create index if not exists kuber_cash_item_head on kuber_cash_item (head, date);

-- ------------------------------------------------------- OPENING BALANCE
-- "The Opening balance should be the balance at the start of sunday."
-- It is computed from the bank and cash ledgers, but the books are only as
-- fresh as the last Tally upload, and a cash plan drawn on a stale opening
-- is worse than no plan. So it can be stated, and when it is stated it wins
-- and the screen says whose figure it is showing.
create table if not exists cash_opening (
  on_date  date primary key,
  amount   numeric not null,
  note     text,
  by_email text,
  at       timestamptz not null default now()
);

alter table cash_expected       enable row level security;
alter table collection_followup enable row level security;
alter table cash_opening        enable row level security;
revoke all on cash_expected, collection_followup, cash_opening from public, anon;
