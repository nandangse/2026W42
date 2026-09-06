-- 0146_marketing_access.sql — Genie 5.0.2.0 (6 Sep 2026): the Marketing door.
--
-- Dr Raghu: "lets build a new module called Marketing ... something I can
-- give access to an intern. Will assign people to Marketing. Role — show
-- assigned records or created records only. When Sales person log into
-- this they can see all."
--
-- A grant per e-mail, like every other door. `role` is member (sees what
-- they made or were assigned) or manager (sees everything). The owner and
-- anyone with the CRM's sales roles see everything without a row.
create table if not exists public.marketing_access (
  email      text primary key check (email = lower(email)),
  role       text not null default 'member' check (role in ('member','manager')),
  granted_by text,
  granted_at timestamptz not null default now()
);
alter table public.marketing_access enable row level security;
revoke all on public.marketing_access from anon, authenticated;

create table if not exists public.genie_migration (name text primary key, applied_at timestamptz not null default now());
insert into public.genie_migration (name) values ('0146_marketing_access') on conflict (name) do nothing;
