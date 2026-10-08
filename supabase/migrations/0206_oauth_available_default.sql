-- 0206 · Connect Gmail for everybody (Dr Raghu, 8 Oct 2026: "in the profile, to connect their email, that
-- feature you can give it to everybody now, at least in the leaders council, stratcom, purchase, and sales").
-- Every active @nandan.co.in account was switched on by hand the same day; this makes a NEW account start
-- that way too. An admin can still untick ✉ OAuth on a person to take it away.
alter table public.profiles alter column oauth_available set default true;
update public.profiles set oauth_available = true where disabled = false and email ilike '%@nandan.co.in' and oauth_available = false;
create table if not exists public.genie_migration (name text primary key, applied_at timestamptz not null default now());
insert into public.genie_migration (name) values ('0206_oauth_available_default') on conflict (name) do nothing;
