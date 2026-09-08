-- 0160 — where a man will be working, the next seven days (Dr Raghu,
-- 8 Sep 2026: "in the IDP show location of work for the next 7 days, show it
-- in a calendar form. Default will be the place they are assigned as per the
-- HRIS. They can change it as per the way they want. The change is only for
-- service and mukesh and design. Others are all in one place anyways").
--
-- ONLY THE EXCEPTIONS ARE STORED. 175 of the 204 sit at Khalapur every day of
-- the week; writing seven rows a week each for them would be a quarter of a
-- million rows a year saying nothing. A day with no row here means the man is
-- where the HRIS says he is, and that is the answer for almost everybody.
--
-- Who may change it is not stored either — it is Service, Design, and whoever
-- reports to Mukesh, read from the record at the time of asking. 52 people
-- today. The other 152 see their week and cannot edit it, which is honest:
-- they are in one place anyway.
--
-- Safe to run twice.

create table if not exists public.hrms_work_location (
  employee_id  text not null,
  on_date      date not null,
  location     text not null,
  note         text,
  set_by       text,
  set_at       timestamptz default now(),
  primary key (employee_id, on_date)
);

create index if not exists hrms_work_location_date_idx on public.hrms_work_location (on_date, location);

comment on table public.hrms_work_location is
  'Where someone will work on a given day, stored ONLY where it differs from the HRIS location. No row = the HRIS answer. Service, Design and Mukesh''s people may set it; everybody else is fixed.';

alter table public.hrms_work_location enable row level security;
revoke all on public.hrms_work_location from public, anon, authenticated;

create table if not exists public.genie_migration (name text primary key, at timestamptz default now());
insert into public.genie_migration (name) values ('0160_work_location') on conflict (name) do nothing;

notify pgrst, 'reload schema';

select count(*) as days_set from public.hrms_work_location;
