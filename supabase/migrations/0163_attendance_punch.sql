-- 0163 — ATTENDANCE, AS EVENTS (Dr Raghu, 8 Sep 2026)
--
-- "The guy would login from his IDP then do attendance ... the photo he will
-- click which will have the GPS record and the time stamp ... this will allow
-- him to put in the attendance when it's Outdoor duty. Especially for service
-- and sales ... they can also set the attendance for up to 3 days back
-- without the photo stamp 3 times a month ... then he will sign out too. The
-- time in to out will be mapped and calculated. LET'S CAPTURE DATA FIRST and
-- then decide how we will do this."
--
-- SO THIS IS A LOG, NOT A LEDGER. One row per press: he arrived, he left. It
-- does not decide whether a day counts as present, or how long a half day is,
-- or what to do about a man who forgot to sign out — because those rules are
-- not settled and a table that encodes an unsettled rule has to be rebuilt
-- when it changes. Capture faithfully now; total later, off data that is real.
--
-- TWO MOUTHS FEED IT. `source` says which: 'present' is a man on his phone
-- with a photo and a fix; 'essl' is the biometric machine's own record; and
-- 'backdated' is him telling us about a day already gone. They are kept apart
-- deliberately, because a punch a machine saw and a punch a man typed are not
-- the same evidence and the day somebody asks "how do we know" the answer has
-- to be in the row.
--
-- Safe to run twice.

create table if not exists public.hrms_attendance_punch (
  id           uuid primary key default gen_random_uuid(),
  employee_id  text not null,
  for_date     date not null,              -- the DAY it counts for
  at           timestamptz not null,       -- the MOMENT it happened
  kind         text not null check (kind in ('in', 'out')),
  source       text not null check (source in ('present', 'essl', 'backdated')),

  -- where he was. Null is honest: a phone may refuse a fix indoors.
  lat          double precision,
  lng          double precision,
  accuracy_m   double precision,
  place        text,

  -- the photo. Drive is where it belongs; storage is where it cannot be lost.
  photo_drive_id   text,
  photo_link       text,
  photo_path       text,                   -- supabase storage, the fallback

  note         text,
  device       text,                       -- user agent, for a disputed punch
  batch_id     text,                       -- the ESSL import it arrived in
  created_at   timestamptz not null default now(),
  created_by   text
);

create index if not exists hrms_att_punch_emp_idx  on public.hrms_attendance_punch (employee_id, for_date desc);
create index if not exists hrms_att_punch_date_idx on public.hrms_attendance_punch (for_date desc);
create index if not exists hrms_att_punch_src_idx  on public.hrms_attendance_punch (source);
create index if not exists hrms_att_punch_batch_idx on public.hrms_attendance_punch (batch_id);

-- THE SAME PUNCH MAY NOT LAND TWICE.
--
-- This was first written as a unique index on date_trunc('minute', at), to
-- stop a double press. Postgres refused it — 42P17 — and was right to:
-- date_trunc over a timestamptz depends on the session's TimeZone, so the
-- same row could index differently for two connections, and an index that
-- disagrees with itself is worse than no index. Plain columns instead; the
-- double press is caught in the route, where a clock is allowed to be a
-- clock. This also gives PostgREST a target it can name for on-conflict,
-- which an expression index cannot be.
create unique index if not exists hrms_att_punch_once_idx
  on public.hrms_attendance_punch (employee_id, kind, source, at);

-- ── the ESSL machine's imports, so a batch can be named and undone ──
create table if not exists public.hrms_essl_import (
  id           uuid primary key default gen_random_uuid(),
  filename     text,
  rows_read    integer default 0,
  rows_written integer default 0,
  from_date    date,
  to_date      date,
  note         text,
  uploaded_by  text,
  uploaded_at  timestamptz not null default now()
);

-- ── the three-a-month backdating allowance, counted not trusted ──
-- Nothing is stored for this: it is COUNTED off the punches themselves, so it
-- cannot drift from what actually happened. This view is only for reading.
create or replace view public.hrms_backdated_this_month as
  select employee_id,
         date_trunc('month', for_date)::date as month,
         count(distinct for_date) as days_claimed
    from public.hrms_attendance_punch
   where source = 'backdated'
   group by 1, 2;

-- Personnel data: the service role is the only way in, as everywhere else in
-- HRMS. A man's whereabouts at a moment in time is not browser-readable.
alter table public.hrms_attendance_punch enable row level security;
alter table public.hrms_essl_import      enable row level security;
revoke all on public.hrms_attendance_punch from public, anon, authenticated;
revoke all on public.hrms_essl_import      from public, anon, authenticated;
revoke all on public.hrms_backdated_this_month from public, anon, authenticated;

create table if not exists public.genie_migration (name text primary key, at timestamptz default now());
insert into public.genie_migration (name) values ('0163_attendance_punch') on conflict (name) do nothing;

notify pgrst, 'reload schema';

-- ── prove it ──
select 'hrms_attendance_punch' as t, count(*) from public.hrms_attendance_punch
union all
select 'hrms_essl_import', count(*) from public.hrms_essl_import;
