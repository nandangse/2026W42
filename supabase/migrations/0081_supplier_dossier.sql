-- 0081: the supplier's FULL dossier (Dr Raghu, 28 Aug 2026) — two tables.
--
-- 1. RECO STATUS — the vendor-reconciliation grid from the sheet (its tabs
--    B14/B26/B27): per supplier, per FY, our Tally closing vs the ledger THE
--    SUPPLIER sent, the status in words, and reconciled-upto. The supplier's
--    side of the ledger lives outside Tally, so these rows are typed by
--    hand and never touched by an upload.
--
-- 2. VOUCHER ITEMS — what actually rode each purchase voucher (stock item,
--    quantity, amount), parsed from the Tally transactions' inventory
--    entries. Feeds the Items Supplied analysis on the supplier card.
--    Snapshot like the other kuber_ tables: wiped and refilled per upload.
--
-- Line comments only. Additive and safe to re-run.

create table if not exists public.kuber_supplier_reco (
  id            uuid primary key default gen_random_uuid(),
  party         text not null,
  fy            text not null,
  our_closing   numeric,
  their_closing numeric,
  status        text not null default '',
  upto          date,
  note          text not null default '',
  by            text,
  at            timestamptz not null default now(),
  unique (party, fy)
);
create index if not exists kuber_reco_party_idx on public.kuber_supplier_reco (party);

create table if not exists public.kuber_voucher_item (
  id         uuid primary key default gen_random_uuid(),
  voucher_id uuid not null,
  item       text not null,
  qty        text not null default '',
  amount     numeric not null default 0
);
create index if not exists kuber_vitem_voucher_idx on public.kuber_voucher_item (voucher_id);
create index if not exists kuber_vitem_item_idx on public.kuber_voucher_item (item);

do $$
declare t text;
begin
  foreach t in array array['kuber_supplier_reco','kuber_voucher_item'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
  end loop;
end $$;
