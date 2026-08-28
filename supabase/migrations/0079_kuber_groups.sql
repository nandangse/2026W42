-- 0079: the Tally GROUP TREE, and truthful receivables (Dr Raghu, 28 Aug
-- 2026: "this is really NOT the customer receivables!!").
--
-- The first cut called any debit-balance bill a receivable — which swept in
-- supplier advances, loan-company entries and staff advances (₹17.5 Cr of
-- not-customers). The cure is Tally's own tree: a party is a RECEIVABLE
-- party only if its group chain reaches Sundry Debtors, a PAYABLE party only
-- via Sundry Creditors. This table holds the tree; the ingest walks it.
--
-- Bills now keep their SIGN: positive = owed in the party's own direction,
-- negative = an unadjusted opposite entry (an unallocated receipt, a
-- mis-referenced settlement). The screens net per party and show the
-- unadjusted lump in the open, because hiding it is how a book lies.
--
-- Line comments only. Additive and safe to re-run.

create table if not exists public.kuber_group (
  name   text primary key,
  parent text not null default ''
);

alter table public.kuber_group enable row level security;
drop policy if exists kuber_group_read on public.kuber_group;
create policy kuber_group_read on public.kuber_group
  for select to authenticated
  using (true);
