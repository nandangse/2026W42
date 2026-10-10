-- 0216 — LEADERS COUNCIL: WHO VIEWED, AND THE COMPANY'S KPIs (Genie 6.4.0.2)
--
-- Dr Raghu, 10 Oct 2026: "in such boxes also show viewed with the eye icon.
-- the ones who didn't vote are only viewed!" — and — "fill the representative
-- KPIs that are important for Nandan GSE. These can be filled today for the
-- last two quarters … the most discrete point is monthly."

-- one row per person per thing, the first time it is opened; opens counted after
create table if not exists public.lc_view (
  ref_kind    text not null check (ref_kind in ('ssc','problem','presentation','meeting','section')),
  ref_id      uuid not null,
  email       text not null,
  first_at    timestamptz not null default now(),
  last_at     timestamptz not null default now(),
  opens       int not null default 1,
  primary key (ref_kind, ref_id, email)
);
alter table public.lc_view enable row level security;
revoke all on public.lc_view from anon, authenticated;

-- WHO MAY SEE A KPI (Dr Raghu, 10 Oct 2026: "in each kpi have a part which
-- shows visibility. Default all, then mancom (JC Kumar, Cdr Tushar and me),
-- stratcom, LC, staff"). The rooms are the marks that already exist on a
-- login — management, stratcom, lc — the owner implicit in every one.
alter table public.lc_kpi add column if not exists visibility text not null default 'all'
  check (visibility in ('all','mancom','stratcom','lc','staff'));

-- THE REPRESENTATIVE KPIs of a ground-support-equipment manufacturer, in the
-- order the business reads them: what we won, what we shipped, what it
-- earned, what we hold, who we are, how we served. Each carries the rule a
-- quarter is read by. Targets and owners are left for the council; a KPI
-- already present by name is left alone.
insert into public.lc_kpi (name, type, unit, agg, sort, created_by)
select v.name, v.type, v.unit, v.agg, v.sort, 'raghu@nandan.co.in'
from (values
  -- win the work
  ('Enquiries received',                    'number',   'nos',   'sum',  1),
  ('Quotations sent',                       'number',   'nos',   'sum',  2),
  ('Quotation value sent',                  'currency', null,    'sum',  3),
  ('Orders booked',                         'currency', null,    'sum',  4),
  ('Order book at month end',               'currency', null,    'last', 5),
  -- build and ship
  ('Jobs delivered',                        'number',   'nos',   'sum',  6),
  ('Sales invoiced',                        'currency', null,    'sum',  7),
  ('On-time delivery',                      'number',   '%',     'avg',  8),
  ('Gross margin',                          'number',   '%',     'avg',  9),
  ('Rework and NC cost',                    'currency', null,    'sum',  10),
  -- the money
  ('Collections received',                  'currency', null,    'sum',  11),
  ('Receivables at month end',              'currency', null,    'last', 12),
  ('Receivables overdue beyond 90 days',    'currency', null,    'last', 13),
  ('Cash and bank at month end',            'currency', null,    'last', 14),
  ('Purchases',                             'currency', null,    'sum',  15),
  ('Inventory at month end',                'currency', null,    'last', 16),
  ('Operating expenses',                    'currency', null,    'sum',  17),
  -- the people
  ('Headcount at month end',                'number',   'nos',   'last', 18),
  ('Attrition',                             'number',   'nos',   'sum',  19),
  ('Training hours',                        'number',   'hours', 'sum',  20),
  ('Safety incidents',                      'number',   'nos',   'sum',  21),
  -- the customer, after the sale
  ('Service tickets raised',                'number',   'nos',   'sum',  22),
  ('Service tickets closed in time',        'number',   '%',     'avg',  23),
  ('Customer complaints',                   'number',   'nos',   'sum',  24)
) as v(name, type, unit, agg, sort)
where not exists (select 1 from public.lc_kpi k where lower(k.name) = lower(v.name));

insert into public.genie_migration (name) values ('0216_lc_views_and_kpis') on conflict (name) do nothing;
