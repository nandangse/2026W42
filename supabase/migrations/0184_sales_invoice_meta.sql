-- 0184 — THE SALES REGISTER BECOMES A WORKING REGISTER
--
-- Dr Raghu, 30 Sep 2026: "in this we will have edit also. Add the Product
-- Family ... field - Salesman (this will help to know who has to follow it)
-- ... Have the scanned copy of the bill also which they will upload here as
-- the single source of truth! I think if we are able to do this quickly then
-- a lot of double work will eliminate!"
--
-- WHAT TALLY KNOWS IS NOT RE-TYPED HERE.
--
-- The invoice, its date, its party and its amount come from the Tally upload
-- and are rebuilt from scratch every time one lands — nothing written into
-- those may survive, so nothing is written into them. Equally, how much has
-- been RECEIVED against a bill is already in the books, bill by bill. Typing
-- a payment status beside it would create a second truth that drifts from the
-- first, which is the double work he wants to end, not a cure for it.
--
-- So: status, payment received, payment date and days pending are COMPUTED
-- from the books and shown in his columns. This table holds only the things
-- Tally cannot know — which product family it was, whose customer it is, the
-- scan of the bill itself, and an override for the rare case where the books
-- are wrong and somebody has to say so out loud.

create table if not exists sales_invoice_meta (
  bill        text primary key,              -- the invoice number, as Tally spells it
  party       text,                          -- snapshot; the invoice is the key, this is for reading
  fam         text,                          -- product family — the Jobmaster's own list
  salesman    text,                          -- who follows it up
  -- an override, used only when the books are wrong. Null means "the books
  -- are right", which is the case Genie expects and the one that needs no
  -- upkeep. The screen says which of the two it is showing.
  pay_status  text,                          -- null | unpaid | partial | paid
  paid_on     date,
  paid_amount numeric,
  note        text,
  scan_path   text,                          -- bill-scans/<bill>.<ext>
  scan_name   text,
  scan_at     timestamptz,
  by_email    text,
  at          timestamptz not null default now()
);

create index if not exists sales_invoice_meta_fam on sales_invoice_meta (fam);
create index if not exists sales_invoice_meta_sales on sales_invoice_meta (salesman);
create index if not exists sales_invoice_meta_party on sales_invoice_meta (party);

alter table sales_invoice_meta enable row level security;
revoke all on sales_invoice_meta from public, anon;

-- The scans. Private: a customer invoice is not a public document, and the
-- app hands out signed links rather than a bucket anybody can walk.
insert into storage.buckets (id, name, public)
values ('bill-scans', 'bill-scans', false)
on conflict (id) do nothing;
