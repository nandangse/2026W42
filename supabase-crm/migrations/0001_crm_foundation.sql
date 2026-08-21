-- ============================================================================
-- NANDAN CRM — 0001 — FOUNDATION
--
-- Runs in the CRM's OWN Supabase project. Nothing here belongs in Genie's
-- database and nothing here reads from it.
--
-- WHO CAN READ THIS DATA: nobody, directly. RLS is on for every table and
-- there are no permissive policies, so the anon and authenticated keys can
-- see nothing at all. The CRM's route handlers verify the Genie session
-- first and then speak to this database with the service key, which bypasses
-- RLS. That is deliberate: the session is issued by Genie's auth project and
-- this database has no way to validate a token it did not sign, so the gate
-- lives in code that can be read rather than in a policy that would have to
-- trust a foreign key.
--
-- Idempotent and additive, like Genie's. Safe to re-run.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- utilities
create or replace function crm_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- =============================================================== A. IDENTITY
-- A mirror of the Genie account, not a second user list. A row existing here
-- IS access to the CRM; there is no separate grant table to fall out of step.
create table if not exists crm_user (
  id            uuid primary key,              -- the id Genie's auth issued
  email         text not null unique,
  display_name  text,
  initials      text,
  crm_role      text not null default 'salesperson'
                check (crm_role in ('sales_head','salesperson','sales_admin','viewer')),
  reports_to    uuid references crm_user(id),
  active        boolean not null default true,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists crm_user_touch on crm_user;
create trigger crm_user_touch before update on crm_user
  for each row execute function crm_touch();

-- Dr Raghu, and for now only Dr Raghu. The id is filled in on his first
-- sign-in; until then the row is matched on email.
insert into crm_user (id, email, display_name, initials, crm_role)
values ('00000000-0000-0000-0000-000000000000', 'raghu@nandan.co.in',
        'Raghunandan Jagdish', 'RJ', 'sales_head')
on conflict (email) do nothing;

create table if not exists crm_audit (
  id         bigserial primary key,
  entity     text not null,
  entity_id  text,
  action     text not null,
  before     jsonb,
  after      jsonb,
  by_user    uuid,
  at         timestamptz not null default now()
);
create index if not exists crm_audit_entity_idx on crm_audit(entity, entity_id);

-- ================================================== B. ACCOUNTS AND PEOPLE
-- Sector is what NANDAN makes. SEVEN, named by Dr Raghu on 21 Aug. Six of them
-- appear in the live opportunity export (MHE 70%, GSE 12.5%, DEF 9.3%,
-- CAR 8.2%, ENT and SER a handful each); CM does not appear in that sample but
-- is a real sector.
create table if not exists sector (
  id          smallserial primary key,
  code        text not null unique,
  name        text not null,
  sort_order  smallint not null default 0,
  active      boolean not null default true
);
insert into sector (code, name, sort_order) values
  ('MHE','Material Handling Equipment',1),
  ('GSE','Ground Support Equipment',2),
  ('DEF','Defence',3),
  ('CAR','Car Parking',4),
  ('ENT','Entertainment',5),
  ('SER','Service',6),
  ('CM','Contract Manufacturing',7)
on conflict (code) do update set
  name = excluded.name, sort_order = excluded.sort_order;

-- What the CUSTOMER does. More than a lookup: your 253 industries already
-- carry a sector, a priority, an owner and a FOCUS/REGULAR/B10 rating.
create table if not exists industry (
  id                 smallserial primary key,
  name               text not null unique,
  erp_name           text,
  sector_id          smallint references sector(id),
  priority           text check (priority in ('Low','Medium','High','Highest')),
  owner_user_id      uuid references crm_user(id),
  goal_qualification text,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
drop trigger if exists industry_touch on industry;
create trigger industry_touch before update on industry
  for each row execute function crm_touch();

create table if not exists customer (
  id             uuid primary key default gen_random_uuid(),
  erp_name       text unique,
  name           text not null,
  industry_id    smallint references industry(id),
  owner_user_id  uuid references crm_user(id),
  gstin          text,
  country        text default 'India',
  website        text,
  is_export      boolean not null default false,
  match_key      text,
  merged_into_id uuid references customer(id),
  notes          text,
  created_at     timestamptz not null default now(),
  created_by     uuid,
  updated_at     timestamptz not null default now()
);
create index if not exists customer_match_idx on customer(match_key);
create index if not exists customer_name_idx  on customer(lower(name));
drop trigger if exists customer_touch on customer;
create trigger customer_touch before update on customer
  for each row execute function crm_touch();

create table if not exists address (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customer(id) on delete cascade,
  label       text,
  line1       text,
  line2       text,
  city        text,
  state       text,
  state_code  text,       -- the GST state code. 00 throughout the ERP export.
  pincode     text,
  country     text default 'India',
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists address_touch on address;
create trigger address_touch before update on address
  for each row execute function crm_touch();

create table if not exists contact (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid references customer(id) on delete set null,
  erp_name    text,
  salutation  text,
  first_name  text,
  last_name   text,
  full_name   text generated always as
              (trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))) stored,
  designation text,
  email       text,
  is_primary  boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now()
);
create index if not exists contact_email_idx    on contact(lower(email));
create index if not exists contact_customer_idx on contact(customer_id);
drop trigger if exists contact_touch on contact;
create trigger contact_touch before update on contact
  for each row execute function crm_touch();

-- Its own table because a call arrives as a NUMBER with no person attached,
-- so the lookup runs backwards. One person has a mobile and a desk line, and
-- a number moves between people when somebody leaves.
create table if not exists contact_phone (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references contact(id) on delete cascade,
  number_e164 text not null,
  number_raw  text,
  kind        text default 'mobile' check (kind in ('mobile','landline','whatsapp')),
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists contact_phone_e164_idx on contact_phone(number_e164);

-- ============================================================== C. THE FUNNEL
-- Fourteen rungs, as rows. Reordering is an UPDATE, not a migration.
create table if not exists stage (
  id          smallserial primary key,
  code        text not null unique,
  name        text not null,
  sort_order  smallint not null default 0,
  colour      text,
  is_terminal boolean not null default false,
  is_won      boolean not null default false,
  weight_pct  smallint not null default 0,
  active      boolean not null default true
);
insert into stage (code, name, sort_order, colour, is_terminal, is_won, weight_pct) values
  ('suspect',            'Suspect',             1,  '#8A94A0', false, false,  5),
  ('prospect',           'Prospect',            2,  '#7C90A4', false, false, 10),
  ('opportunity',        'Opportunity',         3,  '#5E86A8', false, false, 20),
  ('handled_opportunity','Handled Opportunity', 4,  '#4A7FA8', false, false, 30),
  ('quote_given',        'Quote Given',         5,  '#3E7BA6', false, false, 40),
  ('after_two_months',   'After Two Months',    6,  '#6E8FA0', false, false, 30),
  ('next_month',         'Next Month',          7,  '#4F8C9B', false, false, 50),
  ('this_month',         'This Month',          8,  '#3F8F8A', false, false, 60),
  ('bucket_b',           'Bucket B',            9,  '#5F9E62', false, false, 55),
  ('bucket_a',           'Bucket A',           10,  '#3E9147', false, false, 75),
  ('bucket_0',           'Bucket 0',           11,  '#2E8B3F', false, false, 90),
  ('order_received',     'Order Received',     12,  '#1E6B3E', true,  true, 100),
  ('quote_lost',         'Quote Lost',         98,  '#C0392B', true,  false, 0),
  ('not_target',         'Not Target',         99,  '#8A94A0', true,  false, 0)
on conflict (code) do nothing;

-- Human-facing numbers, issued by the database. Counting rows gives two
-- people the same number the moment two of them save at once.
create table if not exists number_series (
  id           smallserial primary key,
  code         text not null unique,
  prefix       text not null,
  current      bigint not null default 0,
  width        smallint not null default 5,
  reset_yearly boolean not null default true
);
insert into number_series (code, prefix, width) values
  ('deal', 'ENQ-', 5), ('quotation', 'NGSE/QTN/', 5), ('tds', 'NGSE/TDS/', 4)
on conflict (code) do nothing;

create or replace function next_number(p_code text)
returns text language plpgsql as $$
declare n bigint; p text; w smallint;
begin
  update number_series set current = current + 1
   where code = p_code
   returning current, prefix, width into n, p, w;
  if n is null then raise exception 'unknown number series: %', p_code; end if;
  return p || lpad(n::text, w, '0');
end $$;

create table if not exists deal (
  id                    uuid primary key default gen_random_uuid(),
  deal_no               text unique,
  title                 text not null,
  customer_id           uuid references customer(id),
  primary_contact_id    uuid references contact(id),
  sector_id             smallint references sector(id),
  owner_user_id         uuid references crm_user(id),
  stage_id              smallint not null references stage(id),
  value_estimate        numeric(16,2),
  currency              text not null default 'INR',
  expected_close_date   date,
  source                text,
  priority              text default 'Standard',
  erp_opportunity_name  text,
  stage_entered_at      timestamptz not null default now(),
  budget_pct            smallint,
  authority_pct         smallint,
  need_pct              smallint,
  timing_pct            smallint,
  competitiveness_pct   smallint,
  technically_qualified_pct smallint,
  is_tender             boolean not null default false,
  closed_at             timestamptz,
  close_reason          text,
  created_at            timestamptz not null default now(),
  created_by            uuid,
  updated_at            timestamptz not null default now()
);
create index if not exists deal_stage_idx    on deal(stage_id);
create index if not exists deal_customer_idx on deal(customer_id);
create index if not exists deal_owner_idx    on deal(owner_user_id);
drop trigger if exists deal_touch on deal;
create trigger deal_touch before update on deal
  for each row execute function crm_touch();

-- Every move. This is what makes "how long was it in each stage" measured
-- rather than remembered, and it is written by a trigger so nobody can
-- forget to write it.
create table if not exists deal_stage_history (
  id         bigserial primary key,
  deal_id    uuid not null references deal(id) on delete cascade,
  stage_id   smallint not null references stage(id),
  entered_at timestamptz not null default now(),
  exited_at  timestamptz,
  days_in_stage numeric generated always as
    (case when exited_at is null then null
          else extract(epoch from (exited_at - entered_at)) / 86400.0 end) stored,
  moved_by   uuid,
  note       text
);
create index if not exists dsh_deal_idx on deal_stage_history(deal_id);

create or replace function deal_stage_log()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into deal_stage_history (deal_id, stage_id, moved_by)
    values (new.id, new.stage_id, new.created_by);
  elsif new.stage_id is distinct from old.stage_id then
    update deal_stage_history set exited_at = now()
     where deal_id = new.id and exited_at is null;
    insert into deal_stage_history (deal_id, stage_id) values (new.id, new.stage_id);
    new.stage_entered_at = now();
  end if;
  return new;
end $$;

drop trigger if exists deal_stage_log_ins on deal;
create trigger deal_stage_log_ins after insert on deal
  for each row execute function deal_stage_log();
drop trigger if exists deal_stage_log_upd on deal;
create trigger deal_stage_log_upd before update on deal
  for each row execute function deal_stage_log();

-- ================================================================== LOCKDOWN
-- RLS on, no policies. The anon and authenticated keys see nothing; the
-- service key -- used only after a route has checked the Genie session --
-- bypasses RLS and is the only way in.
do $$
declare t text;
begin
  foreach t in array array[
    'crm_user','crm_audit','sector','industry','customer','address',
    'contact','contact_phone','stage','deal','deal_stage_history','number_series'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;
