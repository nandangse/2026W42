-- 0078: the upload ledger says WHAT WAS TAKEN IN (Dr Raghu, 28 Aug 2026) —
-- "3,632 ledgers · 3,433 opening bills" beside the file, so the row proves
-- not just that a file arrived but that the books actually drank it.
-- Line comments only. Additive and safe to re-run.

alter table public.kuber_upload add column if not exists taken_in text;

-- Backfill: the latest browser upload of each kind gets its sentence from
-- the LIVE tables it filled — the counts are the books' own.
update public.kuber_upload set taken_in =
  (select to_char(count(*), 'FM9,99,99,999') from public.kuber_ledger) || ' ledgers · ' ||
  (select to_char(count(*), 'FM9,99,99,999') from public.kuber_opening_bill) || ' opening bills → ' ||
  (select to_char(count(*), 'FM9,99,99,999') from public.kuber_bill) || ' open bills stand'
where taken_in is null and kind = 'masters' and path like 'browser/%'
  and id = (select id from public.kuber_upload where kind = 'masters' order by at desc limit 1);

update public.kuber_upload set taken_in =
  (select to_char(count(*), 'FM9,99,99,999') from public.kuber_voucher) || ' vouchers · ' ||
  (select to_char(count(*), 'FM9,99,99,999') from public.kuber_voucher_line) || ' lines · ' ||
  (select to_char(count(*), 'FM9,99,99,999') from public.kuber_bill_alloc) || ' bill refs → ' ||
  (select to_char(count(*), 'FM9,99,99,999') from public.kuber_bill) || ' open bills stand'
where taken_in is null and kind = 'transactions' and path like 'browser/%'
  and id = (select id from public.kuber_upload where kind = 'transactions' order by at desc limit 1);
