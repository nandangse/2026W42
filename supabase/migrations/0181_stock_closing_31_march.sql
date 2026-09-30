-- 0181_stock_closing_31_march.sql
--
-- THE FIRST ROW IS THE CLOSING OF 31 MARCH, NOT THE OPENING OF 1 APRIL.
--
-- Dr Raghu, 30 Sep 2026: "closing stock of 31st march, then stock of 30th
-- april, etc. suresh will enter this."
--
-- They are the same number and it is not the same instruction. Suresh does
-- not value a stock "as at the opening of 1 April" -- he counts what is on
-- the floor on the last day of March, and that figure closes one year and
-- opens the next. Asking him for the one he actually produces removes a
-- translation step, and a translation step is where a wrong number gets
-- entered confidently.
--
-- Every other row is a month END for the same reason: 30 April, 31 May, and
-- on. One closing after another, which is how a stock register reads in every
-- office in the country.
--
-- The P&L is unaffected: it takes the latest valuation on or before the
-- period's first day as the opening, and 31 March is on or before 1 April.
--
-- ASCII only, safe to re-run.

do $$
declare
  v numeric;
  n text;
  b text;
begin
  if to_regclass('public.kuber_stock') is null then
    raise notice 'kuber_stock is not there yet -- run 0179 first. Nothing was touched.';
    return;
  end if;
  -- Move a seeded 1 April row back one day, unless 31 March already stands.
  if exists (select 1 from public.kuber_stock where as_on = '2026-04-01')
     and not exists (select 1 from public.kuber_stock where as_on = '2026-03-31') then
    select amount, note, by into v, n, b from public.kuber_stock where as_on = '2026-04-01';
    insert into public.kuber_stock (as_on, amount, note, by)
    values ('2026-03-31', v, coalesce(n, '') || ' (re-dated to the 31 March closing by 0181)', b);
    delete from public.kuber_stock where as_on = '2026-04-01';
    raise notice 'stock: the 1 April opening became the 31 March closing.';
  end if;
end $$;
