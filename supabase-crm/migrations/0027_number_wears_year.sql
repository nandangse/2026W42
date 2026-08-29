-- 0027_number_wears_year.sql  (CRM project)
--
-- The number WEARS THE YEAR while never resetting (Dr Raghu, 28 Aug 2026:
-- "It was NGSE/QTN/<year>/No"). Migration 0024 switched the yearly reset
-- off so numbers continue past the largest — but the old function only
-- stamped the year on resetting series, so new quotations came out as
-- NGSE/QTN/34601. Now the label rides along always: NGSE/QTN/26-27/34601,
-- the counter still one unbroken stream.
--
-- Line comments only. Safe to re-run.

create or replace function next_number(p_code text)
returns text language plpgsql as $$
declare
  s   number_series%rowtype;
  lbl text;
  sep text;
begin
  -- '26-27' for any date from Apr 2026 to Mar 2027, reckoned in IST.
  lbl := to_char((now() at time zone 'Asia/Kolkata') - interval '3 months', 'YY')
      || '-'
      || to_char((now() at time zone 'Asia/Kolkata') + interval '9 months', 'YY');

  select * into s from number_series where code = p_code for update;
  if not found then raise exception 'unknown number series: %', p_code; end if;

  if s.reset_yearly and s.fy is distinct from lbl then
    update number_series set current = 1, fy = lbl where id = s.id
      returning current into s.current;
  else
    update number_series set current = current + 1 where id = s.id
      returning current into s.current;
  end if;

  sep := right(s.prefix, 1);
  if sep not in ('/', '-') then sep := '/'; end if;

  -- the year label stands in the string EITHER WAY; only the counter's
  -- behaviour differs between resetting and continuing series.
  return s.prefix || lbl || sep || lpad(s.current::text, s.width, '0');
end $$;
