-- Genie 0104 — Consult Raghu's knowledgebase (30 Aug 2026)
-- Four living documents — Planning, Sales, Kuber, Vishwakarma — Dr Raghu
-- dumps knowledge in, Opus weaves it into one large organized document,
-- and a copy files into his Drive folder. Owner's eyes alone.
create table if not exists consult_kb (
  section     text primary key check (section in ('planning', 'sales', 'kuber', 'vishwakarma')),
  content     text not null default '',
  version     int not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
create table if not exists consult_kb_upload (
  id          uuid primary key default gen_random_uuid(),
  section     text not null,
  filename    text,
  chars       int,
  note        text,
  uploaded_by text,
  uploaded_at timestamptz not null default now()
);
insert into consult_kb (section) values ('planning'), ('sales'), ('kuber'), ('vishwakarma')
on conflict do nothing;
