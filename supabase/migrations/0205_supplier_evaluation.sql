-- 0205_supplier_evaluation.sql
--
-- SUPPLIER EVALUATION IN SAAMAAN, BY QUARTER, AND SUPPLIER ONBOARDING
-- (Dr Raghu, 6 Oct 2026: “make a supplier revaluation form where Mukesh can
-- open up each one … Make the financial year and quarter because it has to
-- go as per quarter … It has two parts: Factual information, Evaluation
-- information. The factual information should be open for edit even by the
-- supplier when he logs into the portal … A new supplier can be given a
-- supplier onboarding form … the dropdown of the type of the supplier …
-- follow whatever is there in the ERP and recreate one … I will stop using
-- the ERP’s evaluation completely now.”)
--
--   material_supplier_fact     the factual part, one row per supplier — the
--                              ERP’s Evaluation Form fields, seeded from the
--                              ERP once, kept in Genie from then on
--   material_supplier_eval     the evaluation part, one row per supplier per
--                              financial year and quarter — the ERP’s four
--                              ratings, the rating %, the status, remarks,
--                              who evaluated and who approved
--   material_supplier_onboard  an onboarding form sent to a new supplier: a
--                              link with a token, what they filled in, and
--                              what Nandan decided
--
-- The ERP is not written to. Additive, safe to re-run. No straight
-- apostrophes in these comments: the Supabase SQL editor misreads them.

create table if not exists public.material_supplier_fact (
  supplier          text primary key,          -- the ERP Supplier name
  supplier_type     text not null default '',  -- Company, Individual, Partnership
  supplier_group    text not null default '',
  country           text not null default '',
  gst_category      text not null default '',
  gst_no            text not null default '',
  pan               text not null default '',
  msme_no           text not null default '',
  cost_center       text not null default '',  -- Raw Material, Expanse, Asset, Transport, Services
  item_groups       text[] not null default '{}',
  industry_type     text not null default '',
  type_of_service   text not null default '',
  is_transporter    boolean not null default false,
  payment_terms     text not null default '',
  website           text not null default '',
  iso_certificates  text not null default '',
  supplier_details  text not null default '',
  contact_name      text not null default '',
  mobile            text not null default '',
  email             text not null default '',
  address           text not null default '',
  bank_name         text not null default '',
  account_no        text not null default '',
  ifsc_code         text not null default '',
  supplier_since    text not null default '',  -- under 1, 1, 2, 3, 4, 5+
  seeded_at         timestamptz,
  updated_by        text,
  updated_at        timestamptz,
  updated_via       text not null default ''   -- erp, saamaan, portal, onboarding
);

create table if not exists public.material_supplier_eval (
  id                     uuid primary key default gen_random_uuid(),
  supplier               text not null,
  fy                     text not null,        -- 2026-27
  quarter                text not null check (quarter in ('Q1', 'Q2', 'Q3', 'Q4')),
  meeting_specifications smallint check (meeting_specifications between 1 and 5),
  quality_of_materials   smallint check (quality_of_materials between 1 and 5),
  timeliness_of_supply   smallint check (timeliness_of_supply between 1 and 5),
  responsiveness         smallint check (responsiveness between 1 and 5),
  rating_pct             numeric,
  status                 text not null default 'To Be Evaluated'
                         check (status in ('Approved Supplier', 'Probation', 'Rejected or Blacklisted', 'Not regular Supplier', 'To Be Evaluated')),
  remarks                text not null default '',
  evaluated_by           text,
  evaluated_at           timestamptz,
  approved_by            text,
  approved_at            timestamptz,
  source                 text not null default 'saamaan',   -- erp (seeded) or saamaan
  unique (supplier, fy, quarter)
);
create index if not exists material_supplier_eval_sup on public.material_supplier_eval (supplier, fy desc, quarter desc);

create table if not exists public.material_supplier_onboard (
  id            uuid primary key default gen_random_uuid(),
  token         text not null unique,
  email         text not null,
  company       text not null default '',
  note          text not null default '',
  sent_by       text,
  sent_at       timestamptz not null default now(),
  mail          text not null default '',
  opened_at     timestamptz,
  submitted_at  timestamptz,
  facts         jsonb not null default '{}'::jsonb,
  status        text not null default 'sent' check (status in ('sent', 'submitted', 'accepted', 'rejected', 'withdrawn')),
  supplier_status text not null default '',
  decided_by    text,
  decided_at    timestamptz,
  decision_note text not null default '',
  supplier      text                         -- the ERP Supplier it became, once known
);
create index if not exists material_supplier_onboard_status on public.material_supplier_onboard (status, sent_at desc);

alter table public.material_supplier_fact enable row level security;
alter table public.material_supplier_eval enable row level security;
alter table public.material_supplier_onboard enable row level security;

-- SUPPLIER PAYMENT RELEASE (Dr Raghu, 6 Oct 2026: “add one more tab at the
-- top called Supplier Payment Release … the supplier’s name and the
-- amount, and let them attach the bills, the P.I. … The moment he clicks
-- Submit, an email has to go to accounts@nandan.co.in … The email is only
-- for intimation, not for action.”) Each release also lands in Kuber’s
-- payment plan as a request awaiting approval, which is where accounts act.
create table if not exists public.material_payment_release (
  id           uuid primary key default gen_random_uuid(),
  supplier     text not null,
  kind         text not null default 'advance' check (kind in ('advance', 'bill')),
  amount       numeric not null check (amount > 0),
  bill_refs    text not null default '',
  remarks      text not null default '',
  wanted_on    date,
  files        jsonb not null default '[]'::jsonb,   -- [{ name, path, size }] in the portal bucket
  plan_id      uuid,                                  -- the kuber_payment_plan row it became
  mail         text not null default '',              -- sent, or why not
  by_email     text not null,
  at           timestamptz not null default now()
);
create index if not exists material_payment_release_at on public.material_payment_release (at desc);
alter table public.material_payment_release enable row level security;
