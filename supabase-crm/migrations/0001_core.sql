-- ============================================================================
-- NANDAN CRM — 0001 — CORE
--
-- The second foundation. The first (0001_crm_foundation.sql, Genie 3.18.0.0)
-- was superseded on 24 Aug 2026 by the Sales Genie handover model — the
-- Twenty-CRM-derived object set (company / person / lead / opportunity /
-- quotation / installed base / unified inbox), re-implemented, not copied.
-- The database was empty of transactional data, so it was reset rather than
-- migrated; what the foundation had that the handover lacked is folded in
-- here rather than lost:
--
--   · the fourteen-stage funnel AS ROWS (reordering is an UPDATE, never a
--     migration), with the stage-history trigger that measures time-in-stage
--   · sector (what Nandan makes) and industry (what the customer does),
--     Dr Raghu's own taxonomy, instead of the handover's generic enum
--   · number_series + next_number(), now financial-year aware — the database
--     issues every human-facing number; counting rows gives two people the
--     same number the moment they save at once
--   · crm_audit, written by the one API route on every insert
--   · the BANT-style qualification percentages and the tender flag on what
--     the handover calls an opportunity and the foundation called a deal
--
-- WHO CAN READ THIS DATA: nobody, directly. One login — Genie's. RLS is on
-- and FORCED for every table with no policies at all, so the anon and
-- authenticated keys see nothing. The CRM's route handlers verify the Genie
-- session first and then use the service key, which bypasses RLS. This
-- database never issues a session of its own.
--
-- The identity bridge to Genie is the email address, never a user id.
-- profile.id is this database's own uuid; it means nothing in Genie's.
--
-- Idempotent and additive. Safe to re-run.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------- utilities
create or replace function crm_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ------------------------------------------------------------------- enums
-- Enums for what is structural; rows for what Dr Raghu reorders.
do $$ begin
  create type pipeline_type as enum ('capital', 'aftermarket', 'spares');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_source as enum (
    'indiamart', 'whatsapp', 'email', 'google_ads', 'linkedin',
    'phone', 'exhibition', 'website', 'referral', 'field_visit', 'tender', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_status as enum (
    'new', 'triaging', 'mql', 'sql', 'converted', 'nurture', 'disqualified', 'spam');
exception when duplicate_object then null; end $$;

do $$ begin
  create type quotation_status as enum (
    'draft', 'internal_review', 'approved', 'sent',
    'revised', 'accepted', 'rejected', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type channel_type as enum (
    'email', 'whatsapp', 'indiamart', 'call', 'sms', 'linkedin', 'webform', 'manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type direction as enum ('inbound', 'outbound');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('todo', 'in_progress', 'blocked', 'done', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type unit_status as enum (
    'commissioned', 'under_warranty', 'amc_active', 'amc_lapsed', 'retired');
exception when duplicate_object then null; end $$;

-- =============================================================== A. IDENTITY
-- A mirror of the Genie account, matched on EMAIL. Never on id: this
-- database's uuid and Genie's auth uuid are different numbers for the same
-- person, and storing one in the other's tables points at the wrong person
-- the moment somebody re-enrols. A row existing here IS access to a CRM
-- owner dropdown; opening the CRM at all is Genie's crm_access grant.
create table if not exists profile (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique check (email = lower(email)),
  full_name     text not null,
  initials      text,
  phone         text,
  role          text not null default 'sales'
                check (role in ('admin','ceo','sales_head','sales','service','inside_sales','viewer')),
  pipelines     pipeline_type[] not null default '{capital}',
  reports_to    uuid references profile(id),
  is_active     boolean not null default true,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists profile_touch on profile;
create trigger profile_touch before update on profile
  for each row execute function crm_touch();

insert into profile (email, full_name, initials, role, pipelines)
values ('raghu@nandan.co.in', 'Raghunandan Jagdish', 'RJ', 'sales_head',
        '{capital,aftermarket,spares}')
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

-- ============================================================= B. TAXONOMY
-- Sector is what NANDAN makes. Seven, named by Dr Raghu on 21 Aug 2026.
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

-- What the CUSTOMER does. The 253 ERP industries carry a sector, a priority,
-- an owner and a FOCUS/REGULAR/B10 rating.
create table if not exists industry (
  id                 smallserial primary key,
  name               text not null unique,
  erp_name           text,
  sector_id          smallint references sector(id),
  priority           text check (priority in ('Low','Medium','High','Highest')),
  owner_id           uuid references profile(id),
  goal_qualification text,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
drop trigger if exists industry_touch on industry;
create trigger industry_touch before update on industry
  for each row execute function crm_touch();

-- The fourteen rungs, as rows. is_won marks the one happy ending; the other
-- terminals are the two ways a deal dies.
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

-- Human-facing numbers, issued by the database, now financial-year aware:
-- a yearly series resets itself the first time it is asked for a number in a
-- new FY (Apr–Mar) and stamps the year into the string — NGSE/QTN/26-27/00001.
create table if not exists number_series (
  id           smallserial primary key,
  code         text not null unique,
  prefix       text not null,
  current      bigint not null default 0,
  width        smallint not null default 5,
  reset_yearly boolean not null default true,
  fy           text
);
insert into number_series (code, prefix, width) values
  ('opportunity', 'ENQ-', 5), ('quotation', 'NGSE/QTN/', 5), ('tds', 'NGSE/TDS/', 4)
on conflict (code) do nothing;

create or replace function next_number(p_code text)
returns text language plpgsql as $$
declare
  s   number_series%rowtype;
  lbl text;
  sep text;
begin
  -- '26-27' for any date from Apr 2026 to Mar 2027, reckoned in IST.
  lbl := to_char((now() at time zone 'Asia/Kolkata') - interval '3 months', 'YY')
      || '-'
      || to_char((now() at time zone 'Asia/Kolkata') + interval '9 months', 'YY');

  select * into s from number_series where code = p_code for update;
  if not found then raise exception 'unknown number series: %', p_code; end if;

  if s.reset_yearly and s.fy is distinct from lbl then
    update number_series set current = 1, fy = lbl where id = s.id
      returning current into s.current;
  else
    update number_series set current = current + 1 where id = s.id
      returning current into s.current;
  end if;

  sep := right(s.prefix, 1);
  if sep not in ('/', '-') then sep := '/'; end if;

  if s.reset_yearly then
    return s.prefix || lbl || sep || lpad(s.current::text, s.width, '0');
  end if;
  return s.prefix || lpad(s.current::text, s.width, '0');
end $$;

-- ==================================================== C. ACCOUNTS AND PEOPLE
create table if not exists company (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  erp_name          text unique,
  domain_name       text,
  website           text,
  linkedin_url      text,
  industry_id       smallint references industry(id),
  country           text default 'India',
  state             text,
  city              text,
  gstin             text,
  cin               text,
  indiamart_glid    text,
  annual_revenue    numeric(16,2),
  currency          char(3) default 'INR',
  employee_count    int,
  is_export         boolean not null default false,
  is_customer       boolean not null default false,   -- true once first order won
  first_order_at    date,
  account_owner_id  uuid references profile(id),
  match_key         text,
  merged_into_id    uuid references company(id),
  notes             text,
  search_vector     tsvector generated always as (
                      to_tsvector('simple', coalesce(name,'') || ' ' ||
                      coalesce(domain_name,'') || ' ' || coalesce(city,''))
                    ) stored,
  created_at        timestamptz not null default now(),
  created_by        uuid references profile(id),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index if not exists company_search_idx    on company using gin (search_vector);
create index if not exists company_name_trgm_idx on company using gin (name gin_trgm_ops);
create index if not exists company_owner_idx     on company (account_owner_id);
create index if not exists company_match_idx     on company (match_key);
create unique index if not exists company_gstin_uq on company (gstin) where gstin is not null;
drop trigger if exists company_touch on company;
create trigger company_touch before update on company
  for each row execute function crm_touch();

create table if not exists address (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company(id) on delete cascade,
  label       text,
  line1       text,
  line2       text,
  city        text,
  state       text,
  state_code  text,       -- the GST state code; decides IGST vs CGST+SGST
  pincode     text,
  country     text default 'India',
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists address_touch on address;
create trigger address_touch before update on address
  for each row execute function crm_touch();

create table if not exists person (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid references company(id) on delete set null,
  erp_name          text,
  salutation        text,
  first_name        text,
  last_name         text,
  full_name         text generated always as (
                      trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
                    ) stored,
  job_title         text,
  department        text,
  primary_email     text,
  primary_phone     text,                              -- E.164
  whatsapp_number   text,
  linkedin_url      text,
  is_decision_maker boolean not null default false,
  is_primary        boolean not null default false,
  owner_id          uuid references profile(id),
  active            boolean not null default true,
  search_vector     tsvector generated always as (
                      to_tsvector('simple', coalesce(first_name,'') || ' ' ||
                      coalesce(last_name,'') || ' ' || coalesce(primary_email,''))
                    ) stored,
  created_at        timestamptz not null default now(),
  created_by        uuid references profile(id),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index if not exists person_company_idx on person (company_id);
create index if not exists person_email_idx   on person (lower(primary_email));
create index if not exists person_phone_idx   on person (primary_phone);
create index if not exists person_wa_idx      on person (whatsapp_number);
create index if not exists person_search_idx  on person using gin (search_vector);
drop trigger if exists person_touch on person;
create trigger person_touch before update on person
  for each row execute function crm_touch();

-- Its own table because a call arrives as a NUMBER with no person attached,
-- so the lookup runs backwards. One person has a mobile and a desk line, and
-- a number moves between people when somebody leaves.
create table if not exists person_phone (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references person(id) on delete cascade,
  number_e164 text not null,
  number_raw  text,
  kind        text default 'mobile' check (kind in ('mobile','landline','whatsapp')),
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists person_phone_e164_idx on person_phone(number_e164);

-- ================================================================== D. LEAD
-- The gate the funnel needs for portal volume: EVERY inbound message becomes
-- a row here, junk included — junk gets status 'spam' and stays, because the
-- denominator is what tells you what portal traffic actually costs.
create table if not exists lead (
  id                uuid primary key default gen_random_uuid(),
  source            lead_source not null,
  source_ref        text,                    -- IndiaMART query id / gclid / message id
  status            lead_status not null default 'new',
  pipeline          pipeline_type,           -- set at routing, human or AI

  raw_subject       text,
  raw_body          text,
  raw_payload       jsonb,                   -- untouched webhook body, always keep

  contact_name      text,
  contact_email     text,
  contact_phone     text,
  company_name      text,
  city              text,
  country           text,

  product_interest  text,
  quantity_hint     int,

  ai_score          int check (ai_score between 0 and 100),
  ai_reasoning      text,
  ai_classified_at  timestamptz,

  company_id        uuid references company(id),
  person_id         uuid references person(id),
  opportunity_id    uuid,                    -- FK added after opportunity table

  owner_id          uuid references profile(id),
  first_response_due_at timestamptz,         -- set on insert by the API: the response clock
  first_responded_at    timestamptz,
  disqualify_reason text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists lead_status_idx on lead (status, created_at desc);
create index if not exists lead_source_idx on lead (source, created_at desc);
create index if not exists lead_owner_idx  on lead (owner_id, status);
create index if not exists lead_sla_idx    on lead (first_response_due_at)
  where first_responded_at is null;
create unique index if not exists lead_source_ref_uq on lead (source, source_ref)
  where source_ref is not null;
drop trigger if exists lead_touch on lead;
create trigger lead_touch before update on lead
  for each row execute function crm_touch();

-- ====================================================== E. PRODUCT CATALOGUE
-- The spine of the quotation engine. Seed the REAL GSE model list before the
-- quote builder — a quote built on invented SKUs is worthless.
create table if not exists product (
  id                uuid primary key default gen_random_uuid(),
  sku               text unique not null,
  name              text not null,
  category          text,                    -- Hi-Lift, Bowser, GPU, Towbar, ASRS, Platform
  pipeline          pipeline_type not null default 'capital',
  sector_id         smallint references sector(id),
  description       text,
  specs             jsonb default '{}'::jsonb,
  hsn_code          text,
  gst_rate          numeric(5,2) default 18.00,
  base_price        numeric(16,2),
  standard_cost     numeric(16,2),
  currency          char(3) default 'INR',
  lead_time_weeks   int,
  erpnext_item_code text,                    -- plain text; ERPNext is not modified
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

create table if not exists product_option (    -- optional extras priced per line
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references product(id) on delete cascade,
  name          text not null,
  description   text,
  price         numeric(16,2) not null default 0,
  is_default    boolean not null default false
);

-- =========================================================== F. OPPORTUNITY
-- The foundation called it a deal; the handover model calls it an
-- opportunity. Stage is a ROW, not an enum, and every move is timed by
-- trigger. Terminal moves are guarded: the won stage stamps won_at and marks
-- the company a customer; a lost stage REFUSES to save without a reason —
-- optional means empty, and empty teaches the AI a flattering lie.
create table if not exists opportunity (
  id                  uuid primary key default gen_random_uuid(),
  opportunity_no      text unique,             -- ENQ-26-27-00001, from next_number()
  name                text not null,
  pipeline            pipeline_type not null default 'capital',
  stage_id            smallint not null references stage(id),
  sector_id           smallint references sector(id),
  company_id          uuid references company(id),
  point_of_contact_id uuid references person(id),
  owner_id            uuid references profile(id),

  amount              numeric(16,2),
  currency            char(3) not null default 'INR',
  expected_close_on   date,
  probability         int check (probability between 0 and 100),
  source              lead_source,
  lead_id             uuid references lead(id),
  priority            text default 'Standard',
  is_tender           boolean not null default false,

  -- qualification, as percentages — carried from the foundation's deal
  budget_pct                smallint,
  authority_pct             smallint,
  need_pct                  smallint,
  timing_pct                smallint,
  competitiveness_pct       smallint,
  technically_qualified_pct smallint,

  stage_entered_at    timestamptz not null default now(),
  won_at              timestamptz,
  lost_at             timestamptz,
  lost_reason         text,
  lost_to_competitor  text,

  erp_opportunity_name text,                  -- the old ERP key, for imports
  erpnext_so_no        text,                  -- written back after order
  created_at          timestamptz not null default now(),
  created_by          uuid references profile(id),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index if not exists opp_pipeline_stage_idx on opportunity (pipeline, stage_id);
create index if not exists opp_stage_idx          on opportunity (stage_id);
create index if not exists opp_owner_idx          on opportunity (owner_id, stage_id);
create index if not exists opp_company_idx        on opportunity (company_id);
create index if not exists opp_close_idx          on opportunity (expected_close_on);
drop trigger if exists opportunity_touch on opportunity;
create trigger opportunity_touch before update on opportunity
  for each row execute function crm_touch();

alter table lead drop constraint if exists lead_opportunity_fk;
alter table lead
  add constraint lead_opportunity_fk
  foreign key (opportunity_id) references opportunity(id) on delete set null;

-- Every move, written by trigger so nobody can forget to write it.
create table if not exists opportunity_stage_history (
  id            bigserial primary key,
  opportunity_id uuid not null references opportunity(id) on delete cascade,
  stage_id      smallint not null references stage(id),
  entered_at    timestamptz not null default now(),
  exited_at     timestamptz,
  days_in_stage numeric generated always as
    (case when exited_at is null then null
          else extract(epoch from (exited_at - entered_at)) / 86400.0 end) stored,
  moved_by      uuid,
  note          text
);
create index if not exists osh_opp_idx on opportunity_stage_history(opportunity_id);

create or replace function opportunity_stage_log()
returns trigger language plpgsql as $$
declare s stage%rowtype;
begin
  if tg_op = 'INSERT' then
    insert into opportunity_stage_history (opportunity_id, stage_id, moved_by)
    values (new.id, new.stage_id, new.created_by);
    return new;
  end if;

  if new.stage_id is distinct from old.stage_id then
    update opportunity_stage_history set exited_at = now()
     where opportunity_id = new.id and exited_at is null;
    insert into opportunity_stage_history (opportunity_id, stage_id)
    values (new.id, new.stage_id);
    new.stage_entered_at = now();

    select * into s from stage where id = new.stage_id;
    if s.is_terminal and s.is_won then
      new.won_at  = coalesce(new.won_at, now());
      new.lost_at = null;
      if new.company_id is not null then
        update company
           set is_customer = true,
               first_order_at = coalesce(first_order_at, current_date)
         where id = new.company_id;
      end if;
    elsif s.is_terminal then
      if new.lost_reason is null or length(trim(new.lost_reason)) <= 3 then
        raise exception 'A % move needs a reason — set lost_reason first.', s.name;
      end if;
      new.lost_at = coalesce(new.lost_at, now());
    end if;
  end if;
  return new;
end $$;

drop trigger if exists opportunity_stage_log_ins on opportunity;
create trigger opportunity_stage_log_ins after insert on opportunity
  for each row execute function opportunity_stage_log();
drop trigger if exists opportunity_stage_log_upd on opportunity;
create trigger opportunity_stage_log_upd before update on opportunity
  for each row execute function opportunity_stage_log();

-- ====================================================== G. QUOTATION ENGINE
create table if not exists terms_template (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  pipeline    pipeline_type,
  body        text not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists quotation (
  id                uuid primary key default gen_random_uuid(),
  quote_no          text unique not null,        -- NGSE/QTN/26-27/00001, from next_number()
  revision          int not null default 0,
  parent_quote_id   uuid references quotation(id),
  opportunity_id    uuid not null references opportunity(id) on delete cascade,
  company_id        uuid references company(id),
  contact_id        uuid references person(id),
  owner_id          uuid references profile(id),
  status            quotation_status not null default 'draft',

  -- commercial terms
  currency          char(3) not null default 'INR',
  fx_rate           numeric(12,6) default 1,
  incoterm          text,                        -- EXW, FOB, CIF, DDP
  incoterm_place    text,
  payment_terms     text,
  delivery_weeks    int,
  warranty_months   int default 12,
  validity_days     int not null default 30,
  valid_until       date,

  -- money: every total below is computed by recalc_quotation(), never by
  -- the front end and never by TypeScript
  subtotal          numeric(16,2) not null default 0,
  discount_pct      numeric(5,2) not null default 0,
  discount_amount   numeric(16,2) not null default 0,
  freight           numeric(16,2) not null default 0,
  insurance         numeric(16,2) not null default 0,
  packing           numeric(16,2) not null default 0,
  installation      numeric(16,2) not null default 0,
  taxable_value     numeric(16,2) not null default 0,
  tax_amount        numeric(16,2) not null default 0,
  grand_total       numeric(16,2) not null default 0,

  -- margin control
  total_cost        numeric(16,2) not null default 0,
  margin_pct        numeric(6,2) generated always as (
                      case when grand_total > 0
                      then round(((grand_total - total_cost) / grand_total) * 100, 2)
                      else 0 end
                    ) stored,

  scope_of_supply   text,
  exclusions        text,
  notes             text,
  terms_template_id uuid references terms_template(id),

  approved_by       uuid references profile(id),
  approved_at       timestamptz,
  sent_at           timestamptz,
  pdf_url           text,

  created_at        timestamptz not null default now(),
  created_by        uuid references profile(id),
  updated_at        timestamptz not null default now()
);
create index if not exists quote_opp_idx    on quotation (opportunity_id);
create index if not exists quote_status_idx on quotation (status, created_at desc);
drop trigger if exists quotation_touch on quotation;
create trigger quotation_touch before update on quotation
  for each row execute function crm_touch();

create table if not exists quotation_line (
  id            uuid primary key default gen_random_uuid(),
  quotation_id  uuid not null references quotation(id) on delete cascade,
  line_no       int not null,
  product_id    uuid references product(id),
  description   text not null,
  specs         jsonb default '{}'::jsonb,
  quantity      numeric(12,3) not null default 1,
  uom           text default 'Nos',
  unit_price    numeric(16,2) not null default 0,
  unit_cost     numeric(16,2) not null default 0,
  discount_pct  numeric(5,2) not null default 0,
  hsn_code      text,
  gst_rate      numeric(5,2) not null default 18.00,
  is_optional   boolean not null default false,   -- optional lines excluded from totals
  line_total    numeric(16,2) generated always as (
                  round(quantity * unit_price * (1 - discount_pct/100), 2)
                ) stored,
  created_at    timestamptz not null default now(),
  unique (quotation_id, line_no)
);
create index if not exists qline_quote_idx on quotation_line (quotation_id);

-- Totals trigger: the front end never computes money.
create or replace function recalc_quotation()
returns trigger language plpgsql as $$
declare q uuid; sub numeric(16,2); cost numeric(16,2); tax numeric(16,2);
        disc numeric(16,2); taxable numeric(16,2); rec record;
begin
  q := coalesce(new.quotation_id, old.quotation_id);

  select coalesce(sum(line_total),0), coalesce(sum(quantity*unit_cost),0)
    into sub, cost
    from quotation_line where quotation_id = q and is_optional = false;

  select * into rec from quotation where id = q;

  disc    := round(sub * rec.discount_pct / 100, 2);
  taxable := sub - disc + rec.freight + rec.insurance + rec.packing + rec.installation;

  select coalesce(sum(round(line_total * gst_rate / 100, 2)), 0) into tax
    from quotation_line where quotation_id = q and is_optional = false;

  update quotation set
    subtotal        = sub,
    discount_amount = disc,
    taxable_value   = taxable,
    tax_amount      = tax,
    grand_total     = taxable + tax,
    total_cost      = cost,
    updated_at      = now()
  where id = q;

  return null;
end $$;

drop trigger if exists quotation_line_recalc on quotation_line;
create trigger quotation_line_recalc
after insert or update or delete on quotation_line
for each row execute function recalc_quotation();

-- ================================================== H. INSTALLED BASE & AMC
-- Where aftermarket revenue actually lives.
create table if not exists installed_unit (
  id                uuid primary key default gen_random_uuid(),
  serial_no         text unique not null,
  product_id        uuid references product(id),
  company_id        uuid references company(id),
  site_name         text,                        -- e.g. BOM T2 Airside
  iata_code         text,
  country           text,
  commissioned_on   date,
  warranty_ends_on  date,
  status            unit_status not null default 'commissioned',
  erpnext_so_no     text,
  last_service_on   date,
  next_service_due  date,
  notes             text,
  created_at        timestamptz not null default now()
);
create index if not exists unit_company_idx on installed_unit (company_id);
create index if not exists unit_due_idx     on installed_unit (next_service_due)
  where status <> 'retired';

create table if not exists amc_contract (
  id                uuid primary key default gen_random_uuid(),
  contract_no       text unique not null,
  company_id        uuid references company(id),
  start_on          date not null,
  end_on            date not null,
  value             numeric(16,2),
  currency          char(3) default 'INR',
  visits_per_year   int,
  owner_id          uuid references profile(id),
  renewal_opportunity_id uuid references opportunity(id),
  created_at        timestamptz not null default now()
);

create table if not exists amc_contract_unit (
  amc_contract_id   uuid references amc_contract(id) on delete cascade,
  installed_unit_id uuid references installed_unit(id) on delete cascade,
  primary key (amc_contract_id, installed_unit_id)
);

-- ======================================================= I. UNIFIED INBOX
-- Email + WhatsApp + IndiaMART + calls, one table.
create table if not exists channel_account (
  id             uuid primary key default gen_random_uuid(),
  channel        channel_type not null,
  label          text not null,                  -- "sales@nandan.co.in", "Nandan WA Business"
  handle         text not null,                  -- address / number / seller id
  owner_id       uuid references profile(id),
  credentials    jsonb,                          -- refs only; secrets live in Vault
  is_active      boolean not null default true,
  last_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  unique (channel, handle)
);

create table if not exists message (
  id                 uuid primary key default gen_random_uuid(),
  channel            channel_type not null,
  channel_account_id uuid references channel_account(id),
  direction          direction not null,
  external_id        text,
  thread_key         text,                       -- groups a conversation
  subject            text,
  body_text          text,
  body_html          text,
  from_handle        text,
  to_handles         text[],
  attachments        jsonb default '[]'::jsonb,
  occurred_at        timestamptz not null default now(),

  company_id         uuid references company(id),
  person_id          uuid references person(id),
  lead_id            uuid references lead(id),
  opportunity_id     uuid references opportunity(id),

  requires_reply     boolean not null default false,
  replied_at         timestamptz,
  reply_due_at       timestamptz,
  ai_summary         text,
  ai_intent          text,                       -- rfq | spares | service | payment | other
  raw_payload        jsonb,

  created_at         timestamptz not null default now(),
  unique (channel, external_id)
);
create index if not exists msg_thread_idx  on message (thread_key, occurred_at);
create index if not exists msg_company_idx on message (company_id, occurred_at desc);
create index if not exists msg_open_idx    on message (reply_due_at)
  where requires_reply = true and replied_at is null;

-- AI proposes, a human sends. The delta between draft_body and edited_body is
-- the best training signal we will get — log the edit, always.
create table if not exists ai_draft (
  id            uuid primary key default gen_random_uuid(),
  message_id    uuid references message(id) on delete cascade,
  lead_id       uuid references lead(id) on delete cascade,
  draft_body    text not null,
  sources       jsonb default '[]'::jsonb,       -- past quotes/answers the draft leaned on
  model         text,
  approved_by   uuid references profile(id),
  approved_at   timestamptz,
  edited_body   text,
  sent_at       timestamptz,
  rejected      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ============================================================ J. CALL LOG
-- Ingested from the Emergent mobile app. Upserts on external_id — the app
-- retries, so the endpoint must be idempotent.
create table if not exists call_log (
  id                 uuid primary key default gen_random_uuid(),
  external_id        text unique,                -- device-side call id, idempotency key
  device_owner_id    uuid references profile(id),
  direction          direction not null,
  counterpart_number text not null,
  started_at         timestamptz not null,
  ended_at           timestamptz,
  duration_seconds   int,

  recording_url      text,                       -- Google Drive file link
  drive_file_id      text,
  transcript         text,
  transcript_lang    text,
  ai_summary         text,
  ai_next_action     text,
  ai_sentiment       text,

  person_id          uuid references person(id),
  company_id         uuid references company(id),
  opportunity_id     uuid references opportunity(id),
  task_id            uuid,                       -- FK added after task table
  matched_by         text,                       -- phone_exact | phone_fuzzy | manual | unmatched

  consent_captured   boolean not null default false,
  created_at         timestamptz not null default now()
);
create index if not exists call_owner_idx  on call_log (device_owner_id, started_at desc);
create index if not exists call_number_idx on call_log (counterpart_number);

-- ========================================== K. TASKS, NOTES, LINKS, TIMELINE
create table if not exists task (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text,
  status        task_status not null default 'todo',
  priority      int not null default 3 check (priority between 1 and 5),
  due_at        timestamptz,
  assignee_id   uuid references profile(id),
  created_by    uuid references profile(id),
  source        text,                            -- call_log | ai | manual | workflow
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists task_assignee_idx on task (assignee_id, status, due_at);
drop trigger if exists task_touch on task;
create trigger task_touch before update on task
  for each row execute function crm_touch();

alter table call_log drop constraint if exists call_task_fk;
alter table call_log
  add constraint call_task_fk foreign key (task_id) references task(id) on delete set null;

create table if not exists note (
  id          uuid primary key default gen_random_uuid(),
  title       text,
  body        text not null,
  created_by  uuid references profile(id),
  created_at  timestamptz not null default now()
);

-- Polymorphic link table (Twenty's taskTarget / noteTarget pattern, generalised).
create table if not exists record_link (
  id            uuid primary key default gen_random_uuid(),
  source_type   text not null check (source_type in ('task','note','attachment')),
  source_id     uuid not null,
  target_type   text not null check (target_type in
                  ('company','person','lead','opportunity','quotation','installed_unit')),
  target_id     uuid not null,
  created_at    timestamptz not null default now(),
  unique (source_type, source_id, target_type, target_id)
);
create index if not exists link_target_idx on record_link (target_type, target_id);

create table if not exists attachment (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  storage_path  text not null,                   -- Supabase Storage key
  mime_type     text,
  size_bytes    bigint,
  uploaded_by   uuid references profile(id),
  created_at    timestamptz not null default now()
);

-- The timeline. APPEND-ONLY: never update or delete a row here.
create table if not exists activity (
  id            uuid primary key default gen_random_uuid(),
  happened_at   timestamptz not null default now(),
  actor_id      uuid references profile(id),
  actor_type    text not null default 'user' check (actor_type in ('user','ai','system','webhook')),
  verb          text not null,                   -- created | stage_changed | quoted | replied | called
  target_type   text not null,
  target_id     uuid not null,
  summary       text,
  properties    jsonb default '{}'::jsonb
);
create index if not exists activity_target_idx on activity (target_type, target_id, happened_at desc);
create index if not exists activity_time_idx   on activity (happened_at desc);

-- ================================================= L. THE CEO COCKPIT VIEWS
-- Owner concentration is on the home screen because today most order value
-- flows through two people. A number nobody sees is a number nobody manages.
create or replace view v_owner_concentration as
select
  p.id as owner_id,
  p.full_name,
  o.pipeline,
  count(*)                                   as open_deals,
  coalesce(sum(o.amount), 0)                 as open_value,
  round(100.0 * coalesce(sum(o.amount), 0)
        / nullif(sum(coalesce(sum(o.amount), 0)) over (), 0), 1) as pct_of_pipeline
from opportunity o
join stage s   on s.id = o.stage_id and not s.is_terminal
join profile p on p.id = o.owner_id
where o.deleted_at is null
group by p.id, p.full_name, o.pipeline;

create or replace view v_funnel as
select
  date_trunc('month', l.created_at)::date as month,
  l.source,
  l.pipeline,
  count(*)                                                       as leads,
  count(*) filter (where l.status in ('mql','sql','converted'))  as mql,
  count(*) filter (where l.status in ('sql','converted'))        as sql,
  count(*) filter (where l.status = 'converted')                 as converted
from lead l
group by 1,2,3;

create or replace view v_response_sla as
select
  l.source,
  count(*)                                                               as total,
  count(*) filter (where l.first_responded_at is not null)               as answered,
  count(*) filter (where l.first_responded_at > l.first_response_due_at) as breached,
  round(avg(extract(epoch from (l.first_responded_at - l.created_at))/60)::numeric, 1)
                                                                         as avg_minutes
from lead l
where l.created_at > now() - interval '90 days'
group by l.source;

-- ================================================================== LOCKDOWN
-- RLS on and FORCED, no policies. The anon and authenticated keys see
-- nothing; the service key — used only after a route has checked the Genie
-- session — bypasses RLS and is the only way in. This database issues no
-- sessions of its own, so there is no auth.uid() to write a policy against.
do $$
declare t text;
begin
  foreach t in array array[
    'profile','crm_audit','sector','industry','stage','number_series',
    'company','address','person','person_phone','lead',
    'product','product_option','opportunity','opportunity_stage_history',
    'terms_template','quotation','quotation_line',
    'installed_unit','amc_contract','amc_contract_unit',
    'channel_account','message','ai_draft','call_log',
    'task','note','record_link','attachment','activity'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;
