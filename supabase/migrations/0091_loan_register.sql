-- 0091: the BANKING / LOAN STATUS register (Dr Raghu, 28 Aug 2026, from his
-- Indebtedness Status sheet): every borrowing with its sanction, outstanding,
-- EMI, ROI and tenor — cut his way into Secured–Banks (A), Secured–Others
-- (B), Non-fund/BG (C) and Unsecured (D), Total Debts = A+B+C+D.
--
-- Sanctions, EMIs and ROIs are the bank's paper, not Tally's — so this is a
-- REGISTER like the BGs and FDs, typed once and kept current.
--
-- Line comments only. Safe to re-run.

create table if not exists public.kuber_loan (
  id           uuid primary key default gen_random_uuid(),
  bank         text not null default '',
  loan_ac_no   text not null default '',
  ltype        text not null default '',
  drawn_on     date,
  sanctioned   numeric not null default 0,
  outstanding  numeric not null default 0,
  emi          numeric not null default 0,
  roi          numeric,
  emi_date     text not null default '',
  tenor_months integer,
  upto         date,
  security     text not null default '',
  status       text not null default 'secured - bank',
  note         text not null default '',
  by           text,
  at           timestamptz not null default now()
);

alter table public.kuber_loan enable row level security;
drop policy if exists kuber_loan_read on public.kuber_loan;
create policy kuber_loan_read on public.kuber_loan
  for select to authenticated using (true);

-- Writes go through /api/kuber/register with the service key, behind the
-- Kuber grant.
