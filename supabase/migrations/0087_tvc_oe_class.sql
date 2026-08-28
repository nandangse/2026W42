-- 0087: TVC / OE classification (Dr Raghu, 28 Aug 2026, the TOC cut):
-- "TVC = Truly Variable Cost — RM, process, etc. OE = Operating Expenses —
-- any cost which is NOT a variable cost."
--
-- Every expense ledger is one or the other. Genie seeds a sensible default
-- (Purchase heads and process/job-work/freight-like direct expenses read as
-- TVC, the rest as OE) and this table holds the CFO's own word wherever he
-- flips a ledger — his classification always outranks the default.
--
-- Line comments only. Safe to re-run.

create table if not exists public.kuber_expense_class (
  ledger text primary key,
  cls    text not null check (cls in ('tvc', 'oe')),
  by     text,
  at     timestamptz not null default now()
);

alter table public.kuber_expense_class enable row level security;
drop policy if exists kuber_expense_class_read on public.kuber_expense_class;
create policy kuber_expense_class_read on public.kuber_expense_class
  for select to authenticated using (true);

-- Writes go through /api/kuber/books with the service key, behind the
-- Kuber grant.
