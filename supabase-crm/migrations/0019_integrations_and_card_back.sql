-- 0019_integrations_and_card_back.sql
--
-- TWO THINGS (Dr Raghu, 28 Aug 2026):
--
-- 1. The visiting card gets its BACK — Indian cards carry the works list on
--    the reverse — plus the verbatim transcript and a status: 'saved' is a
--    scan on file, 'added' is a scan that became a Contact.
--
-- 2. INTEGRATIONS: one table for every outside service's keys — Apollo
--    first — so credentials live in the database behind the service key,
--    not scattered through env vars that need a redeploy to change. The
--    config is jsonb because every service's shape differs.
--
-- ASCII only, additive, safe to re-run.

alter table visiting_card
  add column if not exists image_back_path text,
  add column if not exists transcript text,
  add column if not exists status text not null default 'saved';

create table if not exists integration_setting (
  key        text primary key,
  config     jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);

comment on table integration_setting is
  'API keys and settings for outside services (apollo, ...). Read only by '
  'the server; the UI shows a masked tail, never the key.';
