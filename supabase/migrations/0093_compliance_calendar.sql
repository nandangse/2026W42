-- 0093: the COMPLIANCE CALENDAR (Dr Raghu, 28 Aug 2026, from his sheet):
-- compliances down the side (TDS heads, PF, ESIC, GST, PT…), the FY's months
-- across, each cell carrying WHEN it was done and THE LINK to the proof —
-- editable, openable — and the COLOUR judged from the date: green when done
-- by the due day, amber when late, red when a past month stands empty.
--
-- Two tables: the compliance master (with the due rule as a day-of-next-
-- month, where one exists) and one row per compliance per month.
--
-- Line comments only. Safe to re-run.

create table if not exists public.kuber_compliance (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  grp        text not null default '',
  frequency  text not null default 'Monthly',
  due_day    integer,
  due_note   text not null default '',
  sort_order integer,
  active     boolean not null default true,
  by         text,
  at         timestamptz not null default now()
);

create table if not exists public.kuber_compliance_entry (
  id            uuid primary key default gen_random_uuid(),
  compliance_id uuid not null references public.kuber_compliance (id) on delete cascade,
  month         text not null,
  done_on       date,
  link          text not null default '',
  note          text not null default '',
  by            text,
  at            timestamptz not null default now(),
  unique (compliance_id, month)
);
create index if not exists kuber_compliance_entry_month on public.kuber_compliance_entry (month);

-- His sheet's rows, seeded so the calendar opens furnished; he edits freely.
insert into public.kuber_compliance (name, grp, frequency, due_day, due_note, sort_order) values
  ('TDS/TCS Payment',          'TDS', 'Monthly',   7,  '7th of next month',  10),
  ('94C - TDS on Contractor',  'TDS', 'Monthly',   7,  '7th of next month',  20),
  ('94J - TDS on Professional','TDS', 'Monthly',   7,  '7th of next month',  30),
  ('94I - TDS on Rent',        'TDS', 'Monthly',   30, '30th of next month', 40),
  ('94A - TDS on Bank Interest','TDS','Monthly',   7,  '7th of next month',  50),
  ('92B - TDS on Salary',      'TDS', 'Monthly',   7,  '7th of next month',  60),
  ('TDS/TCS Return - Quarterly','TDS','Quarterly', null, '31 Jul / 31 Oct / 31 Jan / 31 May', 70),
  ('PF Payment',               'PF',  'Monthly',   15, '15th of next month', 80),
  ('PF Return',                'PF',  'Monthly',   15, '15th of next month', 90),
  ('ESIC Payment',             'ESIC','Monthly',   15, '15th of next month', 100),
  ('GST - Payment',            'GST', 'Monthly',   20, '20th of next month', 110),
  ('GSTR 1',                   'GST', 'Monthly',   11, '11th of next month', 120),
  ('TDS on TCS',               'GST', 'Monthly',   19, '19th of next month', 130),
  ('GSTR - 3/3B',              'GST', 'Monthly',   20, '20th of next month', 140),
  ('GSTR - 9C',                'GST', 'Yearly',    null, '30 Nov',           150),
  ('Profession Tax - Challan', 'PT',  'Monthly',   null, 'month end',        160),
  ('Profession Tax - Business','PT',  'Yearly',    null, '30 Jun',           170)
on conflict do nothing;

alter table public.kuber_compliance enable row level security;
alter table public.kuber_compliance_entry enable row level security;
drop policy if exists kuber_compliance_read on public.kuber_compliance;
create policy kuber_compliance_read on public.kuber_compliance
  for select to authenticated using (true);
drop policy if exists kuber_compliance_entry_read on public.kuber_compliance_entry;
create policy kuber_compliance_entry_read on public.kuber_compliance_entry
  for select to authenticated using (true);

-- Writes go through /api/kuber/compliance with the service key, behind the
-- Kuber grant.
