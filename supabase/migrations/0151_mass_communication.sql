-- 0151_mass_communication.sql — Genie 5.0.9.0 (7 Sep 2026)
--
-- Dr Raghu, 7 Sep 2026, on the mass mail screen: "keep this as Save draft and
-- in communication make a tab called Mass Communication and this should be
-- there. Show the drafted and sent ones. In communication of course keep all
-- in line. Any replies recieved also to be plonked here both for whatsapp and
-- email." And: "all communication sent from here should also link to the HRIS
-- records as Communication."
--
-- So one campaign is a row here, and every mail it sends is a line in
-- hrms_communication carrying that campaign's id and the employee's id. The
-- record's Communication tab therefore shows the mail without being told
-- about campaigns at all, and this table is only the cover sheet: who it was
-- addressed to, what was written, what went out, what came back.
create table if not exists public.hrms_mass_mail (
  id           uuid primary key default gen_random_uuid(),
  title        text,
  status       text not null default 'draft',       -- draft | sent
  channel      text not null default 'email',
  from_email   text,
  from_as      text,                                -- the From the reader sees
  reply_to     text,
  to_pref      text default 'either',               -- company | personal | either | personal_first
  subject      text,
  body         text,
  template_key text,
  audience     jsonb not null default '{}'::jsonb,  -- types, departments, groups, ids
  attachments  jsonb not null default '[]'::jsonb,  -- names and sizes, not the bytes
  counts       jsonb not null default '{}'::jsonb,  -- sent, failed, of
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  sent_at      timestamptz
);
create index if not exists hrms_mass_mail_status_idx on public.hrms_mass_mail (status, updated_at desc);

-- Which campaign a line belongs to, and which Gmail conversation it opened.
-- The thread is how a reply finds its way back to the person who wrote it.
alter table public.hrms_communication add column if not exists mass_id uuid;
alter table public.hrms_communication add column if not exists thread_id text;
create index if not exists hrms_communication_mass_idx on public.hrms_communication (mass_id);
create index if not exists hrms_communication_thread_idx on public.hrms_communication (thread_id);

create table if not exists public.genie_migration (name text primary key, applied_at timestamptz not null default now());
insert into public.genie_migration (name) values ('0151_mass_communication') on conflict (name) do nothing;
