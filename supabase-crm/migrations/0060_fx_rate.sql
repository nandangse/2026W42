-- 0060_fx_rate.sql — the currencies a quote may be written in, and what they
-- are worth (Dr Raghu, 8 Sep 2026: "show the latest foreign exchange rate for
-- USD and euro, and later on we can of course add more currencies also. It
-- will come from the table").
--
-- THE TABLE IS THE LIST. The quote's currency dropdown reads its options from
-- here, so adding a currency is one INSERT and no deploy. INR sits in it too,
-- at 1.0000, so there is no special case in the code for the home currency.
--
-- `inr_per_unit` is rupees for ONE unit of the currency — 1 USD = 88.4200.
-- Read that way round because that is how the rate is quoted to a person, and
-- a cross rate (USD to EUR) is one division rather than two.

create table if not exists fx_rate (
  code          text primary key,
  name          text not null,
  symbol        text not null default '',
  inr_per_unit  numeric(14,4) not null check (inr_per_unit > 0),
  as_of         date not null default current_date,
  source        text,
  is_active     boolean not null default true,
  sort_order    int not null default 100,
  updated_at    timestamptz not null default now()
);

comment on table fx_rate is
  'Currencies a quote may be written in, and rupees per unit. The quote currency dropdown reads its options from this table.';

insert into fx_rate (code, name, symbol, inr_per_unit, as_of, source, sort_order) values
  ('INR', 'Indian Rupee', '₹',  1.0000, current_date, 'home currency', 10),
  ('USD', 'US Dollar',    '$', 88.0000, current_date, 'seed — the daily cron replaces this', 20),
  ('EUR', 'Euro',         '€', 96.0000, current_date, 'seed — the daily cron replaces this', 30)
on conflict (code) do nothing;

-- The home currency is never rewritten by the rate cron.
create or replace function fx_rate_home_stays_one() returns trigger as $$
begin
  if new.code = 'INR' and new.inr_per_unit <> 1 then new.inr_per_unit := 1; end if;
  new.updated_at := now();
  return new;
end $$ language plpgsql;

drop trigger if exists fx_rate_guard on fx_rate;
create trigger fx_rate_guard before insert or update on fx_rate
  for each row execute function fx_rate_home_stays_one();

alter table fx_rate enable row level security;
drop policy if exists fx_rate_read on fx_rate;
create policy fx_rate_read on fx_rate for select to authenticated using (true);

select code, name, inr_per_unit, as_of from fx_rate order by sort_order;
