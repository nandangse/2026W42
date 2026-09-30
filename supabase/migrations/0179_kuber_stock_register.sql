-- 0179_kuber_stock_register.sql
--
-- THE MONTH-END STOCK REGISTER.
--
-- Dr Raghu, 30 Sep 2026: "make the stock entry here. Opening stock as of
-- 1/4/2026, then April 30 <>, May 31 <> etc. This will help me understand
-- better. No entries put inside in line."
--
-- WHAT WAS WRONG WITH THE TWO TYPED BOXES. kuber_mis_input holds exactly two
-- numbers -- opening_stock and closing_stock -- with no date on either. So
-- the same closing figure was used whether the P&L was drawn to 30 April or
-- to 30 September, and the gross profit of every period in between was struck
-- against a stock value belonging to none of them. Two boxes cannot describe
-- six month-ends.
--
-- AND THE BOXES WERE IN THE STATEMENT ITSELF, which is the other half of his
-- instruction. A figure somebody types is an input; a statement is an output.
-- Typing into a line of the P&L invites a number being changed to make the
-- statement read better, which is the opposite of what a statement is for.
-- The register is its own screen; the P&L reads from it.
--
-- HOW THE P&L PICKS ITS TWO NUMBERS. For a period ending on date D:
--   opening = the value at the financial year's first day
--   closing = the LATEST entry on or before D
-- So a P&L to 31 May uses the 31 May stock, and one to 30 September uses the
-- 30 September stock, with no re-typing. A month with no entry falls back to
-- the last one that has a figure, and the screen says which date it used --
-- an assumed stock value that does not announce itself is how a gross profit
-- quietly becomes fiction.
--
-- WHY IT IS ONE VALUE A MONTH AND NOT A STOCK SHEET. Suresh values the stock
-- once a month; Genie needs the number, not the workings. The note column is
-- there for how it was arrived at.
--
-- ASCII only, additive, safe to re-run.

create table if not exists public.kuber_stock (
  as_on   date primary key,
  amount  numeric not null default 0,
  note    text,
  by      text,
  at      timestamptz not null default now()
);

comment on table public.kuber_stock is
  'Stock in hand at a date -- the opening at 1 April and one entry per month end. '
  'The P&L reads its opening and closing from here; nothing is typed into the statement itself.';
comment on column public.kuber_stock.as_on is
  'The date the value is AS AT: 2026-04-01 for the opening, then each month end.';

alter table public.kuber_stock enable row level security;
drop policy if exists kuber_stock_read on public.kuber_stock;
create policy kuber_stock_read on public.kuber_stock
  for select to authenticated using (true);

-- Carry the opening figure that was already typed, so nothing is lost and
-- nobody re-keys it. The typed CLOSING is deliberately NOT carried: it had no
-- date, so there is no honest date to give it, and a guessed month-end would
-- be worse than an empty row somebody fills in.
insert into public.kuber_stock (as_on, amount, note, by)
select '2026-04-01'::date, value, 'carried from the typed Opening Stock when the register was created (0179)', by
from public.kuber_mis_input
where key = 'opening_stock' and value is not null and value <> 0
on conflict (as_on) do nothing;
