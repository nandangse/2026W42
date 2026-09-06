-- 0144_usage_log_and_kind.sql — Genie 5.0.1.0 (6 Sep 2026)
--
-- Dr Raghu: "show an access log ... last 60 days with latest on top, week
-- wise ... if the person has logged in then mark as dark green and mouseover
-- should show how many records and how many minutes he was on site ... we
-- will work thresholds where it may seem the person is copying data."
-- And: "Employees / Consultant / Intern — default employees."

-- one row per person per day; the shell beats once a minute while the tab
-- is visible, carrying how many /api calls the browser made since the last beat
create table if not exists public.genie_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  minutes int not null default 0,
  requests int not null default 0,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.genie_usage enable row level security;
revoke all on public.genie_usage from anon, authenticated;

-- the kind of person a login is: employee (default), consultant, intern
alter table public.profiles add column if not exists kind text not null default 'employee';
alter table public.profiles drop constraint if exists profiles_kind_chk;
alter table public.profiles add constraint profiles_kind_chk check (kind in ('employee','consultant','intern'));

-- ledger (0143): this migration records itself, whichever runs first
create table if not exists public.genie_migration (name text primary key, applied_at timestamptz not null default now());
insert into public.genie_migration (name) values ('0144_usage_log_and_kind') on conflict (name) do nothing;
