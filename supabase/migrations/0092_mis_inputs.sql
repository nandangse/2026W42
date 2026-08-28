-- 0092: the MIS statement's two typed inputs and the ratio targets
-- (Dr Raghu, 28 Aug 2026, from his Statement-of-P&L sheet).
--
-- Opening and closing stock are not in the Tally XML this pipeline reads —
-- they are typed once per period on the P&L screen (his sheet types them
-- too). The Ratio Analysis sheet carries a TARGET beside each ratio; those
-- targets are the CFO's word, typed once and kept.
--
-- Line comments only. Safe to re-run.

create table if not exists public.kuber_mis_input (
  key   text primary key,
  value numeric not null default 0,
  by    text,
  at    timestamptz not null default now()
);

create table if not exists public.kuber_ratio_target (
  key    text primary key,
  target text not null default '',
  by     text,
  at     timestamptz not null default now()
);

alter table public.kuber_mis_input enable row level security;
alter table public.kuber_ratio_target enable row level security;
drop policy if exists kuber_mis_input_read on public.kuber_mis_input;
create policy kuber_mis_input_read on public.kuber_mis_input
  for select to authenticated using (true);
drop policy if exists kuber_ratio_target_read on public.kuber_ratio_target;
create policy kuber_ratio_target_read on public.kuber_ratio_target
  for select to authenticated using (true);

-- Writes go through /api/kuber/books with the service key, behind the
-- Kuber grant.
