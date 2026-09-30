-- 0178_kuber_year_scope.sql
--
-- KUBER LEARNS WHICH YEAR A ROW BELONGS TO.
--
-- Dr Raghu, 30 Sep 2026, on loading the 2025-26 Tally export: "yes do that.
-- it may be necessary."
--
-- WHY IT IS NECESSARY. The loader opens with a full reset -- it deletes every
-- Kuber table and then fills it. That is right for one year and catastrophic
-- for two: uploading 2025-26 today would DELETE 2026-27 rather than sit
-- beside it, and the first anyone would know is a board report with half a
-- year missing. The books have no column that says which year a voucher is
-- from, so the loader has no way to clear less than everything.
--
-- WHAT THIS ADDS. One `fy` column, spelled the way the year-file register
-- already spells it -- "2025-26", "2026-27". Every existing row is stamped
-- 2026-27, because that is the only year in the books today: the vouchers run
-- 1 April to 26 September 2026 and nothing else has ever been loaded.
--
-- WHAT IT DELIBERATELY DOES NOT SCOPE.
--
--   kuber_group -- the group tree is the chart of accounts, not a year's
--   data. It keys on the name and is upserted; a group that existed last year
--   and this is one group.
--
--   kuber_bill -- the OPEN bills. These are rebuilt from first principles
--   after every load and are a position, not a period: a bill raised in
--   March 2026 and paid in July 2026 is one bill crossing two years, and
--   scoping it would split it in half. It keeps an `fy` only to record which
--   load last rebuilt it.
--
-- THE ARITHMETIC THAT MAKES TWO YEARS CORRECT. When more than one year is
-- loaded, the open position must be rebuilt from the OPENING BILLS OF THE
-- EARLIEST YEAR plus the allocations of EVERY year -- never from each year's
-- own openings, because 2026-27's opening balance already contains what
-- 2025-26 left unsettled. Counting both would double every old bill. That
-- rule lives in /api/kuber/ingest and this comment exists so nobody
-- re-derives it wrongly later.
--
-- ASCII only, additive, safe to re-run.

alter table public.kuber_ledger       add column if not exists fy text;
alter table public.kuber_opening_bill add column if not exists fy text;
alter table public.kuber_voucher      add column if not exists fy text;
alter table public.kuber_voucher_line add column if not exists fy text;
alter table public.kuber_bill_alloc   add column if not exists fy text;
alter table public.kuber_bill         add column if not exists fy text;

do $$
begin
  if to_regclass('public.kuber_voucher_item') is not null then
    execute 'alter table public.kuber_voucher_item add column if not exists fy text';
    execute 'update public.kuber_voucher_item set fy = ''2026-27'' where fy is null';
    execute 'create index if not exists kuber_vitem_fy_idx on public.kuber_voucher_item (fy)';
  end if;
end $$;

-- Everything already in the books is FY 2026-27: 1 April to 26 September 2026.
update public.kuber_ledger       set fy = '2026-27' where fy is null;
update public.kuber_opening_bill set fy = '2026-27' where fy is null;
update public.kuber_voucher      set fy = '2026-27' where fy is null;
update public.kuber_voucher_line set fy = '2026-27' where fy is null;
update public.kuber_bill_alloc   set fy = '2026-27' where fy is null;
update public.kuber_bill         set fy = '2026-27' where fy is null;

create index if not exists kuber_ledger_fy_idx  on public.kuber_ledger (fy);
create index if not exists kuber_obill_fy_idx   on public.kuber_opening_bill (fy);
create index if not exists kuber_voucher_fy_idx on public.kuber_voucher (fy, date desc);
create index if not exists kuber_vline_fy_idx   on public.kuber_voucher_line (fy);
create index if not exists kuber_alloc_fy_idx   on public.kuber_bill_alloc (fy);

comment on column public.kuber_voucher.fy is
  'The financial year this row was loaded under, spelt as the year-file register spells it: 2026-27. '
  'The loader clears and refills ONE year at a time; a row with no fy predates migration 0178.';
comment on column public.kuber_bill.fy is
  'Which load last rebuilt this open bill. kuber_bill is a POSITION across all loaded years, not a '
  'period: a bill raised in one year and settled in the next is one bill, and is never split.';
