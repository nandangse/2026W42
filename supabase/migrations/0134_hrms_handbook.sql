-- 0134_hrms_handbook.sql
--
-- THE EMPLOYEE HANDBOOK, PUBLISHED (Dr Raghu, 4 Sep 2026): "make it go under
-- the employee handbook policy and make it readable and publishable for
-- people. They can, of course, ask questions there too."
--
-- One row per section, rich text, versioned per section so a change to
-- Leave does not restamp Safety. Questions ride on hrms_query (topic
-- 'Handbook', form.section = the slug); an answered one, once HR marks it
-- published, shows under its section for everybody -- Policy -> HR Queries
-- Solved, fed exactly as the menu said it would be.
--
-- The words themselves are seeded by the app on first read (src/lib/
-- handbook-seed.ts), never by SQL, so a section already edited is never
-- overwritten by a redeploy.
--
-- ASCII only, additive, safe to re-run.

create table if not exists public.hrms_handbook (
  slug        text primary key,
  ord         integer not null default 0,
  title       text not null,
  summary     text,
  body        text not null default '',
  audience    text not null default 'all',
  published   boolean not null default true,
  version     integer not null default 1,
  updated_by  text,
  updated_at  timestamptz not null default now()
);
alter table public.hrms_handbook enable row level security;
revoke all on public.hrms_handbook from anon, authenticated;

create table if not exists public.hrms_handbook_ack (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  employee_id   text,
  edition       text not null,
  acknowledged_at timestamptz not null default now(),
  unique (email, edition)
);
alter table public.hrms_handbook_ack enable row level security;
revoke all on public.hrms_handbook_ack from anon, authenticated;

alter table public.hrms_query add column if not exists published boolean not null default false;
comment on column public.hrms_query.published is 'An answered Handbook question HR chose to show under its section for everyone.';
