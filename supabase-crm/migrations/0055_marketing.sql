-- 0055_marketing.sql — CRM database — Genie 5.0.2.0 (6 Sep 2026)
--
-- MARKETING, on the CRM's own database (Dr Raghu, 6 Sep 2026): leads, lists,
-- e-mail campaigns, sending channels, unsubscribes. "We are basically
-- replicating Apollo internally for ourselves."
--
-- Companies and people gain a `source` (crm | apollo) and `is_lead`, so the
-- Apollo imports do not clog the CRM's Company list: the CRM shows source =
-- crm; Marketing shows all. `assigned_to` and `created_by_email` are what a
-- member's view is scoped by — e-mail, not profile id, so an intern with no
-- CRM profile still owns what they made.

alter table company add column if not exists source text not null default 'crm' check (source in ('crm','apollo'));
alter table company add column if not exists is_lead boolean not null default false;
alter table company add column if not exists assigned_to text;
alter table company add column if not exists created_by_email text;
create index if not exists company_source_idx on company (source, is_lead);

alter table person add column if not exists source text not null default 'crm' check (source in ('crm','apollo'));
alter table person add column if not exists assigned_to text;
alter table person add column if not exists created_by_email text;
alter table person add column if not exists city text;
alter table person add column if not exists country text;
create index if not exists person_source_idx on person (source);
create index if not exists person_email_idx on person (lower(primary_email));

-- lists: a named set of people
create table if not exists mk_list (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by_email text not null,
  created_at timestamptz not null default now()
);
create table if not exists mk_list_member (
  list_id uuid not null references mk_list(id) on delete cascade,
  person_id uuid not null references person(id) on delete cascade,
  added_by_email text,
  added_at timestamptz not null default now(),
  primary key (list_id, person_id)
);

-- sending channels: an address, its limits, the API that carries it
create table if not exists mk_channel (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  label text,
  kind text not null default 'gmail' check (kind in ('gmail','resend','mailercloud')),
  api_key text,                      -- resend / mailercloud; blank = the deploy's RESEND_API_KEY for resend
  daily_limit int not null default 200,
  hourly_limit int not null default 50,
  active boolean not null default true,
  sent_on date,
  sent_today int not null default 0,
  sent_this_hour int not null default 0,
  hour_mark timestamptz,
  created_by_email text,
  created_at timestamptz not null default now()
);

-- message templates with {{variables}}
create table if not exists mk_template (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text,
  body_html text,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- campaigns
create table if not exists mk_campaign (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft' check (status in ('draft','ready','sending','paused','done')),
  subject text,
  body_html text,
  list_ids uuid[] not null default '{}',
  person_ids uuid[] not null default '{}',   -- people added one by one
  channel_ids uuid[] not null default '{}',  -- the from-addresses ticked
  speed_per_hour int not null default 50,
  checklist jsonb,                           -- the list check, as last run
  deliverability jsonb,                      -- the message check, as last run
  created_by_email text not null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  done_at timestamptz,
  counts jsonb
);

-- one row per recipient per campaign
create table if not exists mk_send (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references mk_campaign(id) on delete cascade,
  person_id uuid references person(id) on delete set null,
  email text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed','bounced','opened','unsubscribed','skipped')),
  channel_id uuid references mk_channel(id),
  token text not null default replace(gen_random_uuid()::text, '-', ''),
  sent_at timestamptz,
  opened_at timestamptz,
  open_count int not null default 0,
  error text,
  unique (campaign_id, email)
);
create index if not exists mk_send_queue_idx on mk_send (campaign_id, status);
create index if not exists mk_send_token_idx on mk_send (token);

-- the unsubscribe list, kept meticulously: every bounce lands here
create table if not exists mk_unsubscribe (
  email text primary key check (email = lower(email)),
  reason text not null default 'request' check (reason in ('bounce','request','manual','complaint')),
  campaign_id uuid,
  note text,
  at timestamptz not null default now()
);

-- a member's own notes on a lead (Marketing's notes are of self, not of others)
create table if not exists mk_note (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('company','person')),
  entity_id uuid not null,
  body text not null,
  created_by_email text not null,
  created_at timestamptz not null default now()
);
create index if not exists mk_note_entity_idx on mk_note (entity, entity_id);

-- the CRM's tag list can carry 'company','person','opportunity' only; that is enough.
do $$ begin
  perform 1 from crm_tag where name = 'Apollo' and owner_id is null;
  if not found then insert into crm_tag (name, owner_id) values ('Apollo', null); end if;
  perform 1 from crm_tag where name = 'Leads' and owner_id is null;
  if not found then insert into crm_tag (name, owner_id) values ('Leads', null); end if;
end $$;

alter table mk_list enable row level security;
alter table mk_list_member enable row level security;
alter table mk_channel enable row level security;
alter table mk_template enable row level security;
alter table mk_campaign enable row level security;
alter table mk_send enable row level security;
alter table mk_unsubscribe enable row level security;
alter table mk_note enable row level security;
