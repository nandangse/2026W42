-- 0222 — IMS: INTERNAL AUDIT (Genie 6.4.0.13)
--
-- Dr Raghu, 10 Oct 2026: "In the IMS also create Internal audit checklist. In
-- that have a place to add the standard, date start, target completion date,
-- people, department, status. Then use from this [the NGSE AS9100D Internal
-- Audit & Recertification Checklist] and go ahead. When you meet a certain
-- department all the clauses of that should come up. Post that there should
-- be an internal audit file created with the NC and also the action plan."
--
-- Three new tables; non-conformities and the action plan reuse
-- ims_nonconformity and ims_capa. The checklist bank is seeded from the
-- sheet (116 lines for AS 9100D incl. ISO 9001), and the audit the sheet
-- records — 61 conforming, 33 major, 21 minor, 1 N/A, 60 action points by
-- owner — is seeded as audit IA-2026-01 so nothing already found is lost.

create table if not exists public.ims_internal_audit (
  id            uuid primary key default gen_random_uuid(),
  audit_no      text unique,
  title         text not null,
  standard_ids  uuid[] not null default '{}',
  date_start    date,
  target_end    date,
  status        text not null default 'planned' check (status in ('planned','in_progress','reporting','closed')),
  lead_auditor  text,                       -- e-mail or name
  auditors      text[] not null default '{}',
  auditees      text[] not null default '{}',
  departments   text[] not null default '{}',
  report_html   text,
  report_at     timestamptz,
  created_by    text,
  created_at    timestamptz not null default now()
);
alter table public.ims_internal_audit enable row level security;
revoke all on public.ims_internal_audit from anon, authenticated;

create table if not exists public.ims_audit_item (
  id                  uuid primary key default gen_random_uuid(),
  standard_id         uuid references public.ims_standard(id) on delete set null,
  ref_no              text not null,
  sec                 text,
  clause_no           text not null,
  clause_title        text,
  question            text not null,
  aero                boolean not null default false,   -- an AS9100D addition over ISO 9001
  evidence_to_verify  text,
  process_owner       text,
  departments         text[] not null default '{}',
  method              text,
  sort                int not null default 0,
  active              boolean not null default true,
  import_key          text unique,
  created_by          text,
  created_at          timestamptz not null default now()
);
alter table public.ims_audit_item enable row level security;
revoke all on public.ims_audit_item from anon, authenticated;

create table if not exists public.ims_audit_answer (
  id            uuid primary key default gen_random_uuid(),
  audit_id      uuid not null references public.ims_internal_audit(id) on delete cascade,
  item_id       uuid not null references public.ims_audit_item(id) on delete cascade,
  department    text,
  status        text not null default 'Not audited' check (status in ('Not audited','C','OFI','Minor NC','Major NC','N/A')),
  finding       text,
  evidence_ref  text,
  remarks       text,
  nc_id         uuid references public.ims_nonconformity(id) on delete set null,
  auditor       text,
  audited_at    timestamptz,
  unique (audit_id, item_id)
);
alter table public.ims_audit_answer enable row level security;
revoke all on public.ims_audit_answer from anon, authenticated;

-- the action plan needs free-text owners and a support column, as the sheet has them
alter table public.ims_capa add column if not exists owner_name text not null default '';
alter table public.ims_capa add column if not exists support text not null default '';
alter table public.ims_capa add column if not exists clause_no text;
alter table public.ims_capa add column if not exists audit_id uuid references public.ims_internal_audit(id) on delete set null;
alter table public.ims_nonconformity add column if not exists clause_no text;
alter table public.ims_nonconformity add column if not exists audit_id uuid references public.ims_internal_audit(id) on delete set null;
alter table public.ims_nonconformity add column if not exists evidence_ref text;

-- ───────────────────────── the checklist bank (AS 9100D incl. ISO 9001) ─────────────────────────

insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '4-01', '4', '4.1', 'Context of the organisation', 'Have external and internal issues relevant to NGSE''s purpose and strategic direction been determined (aviation/defence market, customer concentration, capacity, skilled manpower, supply chain, regulation, technology)?', false, 'Context analysis / SWOT / PESTLE dated and approved; linkage to risk register', 'Top Mgmt / MR', array['Management']::text[], 'Doc review + Interview MD & CEO', 1, 'as9100d:4-01', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:4-01');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '4-02', '4', '4.1', 'Context of the organisation', 'Are these issues monitored and reviewed at planned intervals (at least in each Management Review) and updated after major changes?', false, 'Revision history of context document; MR minutes showing review', 'MR', array['Management']::text[], 'Doc review', 2, 'as9100d:4-02', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:4-02');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '4-03', '4', '4.2', 'Interested parties', 'Are relevant interested parties and their requirements determined (airlines, airports, MROs, OEMs/primes, defence users, DGCA/BCAS/AAI, statutory bodies, suppliers, employees, CB, banks)?', true, 'Interested parties register with needs/expectations; general description maintained as required by 4.4.2', 'MR', array['Management']::text[], 'Doc review', 3, 'as9100d:4-03', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:4-03');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '4-04', '4', '4.2', 'Interested parties', 'Is information about interested parties and their requirements monitored and reviewed?', false, 'Review evidence in MR; updates when new customers/contracts added', 'MR', array['Management']::text[], 'Doc review', 4, 'as9100d:4-04', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:4-04');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '4-05', '4', '4.3', 'QMS scope', 'Is the QMS scope documented, stating products/services covered, sites (Khalapur / Navi Mumbai) and activities (design, manufacture, installation, servicing of GSE)? Does it match the certificate and OASIS entry exactly?', true, 'Quality Manual scope statement vs current certificate vs OASIS record', 'MR', array['Management']::text[], 'Doc review', 5, 'as9100d:4-05', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:4-05');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '4-06', '4', '4.3', 'QMS scope', 'Are any non-applicable requirements justified, and do they not affect NGSE''s ability to ensure conformity of products and customer satisfaction?', false, 'Justification for any exclusions (e.g., 8.3 if design is customer-supplied for a product line)', 'MR', array['Management']::text[], 'Doc review', 6, 'as9100d:4-06', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:4-06');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '4-07', '4', '4.4', 'QMS & its processes', 'Are QMS processes determined with inputs, outputs, sequence and interaction (process map / turtle diagrams)?', false, 'Process interaction map; turtle diagram for each process', 'MR / Process Owners', array['Management','All']::text[], 'Doc review', 7, 'as9100d:4-07', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:4-07');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '4-08', '4', '4.4', 'QMS & its processes', 'For each process: are criteria, methods, KPIs, resources, responsibilities/authorities, risks & opportunities defined, and is performance evaluated and improved?', false, 'Process KPI sheets with targets vs actuals; owner sign-off; actions where targets missed', 'All Process Owners', array['All']::text[], 'Doc review + Interview', 8, 'as9100d:4-08', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:4-08');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '4-09', '4', '4.4', 'QMS & its processes', 'Is documented information maintained that includes: general description of interested parties, scope, description of processes and their application, sequence & interaction, and assignment of responsibilities/authorities?', true, 'Quality Manual / QMS description (current revision, approved)', 'MR', array['Management']::text[], 'Doc review', 9, 'as9100d:4-09', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:4-09');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '4-10', '4', '4.4', 'QMS & its processes', 'Are outsourced processes (machining, galvanising, painting/powder coating, NDT, heat treatment, calibration, transport) identified and controlled within the QMS?', false, 'Outsourced process list; linkage to 8.4 controls; subcontract POs', 'MR / Purchase', array['Management','Purchase']::text[], 'Doc review + Sample', 10, 'as9100d:4-10', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:4-10');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '5-01', '5', '5.1.1', 'Leadership & commitment', 'Does top management take accountability for QMS effectiveness? Can the MD & CEO explain quality policy, objectives, KPI status, key risks and last audit results?', false, 'Interview of top management; MR minutes; resource approvals', 'Top Mgmt', array['Management']::text[], 'Interview', 11, 'as9100d:5-01', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:5-01');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '5-02', '5', '5.1.1', 'Leadership & commitment', 'Are QMS requirements integrated in to business processes (ERPNext workflows, project reviews, purchase approvals), and are process approach and risk-based thinking promoted?', false, 'ERP workflow approvals; project review MoMs referencing quality/risk', 'Top Mgmt / MR', array['Management']::text[], 'Interview + Observation', 12, 'as9100d:5-02', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:5-02');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '5-03', '5', '5.1.1', 'Leadership & commitment', 'Are adequate resources made available and are people engaged, directed and supported to contribute to QMS effectiveness?', false, 'Manpower/capex approvals; recognition / suggestion schemes', 'Top Mgmt / HR', array['Management','HR']::text[], 'Interview', 13, 'as9100d:5-03', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:5-03');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '5-04', '5', '5.1.2', 'Customer focus', 'Are customer and applicable statutory/regulatory requirements determined, understood and consistently met; are risks to product conformity and customer satisfaction addressed?', false, 'Customer requirement matrix per contract; customer-specific requirements list', 'Top Mgmt / Sales', array['Management','Sales']::text[], 'Doc review', 14, 'as9100d:5-04', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:5-04');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '5-05', '5', '5.1.2', 'Customer focus', 'Is product/service conformity AND on-time delivery (OTD) performance measured, and is appropriate action taken when planned results are not (or will not be) achieved?', true, 'Monthly OTD % and quality (rejection/PPM, complaints) trend for last 12–36 months; action plans for misses', 'Top Mgmt / Projects / QA', array['Management','Planning','Quality']::text[], 'Doc review + Interview', 15, 'as9100d:5-05', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:5-05');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '5-06', '5', '5.2', 'Quality policy', 'Is the quality policy appropriate to NGSE, a framework for objectives, committed to meeting requirements and continual improvement, and approved/current?', false, 'Signed quality policy (current rev)', 'Top Mgmt', array['Management']::text[], 'Doc review', 16, 'as9100d:5-06', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:5-06');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '5-07', '5', '5.2', 'Quality policy', 'Is the policy communicated and understood (sample shop-floor and office staff), displayed, and available to relevant interested parties (e.g., website)?', false, 'Displays in shop/office; interviews with 3–5 employees; website', 'MR / HR', array['Management','HR']::text[], 'Interview + Observation', 17, 'as9100d:5-07', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:5-07');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '5-08', '5', '5.3', 'Roles, responsibilities & authorities', 'Are responsibilities and authorities for relevant roles assigned, communicated and understood?', false, 'Organisation chart (current), job descriptions, authority matrix (DoA)', 'Top Mgmt / HR', array['Management','HR']::text[], 'Doc review + Interview', 18, 'as9100d:5-08', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:5-08');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '5-09', '5', '5.3', 'Roles, responsibilities & authorities', 'Has a management representative been appointed with responsibility and authority to oversee the QMS, with organisational freedom and unrestricted access to top management to resolve quality issues?', true, 'Appointment letter for MR; org chart showing reporting line', 'Top Mgmt', array['Management']::text[], 'Doc review', 19, 'as9100d:5-09', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:5-09');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '5-10', '5', '5.3', 'Roles, responsibilities & authorities', 'Are responsibilities assigned for reporting QMS performance, promoting customer focus, and maintaining QMS integrity during changes?', false, 'JD/authority matrix; MR reports', 'Top Mgmt', array['Management']::text[], 'Doc review', 20, 'as9100d:5-10', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:5-10');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '6-01', '6', '6.1', 'Risks & opportunities', 'Are QMS risks and opportunities determined, considering context (4.1) and interested parties (4.2), with likelihood/severity rating?', false, 'QMS risk & opportunity register (current, approved)', 'MR / Process Owners', array['Management','All']::text[], 'Doc review', 21, 'as9100d:6-01', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:6-01');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '6-02', '6', '6.1', 'Risks & opportunities', 'Are actions to address risks planned, integrated in to processes, proportionate to potential impact on conformity, and evaluated for effectiveness?', false, 'Action status in register; effectiveness review dates', 'Process Owners', array['All']::text[], 'Doc review + Sample', 22, 'as9100d:6-02', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:6-02');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '6-03', '6', '6.1', 'Risks & opportunities', 'Is the risk register reviewed periodically and after significant events (major NC, customer complaint, new contract, process change)?', false, 'Review history; linkage from CAPA to risk register updates (10.2)', 'MR', array['Management']::text[], 'Doc review', 23, 'as9100d:6-03', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:6-03');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '6-04', '6', '6.2', 'Quality objectives', 'Are quality objectives established at relevant functions/levels — measurable, consistent with policy, monitored, communicated and updated (e.g., OTD %, rejection PPM, customer complaints, supplier OTD/quality, first-pass yield, rework hours, CAPA closure)?', false, 'Objectives & targets sheet; monthly tracking; display boards', 'Top Mgmt / Process Owners', array['Management','All']::text[], 'Doc review + Interview', 24, 'as9100d:6-04', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:6-04');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '6-05', '6', '6.2', 'Quality objectives', 'For each objective: is it defined what will be done, resources, responsibility, completion date and how results are evaluated?', false, 'Objective action plans with owners/dates', 'Process Owners', array['All']::text[], 'Doc review', 25, 'as9100d:6-05', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:6-05');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '6-06', '6', '6.3', 'Planning of changes', 'Are QMS changes (ERP changes, new facility/line, org restructuring, new product family, key personnel change) planned considering purpose, consequences, integrity, resources and responsibilities?', false, 'Change management records / MoC forms', 'MR', array['Management']::text[], 'Doc review + Sample', 26, 'as9100d:6-06', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:6-06');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '7-01', '7', '7.1.1', 'Resources — general', 'Are resources needed for QMS determined and provided, considering capabilities/constraints of internal resources and what is needed from external providers?', false, 'Capacity vs order-book loading; manpower plan', 'Top Mgmt / Projects', array['Management','Planning']::text[], 'Doc review', 27, 'as9100d:7-01', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:7-01');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '7-02', '7', '7.1.2', 'People', 'Are sufficient persons available for effective operation of the QMS and processes?', false, 'Headcount vs plan; overtime / subcontract labour analysis', 'HR / Production', array['HR','Production']::text[], 'Doc review', 28, 'as9100d:7-02', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:7-02');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '7-03', '7', '7.1.3', 'Infrastructure', 'Is infrastructure (buildings, welding machines, cutting/CNC machines, cranes, paint booth, test rigs, IT/ERP, transport) determined, provided and maintained?', false, 'Machine list; preventive maintenance (PM) plan & completion records; breakdown log', 'Maintenance', array['Maintenance']::text[], 'Doc review + Observation', 29, 'as9100d:7-03', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:7-03');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '7-04', '7', '7.1.3', 'Infrastructure', 'Are critical equipment identified, and are statutory inspections of cranes/hoists/lifting tackles and pressure vessels current?', false, 'Critical machine list; competent-person test certificates (Factories Act forms); validity dates', 'Maintenance / Admin', array['Maintenance','HR']::text[], 'Doc review + Observation', 30, 'as9100d:7-04', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:7-04');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '7-05', '7', '7.1.4', 'Process environment', 'Is a suitable environment maintained (lighting, ventilation & humidity in paint shop, conditions for NDT/inspection, cleanliness), including human factors (fatigue, workload, stress)?', true, 'Paint shop temp/RH logs; lux checks; shift/overtime controls', 'Production / HR', array['Production','HR']::text[], 'Observation + Doc review', 31, 'as9100d:7-05', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:7-05');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '7-06', '7', '7.1.5.1', 'Monitoring & measuring resources', 'Are monitoring and measuring resources suitable for the type of activity and maintained for continued fitness (gauges, DFT meters, weld gauges, load cells, torque wrenches, pressure gauges, multimeters)?', false, 'Instrument list; suitability (range/least count) vs tolerance', 'QA', array['Quality']::text[], 'Doc review + Observation', 32, 'as9100d:7-06', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:7-06');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '7-07', '7', '7.1.5.2', 'Measurement traceability', 'Is equipment calibrated/verified at specified intervals against standards traceable to national/international standards (NABL-accredited labs); basis recorded where no standard exists?', false, 'Calibration certificates with traceability & lab accreditation scope', 'QA', array['Quality']::text[], 'Doc review + Sample', 33, 'as9100d:7-07', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:7-07');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '7-08', '7', '7.1.5.2', 'Measurement traceability', 'Is a register of monitoring and measuring equipment maintained, including equipment type, unique ID, location, calibration interval, method and acceptance criteria?', true, 'Calibration master register — check 100% items within due date (zero overdue)', 'QA', array['Quality']::text[], 'Doc review', 34, 'as9100d:7-08', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:7-08');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '7-09', '7', '7.1.5.2', 'Measurement traceability', 'Is calibration status identified on each instrument, and equipment safeguarded from adjustments, damage or deterioration?', false, 'Calibration labels; sealed adjustment points; storage', 'QA', array['Quality']::text[], 'Observation (shop floor)', 35, 'as9100d:7-09', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:7-09');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '7-10', '7', '7.1.5.2', 'Measurement traceability', 'Is there a process to recall equipment requiring calibration, and when found out-of-tolerance, is validity of previous results assessed and action taken on affected product?', true, 'Recall procedure; out-of-tolerance (OOT) impact assessment records', 'QA', array['Quality']::text[], 'Doc review + Interview', 36, 'as9100d:7-10', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:7-10');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '7-11', '7', '7.1.5.2', 'Measurement traceability', 'Are personal/employee-owned gauges and environmental conditions for calibration/inspection controlled?', true, 'Policy on personal tools; inspection room conditions', 'QA', array['Quality']::text[], 'Observation', 37, 'as9100d:7-11', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:7-11');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '7-12', '7', '7.1.6', 'Organisational knowledge', 'Is knowledge needed to operate processes determined, maintained and accessible (design standards, lessons learned, project closure reports, WPS library, customer feedback)?', false, 'Lessons-learned register; design standards library; project closure reports', 'Design / Projects', array['Design','Planning']::text[], 'Doc review + Interview', 38, 'as9100d:7-12', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:7-12');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '7-13', '7', '7.2', 'Competence', 'Are competence requirements defined for each role affecting product conformity (education, training, skills, experience)?', false, 'Competency matrix / skill matrix; JDs', 'HR', array['HR']::text[], 'Doc review', 39, 'as9100d:7-13', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:7-13');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '7-14', '7', '7.2', 'Competence', 'Are training needs identified, training planned and delivered, and its effectiveness evaluated?', false, 'Training needs identification (TNI), annual training calendar, effectiveness evaluation', 'HR', array['HR']::text[], 'Doc review + Sample', 40, 'as9100d:7-14', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:7-14');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '7-15', '7', '7.2', 'Competence', 'Are special-process personnel qualified and current: welders (WPQ/WQT to ASME IX / AWS D1.1 / ISO 9606), NDT personnel (Level II to ISO 9712 / SNT-TC-1A), painters/coating inspectors, final inspectors?', false, 'Welder qualification certificates & continuity log; NDT certificates & eye tests; validity dates', 'QA / Production', array['Quality','Production']::text[], 'Doc review + Sample', 41, 'as9100d:7-15', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:7-15');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '7-16', '7', '7.2', 'Competence', 'Are internal auditors competent in AS9100D (training records) and is competence of contract/temporary labour assured?', false, 'Internal auditor training certificates; contract labour induction records', 'HR / MR', array['HR','Management']::text[], 'Doc review', 42, 'as9100d:7-16', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:7-16');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '7-17', '7', '7.3', 'Awareness', 'Are persons aware of quality policy, relevant objectives, their contribution to QMS effectiveness and implications of not conforming?', false, 'Interviews of sampled employees across shifts', 'HR / MR', array['HR','Management']::text[], 'Interview', 43, 'as9100d:7-17', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:7-17');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '7-18', '7', '7.3', 'Awareness', 'Are persons aware of relevant QMS documented information and changes, their contribution to product/service conformity, their contribution to PRODUCT SAFETY, and the importance of ETHICAL behaviour?', true, 'Awareness training on product safety, ethics, counterfeit parts, FOD, human factors; attendance records; interviews', 'HR / QA', array['HR','Quality']::text[], 'Interview + Doc review', 44, 'as9100d:7-18', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:7-18');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '7-19', '7', '7.4', 'Communication', 'Are internal and external communications defined (what, when, with whom, how, who communicates), e.g., quality meetings, toolbox talks, customer reporting?', false, 'Communication matrix; meeting MoMs; notice boards', 'MR', array['Management']::text[], 'Doc review + Observation', 45, 'as9100d:7-19', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:7-19');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '7-20', '7', '7.5.1', 'Documented information', 'Is documented information required by AS9100D and determined necessary by NGSE available (see Mandatory Docs Register tab)?', false, 'Master list of documents and records', 'QA / Doc Control', array['Quality']::text[], 'Doc review', 46, 'as9100d:7-20', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:7-20');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '7-21', '7', '7.5.2', 'Creating & updating', 'Do documents have proper identification (title, number, revision, date, author), format and media, and are they reviewed and approved before issue?', false, 'Sample 10 documents: approval signatures/e-approval, revision history', 'QA / Doc Control', array['Quality']::text[], 'Sample', 47, 'as9100d:7-21', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:7-21');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '7-22', '7', '7.5.3', 'Control of documented information', 'Are documents available where needed, adequately protected, controlled for distribution, retrieval, storage, version, retention and disposition? Are only current revision drawings/WIs on the shop floor and obsolete copies marked/removed?', false, 'Check 5–10 drawings/WIs at work stations vs master list revision', 'QA / Production', array['Quality','Production']::text[], 'Observation + Sample', 48, 'as9100d:7-22', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:7-22');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '7-23', '7', '7.5.3', 'Control of documented information', 'Are documents of external origin (customer drawings/specs, EN 1915 / EN 12312 series, SAE ARP, AWS D1.1, ISO 3834, IS codes, OEM manuals) identified, controlled and kept at latest applicable revision?', false, 'External document register with revision check dates', 'QA / Design', array['Quality','Design']::text[], 'Doc review', 49, 'as9100d:7-23', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:7-23');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '7-24', '7', '7.5.3', 'Control of documented information', 'Is documented information protected from loss, unauthorised changes, unintended alteration, corruption and physical damage (ERPNext/CAD access control, backups, restore tests)?', true, 'Backup logs, restore test record, user access matrix, password policy', 'IT', array['IT']::text[], 'Doc review + Interview', 50, 'as9100d:7-24', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:7-24');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '7-25', '7', '7.5.3', 'Control of documented information', 'Are record retention periods defined including customer, contractual and regulatory requirements, and are records legible and retrievable?', false, 'Retention schedule; retrieval test of a 2–3-year-old record', 'QA / Doc Control', array['Quality']::text[], 'Sample', 51, 'as9100d:7-25', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:7-25');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-01', '8', '8.1', 'Operational planning & control', 'Is product realisation planned per order/project (quality plan / project plan): requirements, acceptance criteria, resources, controls, documented information, schedule with planned sequence?', true, 'Project/quality plan for 2–3 live orders; ERP project schedule', 'Projects / QA', array['Planning','Quality']::text[], 'Doc review + Sample', 52, 'as9100d:8-01', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-01');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-02', '8', '8.1', 'Operational planning & control', 'Does planning consider, as applicable: personal and product safety; reliability, availability & maintainability; producibility & inspectability; suitability of parts/materials; embedded software; recycling/final disposal?', true, 'Design/quality plan checklists covering these aspects', 'Design / Projects', array['Design','Planning']::text[], 'Doc review', 53, 'as9100d:8-02', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-02');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-03', '8', '8.1', 'Operational planning & control', 'Is temporary or permanent transfer of work (between NGSE sites, to/from external providers) planned and controlled, with conformity verified?', true, 'Work transfer plans; FAI after transfer', 'Projects / QA', array['Planning','Quality']::text[], 'Doc review', 54, 'as9100d:8-03', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-03');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-04', '8', '8.1', 'Operational planning & control', 'Are planned changes controlled and consequences of unintended changes reviewed with actions to mitigate adverse effects?', false, 'Change records; deviation logs', 'Projects', array['Planning']::text[], 'Sample', 55, 'as9100d:8-04', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-04');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-05', '8', '8.1.1', 'Operational risk management', 'Is there a process for managing operational (project/product realisation) risks: responsibilities, risk assessment criteria (likelihood, consequence, acceptance), identification, assessment & communication, mitigation actions, acceptance of residual risk?', true, 'Project risk registers for live programmes; risk review MoMs; FMEA where used', 'Projects', array['Planning']::text[], 'Doc review + Sample', 56, 'as9100d:8-05', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-05');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-06', '8', '8.1.2', 'Configuration management', 'Is configuration management in place: configuration identification (baselines/BOM), change control incl. customer approval where required, status accounting (as-designed vs as-built), configuration audit?', true, 'Drawing/BOM revision control in ERP; ECN log; as-built records for delivered units', 'Design / QA', array['Design','Quality']::text[], 'Doc review + Sample', 57, 'as9100d:8-06', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-06');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-07', '8', '8.1.3', 'Product safety', 'Are processes in place to assure product safety through the product life cycle: hazard assessment & risk management, control of safety-critical items, analysis & reporting of occurred events, communication & training?', true, 'HIRA/FMEA for products; safety-critical item list; compliance to applicable GSE safety standards (e.g., EN 1915, EN 12312); load/stability/interlock test records', 'Design / QA', array['Design','Quality']::text[], 'Doc review + Interview', 58, 'as9100d:8-07', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-07');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-08', '8', '8.1.4', 'Prevention of counterfeit parts', 'Is a counterfeit-parts prevention process implemented: training, obsolescence monitoring, purchase from OEMs/authorised distributors, traceability (CoC), verification & test, monitoring of counterfeit alerts, quarantine & reporting of suspect parts?', true, 'Procedure; approved distributor list for bought-outs (hydraulics, electricals, engines, fasteners, batteries); OEM CoCs; awareness training records', 'Purchase / QA / Stores', array['Purchase','Quality','Stores']::text[], 'Doc review + Sample', 59, 'as9100d:8-08', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-08');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-09', '8', '8.2.1', 'Customer communication', 'Is communication established for product information, enquiries, contracts/orders and changes, customer feedback incl. complaints, handling of customer property, and contingency actions where relevant?', false, 'Customer correspondence log; complaint register; contact matrix per customer', 'Sales / Projects', array['Sales','Planning']::text[], 'Doc review + Sample', 60, 'as9100d:8-09', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-09');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-10', '8', '8.2.2', 'Determining requirements', 'Are product requirements determined including statutory/regulatory (airport/aviation authority, CMVR/RTO for vehicle-mounted GSE, CE/EN where exported, safety), those considered necessary by NGSE, and special requirements / operational risks?', true, 'Tender/requirement compliance matrix; statutory requirement list per product', 'Sales / Design', array['Sales','Design']::text[], 'Doc review', 61, 'as9100d:8-10', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-10');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-11', '8', '8.2.3', 'Review of requirements', 'Before commitment, is a review conducted covering stated customer requirements incl. delivery & post-delivery, unstated but necessary, NGSE''s own, statutory/regulatory, and differences from previous offers resolved?', false, 'Contract review checklist signed by Design, Production, Purchase, QA, Finance for sampled POs', 'Sales', array['Sales']::text[], 'Sample (3–5 POs)', 62, 'as9100d:8-11', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-11');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-12', '8', '8.2.3', 'Review of requirements', 'Where customer requirements cannot be met, is NGSE coordinating with the customer for a mutually acceptable outcome; are special requirements and risks (technical, schedule, cost) identified in the review?', true, 'Deviation/clarification correspondence; risk notes in contract review', 'Sales', array['Sales']::text[], 'Sample', 63, 'as9100d:8-12', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-12');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-13', '8', '8.2.3', 'Review of requirements', 'Are results of review and any new requirements retained as documented information?', false, 'Contract review records filed per order', 'Sales', array['Sales']::text[], 'Sample', 64, 'as9100d:8-13', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-13');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-14', '8', '8.2.4', 'Changes to requirements', 'When requirements change (PO amendments, revised drawings/specs), are documents amended and relevant persons made aware?', false, 'PO amendment log; revised internal work orders; distribution evidence', 'Sales / Projects', array['Sales','Planning']::text[], 'Sample', 65, 'as9100d:8-14', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-14');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-15', '8', '8.3.1', 'Design & development — general', 'Is a design and development process established, implemented and maintained?', false, 'Design & development procedure', 'Design', array['Design']::text[], 'Doc review', 66, 'as9100d:8-15', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-15');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-16', '8', '8.3.2', 'D&D planning', 'Is design planned with stages, reviews, V&V activities, responsibilities, resources, internal/external interfaces, customer involvement; divided in to distinct activities with defined inputs/outputs, considering ability to produce, verify, test and maintain?', true, 'Design plan / Gantt for 1–2 recent design projects', 'Design', array['Design']::text[], 'Doc review + Sample', 67, 'as9100d:8-16', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-16');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-17', '8', '8.3.3', 'D&D inputs', 'Are design inputs complete and unambiguous: functional/performance (capacity, reach, stability, aircraft interface), previous designs, statutory/regulatory, standards/codes, consequences of failure; conflicts resolved?', false, 'Design input document / customer spec compliance sheet', 'Design', array['Design']::text[], 'Doc review', 68, 'as9100d:8-17', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-17');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-18', '8', '8.3.4', 'D&D controls', 'Are design reviews, verification (calculations, FEA, drawing checks) and validation (prototype/field trials) conducted per plan, problems actioned, progression to next stage authorised, and records retained?', true, 'Design review MoMs; design calculation reports; checker sign-offs', 'Design', array['Design']::text[], 'Doc review + Sample', 69, 'as9100d:8-18', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-18');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-19', '8', '8.3.4.1', 'Verification & validation testing', 'Where tests are required, are they planned, controlled, reviewed and documented — test plan defining item, resources, objectives & conditions, parameters, acceptance criteria; test procedures; correct configuration tested; results recorded?', true, 'Prototype test plans & reports (load test, stability/tilt test, braking, hydraulic pressure, electrical safety)', 'Design / QA', array['Design','Quality']::text[], 'Doc review', 70, 'as9100d:8-19', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-19');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-20', '8', '8.3.5', 'D&D outputs', 'Do outputs meet inputs, suit subsequent processes, reference acceptance criteria and specify characteristics essential for safe and proper use; identify critical items and key characteristics; are they approved by authorised persons before release?', true, 'Released drawings, BOMs, specs, inspection plans, Operation & Maintenance manuals; approval records', 'Design', array['Design']::text[], 'Doc review + Sample', 71, 'as9100d:8-20', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-20');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-21', '8', '8.3.6', 'D&D changes', 'Are design changes identified, reviewed, controlled and approved; impact on delivered products/parts assessed; significant changes notified to customer/authority where contractually required?', true, 'ECN/ECO register with impact assessment & approvals', 'Design', array['Design']::text[], 'Sample (3–5 ECNs)', 72, 'as9100d:8-21', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-21');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-22', '8', '8.4.1', 'Control of external providers', 'Are criteria for evaluation, selection, performance monitoring and re-evaluation of external providers determined and applied, with records retained?', false, 'Supplier approval procedure; evaluation forms; re-evaluation records', 'Purchase / QA', array['Purchase','Quality']::text[], 'Doc review + Sample', 73, 'as9100d:8-22', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-22');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-23', '8', '8.4.1', 'Control of external providers', 'Is a register of external providers maintained, including approval status (approved, conditional, disapproved) and scope of approval (product type, process family)?', true, 'Approved Supplier List (ASL) with status & scope; check POs issued only to approved suppliers', 'Purchase', array['Purchase']::text[], 'Doc review + Sample', 74, 'as9100d:8-23', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-23');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-24', '8', '8.4.1', 'Control of external providers', 'Is external provider performance periodically reviewed, including process performance, product conformity and on-time delivery?', true, 'Supplier rating / scorecards (quality PPM, OTD) for the year', 'Purchase / QA', array['Purchase','Quality']::text[], 'Doc review', 75, 'as9100d:8-24', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-24');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-25', '8', '8.4.1', 'Control of external providers', 'Are actions defined for providers not meeting requirements; customer-designated/approved sources used where required; risks of external providers identified and managed?', true, 'Supplier CAPA requests (SCAR); customer-directed source list; supplier risk assessment', 'Purchase / QA', array['Purchase','Quality']::text[], 'Sample', 76, 'as9100d:8-25', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-25');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-26', '8', '8.4.2', 'Type & extent of control', 'Are controls on external providers and outsourced processes defined based on impact on conformity, with verification activities (receiving inspection, source inspection, review of test reports)?', false, 'Receiving inspection plans & records; source inspection reports', 'QA / Stores', array['Quality','Stores']::text[], 'Sample', 77, 'as9100d:8-26', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-26');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-27', '8', '8.4.2', 'Type & extent of control', 'Where test reports (e.g., steel MTCs to EN 10204 3.1) are used to accept product, is report data evaluated against requirements and are raw-material reports periodically validated by independent testing?', true, 'MTC review stamps; periodic independent lab test reports (chemical/mechanical)', 'QA', array['Quality']::text[], 'Sample', 78, 'as9100d:8-27', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-27');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-28', '8', '8.4.2', 'Type & extent of control', 'Where verification at the supplier''s premises is delegated or performed by NGSE/customer, are the arrangements and method of release defined?', true, 'Delegation letters; source inspection plans', 'QA', array['Quality']::text[], 'Doc review', 79, 'as9100d:8-28', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-28');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-29', '8', '8.4.3', 'Information for external providers', 'Do POs/subcontracts communicate: products/processes to be provided; approval requirements for products, methods, release; competence/qualification of persons; interactions; control & monitoring; verification at provider''s premises?', false, 'Sample 5 POs incl. subcontract (machining, painting, NDT)', 'Purchase', array['Purchase']::text[], 'Sample', 80, 'as9100d:8-29', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-29');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-30', '8', '8.4.3', 'Information for external providers', 'Do POs flow down AS9100D requirements as applicable: drawing/spec revision; critical items & key characteristics; test/inspection & FAI; statistical techniques; notification of nonconforming product & approval of disposition; counterfeit prevention; notification and approval of changes in process, product, provider or location; flow-down to sub-tiers; record retention; right of access for NGSE, customer and regulators; awareness of contribution to conformity, safety & ethics?', true, 'Standard PO terms & conditions / quality clauses; sample check of POs', 'Purchase / QA', array['Purchase','Quality']::text[], 'Doc review + Sample', 81, 'as9100d:8-30', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-30');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-31', '8', '8.5.1', 'Control of production', 'Is production carried out under controlled conditions: current drawings/routings/travellers/WIs, inspection plans, suitable monitoring equipment, monitoring at appropriate stages, suitable infrastructure, competent persons, actions to prevent human error?', false, 'Route cards / job travellers; stage inspection records; WIs at workstations', 'Production / QA', array['Production','Quality']::text[], 'Observation + Sample', 82, 'as9100d:8-31', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-31');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-32', '8', '8.5.1', 'Control of production', 'Do controlled conditions include: evidence that all production & inspection operations are completed as planned (or otherwise documented and authorised); FOD prevention, detection & removal; control/monitoring of utilities & supplies (compressed air, power, gases, consumables); workmanship criteria (standards, photos, samples)?', true, 'Completed travellers with stamps; FOD programme; welding/paint workmanship standards; gas & consumable controls', 'Production / QA', array['Production','Quality']::text[], 'Observation + Sample', 83, 'as9100d:8-32', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-32');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-33', '8', '8.5.1', 'Control of production', 'Are key characteristics measured and controlled, and where sampling inspection is used, is the sampling plan statistically valid?', true, 'Inspection plans highlighting KCs; sampling plan basis (e.g., ISO 2859-1)', 'QA', array['Quality']::text[], 'Doc review', 84, 'as9100d:8-33', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-33');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-34', '8', '8.5.1.1', 'Equipment, tools & software', 'Are production equipment, tools (jigs, fixtures, templates) and software programs (CNC / laser / plasma nesting programs) validated before release for production, maintained and periodically inspected; is storage/preservation of tooling defined?', true, 'Jig & fixture register with inspection dates; CNC program validation & revision control', 'Production / Maintenance', array['Production','Maintenance']::text[], 'Sample + Observation', 85, 'as9100d:8-34', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-34');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-35', '8', '8.5.1.2', 'Special processes', 'Are special processes (welding, painting/powder coating, galvanising, heat treatment, NDT, hose crimping if applicable) validated: review & approval criteria, qualified equipment and personnel, specific methods (WPS/PQR, coating procedure), records, re-validation conditions?', true, 'WPS/PQR library; ISO 3834 / AWS D1.1 compliance; paint procedure with DFT/adhesion tests; special process validation records', 'QA / Production', array['Quality','Production']::text[], 'Doc review + Observation', 86, 'as9100d:8-35', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-35');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-36', '8', '8.5.1.3', 'Production process verification (FAI)', 'Is First Article Inspection (production process verification) performed on a representative item from the first production run of a new part/assembly, and repeated when changes invalidate the original result (design, process, tooling, location, long production lapse)? Is AS9102 format used where required by the customer?', true, 'FAI reports (AS9102 Forms 1-3 or equivalent) for new/changed products', 'QA', array['Quality']::text[], 'Sample', 87, 'as9100d:8-36', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-36');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-37', '8', '8.5.2', 'Identification & traceability', 'Are outputs identified throughout realisation, and is inspection/acceptance status identified (tags, stamps, ERP status)? Are acceptance authority media (stamps, e-signatures) controlled?', true, 'Stamp register; status tags; ERP work order status', 'QA / Production', array['Quality','Production']::text[], 'Observation', 88, 'as9100d:8-37', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-37');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-38', '8', '8.5.2', 'Identification & traceability', 'Where traceability is required: is identification maintained through the product life; can all products from the same raw-material batch/heat be traced; can components be traced to the assembly and vice versa; is the production sequence record retrievable?', true, 'Trace test: pick one delivered unit → serial no. → traveller → MTC heat nos. → bought-out serials (cylinders, motors, engine, chassis)', 'QA / Stores', array['Quality','Stores']::text[], 'Sample (trace test)', 89, 'as9100d:8-38', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-38');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-39', '8', '8.5.3', 'Customer / external provider property', 'Is customer property (e.g., customer-supplied chassis, drawings/IP, tooling, data) identified, verified, protected and safeguarded; is loss/damage reported to the customer and recorded?', false, 'Customer property register; receipt inspection; damage reports', 'Stores / Projects', array['Stores','Planning']::text[], 'Sample + Observation', 90, 'as9100d:8-39', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-39');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-40', '8', '8.5.4', 'Preservation', 'Is preservation ensured: identification, handling, contamination control, packaging, storage, transportation, protection; cleaning; FOD prevention; special handling of sensitive items; marking/labelling incl. safety warnings; shelf-life control & FIFO (paints, sealants, adhesives, hydraulic oil, batteries, welding electrodes); hazardous materials?', true, 'Shelf-life register; electrode baking/oven logs; stores layout; packing specifications; safety decals', 'Stores / Production', array['Stores','Production']::text[], 'Observation + Sample', 91, 'as9100d:8-40', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-40');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-41', '8', '8.5.5', 'Post-delivery activities', 'Are post-delivery requirements met (warranty, installation & commissioning, operator training, AMC, spares)? Are in-service data collected and analysed; technical documentation (O&M manuals) controlled and provided; work at customer sites (domestic/overseas) controlled?', true, 'Installation/commissioning reports; training attendance; warranty claim register; field service reports; manual revision control', 'Projects / Service', array['Planning','Service']::text[], 'Doc review + Sample', 92, 'as9100d:8-41', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-41');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-42', '8', '8.5.5', 'Post-delivery activities', 'When problems are detected after delivery, are they investigated and reported, and actions taken (including customer/authority notification where safety-related)?', true, 'Field failure investigation reports; CAPA linkage', 'QA / Service', array['Quality','Service']::text[], 'Sample', 93, 'as9100d:8-42', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-42');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-43', '8', '8.5.6', 'Control of changes', 'Are changes to production or service provision reviewed and controlled; persons authorised to approve changes identified; customer approval obtained where required; results and actions documented?', true, 'Process change records; authority list; customer approval correspondence', 'Production / QA', array['Production','Quality']::text[], 'Sample', 94, 'as9100d:8-43', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-43');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-44', '8', '8.6', 'Release of products & services', 'Is release only after planned arrangements are satisfactorily completed (stage/final inspection, functional & load tests, PDI / FAT), with evidence of conformity and traceability to the person authorising release?', false, 'Final inspection reports; load-test certificates; FAT records with customer sign-off; release note', 'QA', array['Quality']::text[], 'Sample (3–5 dispatches)', 95, 'as9100d:8-44', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-44');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-45', '8', '8.6', 'Release of products & services', 'Are all documents required to accompany products present at delivery (CoC, test reports, O&M manuals, warranty, as-built drawings, MTCs as contracted)? Is evidence retained to demonstrate qualification where required?', true, 'Dispatch dossier checklist for sampled deliveries', 'QA / Projects', array['Quality','Planning']::text[], 'Sample', 96, 'as9100d:8-45', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-45');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-46', '8', '8.7', 'Control of nonconforming outputs', 'Are nonconforming outputs identified and controlled to prevent unintended use (tagging, quarantine area), and dealt with by correction, segregation, containment, return, suspension, customer notification or concession?', false, 'NC reports (NCR) register; quarantine area; red tags', 'QA', array['Quality']::text[], 'Observation + Sample', 97, 'as9100d:8-46', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-46');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-47', '8', '8.7', 'Control of nonconforming outputs', 'Does the NC process define authority for review/disposition (MRB); contain effects on other processes/products; ensure timely reporting of delivered nonconforming product affecting reliability or safety; restrict ''use-as-is''/''repair'' dispositions to approval by design authority (and customer where required)?', true, 'MRB authority list; concession/deviation approvals; customer notifications', 'QA / Design', array['Quality','Design']::text[], 'Doc review + Sample', 98, 'as9100d:8-47', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-47');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-48', '8', '8.7', 'Control of nonconforming outputs', 'Is scrap conspicuously and permanently marked or positively controlled until physically rendered unusable; are counterfeit/suspect parts controlled to prevent re-entry in to the supply chain?', true, 'Scrap yard marking; scrap disposal records', 'QA / Stores', array['Quality','Stores']::text[], 'Observation', 99, 'as9100d:8-48', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-48');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '8-49', '8', '8.7', 'Control of nonconforming outputs', 'Is documented information retained describing the NC, actions taken, concessions obtained and authority deciding the action?', false, 'Completed NCRs with disposition sign-off', 'QA', array['Quality']::text[], 'Sample', 100, 'as9100d:8-49', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:8-49');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '9-01', '9', '9.1.1', 'Monitoring, measurement, analysis', 'Is it determined what is monitored/measured, methods, frequency, and when results are analysed; are results retained (KPI dashboard per process)?', false, 'KPI dashboard; process performance sheets', 'MR / Process Owners', array['Management','All']::text[], 'Doc review', 101, 'as9100d:9-01', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:9-01');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '9-02', '9', '9.1.2', 'Customer satisfaction', 'Is customer perception monitored, including product/service conformity, on-time delivery performance, customer complaints and corrective action requests; are improvement plans developed and their effectiveness evaluated?', true, 'Customer scorecards/portal ratings; feedback forms; complaint & CAR register; improvement action plans', 'Sales / QA', array['Sales','Quality']::text[], 'Doc review', 102, 'as9100d:9-02', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:9-02');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '9-03', '9', '9.1.3', 'Analysis & evaluation', 'Is data analysed to evaluate conformity, customer satisfaction, QMS performance, planning effectiveness, risk-action effectiveness, external provider performance and need for improvement (incl. statistical techniques)?', false, 'Monthly quality/KPI analysis reports, Pareto charts, trends', 'MR / QA', array['Management','Quality']::text[], 'Doc review', 103, 'as9100d:9-03', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:9-03');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '9-04', '9', '9.2', 'Internal audit', 'Is an audit programme planned considering importance of processes, changes, customer feedback and previous results; does the cycle cover ALL clauses and ALL processes (incl. all shifts/sites)?', false, 'Annual audit programme; audit-process-clause coverage matrix', 'MR', array['Management']::text[], 'Doc review', 104, 'as9100d:9-04', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:9-04');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '9-05', '9', '9.2', 'Internal audit', 'Are audit criteria and scope defined for each audit, and are auditors objective and impartial (not auditing own work) and competent?', false, 'Audit plans; auditor allocation; auditor qualification records', 'MR', array['Management']::text[], 'Doc review', 105, 'as9100d:9-05', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:9-05');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '9-06', '9', '9.2', 'Internal audit', 'Do audits evaluate process effectiveness/performance (not just document conformity), and include product/shop-floor audits?', false, 'Audit reports with KPI/effectiveness conclusions (PEAR-style)', 'MR', array['Management']::text[], 'Doc review', 106, 'as9100d:9-06', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:9-06');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '9-07', '9', '9.2', 'Internal audit', 'Are results reported to relevant management, corrections/corrective actions taken without undue delay, and records of programme and results retained?', false, 'Audit reports; NC log; closure evidence', 'MR', array['Management']::text[], 'Doc review', 107, 'as9100d:9-07', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:9-07');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '9-08', '9', '9.3.1', 'Management review', 'Is management review conducted by top management at planned intervals (and before recertification) covering QMS suitability, adequacy, effectiveness and alignment with strategy?', false, 'MR schedule; signed minutes; attendance', 'Top Mgmt / MR', array['Management']::text[], 'Doc review', 108, 'as9100d:9-08', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:9-08');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '9-09', '9', '9.3.2', 'MR inputs', 'Does MR cover all inputs: status of previous actions; changes in issues; customer satisfaction & interested-party feedback; quality objectives; process performance & product conformity; NC & CA; monitoring results; audit results; external provider performance; ON-TIME DELIVERY performance; resource adequacy; risk-action effectiveness; improvement opportunities?', true, 'MR presentation / minutes — tick each input', 'Top Mgmt / MR', array['Management']::text[], 'Doc review', 109, 'as9100d:9-09', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:9-09');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '9-10', '9', '9.3.3', 'MR outputs', 'Do MR outputs include decisions on improvement opportunities, QMS changes, resource needs and risks identified, with owners and target dates, and are they tracked to closure?', true, 'MR action-item tracker', 'Top Mgmt / MR', array['Management']::text[], 'Doc review', 110, 'as9100d:9-10', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:9-10');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '10-01', '10', '10.1', 'Improvement — general', 'Are opportunities for improvement determined and implemented to meet customer requirements and enhance satisfaction (kaizen, cost of poor quality reduction, process improvement projects)?', false, 'Improvement project register; COPQ data', 'MR / All', array['Management']::text[], 'Doc review', 111, 'as9100d:10-01', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:10-01');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '10-02', '10', '10.2', 'Nonconformity & corrective action', 'When an NC occurs (internal, supplier, customer, audit), does NGSE react (control & correct, deal with consequences), determine root cause, check for similar NCs, implement CA, review effectiveness, update risks and QMS?', false, 'CAPA register; 8D / 5-Why / fishbone reports', 'QA', array['Quality']::text[], 'Sample (5 CAPAs)', 112, 'as9100d:10-02', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:10-02');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '10-03', '10', '10.2', 'Nonconformity & corrective action', 'Does the NC/CA process include: flow-down of CA requirements to external providers when they are responsible; specific actions where timely/effective CA is not achieved; determination whether additional NCs exist based on causes?', true, 'SCARs to suppliers; escalation records for overdue CAPAs', 'QA / Purchase', array['Quality','Purchase']::text[], 'Sample', 113, 'as9100d:10-03', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:10-03');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '10-04', '10', '10.2', 'Nonconformity & corrective action', 'Does root-cause analysis consider human factors where relevant, rather than stopping at ''operator error / retraining''?', true, 'RCA records showing human-factor analysis', 'QA', array['Quality']::text[], 'Sample', 114, 'as9100d:10-04', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:10-04');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '10-05', '10', '10.2', 'Nonconformity & corrective action', 'Are CAPAs closed on time and is effectiveness verified with objective evidence before closure; is documented information retained?', false, 'CAPA ageing report; effectiveness verification records', 'QA', array['Quality']::text[], 'Doc review', 115, 'as9100d:10-05', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:10-05');
insert into public.ims_audit_item (standard_id, ref_no, sec, clause_no, clause_title, question, aero, evidence_to_verify, process_owner, departments, method, sort, import_key, created_by)
select (select id from public.ims_standard where name ilike '%9100%' limit 1), '10-06', '10', '10.3', 'Continual improvement', 'Is suitability, adequacy and effectiveness of the QMS continually improved, and is implementation of improvement activities monitored and their results evaluated for effectiveness?', true, 'Trend of KPIs over 3 years; improvement effectiveness reviews', 'MR', array['Management']::text[], 'Doc review', 116, 'as9100d:10-06', 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_audit_item where import_key = 'as9100d:10-06');

-- ───────────────────────── the audit the sheet records ─────────────────────────
insert into public.ims_internal_audit (audit_no, title, standard_ids, date_start, target_end, status, lead_auditor, auditors, auditees, departments, created_by)
select 'IA-2026-01', 'AS 9100D internal audit — recertification readiness', array(select id from public.ims_standard where name ilike '%9100%' or name ilike '%9001%'), '2026-09-01', '2026-11-30', 'reporting', 'Anil Shinde (Internal Audit)', array['Anil Shinde'], array['Pankaj Sutar','Prashant Patil','Mukesh Tiwari','Vinay Mande','Rajesh Nayak','Suraj Alva','Dr Raghunandan Jagdish','Santosh Patra','Aakash Gaikwad'], array['Management','Quality','Purchase','Stores','Production','Maintenance','HR','Design','Sales','Service','Planning'], 'raghu@nandan.co.in'
where not exists (select 1 from public.ims_internal_audit where audit_no = 'IA-2026-01');

insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:4-01'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:4-02'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:4-03'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:4-04'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:4-05'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:4-06'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:4-07'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'Current Data of quality objectives to update', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:4-08'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-001', 'internal_audit', '4.4 QMS & its processes: Current Data of quality objectives to update', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:4-08'), 'open', '4.4', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-001');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-001') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:4-08' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:4-09'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Minor NC', 'Record of outsource process to be arrange', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:4-10'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-002', 'internal_audit', '4.4 QMS & its processes: Record of outsource process to be arrange', 'minor', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:4-10'), 'open', '4.4', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-002');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-002') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:4-10' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:5-01'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:5-02'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:5-03'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:5-04'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Minor NC', 'CAPA to prepare for non acheiving of objective', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:5-05'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-003', 'internal_audit', '5.1.2 Customer focus: CAPA to prepare for non acheiving of objective', 'minor', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:5-05'), 'open', '5.1.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-003');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-003') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:5-05' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:5-06'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Minor NC', 'QMS policy in Hindi Certificate print outs', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:5-07'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-004', 'internal_audit', '5.2 Quality policy: QMS policy in Hindi Certificate print outs', 'minor', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:5-07'), 'open', '5.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-004');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-004') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:5-07' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:5-08'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:5-09'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:5-10'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:6-01'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Minor NC', 'New risks to be identify Outsource process risk', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:6-02'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-005', 'internal_audit', '6.1 Risks & opportunities: New risks to be identify Outsource process risk', 'minor', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:6-02'), 'open', '6.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-005');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-005') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:6-02' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Minor NC', 'MRM to be prepare', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:6-03'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-006', 'internal_audit', '6.1 Risks & opportunities: MRM to be prepare', 'minor', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:6-03'), 'open', '6.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-006');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-006') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:6-03' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'Record to be updated', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:6-04'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-007', 'internal_audit', '6.2 Quality objectives: Record to be updated', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:6-04'), 'open', '6.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-007');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-007') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:6-04' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:6-05'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:6-06'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:7-01'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Minor NC', 'Training record to be update', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:7-02'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-008', 'internal_audit', '7.1.2 People: Training record to be update', 'minor', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:7-02'), 'open', '7.1.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-008');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-008') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:7-02' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'preventive maintenance (PM) plan & completion records; breakdown log to be prepare', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:7-03'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-009', 'internal_audit', '7.1.3 Infrastructure: preventive maintenance (PM) plan & completion records; breakdown log to be prepare', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:7-03'), 'open', '7.1.3', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-009');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-009') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:7-03' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'Form 11 and 13 not available', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:7-04'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-010', 'internal_audit', '7.1.3 Infrastructure: Form 11 and 13 not available', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:7-04'), 'open', '7.1.3', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-010');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-010') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:7-04' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'Jobcard record needed for painting adherance', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:7-05'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-011', 'internal_audit', '7.1.4 Process environment: Jobcard record needed for painting adherance', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:7-05'), 'open', '7.1.4', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-011');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-011') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:7-05' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Minor NC', 'Calibration record to confirm', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:7-06'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-012', 'internal_audit', '7.1.5.1 Monitoring & measuring resources: Calibration record to confirm', 'minor', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:7-06'), 'open', '7.1.5.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-012');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-012') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:7-06' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Minor NC', 'Calibration record to confirm', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:7-07'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-013', 'internal_audit', '7.1.5.2 Measurement traceability: Calibration record to confirm', 'minor', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:7-07'), 'open', '7.1.5.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-013');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-013') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:7-07' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:7-08'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:7-09'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Minor NC', 'Check calibration procedure', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:7-10'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-014', 'internal_audit', '7.1.5.2 Measurement traceability: Check calibration procedure', 'minor', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:7-10'), 'open', '7.1.5.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-014');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-014') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:7-10' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:7-11'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Minor NC', 'customer feedback not availble', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:7-12'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-015', 'internal_audit', '7.1.6 Organisational knowledge: customer feedback not availble', 'minor', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:7-12'), 'open', '7.1.6', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-015');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-015') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:7-12' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Minor NC', 'Record to be updated, including new designation', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:7-13'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-016', 'internal_audit', '7.2 Competence: Record to be updated, including new designation', 'minor', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:7-13'), 'open', '7.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-016');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-016') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:7-13' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'Training calander and record to be prepare', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:7-14'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-017', 'internal_audit', '7.2 Competence: Training calander and record to be prepare', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:7-14'), 'open', '7.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-017');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-017') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:7-14' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Minor NC', 'Last welder qualification record to be checked', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:7-15'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-018', 'internal_audit', '7.2 Competence: Last welder qualification record to be checked', 'minor', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:7-15'), 'open', '7.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-018');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-018') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:7-15' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:7-16'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', 'Training record', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:7-17'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Minor NC', 'Training record', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:7-18'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-019', 'internal_audit', '7.3 Awareness: Training record', 'minor', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:7-18'), 'open', '7.3', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-019');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-019') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:7-18' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:7-19'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:7-20'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:7-21'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:7-22'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Minor NC', 'List of standards to maintain', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:7-23'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-020', 'internal_audit', '7.5.3 Control of documented information: List of standards to maintain', 'minor', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:7-23'), 'open', '7.5.3', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-020');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-020') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:7-23' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:7-24'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:7-25'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', 'ATP, project plan, quality record', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-01'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', 'GAD', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-02'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'N/A', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-03'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-04'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'Risk assessment to be done', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-05'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-021', 'internal_audit', '8.1.1 Operational risk management: Risk assessment to be done', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:8-05'), 'open', '8.1.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-021');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-021') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:8-05' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', 'Record to maintain', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-06'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-07'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'Training record to prepare', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-08'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-022', 'internal_audit', '8.1.4 Prevention of counterfeit parts: Training record to prepare', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:8-08'), 'open', '8.1.4', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-022');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-022') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:8-08' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'Customer feedback', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-09'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-023', 'internal_audit', '8.2.1 Customer communication: Customer feedback', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:8-09'), 'open', '8.2.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-023');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-023') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:8-09' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-10'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'Sales order not reviewed for Hi lifts and DRJ orders', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-11'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-024', 'internal_audit', '8.2.3 Review of requirements: Sales order not reviewed for Hi lifts and DRJ orders', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:8-11'), 'open', '8.2.3', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-024');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-024') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:8-11' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-12'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-13'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-14'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-15'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-16'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-17'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-18'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-19'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-20'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', 'ECR closed to be shown', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-21'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'No supplier evaluation record', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-22'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-025', 'internal_audit', '8.4.1 Control of external providers: No supplier evaluation record', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:8-22'), 'open', '8.4.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-025');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-025') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:8-22' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-23'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'No supplier rating done', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-24'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-026', 'internal_audit', '8.4.1 Control of external providers: No supplier rating done', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:8-24'), 'open', '8.4.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-026');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-026') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:8-24' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'No CAPA done and sent to supplier', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-25'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-027', 'internal_audit', '8.4.1 Control of external providers: No CAPA done and sent to supplier', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:8-25'), 'open', '8.4.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-027');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-027') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:8-25' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'No 100 % incoming material inspection', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-26'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-028', 'internal_audit', '8.4.2 Type & extent of control: No 100 % incoming material inspection', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:8-26'), 'open', '8.4.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-028');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-028') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:8-26' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-27'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-28'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-029', 'internal_audit', '8.4.2 Type & extent of control: Not stated on the sheet', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:8-28'), 'open', '8.4.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-029');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-029') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:8-28' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', 'Incoming inspection record', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-29'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-30'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'Job card is not maintained', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-31'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-030', 'internal_audit', '8.5.1 Control of production: Job card is not maintained', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:8-31'), 'open', '8.5.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-030');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-030') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:8-31' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'Job card is not maintained', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-32'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-031', 'internal_audit', '8.5.1 Control of production: Job card is not maintained', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:8-32'), 'open', '8.5.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-031');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-031') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:8-32' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-33'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'Jig & fixture validation record', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-34'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-032', 'internal_audit', '8.5.1.1 Equipment, tools & software: Jig & fixture validation record', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:8-34'), 'open', '8.5.1.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-032');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-032') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:8-34' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'No welder qualification done No painting qualification done', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-35'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-033', 'internal_audit', '8.5.1.2 Special processes: No welder qualification done No painting qualification done', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:8-35'), 'open', '8.5.1.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-033');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-033') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:8-35' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'No record', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-36'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-034', 'internal_audit', '8.5.1.3 Production process verification (FAI): No record', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:8-36'), 'open', '8.5.1.3', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-034');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-034') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:8-36' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-37'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'No raw material traeability', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-38'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-035', 'internal_audit', '8.5.2 Identification & traceability: No raw material traeability', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:8-38'), 'open', '8.5.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-035');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-035') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:8-38' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-39'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-40'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-036', 'internal_audit', '8.5.4 Preservation: Not stated on the sheet', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:8-40'), 'open', '8.5.4', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-036');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-036') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:8-40' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-41'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'No CAPA', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-42'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-037', 'internal_audit', '8.5.5 Post-delivery activities: No CAPA', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:8-42'), 'open', '8.5.5', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-037');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-037') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:8-42' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-43'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-44'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-45'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'No quarantine area , red tag', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-46'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-038', 'internal_audit', '8.7 Control of nonconforming outputs: No quarantine area , red tag', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:8-46'), 'open', '8.7', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-038');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-038') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:8-46' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-47'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'Record to be update', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-48'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-039', 'internal_audit', '8.7 Control of nonconforming outputs: Record to be update', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:8-48'), 'open', '8.7', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-039');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-039') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:8-48' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:8-49'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'No objective record', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:9-01'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-040', 'internal_audit', '9.1.1 Monitoring, measurement, analysis: No objective record', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:9-01'), 'open', '9.1.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-040');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-040') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:9-01' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'No customer complaints capa', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:9-02'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-041', 'internal_audit', '9.1.2 Customer satisfaction: No customer complaints capa', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:9-02'), 'open', '9.1.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-041');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-041') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:9-02' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:9-03'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-042', 'internal_audit', '9.1.3 Analysis & evaluation: Not stated on the sheet', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:9-03'), 'open', '9.1.3', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-042');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-042') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:9-03' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Minor NC', 'Record to prepare', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:9-04'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-043', 'internal_audit', '9.2 Internal audit: Record to prepare', 'minor', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:9-04'), 'open', '9.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-043');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-043') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:9-04' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Minor NC', 'Record to prepare', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:9-05'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-044', 'internal_audit', '9.2 Internal audit: Record to prepare', 'minor', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:9-05'), 'open', '9.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-044');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-044') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:9-05' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Minor NC', 'Record to prepare', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:9-06'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-045', 'internal_audit', '9.2 Internal audit: Record to prepare', 'minor', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:9-06'), 'open', '9.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-045');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-045') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:9-06' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Minor NC', 'Record to prepare', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:9-07'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-046', 'internal_audit', '9.2 Internal audit: Record to prepare', 'minor', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:9-07'), 'open', '9.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-046');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-046') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:9-07' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Minor NC', 'Record to prepare', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:9-08'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-047', 'internal_audit', '9.3.1 Management review: Record to prepare', 'minor', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:9-08'), 'open', '9.3.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-047');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-047') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:9-08' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Minor NC', 'Record to prepare', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:9-09'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-048', 'internal_audit', '9.3.2 MR inputs: Record to prepare', 'minor', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:9-09'), 'open', '9.3.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-048');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-048') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:9-09' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Minor NC', 'Record to prepare', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:9-10'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-049', 'internal_audit', '9.3.3 MR outputs: Record to prepare', 'minor', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:9-10'), 'open', '9.3.3', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-049');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-049') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:9-10' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'C', null, null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:10-01'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'No record available', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:10-02'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-050', 'internal_audit', '10.2 Nonconformity & corrective action: No record available', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:10-02'), 'open', '10.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-050');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-050') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:10-02' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'No record available', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:10-03'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-051', 'internal_audit', '10.2 Nonconformity & corrective action: No record available', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:10-03'), 'open', '10.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-051');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-051') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:10-03' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'No record available', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:10-04'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-052', 'internal_audit', '10.2 Nonconformity & corrective action: No record available', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:10-04'), 'open', '10.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-052');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-052') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:10-04' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'No record available', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:10-05'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-053', 'internal_audit', '10.2 Nonconformity & corrective action: No record available', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:10-05'), 'open', '10.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-053');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-053') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:10-05' and x.nc_id is null;
insert into public.ims_audit_answer (audit_id, item_id, department, status, finding, evidence_ref, auditor, audited_at)
select a.id, i.id, i.departments[1], 'Major NC', 'No record available', null, 'Anil Shinde', '2026-09-15'
from public.ims_internal_audit a, public.ims_audit_item i where a.audit_no = 'IA-2026-01' and i.import_key = 'as9100d:10-06'
on conflict (audit_id, item_id) do nothing;
insert into public.ims_nonconformity (nc_no, source, description, severity, department, status, clause_no, audit_id, evidence_ref)
select 'IA-2026-054', 'internal_audit', '10.3 Continual improvement: No record available', 'major', (select i.departments[1] from public.ims_audit_item i where i.import_key = 'as9100d:10-06'), 'open', '10.3', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), null
where not exists (select 1 from public.ims_nonconformity where nc_no = 'IA-2026-054');
update public.ims_audit_answer x set nc_id = (select id from public.ims_nonconformity where nc_no = 'IA-2026-054') from public.ims_audit_item i where x.item_id = i.id and i.import_key = 'as9100d:10-06' and x.nc_id is null;
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '4.4' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Current Data of quality objectives to update' = '' or n.description ilike '%' || 'Current Data of quality objectives to up' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '4.4' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Current Data of quality objectives to update', 'Update current data vs target for all quality objectives (monthly trend) and display.', 'Pankaj Sutar', 'All process owners', '4.4', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '4.4' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Update current data vs target for all quality objectives (monthly trend) and display.' and c.owner_name = 'Pankaj Sutar' and c.clause_no = '4.4');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '6.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Record to be updated' = '' or n.description ilike '%' || 'Record to be updated' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '6.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Record to be updated', 'Update quality objective records with actuals and evidence.', 'Pankaj Sutar', 'All process owners', '6.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '6.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Update quality objective records with actuals and evidence.' and c.owner_name = 'Pankaj Sutar' and c.clause_no = '6.2');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.1.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Risk assessment to be done' = '' or n.description ilike '%' || 'Risk assessment to be done' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.1.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Risk assessment to be done', 'Carry out operational risk assessment for each project.', 'Pankaj Sutar', 'QA, Design', '8.1.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '8.1.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Carry out operational risk assessment for each project.' and c.owner_name = 'Pankaj Sutar' and c.clause_no = '8.1.1');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '9.1.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('No objective record' = '' or n.description ilike '%' || 'No objective record' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '9.1.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'No objective record', 'Maintain monitoring & measurement records for all process objectives.', 'Pankaj Sutar', 'All process owners', '9.1.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '9.1.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Maintain monitoring & measurement records for all process objectives.' and c.owner_name = 'Pankaj Sutar' and c.clause_no = '9.1.1');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '9.1.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('No record' = '' or n.description ilike '%' || 'No record' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '9.1.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'No record', 'Prepare analysis & evaluation of data (objectives, supplier, NC, complaints) for MRM.', 'Pankaj Sutar', 'QA', '9.1.3', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '9.1.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Prepare analysis & evaluation of data (objectives, supplier, NC, complaints) for MRM.' and c.owner_name = 'Pankaj Sutar' and c.clause_no = '9.1.3');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '5.1.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('CAPA to prepare for non acheiving of objective' = '' or n.description ilike '%' || 'CAPA to prepare for non acheiving of obj' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '5.1.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'CAPA to prepare for non acheiving of objective', 'Raise CAPA (root cause + action) for each quality objective not achieved.', 'Pankaj Sutar', 'QA', '5.1.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '5.1.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Raise CAPA (root cause + action) for each quality objective not achieved.' and c.owner_name = 'Pankaj Sutar' and c.clause_no = '5.1.2');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '6.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('New risks to be identify Outsource process risk' = '' or n.description ilike '%' || 'New risks to be identify Outsource proce' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '6.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'New risks to be identify Outsource process risk', 'Review risk register; add new risks incl. outsourced-process risks with mitigation.', 'Pankaj Sutar', 'Purchase, all process owners', '6.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '6.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Review risk register; add new risks incl. outsourced-process risks with mitigation.' and c.owner_name = 'Pankaj Sutar' and c.clause_no = '6.1');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '6.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('MRM to be prepare' = '' or n.description ilike '%' || 'MRM to be prepare' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '6.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'MRM to be prepare', 'Prepare MRM minutes covering risk & opportunity review.', 'Pankaj Sutar', 'MD & CEO', '6.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '6.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Prepare MRM minutes covering risk & opportunity review.' and c.owner_name = 'Pankaj Sutar' and c.clause_no = '6.1');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '9.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Record to prepare' = '' or n.description ilike '%' || 'Record to prepare' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '9.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Record to prepare', 'Prepare internal audit programme, plan, reports and records.', 'Pankaj Sutar', '-', '9.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '9.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Prepare internal audit programme, plan, reports and records.' and c.owner_name = 'Pankaj Sutar' and c.clause_no = '9.2');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '9.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Record to prepare' = '' or n.description ilike '%' || 'Record to prepare' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '9.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Record to prepare', 'Prepare internal audit programme, plan, reports and records.', 'Pankaj Sutar', '-', '9.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '9.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Prepare internal audit programme, plan, reports and records.' and c.owner_name = 'Pankaj Sutar' and c.clause_no = '9.2');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '9.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Record to prepare' = '' or n.description ilike '%' || 'Record to prepare' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '9.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Record to prepare', 'Prepare internal audit programme, plan, reports and records.', 'Pankaj Sutar', '-', '9.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '9.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Prepare internal audit programme, plan, reports and records.' and c.owner_name = 'Pankaj Sutar' and c.clause_no = '9.2');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '9.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Record to prepare' = '' or n.description ilike '%' || 'Record to prepare' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '9.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Record to prepare', 'Prepare internal audit programme, plan, reports and records.', 'Pankaj Sutar', '-', '9.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '9.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Prepare internal audit programme, plan, reports and records.' and c.owner_name = 'Pankaj Sutar' and c.clause_no = '9.2');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '9.3.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Record to prepare' = '' or n.description ilike '%' || 'Record to prepare' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '9.3.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Record to prepare', 'Conduct management review and prepare MRM record.', 'Pankaj Sutar', 'MD & CEO', '9.3.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '9.3.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Conduct management review and prepare MRM record.' and c.owner_name = 'Pankaj Sutar' and c.clause_no = '9.3.1');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '9.3.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Record to prepare' = '' or n.description ilike '%' || 'Record to prepare' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '9.3.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Record to prepare', 'Record all required MR inputs in MRM.', 'Pankaj Sutar', 'MD & CEO', '9.3.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '9.3.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Record all required MR inputs in MRM.' and c.owner_name = 'Pankaj Sutar' and c.clause_no = '9.3.2');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '9.3.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Record to prepare' = '' or n.description ilike '%' || 'Record to prepare' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '9.3.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Record to prepare', 'Record MR outputs, decisions and action plan.', 'Pankaj Sutar', 'MD & CEO', '9.3.3', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '9.3.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Record MR outputs, decisions and action plan.' and c.owner_name = 'Pankaj Sutar' and c.clause_no = '9.3.3');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '10.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('-' = '' or n.description ilike '%' || '-' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '10.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  '-', 'Clause not audited — complete audit before recert.', 'Pankaj Sutar', '-', '10.3', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '10.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Clause not audited — complete audit before recert.' and c.owner_name = 'Pankaj Sutar' and c.clause_no = '10.3');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('ATP, project plan, quality record' = '' or n.description ilike '%' || 'ATP, project plan, quality record' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'ATP, project plan, quality record', 'Keep ATP, project plan and quality records available per project.', 'Pankaj Sutar', 'QA', '8.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '8.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Keep ATP, project plan and quality records available per project.' and c.owner_name = 'Pankaj Sutar' and c.clause_no = '8.1');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.4.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('No 100 % incoming material inspection' = '' or n.description ilike '%' || 'No 100 % incoming material inspection' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.4.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'No 100 % incoming material inspection', 'Implement 100% incoming material inspection with records.', 'Prashant Patil', 'Stores', '8.4.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '8.4.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Implement 100% incoming material inspection with records.' and c.owner_name = 'Prashant Patil' and c.clause_no = '8.4.2');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.4.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('No record' = '' or n.description ilike '%' || 'No record' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.4.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'No record', 'Establish and record verification of purchased product (MTC/CoC review).', 'Prashant Patil', 'Stores', '8.4.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '8.4.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Establish and record verification of purchased product (MTC/CoC review).' and c.owner_name = 'Prashant Patil' and c.clause_no = '8.4.2');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.5.1.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('No welder qualification done with list and schedule No painting qualification done with list and schedule' = '' or n.description ilike '%' || 'No welder qualification done with list a' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.5.1.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'No welder qualification done with list and schedule No painting qualification done with list and schedule', 'Qualify welders (WPS/PQR/WPQ) and painting process; keep qualification records.', 'Prashant Patil', 'Production', '8.5.1.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '8.5.1.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Qualify welders (WPS/PQR/WPQ) and painting process; keep qualification records.' and c.owner_name = 'Prashant Patil' and c.clause_no = '8.5.1.2');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.5.1.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('No record' = '' or n.description ilike '%' || 'No record' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.5.1.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'No record', 'Prepare AS9102 FAI reports for new products (Afcons, RRR AF, RRR Navy, Veda MTV).', 'Prashant Patil', 'Design', '8.5.1.3', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '8.5.1.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Prepare AS9102 FAI reports for new products (Afcons, RRR AF, RRR Navy, Veda MTV).' and c.owner_name = 'Prashant Patil' and c.clause_no = '8.5.1.3');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.7' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('No quarantine area , red tag' = '' or n.description ilike '%' || 'No quarantine area , red tag' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.7' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'No quarantine area , red tag', 'Set up marked quarantine area and red-tag system for NC material.', 'Prashant Patil', 'Stores, Production', '8.7', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '8.7' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Set up marked quarantine area and red-tag system for NC material.' and c.owner_name = 'Prashant Patil' and c.clause_no = '8.7');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.7' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Record to be update' = '' or n.description ilike '%' || 'Record to be update' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.7' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Record to be update', 'Update NC records with disposition and approval.', 'Prashant Patil', 'Stores', '8.7', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '8.7' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Update NC records with disposition and approval.' and c.owner_name = 'Prashant Patil' and c.clause_no = '8.7');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '9.1.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('No customer complaints capa' = '' or n.description ilike '%' || 'No customer complaints capa' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '9.1.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'No customer complaints capa', 'Raise CAPA for customer complaints and track to closure.', 'Prashant Patil', 'Sales, Service', '9.1.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '9.1.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Raise CAPA for customer complaints and track to closure.' and c.owner_name = 'Prashant Patil' and c.clause_no = '9.1.2');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.1.5.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Calibration record to confirm' = '' or n.description ilike '%' || 'Calibration record to confirm' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.1.5.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Calibration record to confirm', 'Confirm calibration certificates current for all M&M equipment; update register. Mention acceptance criteria review and its certificate on all enable instruments', 'Prashant Patil', '-', '7.1.5.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '7.1.5.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Confirm calibration certificates current for all M&M equipment; update register. Mention acceptance criteria review and its certificate on all enable instruments' and c.owner_name = 'Prashant Patil' and c.clause_no = '7.1.5.1');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.1.5.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Calibration record to confirm' = '' or n.description ilike '%' || 'Calibration record to confirm' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.1.5.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Calibration record to confirm', 'Confirm calibration traceability to national standards for all instruments.', 'Prashant Patil', '-', '7.1.5.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '7.1.5.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Confirm calibration traceability to national standards for all instruments.' and c.owner_name = 'Prashant Patil' and c.clause_no = '7.1.5.2');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.1.5.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Check calibration procedure' = '' or n.description ilike '%' || 'Check calibration procedure' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.1.5.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Check calibration procedure', 'Review calibration procedure; add out-of-tolerance (OOT) handling.', 'Prashant Patil', '-', '7.1.5.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '7.1.5.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Review calibration procedure; add out-of-tolerance (OOT) handling.' and c.owner_name = 'Prashant Patil' and c.clause_no = '7.1.5.2');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Last welder qualification record to be checked' = '' or n.description ilike '%' || 'Last welder qualification record to be c' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Last welder qualification record to be checked', 'Verify validity of last welder qualification records; requalify where lapsed.', 'Prashant Patil', 'Production', '7.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '7.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Verify validity of last welder qualification records; requalify where lapsed.' and c.owner_name = 'Prashant Patil' and c.clause_no = '7.2');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '10.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('-' = '' or n.description ilike '%' || '-' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '10.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  '-', 'Clause not audited — complete audit before recert.', 'Prashant Patil', '-', '10.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '10.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Clause not audited — complete audit before recert.' and c.owner_name = 'Prashant Patil' and c.clause_no = '10.2');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '10.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('-' = '' or n.description ilike '%' || '-' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '10.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  '-', 'Clause not audited — complete audit before recert.', 'Prashant Patil', 'Purchase', '10.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '10.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Clause not audited — complete audit before recert.' and c.owner_name = 'Prashant Patil' and c.clause_no = '10.2');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '10.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('-' = '' or n.description ilike '%' || '-' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '10.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  '-', 'Clause not audited — complete audit before recert.', 'Prashant Patil', '-', '10.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '10.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Clause not audited — complete audit before recert.' and c.owner_name = 'Prashant Patil' and c.clause_no = '10.2');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '10.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('-' = '' or n.description ilike '%' || '-' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '10.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  '-', 'Clause not audited — complete audit before recert.', 'Prashant Patil', '-', '10.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '10.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Clause not audited — complete audit before recert.' and c.owner_name = 'Prashant Patil' and c.clause_no = '10.2');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.4.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('No CAPA done and sent to supplier' = '' or n.description ilike '%' || 'No CAPA done and sent to supplier' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.4.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'No CAPA done and sent to supplier', 'Raise CAPA on suppliers for rejections and send to supplier; track closure.', 'Prashant Patil', 'QA', '8.4.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '8.4.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Raise CAPA on suppliers for rejections and send to supplier; track closure.' and c.owner_name = 'Prashant Patil' and c.clause_no = '8.4.1');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.1.4' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Training record to prepare' = '' or n.description ilike '%' || 'Training record to prepare' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.1.4' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Training record to prepare', 'Conduct counterfeit-parts prevention training and keep records.', 'Mukesh Tiwari', 'QA, Stores', '8.1.4', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '8.1.4' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Conduct counterfeit-parts prevention training and keep records.' and c.owner_name = 'Mukesh Tiwari' and c.clause_no = '8.1.4');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.4.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('No supplier evaluation record' = '' or n.description ilike '%' || 'No supplier evaluation record' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.4.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'No supplier evaluation record', 'Carry out supplier evaluation and maintain approved supplier list.', 'Mukesh Tiwari', 'QA', '8.4.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '8.4.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Carry out supplier evaluation and maintain approved supplier list.' and c.owner_name = 'Mukesh Tiwari' and c.clause_no = '8.4.1');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.4.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('No supplier rating done' = '' or n.description ilike '%' || 'No supplier rating done' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.4.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'No supplier rating done', 'Carry out periodic supplier rating (quality + delivery).', 'Mukesh Tiwari', 'QA', '8.4.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '8.4.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Carry out periodic supplier rating (quality + delivery).' and c.owner_name = 'Mukesh Tiwari' and c.clause_no = '8.4.1');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.5.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('No raw material traeability' = '' or n.description ilike '%' || 'No raw material traeability' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.5.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'No raw material traeability', 'Establish raw material traceability (heat no./MTC to job) from receipt to use.', 'Mukesh Tiwari', 'QA', '8.5.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '8.5.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Establish raw material traceability (heat no./MTC to job) from receipt to use.' and c.owner_name = 'Mukesh Tiwari' and c.clause_no = '8.5.2');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.5.4' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('No record' = '' or n.description ilike '%' || 'No record' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.5.4' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'No record', 'Define and record preservation (storage, handling, packaging) controls.', 'Mukesh Tiwari', 'Production', '8.5.4', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '8.5.4' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Define and record preservation (storage, handling, packaging) controls.' and c.owner_name = 'Mukesh Tiwari' and c.clause_no = '8.5.4');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '4.4' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Record of outsource process to be arrange' = '' or n.description ilike '%' || 'Record of outsource process to be arrang' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '4.4' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Record of outsource process to be arrange', 'Compile list of outsourced processes with records of control (PO, inspection, supplier approval).', 'Mukesh Tiwari', 'QA', '4.4', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '4.4' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Compile list of outsourced processes with records of control (PO, inspection, supplier approval).' and c.owner_name = 'Mukesh Tiwari' and c.clause_no = '4.4');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.4.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Incoming inspection record' = '' or n.description ilike '%' || 'Incoming inspection record' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.4.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Incoming inspection record', 'Communicate inspection/quality requirements to suppliers in PO; keep incoming inspection records.', 'Mukesh Tiwari', 'QA', '8.4.3', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '8.4.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Communicate inspection/quality requirements to suppliers in PO; keep incoming inspection records.' and c.owner_name = 'Mukesh Tiwari' and c.clause_no = '8.4.3');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Training calander and record to be prepare' = '' or n.description ilike '%' || 'Training calander and record to be prepa' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Training calander and record to be prepare', 'Prepare annual training calendar and maintain training records.', 'Vinay Mande', 'All HODs', '7.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '7.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Prepare annual training calendar and maintain training records.' and c.owner_name = 'Vinay Mande' and c.clause_no = '7.2');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '5.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('QMS policy in Hindi Certificate print outs' = '' or n.description ilike '%' || 'QMS policy in Hindi Certificate print ou' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '5.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'QMS policy in Hindi Certificate print outs', 'Issue Quality Policy in Hindi; display policy & certificate printouts at shop floor/office.', 'Vinay Mande', 'MR', '5.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '5.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Issue Quality Policy in Hindi; display policy & certificate printouts at shop floor/office.' and c.owner_name = 'Vinay Mande' and c.clause_no = '5.2');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.1.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Training record to be update' = '' or n.description ilike '%' || 'Training record to be update' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.1.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Training record to be update', 'Update training records for all shop-floor and staff personnel.', 'Vinay Mande', 'Production', '7.1.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '7.1.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Update training records for all shop-floor and staff personnel.' and c.owner_name = 'Vinay Mande' and c.clause_no = '7.1.2');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Record to be updated, including new designation' = '' or n.description ilike '%' || 'Record to be updated, including new desi' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Record to be updated, including new designation', 'Update competence matrix / JD records incl. new designations.', 'Vinay Mande', 'All HODs', '7.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '7.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Update competence matrix / JD records incl. new designations.' and c.owner_name = 'Vinay Mande' and c.clause_no = '7.2');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Training record' = '' or n.description ilike '%' || 'Training record' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Training record', 'Maintain awareness training records (product safety, ethics, counterfeit).', 'Vinay Mande', 'QA', '7.3', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '7.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Maintain awareness training records (product safety, ethics, counterfeit).' and c.owner_name = 'Vinay Mande' and c.clause_no = '7.3');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Training record' = '' or n.description ilike '%' || 'Training record' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Training record', 'Maintain awareness training records (policy, objectives, contribution).', 'Vinay Mande', 'MR', '7.3', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '7.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Maintain awareness training records (policy, objectives, contribution).' and c.owner_name = 'Vinay Mande' and c.clause_no = '7.3');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.1.4' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Jobcard record needed for painting adherance' = '' or n.description ilike '%' || 'Jobcard record needed for painting adher' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.1.4' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Jobcard record needed for painting adherance', 'Maintain job card records for painting (surface prep, DFT, environment) as evidence of adherence.', 'Rajesh Nayak', 'QA', '7.1.4', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '7.1.4' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Maintain job card records for painting (surface prep, DFT, environment) as evidence of adherence.' and c.owner_name = 'Rajesh Nayak' and c.clause_no = '7.1.4');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.5.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Job card is not maintained' = '' or n.description ilike '%' || 'Job card is not maintained' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.5.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Job card is not maintained', 'Maintain job cards for every job with stage inspection sign-off.', 'Rajesh Nayak', 'QA', '8.5.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '8.5.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Maintain job cards for every job with stage inspection sign-off.' and c.owner_name = 'Rajesh Nayak' and c.clause_no = '8.5.1');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.5.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Job card is not maintained' = '' or n.description ilike '%' || 'Job card is not maintained' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.5.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Job card is not maintained', 'Maintain job cards for every job with stage inspection sign-off.', 'Rajesh Nayak', 'QA', '8.5.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '8.5.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Maintain job cards for every job with stage inspection sign-off.' and c.owner_name = 'Rajesh Nayak' and c.clause_no = '8.5.1');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.5.1.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Jig & fixture validation record' = '' or n.description ilike '%' || 'Jig & fixture validation record' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.5.1.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Jig & fixture validation record', 'Validate jigs & fixtures and keep validation records.', 'Rajesh Nayak', 'Maintenance', '8.5.1.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '8.5.1.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Validate jigs & fixtures and keep validation records.' and c.owner_name = 'Rajesh Nayak' and c.clause_no = '8.5.1.1');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.1.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('preventive maintenance (PM) plan & completion records; breakdown log to be prepare' = '' or n.description ilike '%' || 'preventive maintenance (PM) plan & compl' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.1.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'preventive maintenance (PM) plan & completion records; breakdown log to be prepare', 'Prepare PM plan for critical machines, record PM completion; start breakdown log.', 'Suraj Alva', 'Production', '7.1.3', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '7.1.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Prepare PM plan for critical machines, record PM completion; start breakdown log.' and c.owner_name = 'Suraj Alva' and c.clause_no = '7.1.3');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.1.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Form 11 and 13 not available' = '' or n.description ilike '%' || 'Form 11 and 13 not available' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.1.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Form 11 and 13 not available', 'Prepare and fill Form 11 and Form 13.', 'Suraj Alva', 'Admin', '7.1.3', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '7.1.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Prepare and fill Form 11 and Form 13.' and c.owner_name = 'Suraj Alva' and c.clause_no = '7.1.3');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.1.6' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('customer feedback not availble' = '' or n.description ilike '%' || 'customer feedback not availble' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.1.6' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'customer feedback not availble', 'Collect customer feedback / lessons learned and record in organisational knowledge.', 'Dr. Raghunandan', 'Projects, Sales', '7.1.6', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '7.1.6' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Collect customer feedback / lessons learned and record in organisational knowledge.' and c.owner_name = 'Dr. Raghunandan' and c.clause_no = '7.1.6');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.5.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('List of standards to maintain' = '' or n.description ilike '%' || 'List of standards to maintain' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '7.5.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'List of standards to maintain', 'Prepare and maintain list of applicable standards with current revisions.', 'Dr. Raghunandan', 'QA', '7.5.3', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '7.5.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Prepare and maintain list of applicable standards with current revisions.' and c.owner_name = 'Dr. Raghunandan' and c.clause_no = '7.5.3');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('GAD' = '' or n.description ilike '%' || 'GAD' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'GAD', 'Keep approved GAD under revision control.', 'Dr. Raghunandan', '-', '8.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '8.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Keep approved GAD under revision control.' and c.owner_name = 'Dr. Raghunandan' and c.clause_no = '8.1');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.1.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Record to maintain' = '' or n.description ilike '%' || 'Record to maintain' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.1.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Record to maintain', 'Maintain configuration management records (drawing rev, ECN, as-built).', 'Dr. Raghunandan', 'QA', '8.1.2', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '8.1.2' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Maintain configuration management records (drawing rev, ECN, as-built).' and c.owner_name = 'Dr. Raghunandan' and c.clause_no = '8.1.2');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.3.6' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('ECR closed to be shown' = '' or n.description ilike '%' || 'ECR closed to be shown' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.3.6' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'ECR closed to be shown', 'Show closure records for all ECRs.', 'Dr. Raghunandan', '-', '8.3.6', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '8.3.6' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Show closure records for all ECRs.' and c.owner_name = 'Dr. Raghunandan' and c.clause_no = '8.3.6');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.2.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Customer feedback' = '' or n.description ilike '%' || 'Customer feedback' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.2.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Customer feedback', 'Collect customer feedback for completed orders and record.', 'Santosh Patra', 'Projects', '8.2.1', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '8.2.1' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Collect customer feedback for completed orders and record.' and c.owner_name = 'Santosh Patra' and c.clause_no = '8.2.1');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.2.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('Sales order not reviewed for Hi lifts and DRJ orders' = '' or n.description ilike '%' || 'Sales order not reviewed for Hi lifts an' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.2.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'Sales order not reviewed for Hi lifts and DRJ orders', 'Carry out contract/sales order review for Hi-Lift and DRJ orders; keep signed review record.', 'Santosh Patra', 'Design', '8.2.3', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '8.2.3' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Carry out contract/sales order review for Hi-Lift and DRJ orders; keep signed review record.' and c.owner_name = 'Santosh Patra' and c.clause_no = '8.2.3');
insert into public.ims_capa (nc_id, correction, corrective_action, owner_name, support, clause_no, audit_id, status)
select coalesce(
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.5.5' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') and ('No CAPA' = '' or n.description ilike '%' || 'No CAPA' || '%') order by n.created_at limit 1),
  (select n.id from public.ims_nonconformity n where n.clause_no = '8.5.5' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01') order by n.created_at limit 1)),
  'No CAPA', 'Raise CAPA for post-delivery issues/field failures and record.', 'Aakash D. Gaikwad', 'QA', '8.5.5', (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'), 'open'
where exists (select 1 from public.ims_nonconformity n where n.clause_no = '8.5.5' and n.audit_id = (select id from public.ims_internal_audit where audit_no = 'IA-2026-01'))
  and not exists (select 1 from public.ims_capa c where c.corrective_action = 'Raise CAPA for post-delivery issues/field failures and record.' and c.owner_name = 'Aakash D. Gaikwad' and c.clause_no = '8.5.5');

insert into public.feature_request (title, body, want, status, note, by)
select 'IMS — Internal audit: checklist, department-wise audit, NCs and the action plan', '<p>"In the IMS also create Internal audit checklist … standard, date start, target completion date, people, department, status … When you meet a certain department all the clauses of that should come up. Post that there should be an internal audit file created with the NC and also the action plan." (Dr Raghu, 10 Oct 2026.)</p>', 'must', 'done', 'Shipped as Genie 6.4.0.13.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title like 'IMS — Internal audit%');

insert into public.genie_migration (name) values ('0222_ims_internal_audit') on conflict (name) do nothing;
