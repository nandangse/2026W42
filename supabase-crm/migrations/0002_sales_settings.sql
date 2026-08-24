-- ============================================================================
-- NANDAN CRM — 0002 — SALES SETTINGS
-- Per-user mailboxes + the company WhatsApp number. Apply AFTER 0001_core.sql.
--
-- SECURITY RULE FOR THIS FILE: no password is ever stored in an application
-- table. Not encrypted, not hashed, not base64. Secrets go into Supabase
-- Vault; these tables hold only the Vault secret UUID. If you find yourself
-- adding a `password text` column, stop.
--
-- Mail sends and receives through each user's own @nandan.co.in mailbox with
-- an APP-SPECIFIC password (Google: Security → 2-Step Verification → App
-- passwords) — never their real login password. Asking 270 people to type
-- their real Google password into a form on genie.nandan.co.in would build a
-- phishing page and teach the company to trust it. The form must say so.
--
-- One login, Genie's — same lockdown as 0001: RLS on and forced, no
-- policies. The server verifies the Genie session, then uses the service
-- key. "A user sees only their own mailbox row" is enforced in the route,
-- which is the only caller this database has.
--
-- Idempotent and additive. Safe to re-run.
-- ============================================================================

create extension if not exists "supabase_vault" with schema vault;

do $$ begin
  create type connection_security as enum ('ssl_tls', 'starttls', 'none');
exception when duplicate_object then null; end $$;

do $$ begin
  create type mailbox_status as enum ('unverified', 'active', 'auth_failed', 'disabled');
exception when duplicate_object then null; end $$;

-- ========================================================= A. PER-USER MAILBOX
create table if not exists mailbox (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null references profile(id) on delete cascade,
  email_address       text not null unique,
  display_name        text,

  -- IMAP (receive)
  imap_host           text not null default 'imap.gmail.com',
  imap_port           int  not null default 993,
  imap_security       connection_security not null default 'ssl_tls',

  -- SMTP (send)
  smtp_host           text not null default 'smtp.gmail.com',
  smtp_port           int  not null default 465,
  smtp_security       connection_security not null default 'ssl_tls',

  username            text not null,              -- usually = email_address
  credential_ref      uuid not null,              -- vault.secrets.id — NEVER the password
  credential_kind     text not null default 'app_password'
                      check (credential_kind in ('app_password','oauth_refresh_token')),

  status              mailbox_status not null default 'unverified',
  last_error          text,
  last_verified_at    timestamptz,
  last_synced_at      timestamptz,
  sync_since          date not null default (current_date - interval '90 days')::date,

  signature_html      text,
  is_shared           boolean not null default false,   -- true for sales@nandan.co.in
  auto_log_inbound    boolean not null default true,
  auto_log_outbound   boolean not null default true,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists mailbox_profile_idx on mailbox (profile_id);
create index if not exists mailbox_active_idx  on mailbox (status) where status = 'active';
drop trigger if exists mailbox_touch on mailbox;
create trigger mailbox_touch before update on mailbox
  for each row execute function crm_touch();

-- Only @nandan.co.in mailboxes. No personal Gmail in the company CRM.
alter table mailbox drop constraint if exists mailbox_domain_check;
alter table mailbox
  add constraint mailbox_domain_check
  check (lower(email_address) like '%@nandan.co.in');

-- Link the unified inbox to the mailbox it came through.
alter table channel_account
  add column if not exists mailbox_id uuid references mailbox(id) on delete cascade;

-- ========================================================= B. COMPANY WHATSAPP
-- ONE business number, many agents — not one per salesperson. Personal
-- WhatsApp on personal handsets is the problem this replaces: when a
-- salesperson leaves, the relationship walks out with the SIM.
create table if not exists whatsapp_config (
  id                    boolean primary key default true check (id),  -- singleton row
  display_number        text not null,            -- E.164
  verified_name         text,                     -- "Nandan GSE"
  waba_id               text,                     -- Meta WhatsApp Business Account id
  phone_number_id       text,                     -- Meta phone number id
  access_token_ref      uuid not null,            -- vault.secrets.id
  webhook_verify_ref    uuid not null,            -- vault.secrets.id
  provider              text not null default 'meta_cloud'
                        check (provider in ('meta_cloud','gupshup','twilio','wati')),
  default_owner_id      uuid references profile(id),
  business_hours        jsonb not null default
                        '{"tz":"Asia/Kolkata","mon_fri":["09:30","18:30"],"sat":["09:30","14:00"]}'::jsonb,
  is_active             boolean not null default false,
  last_verified_at      timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
drop trigger if exists wa_config_touch on whatsapp_config;
create trigger wa_config_touch before update on whatsapp_config
  for each row execute function crm_touch();

-- Which salesperson picks up which WhatsApp conversation.
create table if not exists whatsapp_agent (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references profile(id) on delete cascade unique,
  agent_label   text not null,                    -- shown to customer: "Santosh — Nandan GSE"
  pipelines     pipeline_type[] not null default '{capital}',
  keywords      text[] default '{}',              -- routing hints: 'spares','hi-lift','bowser'
  is_available  boolean not null default true,
  priority      int not null default 5,
  created_at    timestamptz not null default now()
);

alter table message
  add column if not exists agent_profile_id uuid references profile(id);

-- ============================================================ C. VAULT HELPERS
-- Called from a server route with the service role. The browser NEVER calls
-- these and NEVER sees a password.
create or replace function store_mailbox_credential(
  p_email text,
  p_secret text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select vault.create_secret(p_secret, 'mailbox:' || p_email,
         'Sales Genie mailbox credential') into v_id;
  return v_id;
end $$;

-- NOTE: `public` below is the PUBLIC *role*, not the public schema.
revoke all on function store_mailbox_credential(text, text) from public, authenticated, anon;

create or replace function rotate_mailbox_credential(
  p_mailbox_id uuid,
  p_secret text
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_ref uuid;
begin
  select credential_ref into v_ref from public.mailbox where id = p_mailbox_id;
  perform vault.update_secret(v_ref, p_secret);
  update public.mailbox
     set status = 'unverified'::public.mailbox_status,
         last_error = null, updated_at = now()
   where id = p_mailbox_id;
end $$;

revoke all on function rotate_mailbox_credential(uuid, text) from public, authenticated, anon;

-- ================================================================== LOCKDOWN
do $$
declare t text;
begin
  foreach t in array array['mailbox','whatsapp_config','whatsapp_agent'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- Belt and braces: nobody reads the Vault from a client key.
revoke all on vault.secrets           from anon, authenticated;
revoke all on vault.decrypted_secrets from anon, authenticated;

-- ================================================ D. SAFE VIEW FOR SETTINGS
-- Everything the settings screen needs and nothing it must not see: no
-- credential_ref. The route filters to the caller's own row; the view keeps
-- the secret reference out of every SELECT * a future route might write.
create or replace view v_mailbox_safe as
select
  m.id, m.profile_id, m.email_address, m.display_name, m.username,
  m.imap_host, m.imap_port, m.imap_security,
  m.smtp_host, m.smtp_port, m.smtp_security,
  m.credential_kind, m.status, m.last_error,
  m.last_verified_at, m.last_synced_at, m.sync_since,
  m.signature_html, m.is_shared,
  m.auto_log_inbound, m.auto_log_outbound,
  (m.credential_ref is not null) as has_credential
from mailbox m;
