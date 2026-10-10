-- 0219 — LEADERS COUNCIL: THE KPIs IN DR RAGHU'S FIVE GROUPS (Genie 6.4.0.6)
--
-- Dr Raghu, 10 Oct 2026: "keep kpi related to Revenue (Booking, Billing,
-- Collections), Profits (Throughput, Throughput % of sales, OE, OE % of
-- sales), Inventory (Purchase, Purchase % of sales), Cash (Payables,
-- Payables > 180 days, Receivables, Receivables > 180 days, Fixed Costs,
-- Purchase of Fixed Assets), People (Total, Staff, Labour, Contract,
-- Salary / Sales)."
--
-- A KPI now has a GROUP, a CODE (what a formula calls it by) and, for the
-- ratios, a FORMULA over other codes — so a percentage is worked out from
-- the figures typed, never typed itself. The twenty-four of 0216 were
-- Genie's guess; those never given a value are removed and his set stands.

alter table public.lc_kpi add column if not exists "group" text;
alter table public.lc_kpi add column if not exists code text;
alter table public.lc_kpi add column if not exists formula text;   -- e.g. throughput/billing  ·  staff+labour+contract
create unique index if not exists lc_kpi_code on public.lc_kpi (code) where code is not null;

delete from public.lc_kpi k
where k.created_by = 'raghu@nandan.co.in' and k.code is null
  and not exists (select 1 from public.lc_kpi_value v where v.kpi_id = k.id);

insert into public.lc_kpi (name, "group", code, formula, type, unit, agg, sort, created_by)
select v.name, v.grp, v.code, v.formula, v.type, v.unit, v.agg, v.sort, 'raghu@nandan.co.in'
from (values
  -- Revenue
  ('Booking',                       'Revenue',   'booking',         null,                         'currency', null,   'sum',  1),
  ('Billing',                       'Revenue',   'billing',         null,                         'currency', null,   'sum',  2),
  ('Collections',                   'Revenue',   'collections',     null,                         'currency', null,   'sum',  3),
  -- Profits
  ('Throughput',                    'Profits',   'throughput',      null,                         'currency', null,   'sum',  4),
  ('Throughput % of sales',         'Profits',   'throughput_pct',  'throughput/billing',         'number',   '%',    'sum',  5),
  ('OE',                            'Profits',   'oe',              null,                         'currency', null,   'sum',  6),
  ('OE % of sales',                 'Profits',   'oe_pct',          'oe/billing',                 'number',   '%',    'sum',  7),
  -- Inventory
  ('Purchase',                      'Inventory', 'purchase',        null,                         'currency', null,   'sum',  8),
  ('Purchase % of sales',           'Inventory', 'purchase_pct',    'purchase/billing',           'number',   '%',    'sum',  9),
  ('Inventory at month end',        'Inventory', 'inventory',       null,                         'currency', null,   'last', 10),
  -- Cash
  ('Payables',                      'Cash',      'payables',        null,                         'currency', null,   'last', 11),
  ('Payables > 180 days',           'Cash',      'payables_180',    null,                         'currency', null,   'last', 12),
  ('Receivables',                   'Cash',      'receivables',     null,                         'currency', null,   'last', 13),
  ('Receivables > 180 days',        'Cash',      'receivables_180', null,                         'currency', null,   'last', 14),
  ('Fixed costs',                   'Cash',      'fixed_costs',     null,                         'currency', null,   'sum',  15),
  ('Purchase of fixed assets',      'Cash',      'capex',           null,                         'currency', null,   'sum',  16),
  -- People
  ('Total',                         'People',    'people_total',    'staff+labour+contract',      'number',   'nos',  'last', 17),
  ('Staff',                         'People',    'staff',           null,                         'number',   'nos',  'last', 18),
  ('Labour',                        'People',    'labour',          null,                         'number',   'nos',  'last', 19),
  ('Contract',                      'People',    'contract',        null,                         'number',   'nos',  'last', 20),
  ('Salary',                        'People',    'salary',          null,                         'currency', null,   'sum',  21),
  ('Salary / Sales',                'People',    'salary_pct',      'salary/billing',             'number',   '%',    'sum',  22)
) as v(name, grp, code, formula, type, unit, agg, sort)
where not exists (select 1 from public.lc_kpi k where k.code = v.code);

insert into public.genie_migration (name) values ('0219_lc_kpi_groups') on conflict (name) do nothing;
