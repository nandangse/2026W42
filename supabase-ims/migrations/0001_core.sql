-- ============================================================================
-- NANDAN IMS — 0001 — CORE
--
-- The Integrated Management System: ISO 9001, 14001, 45001, 27001, AWS D1.1
-- and EN 1090-2 EXC3, plus the non-ISO schemes (ZED, customer audits).
--
-- A SEPARATE FORK, exactly as the CRM is (Dr Raghu, 2 Sep 2026: "IMS separate
-- fork"). Its own Supabase project; nothing here can see a Genie table and
-- nothing in Genie can see an IMS one. That separation is enforced by them
-- being different databases, not by a naming convention somebody could break
-- in a hurry.
--
-- WHO CAN READ THIS DATA: nobody, directly. One login — Genie's. RLS is on
-- and FORCED for every table with no policies at all, so the anon and
-- authenticated keys see nothing. The IMS route handlers verify the Genie
-- session first (src/ims/auth.ts), resolve the caller's IMS role, and then
-- use the service key, which bypasses RLS. This database never issues a
-- session of its own and could not validate a Genie one — it never signed
-- the token. The gate therefore lives in code that can be read rather than
-- in a policy that would have to trust a foreign signature.
--
-- The identity bridge to Genie is the EMAIL ADDRESS, never a user id.
-- ims_profile.id is this database's own uuid; it means nothing in Genie's,
-- and every column here that names a person takes THIS id.
--
-- DIVERGENCE FROM THE BUILD INSTRUCTION, on its own §7 ("follow the repo"):
--   · no tenant_id — Nandan GSE is one company and every other Genie
--     database is single-tenant. A column that is the same value on every
--     row of every table is a column that will be forgotten in a WHERE and
--     then trusted anyway.
--   · no references auth.users(id) — auth lives in GENIE's project, not this
--     one. Those FKs would not resolve.
--   · public schema with ims_ / core_ prefixes rather than `ims` and `core`
--     Postgres schemas — PostgREST only serves schemas exposed in the
--     project's API settings, and a migration cannot set that. Prefixes give
--     the same separation with nothing to configure by hand.
--   · RLS with no policies + a code gate, instead of ims.has_role() policies,
--     for the reason in the paragraph above.
--
-- Line comments only. Idempotent and additive. Safe to re-run.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------- utilities
create or replace function ims_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ============================================================== A. IDENTITY
-- A mirror of the Genie account, matched on EMAIL. A row existing here IS a
-- name in an owner dropdown; opening the IMS at all is Genie's ims_access
-- grant, which lives in Genie's database because that is where the Admin
-- screen that makes the grant lives.
--
-- ROLES (design §2):
--   ims_admin  — the Management Representative. Everything.
--   dept_head  — approves their department's documents, closes their CAPAs.
--   auditor    — plans and runs audits. May not audit their own department.
--   member     — reads APPROVED documents, raises feedback/kaizen, does tasks.
create table if not exists ims_profile (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique check (email = lower(email)),
  full_name    text not null,
  initials     text,
  role         text not null default 'member'
               check (role in ('ims_admin','dept_head','auditor','member')),
  department   text,
  is_active    boolean not null default true,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
drop trigger if exists ims_profile_touch on ims_profile;
create trigger ims_profile_touch before update on ims_profile
  for each row execute function ims_touch();

-- The MR, seeded. Everybody else arrives when Genie grants them the door.
insert into ims_profile (email, full_name, initials, role, department)
values ('raghu@nandan.co.in', 'Raghunandan Jagdish', 'RJ', 'ims_admin', 'Management')
on conflict (email) do update set role = 'ims_admin';

-- Every write the route handlers make, logged. Auditors ask who changed what.
-- NAMED _log deliberately: ims_audit is the INTERNAL AUDIT instance (§I).
-- Two tables called ims_audit is how `create table if not exists` silently
-- does nothing and the second table never exists.
create table if not exists ims_audit_log (
  id        bigserial primary key,
  entity    text not null,
  entity_id text,
  action    text not null,
  by_email  text,
  detail    jsonb,
  at        timestamptz not null default now()
);
create index if not exists ims_audit_log_entity_idx on ims_audit_log (entity, entity_id, at desc);

-- Module-wide settings. One row, id = 1.
--   approval_mode — 'two_step' (Dept Head reviews, IMS Admin approves) or
--   'single' (IMS Admin alone). The build instruction §4 asked for two_step
--   with a flag so it can be flipped without code; this is the flag.
create table if not exists ims_settings (
  id            smallint primary key default 1 check (id = 1),
  approval_mode text not null default 'two_step'
                check (approval_mode in ('two_step','single')),
  updated_by    text,
  updated_at    timestamptz not null default now()
);
insert into ims_settings (id) values (1) on conflict (id) do nothing;

-- ============================================================== B. NUMBERING
-- The database issues every human-facing number. Counting rows gives two
-- people the same number the moment they save at once — which is exactly what
-- an auditor finds first.

-- B1. Controlled documents: NGSE-QMS-PRO-012, a serial per SYS + TYPE.
create table if not exists ims_doc_series (
  sys         text not null,
  doc_type    text not null,
  next_serial int  not null default 1,
  primary key (sys, doc_type)
);

create or replace function ims_next_doc_no(p_sys text, p_type text)
returns text language plpgsql as $$
declare n int;
begin
  insert into ims_doc_series (sys, doc_type) values (p_sys, p_type)
    on conflict (sys, doc_type) do nothing;
  -- FOR UPDATE holds the row until this transaction ends, so two concurrent
  -- creates queue rather than collide.
  select next_serial into n from ims_doc_series
    where sys = p_sys and doc_type = p_type for update;
  update ims_doc_series set next_serial = n + 1
    where sys = p_sys and doc_type = p_type;
  return 'NGSE-' || p_sys || '-' || p_type || '-' || lpad(n::text, 3, '0');
end $$;

-- B2. Everything else that wears a number (NCs, audits, CAPAs), financial-year
-- aware, the CRM's own next_number() carried across unchanged so the two
-- databases number things the same way.
create table if not exists ims_number_series (
  id           smallserial primary key,
  code         text not null unique,
  prefix       text not null,
  width        smallint not null default 4,
  current      int not null default 0,
  reset_yearly boolean not null default true,
  fy           text
);
insert into ims_number_series (code, prefix, width) values
  ('nonconformity', 'NGSE/NC/',   4),
  ('audit',         'NGSE/IA/',   4),
  ('capa',          'NGSE/CAPA/', 4),
  ('kaizen',        'NGSE/KZN/',  4)
on conflict (code) do nothing;

create or replace function ims_next_number(p_code text)
returns text language plpgsql as $$
declare
  s   ims_number_series%rowtype;
  lbl text;
  sep text;
begin
  -- '26-27' for any date from Apr 2026 to Mar 2027, reckoned in IST.
  lbl := to_char((now() at time zone 'Asia/Kolkata') - interval '3 months', 'YY')
      || '-'
      || to_char((now() at time zone 'Asia/Kolkata') + interval '9 months', 'YY');

  select * into s from ims_number_series where code = p_code for update;
  if not found then raise exception 'unknown number series: %', p_code; end if;

  if s.reset_yearly and s.fy is distinct from lbl then
    update ims_number_series set current = 1, fy = lbl where id = s.id
      returning current into s.current;
  else
    update ims_number_series set current = current + 1 where id = s.id
      returning current into s.current;
  end if;

  sep := right(s.prefix, 1);
  if sep not in ('/', '-') then sep := '/'; end if;

  if s.reset_yearly then
    return s.prefix || lbl || sep || lpad(s.current::text, s.width, '0');
  end if;
  return s.prefix || lpad(s.current::text, s.width, '0');
end $$;

-- ================================================== C. THE SHARED ENGINES
-- core_* is deliberately un-prefixed by "ims": these are the engines CRM,
-- HRMS, LMS and Seva will all want (design §6b). They live in the IMS
-- database today because IMS is the first module that needs them; when a
-- second module wants them the table moves, and the prefix is the reminder
-- that these were never IMS's alone.

-- C1. One task table for the whole of Genie.
create table if not exists core_task (
  id           uuid primary key default gen_random_uuid(),
  module       text not null default 'IMS',
  title        text not null,
  description  text not null default '',
  -- Where it came from, so nothing is a dead end and nothing is duplicated.
  source_type  text,   -- 'cert_expiry'|'audit_finding'|'capa'|'mr_action'|'cert_path'|'manual'
  source_id    uuid,
  -- The threshold that raised it (90/60/30/7), so the daily scan can tell a
  -- 90-day warning from the 30-day one and raise both without duplicating
  -- either.
  source_key   text,
  owner_id     uuid references ims_profile(id),
  due_date     date,
  priority     text not null default 'normal'
               check (priority in ('low','normal','high','urgent')),
  status       text not null default 'open'
               check (status in ('open','in_progress','done','cancelled')),
  completed_at timestamptz,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
drop trigger if exists core_task_touch on core_task;
create trigger core_task_touch before update on core_task
  for each row execute function ims_touch();
create index if not exists core_task_owner_idx  on core_task (owner_id, status, due_date);
create index if not exists core_task_source_idx on core_task (source_type, source_id, source_key);
-- The dedupe the cron leans on: one open task per source + threshold.
create unique index if not exists core_task_source_open_idx
  on core_task (source_type, source_id, source_key)
  where status in ('open','in_progress') and source_id is not null;

-- C2. One calendar for the whole org.
create table if not exists core_event (
  id          uuid primary key default gen_random_uuid(),
  module      text not null default 'IMS',
  event_type  text not null default 'audit',
  title       text not null,
  description text not null default '',
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  all_day     boolean not null default true,
  location    text not null default '',
  department  text not null default '',
  source_type text,
  source_id   uuid,
  owner_id    uuid references ims_profile(id),
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists core_event_when_idx on core_event (starts_at);

-- C3. The checklist engine — schema now, UI in Phase 2 (design §4.15).
create table if not exists core_checklist_template (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  module      text not null default 'IMS',
  description text not null default '',
  version     int  not null default 1,
  status      text not null default 'draft'
              check (status in ('draft','published','archived')),
  clause_refs jsonb not null default '[]'::jsonb,
  created_by  text,
  created_at  timestamptz not null default now()
);

create table if not exists core_checklist_item (
  id                uuid primary key default gen_random_uuid(),
  template_id       uuid not null references core_checklist_template(id) on delete cascade,
  section           text not null default '',
  seq               int  not null default 0,
  prompt            text not null,
  item_type         text not null default 'yes_no'
                    check (item_type in ('yes_no','pass_fail','value','text','photo','signature')),
  unit              text not null default '',
  required          boolean not null default true,
  evidence_required boolean not null default false
);
create index if not exists core_checklist_item_tpl_idx on core_checklist_item (template_id, seq);

create table if not exists core_checklist_run (
  id               uuid primary key default gen_random_uuid(),
  template_id      uuid not null references core_checklist_template(id),
  template_version int not null default 1,
  run_by           uuid references ims_profile(id),
  context_type     text,
  context_id       uuid,
  location         text not null default '',
  started_at       timestamptz not null default now(),
  completed_at     timestamptz,
  status           text not null default 'in_progress'
                   check (status in ('in_progress','complete','abandoned'))
);

create table if not exists core_checklist_response (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references core_checklist_run(id) on delete cascade,
  item_id      uuid not null references core_checklist_item(id),
  response     jsonb not null default '{}'::jsonb,
  remarks      text not null default '',
  -- [{type:'photo'|'voice'|'video'|'handwriting', storage_path, ocr_text?}]
  evidence     jsonb not null default '[]'::jsonb,
  responded_at timestamptz not null default now()
);
create index if not exists core_checklist_response_run_idx on core_checklist_response (run_id);

-- ============================================= D. STANDARDS AND THEIR CLAUSES
create table if not exists ims_standard (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,   -- 'ISO9001' | 'EN1090' | ...
  name                text not null,
  sys                 text not null
                      check (sys in ('QMS','EMS','OHS','ISMS','IMS','WLD')),
  -- The purchased copy. PRIVATE bucket, signed URLs, ims_admin/dept_head only:
  -- these are copyrighted documents and a public link is a licence breach.
  standard_copy_path  text,
  sort_order          smallint not null default 0
);

create table if not exists ims_standard_clause (
  id            uuid primary key default gen_random_uuid(),
  standard_id   uuid not null references ims_standard(id) on delete cascade,
  clause_no     text not null,     -- '7.1.5', 'A.5.1'
  title         text not null,
  parent_clause text,
  sort_order    int  not null default 0,
  unique (standard_id, clause_no)
);
create index if not exists ims_clause_std_idx on ims_standard_clause (standard_id, sort_order);

-- ================================================== E. CERTIFICATES & STATUTORY
-- One table. A statutory licence IS a certificate with a different `kind` and
-- a renewal owner; building two screens for one shape is how the Factory
-- Licence ends up expiring in a register nobody opened.
create table if not exists ims_certificate (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null default 'certification'
                    check (kind in ('certification','statutory','welder_qual',
                                    'calibration','equipment_test')),
  title             text not null,
  certificate_no    text not null default '',
  scheme            text not null default '',   -- 'ISO 9001' | 'Factory Licence' | 'MPCB CTO'
  issuing_body      text not null default '',
  issue_date        date,
  expiry_date       date,
  surveillance_dates date[] not null default '{}',
  renewal_owner_id  uuid references ims_profile(id),
  file_path         text,
  remarks           text not null default '',
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
drop trigger if exists ims_certificate_touch on ims_certificate;
create trigger ims_certificate_touch before update on ims_certificate
  for each row execute function ims_touch();
create index if not exists ims_certificate_expiry_idx on ims_certificate (expiry_date);
create index if not exists ims_certificate_kind_idx   on ims_certificate (kind);

-- ============================================== F. CONTROLLED DOCUMENTS ENGINE
-- One engine, many faces (design §1). The QMS Manual, the HSE Manual, every
-- procedure and every work instruction are rows here. "QMS manual" is not a
-- feature; it is data.
create table if not exists ims_document (
  id                  uuid primary key default gen_random_uuid(),
  doc_no              text unique,           -- assigned by trigger, never by hand
  sys                 text not null
                      check (sys in ('QMS','EMS','OHS','ISMS','IMS','WLD')),
  doc_type            text not null
                      check (doc_type in ('MAN','PRO','WI','FRM','CHK','PLN')),
  title               text not null,
  department          text not null default '',
  owner_id            uuid references ims_profile(id),
  status              text not null default 'draft'
                      check (status in ('draft','in_review','approved','obsolete')),
  current_revision_id uuid,
  created_by          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
drop trigger if exists ims_document_touch on ims_document;
create trigger ims_document_touch before update on ims_document
  for each row execute function ims_touch();

-- The number is issued by the database on insert. A doc_no supplied by the
-- caller is ignored: two people creating a procedure at the same moment must
-- not be able to produce two NGSE-QMS-PRO-012s.
create or replace function ims_document_number()
returns trigger language plpgsql as $$
begin
  if new.doc_no is null or new.doc_no = '' then
    new.doc_no := ims_next_doc_no(new.sys, new.doc_type);
  end if;
  return new;
end $$;
drop trigger if exists ims_document_number_trg on ims_document;
create trigger ims_document_number_trg before insert on ims_document
  for each row execute function ims_document_number();

create table if not exists ims_document_revision (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references ims_document(id) on delete cascade,
  rev_no         int  not null default 0,
  -- Rich text going forward (design §7.1); file_path for the legacy Rev 00
  -- ports, because "port, don't redesign" beats retyping a working procedure.
  body           jsonb,
  body_html      text,
  file_path      text,
  change_summary text not null default '',
  prepared_by    uuid references ims_profile(id),
  reviewed_by    uuid references ims_profile(id),
  approved_by    uuid references ims_profile(id),
  reviewed_at    timestamptz,
  approved_at    timestamptz,
  effective_date date,
  status         text not null default 'draft'
                 check (status in ('draft','in_review','approved','superseded')),
  created_by     text,
  created_at     timestamptz not null default now(),
  unique (document_id, rev_no)
);
create index if not exists ims_doc_rev_idx on ims_document_revision (document_id, rev_no desc);

do $$ begin
  alter table ims_document add constraint ims_document_current_rev_fk
    foreign key (current_revision_id) references ims_document_revision(id);
exception when duplicate_object then null; end $$;

-- Which clauses a document answers. This m2m is what makes the Clause
-- Evidence Matrix (design §4.16) fall out of data already entered rather
-- than out of a second round of tagging nobody will do.
create table if not exists ims_document_clause_map (
  document_id uuid not null references ims_document(id) on delete cascade,
  clause_id   uuid not null references ims_standard_clause(id) on delete cascade,
  primary key (document_id, clause_id)
);

-- ================================================ G. THE REGISTER ENGINE
-- One engine, many registers (design §1). Risk, HIRA, Aspect-Impact, Legal,
-- SoA, PPE issue, work permits — all instances. The admin defines columns;
-- the engine renders, validates and stores. No code change per register.
create table if not exists ims_register_definition (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  sys         text,
  description text not null default '',
  -- [{key,label,type:'text'|'number'|'date'|'select'|'user'|'file'|'bool',options?,required?}]
  columns     jsonb not null default '[]'::jsonb,
  clause_refs jsonb not null default '[]'::jsonb,
  -- Seeded registers may be EDITED by the MR but never deleted: an auditor
  -- asking for the HIRA register must not be told somebody removed it.
  is_system   boolean not null default false,
  sort_order  smallint not null default 0,
  created_by  text,
  created_at  timestamptz not null default now()
);

create table if not exists ims_register_entry (
  id          uuid primary key default gen_random_uuid(),
  register_id uuid not null references ims_register_definition(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  status      text not null default 'open',
  owner_id    uuid references ims_profile(id),
  review_date date,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_by  text,
  updated_at  timestamptz not null default now()
);
drop trigger if exists ims_register_entry_touch on ims_register_entry;
create trigger ims_register_entry_touch before update on ims_register_entry
  for each row execute function ims_touch();
create index if not exists ims_reg_entry_idx on ims_register_entry (register_id, created_at desc);

-- ============================================= H. THE CERTIFICATION JOURNEY
-- Scheme-agnostic on purpose (design §4.14): ZED, a customer audit and a
-- future defence scheme are the same shape as ISO 9001. What we have, what
-- is underway, what we are aiming at — the wall of aims.
create table if not exists ims_certification (
  id             uuid primary key default gen_random_uuid(),
  -- UNIQUE so a re-run of the seed updates the row rather than growing a
  -- second ISO 9001 beside the first.
  scheme         text not null unique,
  body           text not null default '',
  status         text not null default 'target'
                 check (status in ('achieved','in_progress','target')),
  target_date    date,
  achieved_date  date,
  owner_id       uuid references ims_profile(id),
  certificate_id uuid references ims_certificate(id),
  notes          text not null default '',
  sort_order     smallint not null default 0,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
drop trigger if exists ims_certification_touch on ims_certification;
create trigger ims_certification_touch before update on ims_certification
  for each row execute function ims_touch();

-- The implementation path: gap assessment -> documentation -> implementation
-- -> internal audit -> pre-assessment -> certification audit. Each step can
-- spawn a task, which is how an aim becomes work somebody owns.
create table if not exists ims_certification_path_step (
  id               uuid primary key default gen_random_uuid(),
  certification_id uuid not null references ims_certification(id) on delete cascade,
  seq              int  not null default 0,
  title            text not null,
  description      text not null default '',
  owner_id         uuid references ims_profile(id),
  due_date         date,
  status           text not null default 'pending'
                   check (status in ('pending','in_progress','done')),
  task_id          uuid references core_task(id) on delete set null
);
create index if not exists ims_cert_step_idx on ims_certification_path_step (certification_id, seq);

-- ==================================== I. THE QUALITY LOOP — schema now, UI later
-- Audit finding -> NC -> RCA -> CAPA -> verification -> effectiveness check.
-- Every one of these exists from day one so that nothing built later has to
-- migrate data out of a spreadsheet.
create table if not exists ims_nonconformity (
  id          uuid primary key default gen_random_uuid(),
  nc_no       text unique,
  source      text not null default 'internal_audit',
  description text not null,
  severity    text not null default 'minor'
              check (severity in ('observation','minor','major','critical')),
  department  text not null default '',
  status      text not null default 'open'
              check (status in ('open','rca','capa','verification','closed')),
  raised_by   uuid references ims_profile(id),
  closed_at   timestamptz,
  created_at  timestamptz not null default now()
);

create or replace function ims_nc_number()
returns trigger language plpgsql as $$
begin
  if new.nc_no is null or new.nc_no = '' then
    new.nc_no := ims_next_number('nonconformity');
  end if;
  return new;
end $$;
drop trigger if exists ims_nc_number_trg on ims_nonconformity;
create trigger ims_nc_number_trg before insert on ims_nonconformity
  for each row execute function ims_nc_number();

create table if not exists ims_rca (
  id         uuid primary key default gen_random_uuid(),
  nc_id      uuid not null references ims_nonconformity(id) on delete cascade,
  method     text not null default '5why' check (method in ('5why','fishbone','other')),
  analysis   jsonb not null default '{}'::jsonb,
  root_cause text not null default '',
  done_by    uuid references ims_profile(id),
  created_at timestamptz not null default now()
);

create table if not exists ims_capa (
  id                      uuid primary key default gen_random_uuid(),
  nc_id                   uuid not null references ims_nonconformity(id) on delete cascade,
  correction              text not null default '',
  corrective_action       text not null,
  owner_id                uuid references ims_profile(id),
  due_date                date,
  verified_by             uuid references ims_profile(id),
  verified_at             timestamptz,
  -- The field every auditor turns to. Not optional in practice.
  effectiveness_check_date date,
  effectiveness_result    text not null default '',
  status                  text not null default 'open'
                          check (status in ('open','in_progress','verified','closed')),
  created_at              timestamptz not null default now()
);

create table if not exists ims_feedback (
  id             uuid primary key default gen_random_uuid(),
  channel        text not null default 'employee'
                 check (channel in ('customer','supplier','employee')),
  rating         smallint,
  body           text not null,
  contact_ref    text not null default '',
  anonymous      boolean not null default false,
  submitted_by   uuid references ims_profile(id),
  triage_status  text not null default 'new'
                 check (triage_status in ('new','triaged','converted','closed')),
  converted_type text,
  converted_id   uuid,
  created_at     timestamptz not null default now()
);

-- Anonymity enforced by the DATABASE, not by the form. A checkbox the client
-- honours is not anonymity; a trigger that nulls the name before the row is
-- written is.
create or replace function ims_feedback_anonymise()
returns trigger language plpgsql as $$
begin
  if new.anonymous then new.submitted_by := null; end if;
  return new;
end $$;
drop trigger if exists ims_feedback_anon_trg on ims_feedback;
create trigger ims_feedback_anon_trg before insert or update on ims_feedback
  for each row execute function ims_feedback_anonymise();

create table if not exists ims_objective (
  id         uuid primary key default gen_random_uuid(),
  sys        text not null default 'QMS',
  objective  text not null,
  kpi        text not null default '',
  target     text not null default '',
  owner_id   uuid references ims_profile(id),
  frequency  text not null default 'monthly',
  csf_link   text not null default '',
  created_at timestamptz not null default now()
);

-- A missing reading is a MISSING reading. Nothing here defaults to zero:
-- "No data" and "0%" are different facts and a management review that
-- confuses them reviews a fiction (the Genie_Feed rule).
create table if not exists ims_objective_reading (
  id           uuid primary key default gen_random_uuid(),
  objective_id uuid not null references ims_objective(id) on delete cascade,
  period       text not null,
  actual       text,
  remarks      text not null default '',
  entered_by   uuid references ims_profile(id),
  created_at   timestamptz not null default now(),
  unique (objective_id, period)
);

create table if not exists ims_kaizen (
  id               uuid primary key default gen_random_uuid(),
  idea             text not null,
  area             text not null default '',
  before_state     text not null default '',
  after_state      text not null default '',
  photos           jsonb not null default '[]'::jsonb,
  estimated_saving numeric,
  -- Only Accounts may set this, and only from the monthly P&L. An estimated
  -- saving that nobody confirmed is an opinion (design §4.7).
  confirmed_saving numeric,
  confirmed_by     uuid references ims_profile(id),
  status           text not null default 'idea'
                   check (status in ('idea','approved','implemented','verified','rejected')),
  owner_id         uuid references ims_profile(id),
  created_by       text,
  created_at       timestamptz not null default now()
);

create table if not exists ims_audit_plan (
  id            uuid primary key default gen_random_uuid(),
  year          text not null,
  sys           text,
  department    text not null default '',
  planned_month text not null default '',
  audit_type    text not null default 'internal',
  status        text not null default 'planned'
                check (status in ('planned','scheduled','done','cancelled'))
);

create table if not exists ims_audit (
  id                uuid primary key default gen_random_uuid(),
  audit_no          text unique,
  plan_id           uuid references ims_audit_plan(id),
  auditor_id        uuid references ims_profile(id),
  auditee_department text not null default '',
  audit_date        date,
  checklist_run_id  uuid references core_checklist_run(id),
  status            text not null default 'scheduled'
                    check (status in ('scheduled','in_progress','closed')),
  created_at        timestamptz not null default now()
);

create table if not exists ims_audit_finding (
  id           uuid primary key default gen_random_uuid(),
  audit_id     uuid not null references ims_audit(id) on delete cascade,
  clause_id    uuid references ims_standard_clause(id),
  finding_type text not null default 'observation'
               check (finding_type in ('conformity','observation','minor_nc','major_nc','opportunity')),
  description  text not null,
  evidence     text not null default '',
  nc_id        uuid references ims_nonconformity(id)
);

create table if not exists ims_management_review (
  id          uuid primary key default gen_random_uuid(),
  review_date date not null,
  attendees   jsonb not null default '[]'::jsonb,
  agenda      jsonb not null default '{}'::jsonb,
  minutes     text not null default '',
  created_by  text,
  created_at  timestamptz not null default now()
);

-- The Clause Evidence Matrix's two annotation fields (design §4.16): what the
-- MR says justifies this clause, and what the auditor wrote while sitting
-- with us. Both parties writing into the same record is the point.
create table if not exists ims_clause_evidence_note (
  id              uuid primary key default gen_random_uuid(),
  clause_id       uuid not null references ims_standard_clause(id) on delete cascade,
  mr_justification text not null default '',
  auditor_remarks text not null default '',
  updated_by      text,
  updated_at      timestamptz not null default now(),
  unique (clause_id)
);

-- LMS stays the source of truth for learning (design §1.4). These two tables
-- MIRROR it; they never hold the content.
create table if not exists ims_training_requirement (
  id             uuid primary key default gen_random_uuid(),
  target_type    text not null default 'role' check (target_type in ('role','person','department')),
  target_ref     text not null,
  lms_course_id  text not null,
  course_title   text not null default '',
  refresh_months int,
  sys            text,
  created_at     timestamptz not null default now()
);

create table if not exists ims_training_record (
  id            uuid primary key default gen_random_uuid(),
  person_email  text not null,
  lms_course_id text not null,
  completed_at  timestamptz,
  credits       numeric,
  source        text not null default 'lms',
  unique (person_email, lms_course_id)
);

-- ============================== J. WELDING — EN 1090-2 EXC3 / AWS D1.1
-- Schema now, UI in Phase 4. EXC3 is the demanding class: qualified WPS per
-- EN ISO 15614-1 with no pre-qualified shortcuts, a Level B coordinator per
-- EN ISO 14731, and welder qualifications that lapse on a clock (6-monthly
-- confirmation, revalidation at 2/3 years).
create table if not exists ims_wpqr (
  id             uuid primary key default gen_random_uuid(),
  wpqr_no        text not null,
  standard       text not null default 'EN ISO 15614-1',
  process        text not null default '',
  ranges         jsonb not null default '{}'::jsonb,
  test_lab       text not null default '',
  qualified_date date,
  file_path      text
);

create table if not exists ims_wps (
  id              uuid primary key default gen_random_uuid(),
  wps_no          text not null,
  standard        text not null default 'EN ISO 15609-1',
  process         text not null default '',
  material_group  text not null default '',
  thickness_range text not null default '',
  positions       text not null default '',
  wpqr_ids        uuid[] not null default '{}',
  document_id     uuid references ims_document(id),
  status          text not null default 'draft'
                  check (status in ('draft','approved','withdrawn'))
);

create table if not exists ims_welder_qual (
  id                  uuid primary key default gen_random_uuid(),
  welder_name         text not null,
  welder_code         text not null default '',
  standard            text not null default 'EN ISO 9606-1',
  process             text not null,
  positions           text not null default '',
  qualified_date      date not null,
  last_confirmed_date date,
  revalidation_due    date,
  confirmed_by        uuid references ims_profile(id),
  certificate_id      uuid references ims_certificate(id),
  status              text not null default 'valid'
                      check (status in ('valid','due','lapsed','withdrawn'))
);
create index if not exists ims_welder_due_idx on ims_welder_qual (revalidation_due);

-- The traceability spine: which welder, on which joint, to which WPS.
create table if not exists ims_weld_log (
  id             uuid primary key default gen_random_uuid(),
  job_ref        text not null,
  joint_no       text not null,
  welder_qual_id uuid references ims_welder_qual(id),
  wps_id         uuid references ims_wps(id),
  weld_date      date,
  mtc_files      jsonb not null default '[]'::jsonb,
  inspection     jsonb not null default '{}'::jsonb,
  repair         boolean not null default false,
  created_by     text,
  created_at     timestamptz not null default now()
);

-- ================================================================ K. STORAGE
-- Four buckets, ALL PRIVATE. The standards bucket holds purchased copies of
-- copyrighted documents; a public link there is a licence breach, not an
-- inconvenience. Everything is served by a short-lived signed URL issued
-- server-side after the role check.
insert into storage.buckets (id, name, public)
values ('ims-standards',    'ims-standards',    false),
       ('ims-certificates', 'ims-certificates', false),
       ('ims-documents',    'ims-documents',    false),
       ('ims-evidence',     'ims-evidence',     false)
on conflict (id) do update set public = false;

-- ==================================================================== L. RLS
-- On and FORCED everywhere, with NO POLICIES AT ALL. The anon and
-- authenticated keys therefore see nothing whatsoever. The only way in is the
-- service key, and the only thing holding it is src/ims/auth.ts, which has
-- already established who is asking and what their IMS role is.
--
-- FORCE matters: without it the table owner bypasses RLS, and "the owner"
-- includes the role a future migration might run as.
do $$
declare t text;
begin
  foreach t in array array[
    'ims_profile','ims_audit_log','ims_settings',
    'ims_doc_series','ims_number_series',
    'core_task','core_event','core_checklist_template','core_checklist_item',
    'core_checklist_run','core_checklist_response',
    'ims_standard','ims_standard_clause','ims_certificate',
    'ims_document','ims_document_revision','ims_document_clause_map',
    'ims_register_definition','ims_register_entry',
    'ims_certification','ims_certification_path_step',
    'ims_nonconformity','ims_rca','ims_capa','ims_feedback',
    'ims_objective','ims_objective_reading','ims_kaizen',
    'ims_audit_plan','ims_audit','ims_audit_finding',
    'ims_management_review','ims_clause_evidence_note',
    'ims_training_requirement','ims_training_record',
    'ims_wpqr','ims_wps','ims_welder_qual','ims_weld_log'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
  end loop;
end $$;
