-- 0138_ims_register_import.sql
--
-- THE IMS MASTER REGISTER, CONVERTED (Dr Raghu, 5 Sep 2026): "Take this
-- document [Nandan IMS Master Register_2025-26 W11_PS.xlsx] ... Ensure that
-- all of these go into the relevant place ... If there are links, put the
-- links in. If there is a document, make sure that is attached ... convert
-- all of these into the IMS register." And on Standards: "editable document
-- ... Make it better ... Fully compliant / WIP / Pending / Risk ... plus sign
-- for a task."
--
-- Where each sheet went:
--   IMS Document and Link Tracker (300 rows)  -> ims_document, one approved
--     revision each, the sheet's number in ref_no, the Drive/ERP link in
--     external_url; the nine Certification rows -> ims_certificate.
--   Summary Data for ISO                       -> ims_certificate valid-till
--     dates and the certification wall (achieved / in progress).
--   AS 9100 D clause documentation (26 rows)   -> the AS 9100D standard, its
--     clause tree, and one evidence note per clause (ims_clause_evidence_note
--     gains requirement, evidence, compliance, links).
--   MoM (22 rows)                              -> register "IMS Minutes of Meeting".
--   Implementation Plan (32 rows)              -> register "AS 9100D Implementation Plan (2022)".
--   List of Clause to implement (24 rows)      -> core_task, one task each, open.
--
-- Every imported row carries an import key so a re-run adds nothing twice and
-- never overwrites what somebody has since edited. ASCII only, additive.

-- ------------------------------------------------------------ A. columns
alter table ims_document add column if not exists ref_no text;
alter table ims_document add column if not exists external_url text;
alter table ims_document add column if not exists doc_kind text not null default '';
alter table ims_document add column if not exists source_type text not null default '';
alter table ims_document add column if not exists issue_no text not null default '';
alter table ims_document add column if not exists expectation text not null default '';
alter table ims_document add column if not exists owner_name text not null default '';
alter table ims_document add column if not exists approved_by_name text not null default '';
alter table ims_document add column if not exists approved_on date;
alter table ims_document add column if not exists reviewed_by_name text not null default '';
alter table ims_document add column if not exists reviewed_on date;
alter table ims_document add column if not exists next_review date;
alter table ims_document add column if not exists remarks text not null default '';
alter table ims_document add column if not exists import_key text;
create unique index if not exists ims_document_import_key_idx on ims_document (import_key) where import_key is not null;
-- Registers, lists and policies are document types of their own on the sheet.
alter table ims_document drop constraint if exists ims_document_doc_type_check;
alter table ims_document add constraint ims_document_doc_type_check
  check (doc_type in ('MAN','PRO','WI','FRM','CHK','PLN','REG','LST','POL'));

alter table ims_certificate add column if not exists external_url text;
alter table ims_certificate add column if not exists import_key text;
create unique index if not exists ims_certificate_import_key_idx on ims_certificate (import_key) where import_key is not null;

alter table ims_clause_evidence_note add column if not exists requirement text not null default '';
alter table ims_clause_evidence_note add column if not exists evidence text not null default '';
alter table ims_clause_evidence_note add column if not exists compliance text not null default 'Pending';
alter table ims_clause_evidence_note drop constraint if exists ims_clause_evidence_note_compliance_check;
alter table ims_clause_evidence_note add constraint ims_clause_evidence_note_compliance_check
  check (compliance in ('Fully compliant','WIP','Pending','Risk'));
alter table ims_clause_evidence_note add column if not exists links jsonb not null default '[]'::jsonb;
alter table ims_clause_evidence_note add column if not exists ai_draft text not null default '';
alter table ims_clause_evidence_note add column if not exists ai_drafted_at timestamptz;

alter table core_task add column if not exists import_key text;
create unique index if not exists core_task_import_key_idx on core_task (import_key) where import_key is not null;


-- ------------------------------------------------------------ B. documents (the tracker)

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('SHEET-12', '', 'IMS', 'FRM', 'OPSP (2023-24)', 'Management', (select id from public.profiles where email = 'raghu@nandan.co.in' limit 1), 'Dr.RJ', 'approved', 'https://drive.google.com/drive/u/0/search?q=OPSP', 'PDF', 'IMS Document', '1', '', 'CEO', '2023-04-14', 'CEO', '2025-03-13', '2026-03-12', '', 'sheet:tracker:12', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-04-14', ('2023-04-14')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:12' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/IMS/01-13', 'NGSE/IMS/01', 'IMS', 'MAN', 'Nandan GSE IMS MANUAL', 'Management', null, 'MR', 'approved', 'https://docs.google.com/document/d/1Uphyu7rGJXf-f0_X0tb12GByGFlzlcQFTA4RJNcDBJQ/edit?usp=sharing', 'Google Doc', 'IMS Document', '3', 'Information of Nandan IMS', 'CEO', null, 'CEO', null, null, 'Modification As per AS 9100 D pending', 'sheet:tracker:13', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 3, 'approved', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:13' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/IMSP/SYS/01', 'NGSE/IMSP/SYS/01', 'IMS', 'PRO', 'Nandan GSE IMS PROCEDURES', 'Management', null, 'MR', 'in_review', 'https://docs.google.com/document/d/1HARFnK0UqpOUkv09xRNuHZ5dJZFEgTTAdiMxNeuRFhA/edit?usp=sharing', 'Google Doc', 'IMS Document', '1', 'Information of Nandan IMS', 'CEO', null, 'Pankaj Sutar', null, null, '', 'sheet:tracker:14', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 1, 'in_review', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:14' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('WEB-15', 'WEB', 'IMS', 'POL', 'OHS Policy', 'Management', (select id from public.profiles where email = 'raghu@nandan.co.in' limit 1), 'Dr.RJ', 'approved', 'https://drive.google.com/file/d/19-j2GHXspwIjUHBu0nx9Yxp62eZcyvsb/view?usp=drive_link', 'PDF', 'IMS Document', 'NA', 'OHSMS Manual, Safety manual', 'CEO', '2023-07-15', 'CEO', '2025-07-14', '2026-07-13', 'Live document on website', 'sheet:tracker:15', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:15' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('WEB-16', 'WEB', 'IMS', 'FRM', 'Organizational Chart', 'Management', (select id from public.profiles where email = 'raghu@nandan.co.in' limit 1), 'Dr.RJ', 'approved', 'https://www.mindmeister.com/map/2713382340?t=QDEM2wythB', 'Web', 'IMS Document', 'NA', 'Latest Org Chart', 'CEO', '2023-07-15', 'CEO', '2025-07-15', '2026-07-14', 'Live document on website', 'sheet:tracker:16', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:16' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/IMS/01-17', 'NGSE/IMS/01', 'IMS', 'POL', 'IMS Policy', 'Management', null, 'MR', 'in_review', 'https://docs.google.com/document/d/1sfGmDhxKE4hNkWIk5TPPaPs-afwyVcqFzBunQcGDd2I/edit?usp=sharing', 'Google Doc', 'IMS Document', '3', 'Framework for context of the org, quality objective', 'CEO', null, 'CEO', null, null, 'Translation in local language is pending', 'sheet:tracker:17', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 3, 'in_review', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:17' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/01', 'NGSE/R/SYS/01', 'IMS', 'REG', 'Nandan GSE QMS - Context of the Organisation', 'Management', null, 'MR', 'draft', 'https://docs.google.com/spreadsheets/d/1BVDI_ls_NJ10K0geFSix7PiLxSnEnd0CZifBSR10S0A/edit#gid=579413736', 'Google Sheet', 'IMS Document', '1', 'Context of the org', 'CEO', null, 'Pankaj Sutar', null, null, 'Identify more internal & external issues', 'sheet:tracker:18', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'draft', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:18' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/L/SYS/01', 'NGSE/L/SYS/01', 'IMS', 'LST', 'Interested Parties - List & Requirements', 'Management', null, 'MR', 'in_review', 'https://docs.google.com/spreadsheets/d/1BVDI_ls_NJ10K0geFSix7PiLxSnEnd0CZifBSR10S0A/edit?usp=sharing', 'Google Sheet', 'IMS Document', '1', 'list of interested parties of org.', 'CEO', null, 'Pankaj Sutar', null, null, '', 'sheet:tracker:19', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'in_review', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:19' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/02', 'NGSE/R/SYS/02', 'IMS', 'REG', 'Needs and Expectation of Interested Parties', 'Management', null, 'MR', 'in_review', 'https://docs.google.com/spreadsheets/d/1BVDI_ls_NJ10K0geFSix7PiLxSnEnd0CZifBSR10S0A/edit?usp=sharing', 'Google Sheet', 'IMS Document', '1', 'What are the Needs and Expectation of Interested Parties & org.', 'CEO', null, 'Pankaj Sutar', null, null, '', 'sheet:tracker:20', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'in_review', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:20' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/03', 'NGSE/R/SYS/03', 'IMS', 'REG', 'QMS Risks Register', 'Management', null, 'MR', 'in_review', 'https://docs.google.com/spreadsheets/d/1BVDI_ls_NJ10K0geFSix7PiLxSnEnd0CZifBSR10S0A/edit#gid=399845356', 'Google Sheet', 'IMS Document', '1', 'Identification of QMS risk root cause & its mitigation', 'CEO', null, 'Pankaj Sutar', null, null, '', 'sheet:tracker:21', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'in_review', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:21' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/SYS/05', 'NGSE/F/SYS/05', 'IMS', 'FRM', 'Nandan GSE Hazard-Risk identification', 'Management', null, 'Pankaj S', 'approved', 'https://docs.google.com/spreadsheets/d/1BVDI_ls_NJ10K0geFSix7PiLxSnEnd0CZifBSR10S0A/edit#gid=25070645', 'Google Sheet', 'IMS Document', '1', 'Identifications of Hazards to reduce incidents', 'CEO', '2023-07-07', 'Pankaj Sutar', '2025-07-07', '2026-07-06', '', 'sheet:tracker:22', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-07', ('2023-07-07')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:22' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/04', 'NGSE/R/SYS/04', 'IMS', 'REG', 'HIRA Register', 'Management', null, 'Pankaj S', 'approved', 'https://docs.google.com/spreadsheets/d/1BVDI_ls_NJ10K0geFSix7PiLxSnEnd0CZifBSR10S0A/edit#gid=1041292009', 'Google Sheet', 'IMS Document', '1', 'Risk assessment of identified hazards', 'CEO', '2023-07-07', 'Pankaj Sutar', '2025-07-07', '2026-07-06', '', 'sheet:tracker:23', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-07', ('2023-07-07')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:23' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/05', 'NGSE/R/SYS/05', 'IMS', 'REG', 'Aspect Impact Register', 'Management', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1BVDI_ls_NJ10K0geFSix7PiLxSnEnd0CZifBSR10S0A/edit#gid=204494331', 'Google Sheet', 'IMS Document', '1', 'the environmental aspects of its activities, products and services that it can control and those that it
can influence, and their associated environmental impacts, considering a life cycle perspective.', 'CEO', '2023-07-14', 'Pankaj Sutar', '2025-07-15', '2026-07-14', '', 'sheet:tracker:24', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-14', ('2023-07-14')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:24' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('WEB-25', 'WEB', 'IMS', 'FRM', 'Sequence & Interaction of processes - Flowchart (MIND MAPS)', 'Management', (select id from public.profiles where email = 'raghu@nandan.co.in' limit 1), 'Dr.RJ', 'approved', 'https://www.mindmeister.com/map/2742581173?t=Lw9fyWeMYg', 'Web', 'IMS Document', 'NA', 'Mind Maps of all processes', 'CEO', '2023-07-15', 'CEO', '2025-07-15', '2026-07-14', '', 'sheet:tracker:25', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:25' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NA-26', 'NA', 'IMS', 'FRM', 'Factory Map with emergency exits - Display. Decide the location', 'Management', null, 'Hrishikesh R', 'draft', 'https://drive.google.com/drive/folders/1pXmOnuAmvOptjdkN-Zqu5XcVqWRDyvWB?usp=sharing', 'PDF', 'IMS Document', 'NA', 'Evacuation plan in plant layout', 'CEO', null, 'CEO', '2025-07-15', '2026-07-14', 'Evacuation plan to be incorporate in plant layout', 'sheet:tracker:26', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'draft', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:26' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NA-27', 'NA', 'IMS', 'FRM', 'Office map - floor wise with emergency exits - display on each floor.', 'Management', null, 'Hrishikesh R', 'in_review', 'https://drive.google.com/file/d/1IwPkEELwLLijBQj2ByhAooKzr3THQVzf/view?usp=sharing', 'PDF', 'IMS Document', 'NA', 'Office Floor map with evacuation plan', 'CEO', null, 'CEO', '2025-07-15', '2026-07-14', 'Need to verify fire extinguishers & first aid kit', 'sheet:tracker:27', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'in_review', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:27' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NA-28', 'NA', 'IMS', 'FRM', 'Display emergency numbers at reception & entrance of all floors', 'Management', null, 'Hrishikesh R', 'draft', 'https://drive.google.com/file/d/1OQPOEbiwvj5LTI84spWgxKfdlB4wPtoO/view?usp=sharing', 'PDF', 'IMS Document', 'NA', 'Emergency numbers list', 'CEO', null, 'Pankaj Sutar', '2025-07-15', '2026-07-14', 'Incorporate emergency services numbers like hospital, ambulance, etc', 'sheet:tracker:28', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'draft', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:28' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/06-29', 'NGSE/R/SYS/06', 'IMS', 'POL', 'Nandan GSE QMS-Objectives KPI_s', 'Management', (select id from public.profiles where email = 'raghu@nandan.co.in' limit 1), 'CEO', 'approved', 'https://docs.google.com/spreadsheets/d/15PJumQ03oJMp5jd5AEyiGLUDlVvFmvK1V7t9Ze7truc/edit?usp=sharing', 'ERP Doc', 'IMS Document', 'NA', 'QMS objectives', 'CEO', '2023-07-15', 'Pankaj Sutar', '2025-07-15', '2026-07-14', '', 'sheet:tracker:29', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:29' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/06-30', 'NGSE/R/SYS/06', 'IMS', 'POL', 'ISO 45001:2018 Objectives', 'Management', null, 'MR', 'in_review', 'https://docs.google.com/spreadsheets/d/15PJumQ03oJMp5jd5AEyiGLUDlVvFmvK1V7t9Ze7truc/edit#gid=510991113', 'Google Sheet', 'IMS Document', '1', 'OHSMS objectives', 'CEO', '2023-07-15', 'Pankaj Sutar', '2025-07-15', '2026-07-14', '', 'sheet:tracker:30', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'in_review', '2023-07-15', null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:30' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/07', 'NGSE/R/SYS/07', 'IMS', 'POL', 'ISO 14001:2015 Objectives', 'Management', null, 'MR', 'in_review', 'https://docs.google.com/spreadsheets/d/15PJumQ03oJMp5jd5AEyiGLUDlVvFmvK1V7t9Ze7truc/edit#gid=596399962', 'Google Sheet', 'IMS Document', '1', 'EMS objectives', 'CEO', '2023-07-15', 'Pankaj Sutar', '2025-07-15', '2026-07-14', '', 'sheet:tracker:31', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'in_review', '2023-07-15', null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:31' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/08', 'NGSE/R/SYS/08', 'IMS', 'POL', 'NGSE ISMS Objectives', 'Management', null, 'MR', 'draft', null, 'Google Sheet', 'IMS Document', '1', 'ISMS objectives', 'CEO', null, 'Pankaj Sutar', '2025-07-15', '2026-07-14', '', 'sheet:tracker:32', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'draft', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:32' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/09', 'NGSE/R/SYS/09', 'IMS', 'REG', 'Legal Documents / Register', 'Management', (select id from public.profiles where display_name ilike '%Suresh%Lalzare%' and disabled = false limit 1), 'Suresh Lalzare', 'in_review', 'https://docs.google.com/spreadsheets/d/1sQ0kovjk0IEnEuuTxlp2ofsXW7k0FGzphK3oRPWaVLQ/edit?usp=sharing', 'Google Sheet', 'IMS Document', '1', 'List of legal documents & its compliance to be identify & documented', 'CEO', null, 'CEO', '2025-07-15', '2026-07-14', '', 'sheet:tracker:33', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'in_review', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:33' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/SYS/02', 'NGSE/F/SYS/02', 'IMS', 'FRM', 'First Aid Box Inspection Record', 'Management', (select id from public.profiles where display_name ilike '%Neeraj%Kumar%' and disabled = false limit 1), 'Neeraj Kumar', 'approved', 'https://docs.google.com/spreadsheets/d/1Bjo01SIoDsEKX65GdPOdUmoRKCo2Yvw1QxtXDPsbJG4/edit?usp=sharing', 'Google Sheet', 'IMS Document', '1', 'List down all first aid content', 'CEO', '2023-05-03', 'Pankaj Sutar', '2025-05-05', '2026-05-04', '', 'sheet:tracker:34', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-05-03', ('2023-05-03')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:34' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/10', 'NGSE/R/SYS/10', 'IMS', 'REG', 'First Aid Consumption Register', 'Management', (select id from public.profiles where display_name ilike '%Neeraj%Kumar%' and disabled = false limit 1), 'Neeraj Kumar', 'approved', 'https://docs.google.com/spreadsheets/d/1Bjo01SIoDsEKX65GdPOdUmoRKCo2Yvw1QxtXDPsbJG4/edit#gid=1058334536', 'Google Sheet', 'IMS Document', '1', 'List down all consumption of first aid content', 'CEO', '2023-05-03', 'Pankaj Sutar', '2025-05-05', '2026-05-04', '', 'sheet:tracker:35', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-05-03', ('2023-05-03')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:35' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/11-36', 'NGSE/R/SYS/11', 'IMS', 'REG', 'Welding Organisation Chart', 'Management', (select id from public.profiles where display_name ilike '%Swapnil%Ghadigaonkar%' and disabled = false limit 1), 'Swapnil Ghadigaonkar', 'approved', 'https://docs.google.com/document/d/1qlW1lhhroUQYZSligt-OPsRMxrljaf6mQOJmVpIVfq4/edit?usp=sharing', 'Google Doc', 'IMS Document', '1', 'List down all the welding personell', 'CEO', '2025-03-11', 'Swapnil Ghadigaonkar', '2025-03-10', null, '', 'sheet:tracker:36', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-03-11', ('2025-03-11')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:36' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NA-37', 'NA', 'IMS', 'FRM', 'ISO 9001 : 2015 Standard', 'Management', (select id from public.profiles where email = 'raghu@nandan.co.in' limit 1), 'Dr.RJ', 'approved', 'https://drive.google.com/file/d/1iTXAZB0nEFPIpdBFqCy7Wbs8zy_Vp3jL/view?usp=sharing', 'PDF', 'IMS Document', '1', 'Implementation of quality management system', 'CEO', null, 'Pankaj Sutar', '2025-05-05', '2026-05-04', '', 'sheet:tracker:37', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 4, 'approved', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:37' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('List-38', 'List', 'IMS', 'FRM', 'ISO 14001 : 2015 Standard', 'Management', (select id from public.profiles where email = 'raghu@nandan.co.in' limit 1), 'Dr.RJ', 'approved', 'https://drive.google.com/file/d/1igxRtKzjDjQyT6kxsfudPxqWbN0c5tkE/view?usp=drive_link', 'PDF', 'IMS Document', '1', 'Implementation of environmental management system', 'CEO', null, 'Pankaj Sutar', '2025-05-05', '2026-05-04', '', 'sheet:tracker:38', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 2, 'approved', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:38' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NA-39', 'NA', 'IMS', 'FRM', 'ISO 45001 : 2018 Standard', 'Management', (select id from public.profiles where email = 'raghu@nandan.co.in' limit 1), 'Dr.RJ', 'approved', 'https://drive.google.com/file/d/1YAwJi353T325CcK3GHYLMY3K27iH_HVK/view?usp=sharing', 'PDF', 'IMS Document', '1', 'Implementation of OHSAS management system', 'CEO', null, 'Pankaj Sutar', '2025-05-05', '2026-05-04', '', 'sheet:tracker:39', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 2, 'approved', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:39' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NA-40', 'NA', 'IMS', 'FRM', 'AS9100D Standard', 'Management', (select id from public.profiles where email = 'raghu@nandan.co.in' limit 1), 'Dr.RJ', 'approved', 'https://drive.google.com/file/d/1y5qWTpVDOZxWrXurCtx_nG5WBKr1I8vP/view?usp=sharing', 'PDF', 'IMS Document', '1', 'Implementation of ISO quality management system', 'CEO', null, 'Pankaj Sutar', '2025-05-05', '2026-05-04', '', 'sheet:tracker:40', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:40' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NA-41', 'NA', 'IMS', 'FRM', 'AS9100D Standard', 'Management', (select id from public.profiles where email = 'raghu@nandan.co.in' limit 1), 'Dr.RJ', 'approved', 'https://drive.google.com/file/d/1y5qWTpVDOZxWrXurCtx_nG5WBKr1I8vP/view?usp=sharing', 'PDF', 'IMS Document', '1', 'Performing & documenting FAI (First Article Inspection)', 'CEO', null, 'Pankaj Sutar', '2025-05-05', '2026-05-04', '', 'sheet:tracker:41', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:41' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NA-42', 'NA', 'IMS', 'FRM', 'ISO 27001 : 2022 Standard', 'Management', (select id from public.profiles where email = 'raghu@nandan.co.in' limit 1), 'Dr.RJ', 'approved', 'https://drive.google.com/file/d/14w3SSxxj-uWAdCNK1Ugce2YZ_hw9f7uC/view?usp=drive_link', 'PDF', 'IMS Document', '1', 'Implementation of information security  management system', 'CEO', null, 'Pankaj Sutar', '2025-05-05', '2026-05-04', '', 'sheet:tracker:42', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 3, 'approved', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:42' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NA-43', 'NA', 'IMS', 'FRM', 'BS EN ISO 1090-2 EXC 3', 'Management', (select id from public.profiles where email = 'raghu@nandan.co.in' limit 1), 'Dr.RJ', 'approved', 'https://drive.google.com/file/d/1uG61qnGGjgLOho4uL7p8nXPWZ1I7Wqzb/view?usp=drive_link', 'PDF', 'IMS Document', '1', 'Implementation of welding quality system', 'CEO', null, 'Swapnil Ghadigaonkar', '2025-05-05', '2026-05-04', '', 'sheet:tracker:43', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 3, 'approved', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:43' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/L/SYS/02', 'NGSE/L/SYS/02', 'IMS', 'LST', 'NANDAN GSE QUALITY STANDARD READY RECKONER', 'Management', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1LMPuCYn4bZoXf8jKr4dtJo40dBvePANbRB7VakdAndY/edit?usp=sharing', 'Google Sheet', 'IMS Document', '1', 'Document Status Identification', 'CEO', '2022-06-20', 'Pankaj Sutar', '2025-06-19', '2026-06-18', '', 'sheet:tracker:44', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2022-06-20', ('2022-06-20')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:44' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/L/SYS/03', 'NGSE/L/SYS/03', 'QMS', 'LST', 'Externally Provided Processes, Products, and Services', 'Purchase', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1CYfdOx8xe-S32clzEGihBiGIt_gbgF71Z5otb7mCnBY/edit?usp=sharing', 'Google Sheet', 'IMS Document', '1', 'List of outsourced service', 'CEO', '2023-08-30', 'Pankaj Sutar', '2025-08-29', '2026-08-28', '', 'sheet:tracker:45', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-08-30', ('2023-08-30')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:45' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/L/SYS/04', 'NGSE/L/SYS/04', 'IMS', 'LST', 'Communication Matrix', 'Management', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1CEVNPNtb3TmapnVCzGcq8amBlnGPrE8-7m2MXyVfxhY/edit?usp=sharing', 'Google Sheet', 'IMS Document', '1', 'Types of internal & External communication what, with whom, when, how & Who', 'CEO', '2023-10-19', 'Pankaj Sutar', '2025-08-29', '2026-08-28', '', 'sheet:tracker:46', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-10-19', ('2023-10-19')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:46' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/11-47', 'NGSE/R/SYS/11', 'IMS', 'REG', 'Configuration Management Sheet', 'Management', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1g80IhXx-ulppQptodaBes_ldw0XTB8VR1w6_DxvGx58/edit#gid=1393890056', 'Google Sheet', 'IMS Document', '1', 'Change Control record', 'CEO', '2023-07-03', 'Pankaj Sutar', '2025-08-29', '2026-08-28', '', 'sheet:tracker:47', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-03', ('2023-07-03')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:47' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-48', 'ERP', 'QMS', 'FRM', 'Non conformity & corrective action', 'Management', null, 'Department Head', 'approved', 'https://nandanerp.in/app/project-review', 'ERP Doc', 'QMS', '1', 'it does not recur', 'CEO', '2023-07-15', 'Pankaj Sutar', '2025-07-15', '2026-07-14', '', 'sheet:tracker:48', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:48' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/SYS/03', 'NGSE/F/SYS/03', 'OHS', 'FRM', 'Mock drill reports', 'Management', null, 'Swapnil G / Mukesh T', 'approved', 'https://drive.google.com/drive/folders/1apaWqRE3rGirRmlh_OzYzm9vj1sZcx2E?usp=drive_link', 'Google Doc', 'OHSMS', '1', 'Conduct mock drill as per plan & record', 'CEO', '2023-05-04', 'Pankaj Sutar', '2025-05-03', '2026-05-02', '', 'sheet:tracker:49', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-05-04', ('2023-05-04')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:49' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/SYS/04', 'NGSE/F/SYS/04', 'OHS', 'FRM', 'Incident Report Form', 'Management', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'in_review', 'https://docs.google.com/document/d/1_Fs8pzEkpDf1gi3VzicbBQlP7x5k01AgC0On-EvlIOw/edit?usp=sharing', 'Google Doc', 'OHSMS', '1', 'to provide a comprehensive record of any unwelcome or undesirable occurrence (incident) that occurs within the workplace environment', 'CEO', null, 'Pankaj Sutar', '2025-05-03', '2026-05-02', 'Approval from MT', 'sheet:tracker:50', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'in_review', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:50' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-51', 'ERP', 'QMS', 'FRM', 'New MOM in ERP', 'Management', (select id from public.profiles where email = 'raghu@nandan.co.in' limit 1), 'Dr RJ', 'approved', 'https://nandanerp.in/app/minutes-of-meetings/new-minutes-of-meetings-1', 'ERP Doc', 'QMS', '', 'documenting meeting details', 'CEO', '2023-06-30', 'Pankaj Sutar', '2025-06-30', '2026-06-29', '', 'sheet:tracker:51', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-06-30', ('2023-06-30')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:51' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-52', 'ERP', 'QMS', 'FRM', 'New To Do in ERP', 'Management', (select id from public.profiles where email = 'raghu@nandan.co.in' limit 1), 'Dr RJ', 'approved', 'https://nandanerp.in/app/todo/new-todo-1', 'ERP Doc', 'QMS', '', 'Note down tasks', 'CEO', '2023-06-30', 'Pankaj Sutar', '2025-06-30', '2026-06-29', '', 'sheet:tracker:52', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-06-30', ('2023-06-30')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:52' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/L/SYS/05', 'NGSE/L/SYS/05', 'QMS', 'LST', 'List of NGSE Certifications', 'Management', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1oc0-6-_ylG5wtNqKleCre4XZ-QysmfQxr8OZgeRXcOo/edit?usp=sharing', 'Google Sheet', 'QMS', '1', 'Audit certifications, Surveillance Audit findings', 'CEO', '2023-06-20', 'Pankaj Sutar', '2025-06-30', '2026-06-29', '', 'sheet:tracker:53', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-06-20', ('2023-06-20')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:53' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/12', 'NGSE/R/SYS/12', 'OHS', 'REG', 'Safety OHSMS Talk', 'Management', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1hA5v4hyJWxK6l5Pucc9UEAVgMe2NW7D-b-a0YySl7lw/edit#gid=1102425719', 'Google Sheet', 'OHSMS', '1', 'Awareness about hazards & risks', 'CEO', '2023-07-07', 'CEO', '2025-07-15', '2026-07-14', '', 'sheet:tracker:54', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-07', ('2023-07-07')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:54' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('SHEET-55', '', 'ISMS', 'FRM', 'Statement of Applicability', 'Management', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'draft', 'https://docs.google.com/spreadsheets/d/1ziua1cASmWVcOCqXF42pscw5Idr-FPCAyMLds-U1d_8/edit?usp=sharing', 'Google Sheet', 'ISMS', '1', '', 'CEO', null, 'Pankaj Sutar', '2025-07-15', '2026-07-14', '', 'sheet:tracker:55', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'draft', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:55' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('SHEET-56', '', 'ISMS', 'PLN', 'ISMS Risk Assessment & Risk Treatment Plan', 'Management', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'draft', 'https://docs.google.com/spreadsheets/d/1DZ2pAO4FkixnTOnHyImLhDLKwS9l11KSqOspzFG-Sk4/edit?usp=sharing', 'Google Sheet', 'ISMS', '1', '', 'CEO', null, 'Pankaj Sutar', '2025-07-15', '2026-07-14', '', 'sheet:tracker:56', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'draft', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:56' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/13', 'NGSE/R/SYS/13', 'QMS', 'REG', 'Product safety Register', 'Management', (select id from public.profiles where email = 'raghu@nandan.co.in' limit 1), 'Dr RJ', 'approved', 'https://docs.google.com/spreadsheets/d/1fIW_vsJGN-ZlEbh8D09U9-_qwuAk9h06HQzpVN9XWKY/edit?usp=sharing', 'Google Sheet', 'QMS', '1', 'to think about your product or service throughout its entire lifetime, and determine if there are safety risks that need to be addressed.', 'CEO', null, 'Pankaj Sutar', '2025-07-15', '2026-07-14', '', 'sheet:tracker:57', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:57' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/14', 'NGSE/R/SYS/14', 'IMS', 'REG', 'SAMAR certification Checklist', 'Management', (select id from public.profiles where email = 'raghu@nandan.co.in' limit 1), 'Dr RJ', 'approved', 'https://docs.google.com/spreadsheets/d/1xIVoZTwrmnQYwhK8dSC6nJ-cPGl5DHHxkpt17lRyfJ0/edit?usp=sharing', 'Google Sheet', 'IMS', '1', 'Defence manufacturing excellence', 'CEO', '2023-09-21', 'Pankaj Sutar', '2025-09-01', '2026-08-31', '', 'sheet:tracker:58', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-09-21', ('2023-09-21')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:58' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/18-59', 'NGSE/R/SYS/18', 'IMS', 'REG', 'DGAQA Certification', 'Management', (select id from public.profiles where email = 'raghu@nandan.co.in' limit 1), 'Dr RJ', 'approved', 'https://docs.google.com/spreadsheets/d/1cd0d7gcCoa_8LDXEIsBhWBgytwkf9-O06yN1fHRG6Rc/edit?usp=sharing', 'Google Sheet', 'IMS', '0', '', 'CEO', null, 'Pankaj Sutar', '2025-09-01', '2026-08-31', '', 'sheet:tracker:59', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:59' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/20', 'NGSE/R/SYS/20', 'IMS', 'REG', 'ZED Gold certification Assessment Checklist', 'Management', (select id from public.profiles where email = 'raghu@nandan.co.in' limit 1), 'Dr RJ', 'approved', 'https://docs.google.com/spreadsheets/d/1XoqHqrAtouf2s0YqlGnAam93wCJZ4CPxrmHdIWCa2S4/edit?usp=drive_link', 'Google Sheet', 'IMS', '1', '', 'CEO', null, 'Pankaj Sutar', '2025-09-01', '2026-08-31', '', 'sheet:tracker:60', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:60' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/15', 'NGSE/R/SYS/15', 'IMS', 'REG', 'Prevention of Counterfeit parts', 'Management', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1y4XfPMMztCgWrMUyLojKm0LoyTShKydIayqfuKZDbhM/edit?usp=sharing', 'Google Sheet', 'IMS', '1', 'Maximize availability of authentic parts', 'CEO', '2023-09-26', 'Pankaj Sutar', '2025-09-25', '2026-09-24', '', 'sheet:tracker:61', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-09-26', ('2023-09-26')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:61' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/16', 'NGSE/R/SYS/16', 'IMS', 'REG', 'Internal Audits checklist register', 'Management', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1HcY7hUvhfmu1wrI2LePoQ4pF95tDvSCidjKki2xFqJY/edit?usp=sharing', 'Google Sheet', 'IMS', '1', 'Internal audit plan, schedule & audit checklist, internal audit NCs, MRM', 'CEO', '2023-10-07', 'Pankaj Sutar', '2025-10-05', '2026-10-04', '', 'sheet:tracker:62', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-10-07', ('2023-10-07')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:62' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('SHEET-63', '', 'IMS', 'FRM', 'Management Representative', 'Management', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://drive.google.com/file/d/1X_wrUxXn0OyGWgPzeMWZ97oMmXPnzF7V/view?usp=drive_link', 'Google Sheet', 'IMS', '1', '', 'CEO', '2023-10-02', 'Pankaj Sutar', '2025-10-01', '2026-10-01', '', 'sheet:tracker:63', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-10-02', ('2023-10-02')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:63' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/25A', 'NGSE/R/SYS/25A', 'IMS', 'REG', 'Final approval for product release', 'Management', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://drive.google.com/file/d/19fguMb9hyhgpRdCCxQ6kfLN1r5YYAdB9/view?usp=share_link', 'PDF', 'IMS', '1', 'Final approval authority for product release', 'CEO', '2023-10-18', 'Pankaj Sutar', '2025-10-17', '2026-10-17', '', 'sheet:tracker:64', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-10-18', ('2023-10-18')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:64' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/25B', 'NGSE/R/SYS/25B', 'IMS', 'REG', 'Qualification for Final Approval Authority for Product Release', 'Management', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/spreadsheets/d/1bEfo3ZrmwJMNBPTepsDzsgM3jzK7-BbADQFQ9TiuVcU/edit#gid=0', 'Google Sheet', 'IMS', '1', 'Final approval authority for product release', 'CEO', '2023-10-18', 'Pankaj Sutar', '2025-10-17', '2026-10-17', '', 'sheet:tracker:65', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-10-18', ('2023-10-18')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:65' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/SYS/07', 'NGSE/F/SYS/07', 'IMS', 'FRM', 'MRM report', 'Management', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/document/d/1mDv_Ky1IjLCgEMRq04lVcN0A3r8kC-y6LulPrS7Bjjs/edit?usp=sharing', 'Google Doc', 'IMS', '1', 'MRM discussed points', 'CEO', '2023-10-20', 'Pankaj Sutar', '2025-10-19', '2026-10-19', '', 'sheet:tracker:66', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-10-20', ('2023-10-20')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:66' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/17', 'NGSE/R/SYS/17', 'IMS', 'REG', 'Master Register of Internal Audits', 'Management', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', null, 'Google Sheet', 'IMS', '1', 'List of Internal audit & MRM conducted', 'CEO', '2023-10-25', 'Pankaj Sutar', '2025-10-24', '2026-10-24', '', 'sheet:tracker:67', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-10-25', ('2023-10-25')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:67' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/18-68', 'NGSE/R/SYS/18', 'IMS', 'REG', 'Feedback form Responces analysis', 'Management', (select id from public.profiles where email = 'raghu@nandan.co.in' limit 1), 'Dr. RJ', 'approved', 'https://docs.google.com/spreadsheets/d/1UIKMSxDjQExBPL5gqhpoz4mU_k5oV4eoMvPvgghJsMY/edit?usp=sharing', 'Google Sheet', 'IMS', '1', 'Customer feedback analysis', 'CEO', '2023-10-25', 'Pankaj Sutar', '2025-10-24', '2026-10-24', '', 'sheet:tracker:68', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-10-25', ('2023-10-25')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:68' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/19', 'NGSE/R/SYS/19', 'IMS', 'REG', 'Incidents Record Analysis', 'Management', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/14FbMMpK1T9CZfCbvJkJiN-dj99tlpXAzWGlDdBv5ggs/edit?usp=sharing', 'Google Sheet', 'IMS', '1', 'Analysis of incident for calculating lost time injury, cost to company LTIFR', 'CEO', '2023-11-29', 'Pankaj Sutar', '2025-11-28', '2026-11-28', '', 'sheet:tracker:69', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-11-29', ('2023-11-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:69' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NA-70', 'NA', 'IMS', 'FRM', 'Audit Reports', 'Management', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://drive.google.com/drive/folders/1hFQjHa3RdYzxdsz-g_OCj51QPWpsR2mu?usp=drive_link', 'PDF', 'IMS', '-', 'All External Surveillance Audit reports', 'CEO', '2023-12-05', 'Pankaj Sutar', '2024-12-05', '2025-12-05', '', 'sheet:tracker:70', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-12-05', ('2023-12-05')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:70' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/EH/2023/12', 'NGSE/EH/2023/12', 'IMS', 'FRM', 'NANDAN GSE PVT LTD Employee Handbook', 'Management', (select id from public.profiles where email = 'raghu@nandan.co.in' limit 1), 'Dr. RJ', 'approved', 'https://docs.google.com/document/d/1raPPLgCkjSWb6I49-acxTDcOJo2UukNx0ykykL5j9bM/edit?usp=sharing', 'Google Doc', 'IMS', '10', 'This is a collation of all the policies and codes that govern the workings of Nandan GSE team.', 'CEO', '2024-01-01', 'CEO', '2025-01-01', '2025-12-31', '', 'sheet:tracker:71', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2024-01-01', ('2024-01-01')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:71' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/MAIN/01/R0', 'NGSE/R/MAIN/01/R0', 'EMS', 'REG', 'DG Log Book', 'Maintenance', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1rkFmof_A2vmzdJHxPTxxERneW74Tvor82T_klo4DBww/edit?usp=sharing', 'Google Sheet', 'EMS', '1', 'DG Fuel consumption', 'CEO', '2023-06-20', 'Pankaj Sutar', '2025-06-13', '2026-06-12', '', 'sheet:tracker:72', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-06-20', ('2023-06-20')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:72' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/MAIN/02', 'NGSE/R/MAIN/02', 'EMS', 'REG', 'Plant Equipments', 'Maintenance', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1NykxnEBSth46iPPKUza2glPv-t5EIcZNFr-jgvMRrWc/edit?usp=sharing', 'Google Sheet', 'EMS', '1', 'Lifting equipments calibration inspection report', 'CEO', '2023-11-24', 'Pankaj Sutar', '2025-11-23', '2026-11-22', '', 'sheet:tracker:73', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-11-24', ('2023-11-24')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:73' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/HR/01', 'NGSE/WI/HR/01', 'QMS', 'WI', 'Way Of Working', 'HR', (select id from public.profiles where display_name ilike '%Prasad%Tambe%' and disabled = false limit 1), 'Prasad Tambe', 'approved', 'https://docs.google.com/spreadsheets/d/1vec4xo4hJ1Qk8Gq5GjWYb33Fz9jD6aLRiAv3SMlsvw0/edit?usp=sharing', 'Google Doc', 'QMS', '1', 'Standardize departmental SOP', 'CEO', '2023-06-14', 'Prashant M Patil', '2025-06-14', '2026-06-13', '', 'sheet:tracker:74', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-06-14', ('2023-06-14')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:74' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/S&MKT/01', 'NGSE/WI/S&MKT/01', 'QMS', 'WI', 'Way Of Working', 'Sales & Marketing', (select id from public.profiles where display_name ilike '%Dr.%sir%' and disabled = false limit 1), 'Dr. Raghu sir', 'approved', 'https://docs.google.com/document/d/1_m2mE9rRF83daSabFEg-M_KHfVtY9--rU_ZQ0xu47CM/edit', 'Google Doc', 'QMS', '1', 'Standardize departmental SOP', 'CEO', '2023-06-14', 'Prashant M Patil', '2025-06-14', '2026-06-13', '', 'sheet:tracker:75', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-06-14', ('2023-06-14')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:75' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/R&D/01', 'NGSE/WI/R&D/01', 'QMS', 'WI', 'Way Of Working', 'R&D', (select id from public.profiles where display_name ilike '%Sangram%Patil%' and disabled = false limit 1), 'Sangram Patil', 'approved', 'https://docs.google.com/document/d/11n7AE3ZU3NUgo0PVQpCyZT8Jt0xVpN40Vg6_dpCVIw4/edit?usp=sharing', 'Google Doc', 'QMS', '1', 'Standardize departmental SOP', 'CEO', '2023-06-14', 'Prashant M Patil', '2025-06-14', '2026-06-13', '', 'sheet:tracker:76', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-06-14', ('2023-06-14')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:76' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/D&D/01', 'NGSE/WI/D&D/01', 'QMS', 'WI', 'Way Of Working', 'Design', (select id from public.profiles where display_name ilike '%Dhanesh%Patil%' and disabled = false limit 1), 'Dhanesh Patil', 'approved', 'https://docs.google.com/document/d/1fZFBozsqNNPf66vEOdsJ9bjFd2ROD-TQp_L5ClsAveU/edit#heading=h.d6fvw9iyws22', 'Google Doc', 'QMS', '1', 'Standardize departmental SOP', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-07-15', '2026-07-14', '', 'sheet:tracker:77', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:77' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/PPC/01', 'NGSE/WI/PPC/01', 'QMS', 'WI', 'Way Of Working', 'PPC', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://docs.google.com/document/d/1NLASozyZRL7Zr5PjqQc8QdsETx8iZAsAf-lusXahSx0/edit?usp=drive_link', 'Google Doc', 'QMS', '1', 'Standardize departmental SOP', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-07-15', '2026-07-14', '', 'sheet:tracker:78', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:78' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/PUR/01', 'NGSE/WI/PUR/01', 'QMS', 'WI', 'Way Of Working', 'Purchase', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://docs.google.com/document/d/1C9zRUuxyhh65m8JSRzN36l4mMS1s5D5SH9szNoNZric/edit?usp=sharing', 'Google Doc', 'QMS', '1', 'Standardize departmental SOP', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-07-15', '2026-07-14', '', 'sheet:tracker:79', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:79' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/STR/01', 'NGSE/WI/STR/01', 'QMS', 'WI', 'Way Of Working', 'Store', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://docs.google.com/document/d/1YeQpgmTRp9E_z6h01ZhJZBj1kqE6R01oO_ij0elzYvs/edit?usp=sharing', 'Google Doc', 'QMS', '1', 'Standardize departmental SOP', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-07-15', '2026-07-14', '', 'sheet:tracker:80', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:80' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/01', 'NGSE/WI/QA QC/01', 'QMS', 'WI', 'Way Of Working', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1vg6sl-m6BxYmsrBbFBhn398ZkNqSPkFPGyOCV_C-Nm0/edit#bookmark=id.bavd4pq9alse', 'Google Doc', 'QMS', '1', 'Standardize departmental SOP', 'CEO', '2022-11-14', 'Pankaj Sutar', '2025-11-15', '2026-11-14', '', 'sheet:tracker:81', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2022-11-14', ('2022-11-14')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:81' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/PROD/01', 'NGSE/WI/PROD/01', 'QMS', 'WI', 'Way Of Working', 'Production', (select id from public.profiles where display_name ilike '%Yashwanth%Nayak%' and disabled = false limit 1), 'Yashwanth Nayak', 'approved', 'https://docs.google.com/document/d/1KrxO9_AiBIBIh15xQZXac2Kb7_MbG_CCw8At3zLf1_k/edit?usp=sharing', 'Google Doc', 'QMS', '1', 'Standardize departmental SOP', 'CEO', '2023-07-01', 'Pankaj Sutar', '2025-06-30', '2026-06-29', '', 'sheet:tracker:82', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-01', ('2023-07-01')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:82' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/SER/01', 'NGSE/WI/SER/01', 'QMS', 'WI', 'Way Of Working', 'Service', (select id from public.profiles where display_name ilike '%Yashwanth%Nayak%' and disabled = false limit 1), 'Yashwanth Nayak', 'approved', 'https://docs.google.com/document/d/1KOCg3xxYQfTWuk_NafhsFaljx4cbloM6FyY0sUDip3g/edit?usp=sharing', 'Google Doc', 'QMS', '1', 'Standardize departmental SOP', 'CEO', '2023-06-14', 'Prashant M Patil', '2025-06-14', '2026-06-13', '', 'sheet:tracker:83', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-06-14', ('2023-06-14')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:83' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-84', 'ERP', 'QMS', 'FRM', 'Dashboard', 'HR', (select id from public.profiles where display_name ilike '%Prasad%Tambe%' and disabled = false limit 1), 'Prasad Tambe', 'approved', 'https://nandanerp.in/app/dashboard-view/Human%20Resource', 'ERP Doc', 'QMS', '1', 'Management information system', 'CEO', '2023-07-15', 'CEO', '2025-07-14', '2026-07-13', '', 'sheet:tracker:84', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:84' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-85', 'ERP', 'QMS', 'FRM', 'Dashboard', 'Sales & Marketing', (select id from public.profiles where display_name ilike '%Ashish%pradhan%' and disabled = false limit 1), 'Ashish pradhan', 'approved', 'https://nandanerp.in/app/dashboard-view/Nandan%20Sales%202023-24', 'ERP Doc', 'QMS', '1', 'Management information system', 'CEO', '2023-07-15', 'CEO', '2025-07-14', '2026-07-13', '', 'sheet:tracker:85', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:85' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-86', 'ERP', 'QMS', 'FRM', 'Dashboard', 'R&D', (select id from public.profiles where display_name ilike '%Sangram%Patil%' and disabled = false limit 1), 'Sangram Patil', 'approved', 'https://nandanerp.in/app/dashboard-view/R%26D%20Dashboard', 'ERP Doc', 'QMS', '1', 'Management information system', 'CEO', '2023-07-15', 'CEO', '2025-07-14', '2026-07-13', '', 'sheet:tracker:86', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:86' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-87', 'ERP', 'QMS', 'FRM', 'Dashboard', 'Design', (select id from public.profiles where display_name ilike '%Dhanesh%Patil%' and disabled = false limit 1), 'Dhanesh Patil', 'approved', 'https://nandanerp.in/app/dashboard-view/Nandan%20Design', 'ERP Doc', 'QMS', '1', 'Management information system', 'CEO', '2023-07-15', 'CEO', '2025-07-14', '2026-07-13', '', 'sheet:tracker:87', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:87' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-88', 'ERP', 'QMS', 'FRM', 'Dashboard', 'PPC', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://nandanerp.in/app/dashboard-view/PPC%20dashboard', 'ERP Doc', 'QMS', '1', 'Management information system', 'CEO', '2023-07-15', 'CEO', '2025-07-14', '2026-07-13', '', 'sheet:tracker:88', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:88' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-89', 'ERP', 'QMS', 'FRM', 'Dashboard', 'Purchase', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://nandanerp.in/app/dashboard-view/Buying', 'ERP Doc', 'QMS', '1', 'Management information system', 'CEO', '2023-07-15', 'CEO', '2025-07-14', '2026-07-13', '', 'sheet:tracker:89', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:89' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-90', 'ERP', 'QMS', 'FRM', 'Dashboard', 'Store', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'in_review', 'https://nandanerp.in/app/dashboard-view/Stock', 'ERP Doc', 'QMS', '1', 'Management information system', 'CEO', '2023-07-15', 'CEO', '2025-07-14', '2026-07-13', '', 'sheet:tracker:90', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'in_review', '2023-07-15', null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:90' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-91', 'ERP', 'QMS', 'FRM', 'Dashboard (QA)', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://nandanerp.in/app/dashboard-view/Nandan%20QA%20Dashboard', 'ERP Doc', 'QMS', '1', 'Management information system', 'CEO', '2023-07-15', 'CEO', '2025-07-14', '2026-07-13', '', 'sheet:tracker:91', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:91' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-92', 'ERP', 'QMS', 'FRM', 'Dashboard (QC)', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://nandanerp.in/app/dashboard-view/Nandan%20Quality%20Dashboard', 'ERP Doc', 'QMS', '1', 'Management information system', 'CEO', '2023-07-15', 'CEO', '2025-07-14', '2026-07-13', '', 'sheet:tracker:92', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:92' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-93', 'ERP', 'QMS', 'FRM', 'Dashboard', 'Production', (select id from public.profiles where display_name ilike '%Yashwanth%Nayak%' and disabled = false limit 1), 'Yashwanth Nayak', 'draft', 'https://nandanerp.in/app/dashboard-view/Nandan%20Production', 'ERP Doc', 'QMS', '1', 'Management information system', 'CEO', '2023-07-15', 'CEO', '2025-07-14', '2026-07-13', '', 'sheet:tracker:93', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'draft', '2023-07-15', null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:93' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-94', 'ERP', 'QMS', 'FRM', 'Dashboard', 'Service', (select id from public.profiles where display_name ilike '%Yashwanth%Nayak%' and disabled = false limit 1), 'Yashwanth Nayak', 'draft', 'https://nandanerp.in/app/dashboard-view/Nandan%20Service', 'ERP Doc', 'QMS', '1', 'Management information system', 'CEO', '2023-07-15', 'CEO', '2025-07-14', '2026-07-13', '', 'sheet:tracker:94', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'draft', '2023-07-15', null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:94' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/02', 'NGSE/WI/QA QC/02', 'QMS', 'WI', 'Quality Handbook', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1lz-KNw-OjOvTPlET36ylB9hw-2v6F29IbSBRtxnIpac/edit?usp=sharing', 'Google Doc', 'QMS', '1', 'References that are made in the Quality manual', 'CEO', '2023-07-15', 'CEO', '2025-07-14', '2026-07-13', '', 'sheet:tracker:95', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:95' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-96', 'ERP', 'QMS', 'FRM', 'Calibration status of all the measuring instruments', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://nandanerp.in/app/imtes-report', 'ERP Doc', 'QMS', '1', 'Calibration certificate of each instrument and label on it', 'CEO', '2023-07-15', 'Pankaj Sutar', '2025-07-14', '2026-07-13', '', 'sheet:tracker:96', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:96' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-97', 'ERP', 'IMS', 'LST', 'List of machines', 'Maintenance', (select id from public.profiles where display_name ilike '%Rajesh%Nayak%' and disabled = false limit 1), 'Rajesh Nayak', 'approved', 'https://nandanerp.in/app/machinery-master', 'ERP Doc', 'IMS Document', '1', 'All machines of shop floor to be listed', 'CEO', '2023-07-15', 'Pankaj Sutar', '2025-07-14', '2026-07-13', '', 'sheet:tracker:97', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:97' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/QP/MAIN/01', 'NGSE/QP/MAIN/01', 'IMS', 'PRO', 'Preventive maintenance Plan', 'Maintenance', (select id from public.profiles where display_name ilike '%Rajesh%Nayak%' and disabled = false limit 1), 'Rajesh Nayak', 'approved', 'https://docs.google.com/spreadsheets/d/1xR3KFhNauSVe3lflYRzrkSizPmgQPUVsTMyjl75_Pjk/edit?usp=sharing', 'Google Sheet', 'IMS Document', '1', 'Plan for each machine preventive maintenance', 'CEO', '2024-01-27', 'Pankaj Sutar', '2025-01-26', '2026-01-25', '', 'sheet:tracker:98', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2024-01-27', ('2024-01-27')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:98' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-99', 'ERP', 'IMS', 'CHK', 'Preventive Maintenance Checklist', 'Maintenance', (select id from public.profiles where display_name ilike '%Rajesh%Nayak%' and disabled = false limit 1), 'Rajesh Nayak', 'in_review', 'https://docs.google.com/spreadsheets/d/1LnVyLBwgorLtJO9qQAlZRMA-_E4FuB16Y21TUO5uztw/edit?usp=sharing', 'ERP Doc', 'IMS Document', '1', 'Maintenance details and frequency', 'CEO', '2023-07-15', 'Pankaj Sutar', '2025-07-15', '2026-07-14', '', 'sheet:tracker:99', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'in_review', '2023-07-15', null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:99' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-100', 'ERP', 'IMS', 'FRM', 'Machinery Maintenance FRF', 'Maintenance', (select id from public.profiles where display_name ilike '%Rajesh%Nayak%' and disabled = false limit 1), 'Rajesh Nayak', 'approved', 'https://nandanerp.in/app/machinery-maintenance-frf', 'ERP Doc', 'IMS Document', '1', 'Breakdown of machines records', 'CEO', '2023-09-14', 'Pankaj Sutar', '2025-09-13', '2026-09-12', '', 'sheet:tracker:100', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-09-14', ('2023-09-14')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:100' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/HR/01', 'NGSE/R/HR/01', 'QMS', 'REG', 'Role & Responsibilities', 'HR', (select id from public.profiles where display_name ilike '%Prasad%Tambe%' and disabled = false limit 1), 'Prasad Tambe', 'approved', 'https://docs.google.com/spreadsheets/d/1cvrVhnDkDGjiEab-O4txlKQcXxLXOmYtdvry0NYgJ8A/edit?usp=sharing', 'Google Sheet', 'QMS', '1', 'Employees Job role & responsibilities', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-07-14', '2026-07-13', '', 'sheet:tracker:101', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:101' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-102', 'ERP', 'QMS', 'FRM', 'Training master record', 'PPC', null, 'Hrishikesh R', 'approved', 'https://nandanerp.in/app/training-event/view/report', 'ERP Doc', 'WCM', '1', 'acquire necessary knowledge', 'CEO', '2023-07-15', 'Pankaj Sutar', '2025-07-14', '2026-07-13', '', 'sheet:tracker:102', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:102' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/01/R0', 'NGSE/F/QA QC/01/R0', 'QMS', 'CHK', 'FAT Towable Scissor lift', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/1TJJRWGqVNgQT5J3VL9z1UfGHPbQ05TeFBpiNuXxA1GA/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:103', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:103' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/02/R0', 'NGSE/F/QA QC/02/R0', 'QMS', 'CHK', 'Hi-Lift', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/11L1IgJtGVDQMC_YGQb5SY6OWnhF7NNZNr1iiliIsS0Y/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:104', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:104' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/03/R0', 'NGSE/F/QA QC/03/R0', 'QMS', 'CHK', 'Goods Lift', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/1gLiT5633jqnkNBnYq5X-GoIYVc1tVp4HJaZchsAdEzA/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:105', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:105' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/04/R0', 'NGSE/F/QA QC/04/R0', 'QMS', 'CHK', 'Site Inp _ Goods Lift', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/1ddYexh7OHBQytUpSAxoMfaO6-MJB456dCXJt-wzjYmo/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:106', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:106' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/05/R0', 'NGSE/F/QA QC/05/R0', 'QMS', 'CHK', 'Column Tail Lift', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/1tYErNc7exFDdYpoLnzbNPG_AlMAZJh4lzZTtweL9HA8/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:107', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:107' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/06/R0', 'NGSE/F/QA QC/06/R0', 'QMS', 'CHK', 'Vayu tail lift', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/1RHgE5V8507KvhCTbjhfMQzRsVEzkySgSe8dgUovi9hw/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:108', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:108' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/07/R0', 'NGSE/F/QA QC/07/R0', 'QMS', 'CHK', 'Undermount tail lift', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/1wAPA9U7MMPmM0UoYWE3EhNKBJLYCKF2fz3L55tUswKg/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:109', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:109' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/08/R0', 'NGSE/F/QA QC/08/R0', 'QMS', 'CHK', 'Ambulift', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/1TBma5OB6RvbMC0r4mo4EkXx6XPuwHdzmu3uv9gCJKA0/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:110', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:110' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/09/R0', 'NGSE/F/QA QC/09/R0', 'QMS', 'CHK', 'Scissor Lift', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/149zgXwY-ehmlTTypUkjNDc-xAjKCdOcTPFgkJIDCYKc/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:111', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:111' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/10/R0', 'NGSE/F/QA QC/10/R0', 'QMS', 'CHK', 'Self Propelled Scissor Lift', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/1Aw1eFK_7zXzB8boHZ_GhQ7aFeUatKCg7YRjvCan1OYI/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:112', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:112' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/11/R0', 'NGSE/F/QA QC/11/R0', 'QMS', 'CHK', 'Zero Scissor Lift', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/1NrfqRGiIxz-9qCtickXDdVgJFoDqWGHxRJs5usu5z_k/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:113', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:113' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/12/R0', 'NGSE/F/QA QC/12/R0', 'QMS', 'CHK', 'Truck Mounted Scissor Lift', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/1-TcBGUdkeVH9Gb_F04Bqh2p41H4Se7FHdbtvLkjMkP4/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:114', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:114' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/13/R0', 'NGSE/F/QA QC/13/R0', 'QMS', 'CHK', 'Site In Scissor Lift', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/1ic2Ytf41c66hlCASjnm0Khb3MEChPL9_V9KKyWDlMnQ/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:115', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:115' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/14/R0', 'NGSE/F/QA QC/14/R0', 'QMS', 'CHK', 'Step Ladder Checklist', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/1i59mT__XMfj5oPW4Y9lxAa56743Ajin4/edit?usp=sharing&ouid=101619828744482146991&rtpof=true&sd=true', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:116', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:116' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/15/R0', 'NGSE/F/QA QC/15/R0', 'QMS', 'CHK', 'Mobile Truck Loader', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/1gQHPm65aFmUqsbHr9bjVMmZ8g2Q3oRQfsnIYORvLNuU/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:117', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:117' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/16/R0', 'NGSE/F/QA QC/16/R0', 'QMS', 'CHK', 'CHECKLIST OF TAIL-LIFT FOR SERVICE VEHICLES', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/1_iSRHSfke0trH-eAUSan8pXq-SEfq7qsNf52VllMR_A/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:118', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:118' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/18/R0', 'NGSE/F/QA QC/18/R0', 'QMS', 'CHK', 'Belt Conveyor', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/1uzbz0ChVOIhy-Z07yxSs9Rb7JmBqaKvifjV1eMvCLRA/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:119', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:119' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/19/R0', 'NGSE/F/QA QC/19/R0', 'QMS', 'CHK', 'Car Parking', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/1xUGjx1fj5QmMZqzBR6GdjAySxF_oCrIoGTb0PLmTyFw/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:120', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:120' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/20/R0', 'NGSE/F/QA QC/20/R0', 'QMS', 'CHK', 'Turntable', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/1AI3YaxaMynE-4aVbfSVnswH197pba1KvDQRtBXSRiBc/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:121', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:121' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/21/R0', 'NGSE/F/QA QC/21/R0', 'QMS', 'CHK', 'RRR', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1DXyKnYrF43U3N0Swu4oCOcmyptjchb6Nxl7o11P-jK0/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2023-07-15', 'Swapnil Ghadigaonkar', '2025-07-14', '2026-07-13', '', 'sheet:tracker:122', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:122' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/22/R0', 'NGSE/F/QA QC/22/R0', 'QMS', 'CHK', 'RRR', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1neKlGed_yBmMarhAKIkvFErYcHhIbSMAZxKz6UTq_Gk/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2023-07-15', 'Swapnil Ghadigaonkar', '2025-07-14', '2026-07-13', '', 'sheet:tracker:123', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:123' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/23/R0', 'NGSE/F/QA QC/23/R0', 'QMS', 'CHK', 'Delivery Ramp', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/1IZn74RsCvX1EL9Gj5sOuPTewmAfQnoSLNqpUPnSVurs/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:124', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:124' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/24/R0', 'NGSE/F/QA QC/24/R0', 'QMS', 'CHK', 'Elephant Ramp', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/10lk_VTgB2vFeVXgjhuI5vbqut1vUnfNFnkL7KG77FRQ/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:125', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:125' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/25/R0', 'NGSE/F/QA QC/25/R0', 'QMS', 'CHK', 'Floor crane', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/1RLfxdSzxRLUBTbVns_Uf2Iael2tolQfq2mC9mIWsZSc/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:126', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:126' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/26/R0', 'NGSE/F/QA QC/26/R0', 'QMS', 'CHK', 'Hydraulic Door', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/1T1aqQaQE3kZSSc1sj9SbM33adHZsZNTGb_Nlp3o8ycw/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:127', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:127' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/27/R0', 'NGSE/F/QA QC/27/R0', 'QMS', 'CHK', 'Hydraulic Door Site Inspection', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/1-p1mWoQVyav6RczcGsDxFWJGgCcnNh2fvVrKbpZU9tA/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:128', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:128' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/28/R0', 'NGSE/F/QA QC/28/R0', 'QMS', 'CHK', 'Hydraulic jack', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/1H--q-IZbjDJYjEQz2Ta6C35hiEXBAlFjHPugbxXQV3g/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:129', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:129' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/29/R0', 'NGSE/F/QA QC/29/R0', 'QMS', 'CHK', 'Mobile kitchen', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/1vO-A1LB1Q_CbSzlYDgdDM9jBEqfYXKZ4jjUHkhEy6yM/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:130', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:130' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/30/R0', 'NGSE/F/QA QC/30/R0', 'QMS', 'CHK', 'CHECKLIST OF HI-LIFT FOR SERVICE VEHICLES', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/1xJEV8v4nwxCF1-gIDJ6wOlfGY9sRIVHsjU98Q9ua-Q0/edit', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:131', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:131' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/31/R0', 'NGSE/F/QA QC/31/R0', 'QMS', 'CHK', 'Battery Operated Hand Pallet', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/1_kS38XGxaWxst_IMdmCj-_7XlJEG1FzTjz5U_am_Fek/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:132', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:132' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/32/R0', 'NGSE/F/QA QC/32/R0', 'QMS', 'CHK', 'Bike Parking (Motor Driven)', 'Quality', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/document/d/1egwk9-Gvnv2Q5Qr3CsWMEZeRuHdMvhhuXN02d6r9-M8/edit?usp=sharing', 'Google Doc', 'Checklist', '1', 'Ensures that the work-completion quality is according to the requirements.', 'CEO', '2025-04-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:133', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-29', ('2025-04-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:133' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/33/R0', 'NGSE/F/QA QC/33/R0', 'QMS', 'FRM', 'Project QAP', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/spreadsheets/d/1KUfSALBm06cbVfDCGhHfGPOTQn6QO-F71oI-6liWwZc/edit?usp=sharing', 'Google Sheet', 'Format', '1', '', 'CEO', '2023-07-29', 'Prashant M Patil', '2025-04-29', '2026-04-29', '', 'sheet:tracker:134', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-29', ('2023-07-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:134' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/34/R0', 'NGSE/F/QA QC/34/R0', 'QMS', 'FRM', 'Product QAP', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/spreadsheets/d/1bznzRR2VttQ0NddPuBxerTXR6McjavAJUgyHGzy-_B4/edit?usp=sharing', 'Google Sheet', 'Format', '1', '', 'CEO', '2023-07-15', 'Swapnil Ghadigaonkar', '2025-07-28', '2026-07-27', '', 'sheet:tracker:135', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:135' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/35/R0', 'NGSE/F/QA QC/35/R0', 'QMS', 'FRM', 'QAP PDI / Incoming Inspection', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/spreadsheets/d/10xLfe69C_FsZ1bQpEY6d8BrW0u65ve46NFaGj4Nl_no/edit?usp=sharing', 'Google Sheet', 'Format', '1', '', 'CEO', '2023-07-29', 'Swapnil Ghadigaonkar', '2025-07-28', '2026-07-27', '', 'sheet:tracker:136', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-29', ('2023-07-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:136' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/36/R0', 'NGSE/F/QA QC/36/R0', 'QMS', 'FRM', 'Supplier Evaluation Report', 'Quality', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1VsLXKm_qh8lz-yqIX9kNV05AQBhQbwEHizyQnatxHH0/edit#gid=0', 'Google Sheet', 'Format', '1', '', 'CEO', '2023-07-15', 'Swapnil Ghadigaonkar', '2025-07-28', '2026-07-27', '', 'sheet:tracker:137', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:137' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/37/R0', 'NGSE/F/QA QC/37/R0', 'QMS', 'FRM', 'Vendor Evaluation Form', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1K2ji8B84BHCRnImU0jdhwYmygMae_mWfw2fI9zwVkAg/edit?usp=sharing', 'Google Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Swapnil Ghadigaonkar', '2025-07-28', '2026-07-27', '', 'sheet:tracker:138', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:138' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/38/R0', 'NGSE/F/QA QC/38/R0', 'QMS', 'FRM', 'SCAR', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1HnSKCo-r8CA75BsQCtmCpgaA_GZWljX9o36mL-tb1w0/edit?usp=sharing', 'Google Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Swapnil Ghadigaonkar', '2025-07-28', '2026-07-27', '', 'sheet:tracker:139', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:139' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/39/R0', 'NGSE/F/QA QC/39/R0', 'QMS', 'FRM', 'Incoming Inspection Report', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/spreadsheets/d/1A8T28Hal4TUg-cP0K_3_3cfmLaS_j6VP6yg7iLtPJWs/edit?usp=sharing', 'Google Sheet', 'Format', '1', '', 'CEO', '2023-07-15', 'Swapnil Ghadigaonkar', '2025-07-28', '2026-07-27', '', 'sheet:tracker:140', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:140' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/40/R0', 'NGSE/F/QA QC/40/R0', 'QMS', 'FRM', 'Dimensional Inspection Report', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/spreadsheets/d/1blvmDwYSz7ZL8UNEfgbtQzOgEt5xCHId/edit?usp=sharing&ouid=101619828744482146991&rtpof=true&sd=true', 'Google Sheet', 'Format', '1', '', 'CEO', '2023-07-15', 'Swapnil Ghadigaonkar', '2025-07-28', '2026-07-27', '', 'sheet:tracker:141', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:141' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/41/R0', 'NGSE/F/QA QC/41/R0', 'QMS', 'FRM', 'DPT Report', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1tFaMzqbII9TaqJZ0o0_NgBwUKHD7kS_gS6rD-FHcyFw/edit?usp=sharing', 'Google Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Swapnil Ghadigaonkar', '2025-07-28', '2026-07-27', '', 'sheet:tracker:142', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:142' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/42/R0', 'NGSE/F/QA QC/42/R0', 'QMS', 'FRM', 'Blasting Report', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1hfsEZPRoMRbhip4yPmFu9IO7DdR5LkHmPXsc4NOH2jM/edit?usp=sharing', 'Google Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Swapnil Ghadigaonkar', '2025-07-28', '2026-07-27', '', 'sheet:tracker:143', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:143' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/43/R0', 'NGSE/F/QA QC/43/R0', 'QMS', 'FRM', 'Painting Report', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1IhxVvDHURjLaDVSi6Ild3-MrpsSbdJ4Dx6aTugJ2Uwk/edit?tab=t.0', 'Google Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Swapnil Ghadigaonkar', '2025-07-28', '2026-07-27', '', 'sheet:tracker:144', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:144' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/44/R0', 'NGSE/F/QA QC/44/R0', 'QMS', 'FRM', 'IMTE', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/spreadsheets/d/1SwGZw2i2iVVdPbcyAA6HbcC1d1jEaqxf_HNfVWlm-rA/edit?usp=sharing', 'Google Sheet', 'Format', '1', '', 'CEO', '2023-07-15', 'Swapnil Ghadigaonkar', '2025-07-28', '2026-07-27', '', 'sheet:tracker:145', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:145' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/45/R0', 'NGSE/F/QA QC/45/R0', 'QMS', 'FRM', 'COC', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1VTY3dzJhlCdhA_Mp3Q0lfMaLIX631AHZubTQCmzul7Y/edit?usp=sharing', 'Google Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Swapnil Ghadigaonkar', '2025-07-28', '2026-07-27', '', 'sheet:tracker:146', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:146' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/46/R0', 'NGSE/F/QA QC/46/R0', 'QMS', 'FRM', 'Sampling Plan', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1dox5AHdNrR5oNmMeGsEpVoGnlLDIaiEUcFiSHcAVkU0/edit?usp=sharing', 'Google Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Swapnil Ghadigaonkar', '2025-07-28', '2026-07-27', '', 'sheet:tracker:147', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:147' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/47/R0', 'NGSE/F/QA QC/47/R0', 'QMS', 'FRM', 'Supplier Visit Schedule', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/spreadsheets/d/1DEdyLlmRGrLKkg3lj3gYZEWPoGxWU_jP4U86Bopp2yU/edit?usp=sharing', 'Google Sheet', 'Format', '1', '', 'CEO', '2023-07-29', 'Swapnil Ghadigaonkar', '2025-07-28', '2026-07-27', '', 'sheet:tracker:148', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-29', ('2023-07-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:148' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/48/R0', 'NGSE/F/QA QC/48/R0', 'QMS', 'FRM', 'Load Test Report', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant Patil', 'approved', 'https://docs.google.com/document/d/11vZmGDK-73GX8WGMxMKa1P7VQaKxNzMZfZsTZdJsPzQ/edit?usp=sharing', 'Google Doc', 'Format', '1', '', 'CEO', '2023-07-29', 'Swapnil Ghadigaonkar', '2025-07-28', '2026-07-27', '', 'sheet:tracker:149', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-29', ('2023-07-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:149' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/49/R0', 'NGSE/F/QA QC/49/R0', 'QMS', 'FRM', 'Investigation Report', 'Quality', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/document/d/1NTH-PMzYu2W_VrgkGNyZ4s7Ka7u8wxdG6sHPAIIdopQ/edit?usp=share_link', 'Google Doc', 'Format', '1', '', 'CEO', '2022-12-23', 'Swapnil Ghadigaonkar', '2025-07-28', '2026-07-27', '', 'sheet:tracker:150', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2022-12-23', ('2022-12-23')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:150' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/50/R0', 'NGSE/F/QA QC/50/R0', 'QMS', 'FRM', 'Notice of Rejection of Goods', 'Quality', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/document/d/1sF18wal4kQ6xk4OB6Z7-_Uqe3ndvadIc30RLVRP0uNQ/edit?usp=sharing', 'Google Doc', 'Format', '1', '', 'CEO', null, 'Swapnil Ghadigaonkar', '2025-07-28', '2026-07-27', '', 'sheet:tracker:151', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:151' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/51/R0', 'NGSE/F/QA QC/51/R0', 'QMS', 'FRM', 'Measuring Tape Validation', 'Quality', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/document/d/1xDokzuH7jlfjOMBMU49cNAa8pTGMuLmF1j3kdLxYla8/edit?usp=sharing', 'Google Doc', 'Format', '1', '', 'CEO', '2023-03-25', 'Swapnil Ghadigaonkar', '2025-03-24', '2026-03-23', '', 'sheet:tracker:152', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-03-25', ('2023-03-25')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:152' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/52/R0', 'NGSE/F/QA QC/52/R0', 'QMS', 'FRM', 'Measuring tape allocation list', 'Quality', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1O_JsI_SjZYgmyGWOZgV6MxnL6rnMHg7IgODkK9_AmqQ/edit?usp=sharing', 'Google Sheet', 'Format', '1', '', 'CEO', '2023-04-17', 'Swapnil Ghadigaonkar', '2025-03-24', '2026-03-23', '', 'sheet:tracker:153', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-04-17', ('2023-04-17')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:153' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/53/R0', 'NGSE/F/QA QC/53/R0', 'QMS', 'FRM', 'Magnetic Particle Inspection Report', 'Quality', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/document/d/1rOYdy1qz-7j7CyS8gJ5t_PJOcGKxp8oM9zsnTsTDTyE/edit?usp=sharing', 'Google Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Swapnil Ghadigaonkar', '2025-07-28', '2026-07-27', '', 'sheet:tracker:154', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:154' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/QA QC/01/R0', 'NGSE/R/QA QC/01/R0', 'QMS', 'FRM', 'Incoming Material Tracker Sheet', 'Quality', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://nandanerp.in/app/rm-inspection-sheet', 'ERP Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Swapnil Ghadigaonkar', '2025-07-28', '2026-07-27', '', 'sheet:tracker:155', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:155' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/QA QC/02/R0', 'NGSE/R/QA QC/02/R0', 'QMS', 'FRM', 'Process Capability', 'Quality', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1rm62JTR0Kz3Pe-_4uXIDEVzH2Qe0-BxxIiAZsSYwhTQ/edit?usp=sharing', 'Google Sheet', 'Format', '1', 'a statistical measure of the critical process variability of a given characteristic.', 'CEO', '2023-09-18', 'Swapnil Ghadigaonkar', '2025-08-09', '2026-08-08', '', 'sheet:tracker:156', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-09-18', ('2023-09-18')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:156' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/54/R0', 'NGSE/F/QA QC/54/R0', 'QMS', 'FRM', 'Non Conformance Analysis', 'Quality', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1RjAhKOD8uPkypZu9l7dhf-GMV_LxI1TdfU6B-FtRYrY/edit?usp=sharing', 'Google Sheet', 'Format', '1', '', 'CEO', '2023-07-15', 'Pankaj Sutar', '2025-08-09', '2026-08-08', '', 'sheet:tracker:157', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:157' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/55', 'NGSE/F/QA QC/55', 'QMS', 'FRM', 'Machining Part Inspection Checksheet', 'Quality', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1A8T28Hal4TUg-cP0K_3_3cfmLaS_j6VP6yg7iLtPJWs/edit#gid=724749713', 'Google Sheet', 'Format', '1', 'Dimension inspection checksheet for supplier before dispatch', 'CEO', '2023-09-04', 'Pankaj Sutar', '2025-08-09', '2026-08-08', '', 'sheet:tracker:158', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-09-04', ('2023-09-04')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:158' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/56', 'NGSE/F/QA QC/56', 'QMS', 'FRM', 'Hydraulic Cylinder (Bush Mounting) Inspection Checksheet', 'Quality', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1A8T28Hal4TUg-cP0K_3_3cfmLaS_j6VP6yg7iLtPJWs/edit#gid=1917837452', 'Google Sheet', 'Format', '1', 'Dimension inspection checksheet for supplier before dispatch', 'CEO', '2023-09-06', 'Pankaj Sutar', '2025-08-09', '2026-08-08', '', 'sheet:tracker:159', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-09-06', ('2023-09-06')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:159' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/57', 'NGSE/F/QA QC/57', 'QMS', 'FRM', 'Hydraulic Cylinder (Flange Mounting) Inspection Checksheet', 'Quality', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1A8T28Hal4TUg-cP0K_3_3cfmLaS_j6VP6yg7iLtPJWs/edit#gid=294688295', 'Google Sheet', 'Format', '1', 'Dimension inspection checksheet for supplier before dispatch', 'CEO', '2023-09-06', 'Pankaj Sutar', '2025-08-09', '2026-08-08', '', 'sheet:tracker:160', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-09-06', ('2023-09-06')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:160' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/58', 'NGSE/F/QA QC/58', 'QMS', 'FRM', 'Inspection Checksheet - Valence Assembly', 'Quality', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1A8T28Hal4TUg-cP0K_3_3cfmLaS_j6VP6yg7iLtPJWs/edit?usp=sharing', 'Google Sheet', 'Format', '1', 'Dimension inspection checksheet for supplier before dispatch', 'CEO', '2023-09-12', 'Pankaj Sutar', '2025-08-09', '2026-08-08', '', 'sheet:tracker:161', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-09-12', ('2023-09-12')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:161' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/59', 'NGSE/F/QA QC/59', 'QMS', 'FRM', 'Hydraulic Cylinder (Stabilizer) Inspection Checksheet', 'Quality', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1A8T28Hal4TUg-cP0K_3_3cfmLaS_j6VP6yg7iLtPJWs/edit#gid=137499109', 'Google Sheet', 'Format', '1', 'Dimension inspection checksheet for supplier before dispatch', 'CEO', '2023-09-13', 'Pankaj Sutar', '2025-08-09', '2026-08-08', '', 'sheet:tracker:162', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-09-13', ('2023-09-13')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:162' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/60', 'NGSE/F/QA QC/60', 'QMS', 'FRM', 'FMEA', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/spreadsheets/d/1CXcHOyjwC7ELFcAyp-JNbUn-0xilpjH_Vp1sVbiUYd4/edit?usp=sharing', 'Google Sheet', 'Format', '1', 'Failure Modes and Effects Analysis (FMEA) is a systematic, proactive method for evaluating a process to identify where and how it might fail and to assess the relative impact of different failures, in order to identify the parts of the process that are most in need of change.', 'CEO', '2023-09-18', 'Pankaj Sutar', '2025-08-09', '2026-08-08', '', 'sheet:tracker:163', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-09-18', ('2023-09-18')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:163' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/61', 'NGSE/F/QA QC/61', 'QMS', 'FRM', 'Welder Qualification Schedule', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/spreadsheets/d/1ZJrojafl8Zz4P92mnRHOUHJgvCgig7LQqa-LzotYg5k/edit?gid=0#gid=0', 'Google Sheet', 'Format', '1', 'Pro active plan for welding qualification', 'CEO', '2023-09-23', 'Swapnil Ghadigaonkar', '2025-08-09', '2026-08-08', '', 'sheet:tracker:164', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-09-23', ('2023-09-23')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:164' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/62', 'NGSE/F/QA QC/62', 'QMS', 'FRM', 'Painter Qualification Schedule', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/spreadsheets/d/10Wyn4rddgMfpjkVbUNsnlSyXl-dIZ9Qw16kj4EMLfcM/edit?usp=sharing', 'Google Sheet', 'Format', '1', 'Pro active plan for painting qualification', 'CEO', '2023-12-21', 'Swapnil Ghadigaonkar', '2025-08-09', '2026-08-08', '', 'sheet:tracker:165', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-12-21', ('2023-12-21')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:165' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/63-166', 'NGSE/F/QA QC/63', 'QMS', 'FRM', 'Fixture Validation Report', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/spreadsheets/d/1wlAOJD63ok-CHw1jBwEqp3j66Lbo4Wj-fMd0nhH4jE8/edit?usp=sharing', 'Google Sheet', 'Format', '1', 'Validation of jigs and fixtures', 'CEO', '2024-02-09', 'Swapnil Ghadigaonkar', '2025-08-09', '2026-08-08', '', 'sheet:tracker:166', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2024-02-09', ('2024-02-09')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:166' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/64', 'NGSE/F/QA QC/64', 'QMS', 'FRM', 'Laser Cleaning Report', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1ujAehSkDvYQ28XV11A3mvzGBex7GC5WQjx7HDdHM0vE/edit?usp=sharing', 'Google Doc', 'Format', '1', 'Laser Remote Clean', 'CEO', '2024-08-10', 'Swapnil Ghadigaonkar', '2025-08-09', '2026-08-08', '', 'sheet:tracker:167', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2024-08-10', ('2024-08-10')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:167' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/65', 'NGSE/F/QA QC/65', 'QMS', 'FRM', 'Welding Log Book (Checksheet)', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/spreadsheets/d/1A1XtSUYJ8hB5QS0EesAgc-eyDvIGDHgm1TRGdrkUCI8/edit?usp=sharing', 'Google Sheet', 'Format', '1', 'Stagewise inspection of welding', 'CEO', '2026-01-14', 'Pankaj Sutar', '2026-01-14', '2027-01-14', '', 'sheet:tracker:168', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2026-01-14', ('2026-01-14')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:168' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/66', 'NGSE/F/QA QC/66', 'QMS', 'FRM', 'Welding Machine Calibration / Validation Report', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', null, 'Google Doc', 'Format', '1', 'Calivbration of Welding Machines', 'CEO', '2025-03-14', 'Swapnil Ghadigaonkar', '2026-03-14', null, '', 'sheet:tracker:169', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-03-14', ('2025-03-14')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:169' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-170', 'ERP', 'QMS', 'FRM', 'Supplier Visit Report', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://nandanerp.in/app/supplier-visit-report/new-supplier-visit-report-1', 'ERP Doc', 'Format', '1', '', 'CEO', '2024-08-10', 'Swapnil Ghadigaonkar', '2025-08-09', '2026-08-08', '', 'sheet:tracker:170', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2024-08-10', ('2024-08-10')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:170' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/L/QA QC/01', 'NGSE/L/QA QC/01', 'QMS', 'LST', 'List of Painters', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', null, 'Google Sheet', 'Register', '1', 'List of approved painters with skill competency', 'CEO', '2023-06-25', 'Pankaj Sutar', '2025-08-09', '2026-08-08', '', 'sheet:tracker:171', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-06-25', ('2023-06-25')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:171' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/L/QA QC/02-172', 'NGSE/L/QA QC/02', 'QMS', 'LST', 'List of Welders', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/spreadsheets/d/1DUvgcCb-ewrdj3gmJYEOM-crBOHzVNsGJ8zXpW4QgSA/edit?usp=drive_link', 'Google Sheet', 'Register', '1', 'List of approved welders with skill competency & WPS, PQR', 'CEO', '2023-06-25', 'Pankaj Sutar', '2025-09-12', '2026-09-11', '', 'sheet:tracker:172', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-06-25', ('2023-06-25')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:172' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/L/QA QC/02-173', 'NGSE/L/QA QC/02', 'WLD', 'LST', 'QUALIFIED WELDER LIST', 'Quality', (select id from public.profiles where display_name ilike '%Suraj%Alva%' and disabled = false limit 1), 'Suraj Alva', 'approved', 'https://docs.google.com/spreadsheets/d/1NHoXQ7Sf9_A6mFg-SDa-pW83qcXfuehXAK_JYIeYIv8/edit?gid=813621832#gid=813621832', 'Google Sheet', 'EN 1090', '1', 'List of approved welders with skill competency & WPS, PQR', 'CEO', '2026-09-12', 'Pankaj Sutar', '2026-09-12', '2027-09-12', '', 'sheet:tracker:173', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 1, 'approved', '2026-09-12', ('2026-09-12')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:173' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/L/QA QC/03', 'NGSE/L/QA QC/03', 'WLD', 'LST', 'Master List of WPQR - ISO 15614', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/spreadsheets/d/1cE9fZIMh2XlayiWNl_UegebuESlrzmOxnfhgZZxZQA4/edit?usp=drive_link', 'Google Sheet', 'EN 1090', '1', 'List of WPS', 'CEO', '2026-02-14', 'Pankaj Sutar', '2026-02-14', '2027-02-14', '', 'sheet:tracker:174', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2026-02-14', ('2026-02-14')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:174' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/L/QA QC/04', 'NGSE/L/QA QC/04', 'WLD', 'LST', 'Master List of WPS - ISO 15609-1', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/spreadsheets/d/1pPmAbReD4dhH-5gSmE5g5v1eeMH6H2QlmTirHM5GXL0/edit?usp=drive_link', 'Google Sheet', 'EN 1090', '1', 'List of PQR', 'CEO', '2026-02-14', 'Pankaj Sutar', '2026-02-14', '2027-02-14', '', 'sheet:tracker:175', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 1, 'approved', '2026-02-14', ('2026-02-14')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:175' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/L/QA QC/05', 'NGSE/L/QA QC/05', 'QMS', 'LST', 'Master List of WPS/PQR - AWS D1.1', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/spreadsheets/d/1pyB4MiujZK9mKzwI4uiiREE4Gznuk6zpI94x1YAF0NE/edit?usp=sharing', 'Google Sheet', 'Register', '1', 'List of WPS & PQR', '', null, '', null, null, '', 'sheet:tracker:176', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:176' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/03', 'NGSE/WI/QA QC/03', 'QMS', 'WI', 'Welding & Welding Equipment - SOP', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1X6XkJcznLyX0Tx31Gqiapjbw5L7JuT-vpqf0FI7erjs/edit?usp=sharing', 'Google Doc', 'SOP', '1', 'SOP for welding & use of equipments for welding', 'CEO', '2022-08-06', 'Pankaj Sutar', '2025-09-12', '2026-09-11', '', 'sheet:tracker:177', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2022-08-06', ('2022-08-06')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:177' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/04', 'NGSE/WI/QA QC/04', 'QMS', 'WI', 'Surface Preparation & Painting', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1AHNuwrTJBHJOYieoExGf9VTm5aeL3QQiWA8P-jpPa3A/edit?usp=sharing', 'Google Doc', 'SOP', '1', 'SOP for validated painting procedure', 'CEO', '2022-09-02', 'Pankaj Sutar', '2025-09-12', '2026-09-11', '', 'sheet:tracker:178', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2022-09-02', ('2022-09-02')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:178' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/05', 'NGSE/WI/QA QC/05', 'QMS', 'WI', 'Liquid Penetrant Examination', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1-_9unQslx5IOiX-mi5kPbeGM_2oj5Nb-T3N5PF9vQcA/edit?usp=sharing', 'Google Doc', 'SOP', '1', 'Performance & Examination of NDT with LPT', 'CEO', '2022-09-13', 'Pankaj Sutar', '2025-09-12', '2026-09-11', '', 'sheet:tracker:179', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2022-09-13', ('2022-09-13')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:179' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/06', 'NGSE/WI/QA QC/06', 'QMS', 'WI', 'Material inspection', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1LqYk0ZYsYjn4ukPJT7wYu4WDYaXxljpbDUC0kiFtPQE/edit?usp=sharing', 'Google Doc', 'SOP', '1', 'Minimum requirement & instructions for inspection for material', 'CEO', '2023-01-04', 'Pankaj Sutar', '2025-09-12', '2026-09-11', '', 'sheet:tracker:180', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-01-04', ('2023-01-04')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:180' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/07', 'NGSE/WI/QA QC/07', 'QMS', 'WI', 'Color Coding System of Raw Material', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1pKYCgQ9cY4bd-GXaNgnfpxAGtcRGCn6Aj_H1ovVux3Y/edit?usp=sharing', 'Google Doc', 'SOP', '1', 'To lay down the Colour Coding system for indicating the contents of raw material & Utility Lines.', 'CEO', '2023-01-23', 'Pankaj Sutar', '2025-09-12', '2026-09-11', '', 'sheet:tracker:181', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-01-23', ('2023-01-23')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:181' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/08', 'NGSE/WI/QA QC/08', 'QMS', 'WI', 'Preparation of Quality Assurance Plan', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1rXiyIcKsT3ckiL0bUAXqfbNaH8ZB0Vsbae5gOPdvSr0/edit?usp=sharing', 'Google Doc', 'SOP', '1', 'describe stage-wise inspection requirements and purchaser''s hold points', 'CEO', '2023-02-11', 'Pankaj Sutar', '2025-09-12', '2026-09-11', '', 'sheet:tracker:182', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-02-11', ('2023-02-11')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:182' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/09', 'NGSE/WI/QA QC/09', 'QMS', 'WI', 'Validation of Measuring Tape', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1UYBs3bUbBGR_hacKw21QL6AeShNK_lkAB8GJdh5ofvM/edit?usp=sharing', 'Google Doc', 'SOP', '1', 'procedure for internal validation of the measuring tape.', 'CEO', '2023-03-27', 'Pankaj Sutar', '2025-09-12', '2026-09-11', '', 'sheet:tracker:183', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-03-27', ('2023-03-27')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:183' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/10', 'NGSE/WI/QA QC/10', 'QMS', 'WI', 'WPS/Welder Qualifications procedure', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/15Kw8jtuB1Lil-dWM0GjRSIwUnWPAacDd1ttmQXIxOs0/edit?usp=sharing', 'Google Doc', 'SOP', '1', 'sequence for welding procedure qualification by means of a test weld & qualification of the welder.', 'CEO', '2023-03-29', 'Pankaj Sutar', '2025-09-12', '2026-09-11', '', 'sheet:tracker:184', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-03-29', ('2023-03-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:184' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/11', 'NGSE/WI/QA QC/11', 'QMS', 'WI', 'Hardness Testing Procedure', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/10Dlr1RyNq19tt3iJ-0FJt1kWNirhWg_zl49YRIUVad4/edit?usp=sharing', 'Google Doc', 'SOP', '1', 'method of carrying out Hardness Testing (HT) using an MGW metal hardness tester.', 'CEO', '2023-03-30', 'Pankaj Sutar', '2025-09-12', '2026-09-11', '', 'sheet:tracker:185', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-03-30', ('2023-03-30')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:185' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/12', 'NGSE/WI/QA QC/12', 'QMS', 'WI', 'Magnetic Particle Examination', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1848C-Qj1PkS8rVBw-lkU6yRghg6HBOh_cWVhmpIGDGc/edit?usp=sharing', 'Google Doc', 'SOP', '1', 'procedure shall be applied for detecting discontinuities, which are open to the surface and subsurface in ferromagnetic materials.', 'CEO', '2023-05-19', 'Pankaj Sutar', '2025-09-12', '2026-09-11', '', 'sheet:tracker:186', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-05-19', ('2023-05-19')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:186' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/13', 'NGSE/WI/QA QC/13', 'QMS', 'WI', 'Hydraulic Cylinder Inspection', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1FcuG3F0jWdckjzKSPihnMWldewxAG7P8pPNrGeXmw94/edit?usp=sharing', 'Google Doc', 'SOP', '1', 'Perform dimensional & visual inspection, performance test inspection for Hydraulic cylinder', 'CEO', '2023-06-26', 'Pankaj Sutar', '2025-09-12', '2026-09-11', '', 'sheet:tracker:187', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-06-26', ('2023-06-26')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:187' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/14', 'NGSE/WI/QA QC/14', 'QMS', 'WI', 'Acceptance Criteria for Calibrated Instruments', 'Quality', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/document/d/1yz51E6AwXwlnksbGS_qKL2VFem8L0cljAXUYAtIxmPQ/edit?usp=sharing', 'Google Doc', 'SOP', '1', 'Acceptable limit for instruments calibrated', 'CEO', '2023-12-30', 'Pankaj Sutar', '2025-09-12', '2026-09-11', '', 'sheet:tracker:188', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 1, 'approved', '2023-12-30', ('2023-12-30')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:188' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/15', 'NGSE/WI/QA QC/15', 'QMS', 'WI', 'Goods Lift', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1mmXOq_yuEKea_2bS5qSEmoP1U-dqGenIUVOyPA0OYIU/edit?usp=sharing', 'Google Doc', 'SOP', '1', '', 'CEO', '2023-02-27', 'Prashant M Patil', '2025-09-12', '2026-09-11', '', 'sheet:tracker:189', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-02-27', ('2023-02-27')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:189' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/16', 'NGSE/WI/QA QC/16', 'QMS', 'WI', 'Hi - Lift', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1IFlMT1LHGOKHmWUhXZL_XLykNBUQVNvDn4wResIfRcU/edit?usp=sharing', 'Google Doc', 'SOP', '1', '', 'CEO', '2023-02-27', 'Prashant M Patil', '2025-09-12', '2026-09-11', '', 'sheet:tracker:190', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-02-27', ('2023-02-27')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:190' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/17', 'NGSE/WI/QA QC/17', 'QMS', 'WI', 'SOP OF SCISSOR LIFT', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1L3A_8CrKFfVIcF7AXWJY-sM8yGTXaaV1Cxx1eZ99OzE/edit?usp=sharing', 'Google Doc', 'SOP', '1', '', 'CEO', '2023-02-27', 'Prashant M Patil', '2025-09-12', '2026-09-11', '', 'sheet:tracker:191', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-02-27', ('2023-02-27')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:191' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/18', 'NGSE/WI/QA QC/18', 'QMS', 'WI', 'Tail Lift', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1dib8ztmqtRwOphJonDPrgB7nO-OhNvZmcQQ8keg2JF8/edit?usp=sharing', 'Google Doc', 'SOP', '1', '', 'CEO', '2023-02-19', 'Prashant M Patil', '2025-09-12', '2026-09-11', '', 'sheet:tracker:192', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-02-19', ('2023-02-19')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:192' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/19', 'NGSE/WI/QA QC/19', 'QMS', 'WI', 'Towable Scissor Lift', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1wiY1uppFrD80gLwToviEi7teiaefDFD0fJqVKgq7470/edit?usp=share_link', 'Google Doc', 'SOP', '1', '', 'CEO', '2023-01-27', 'Prashant M Patil', '2025-09-12', '2026-09-11', '', 'sheet:tracker:193', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-01-27', ('2023-01-27')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:193' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/20', 'NGSE/WI/QA QC/20', 'QMS', 'WI', 'Zero Scissor Lift', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1wiY1uppFrD80gLwToviEi7teiaefDFD0fJqVKgq7470/edit?usp=share_link', 'Google Doc', 'SOP', '1', '', 'CEO', '2023-01-27', 'Prashant M Patil', '2025-09-12', '2026-09-11', '', 'sheet:tracker:194', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-01-27', ('2023-01-27')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:194' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/21', 'NGSE/WI/QA QC/21', 'QMS', 'WI', 'Turntable', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1Ztf5kqLeXBfh-f311QgQdIZc4709E6ePIKKxXMxrgwQ/edit?usp=share_link', 'Google Doc', 'SOP', '1', '', 'CEO', '2023-03-02', 'Prashant M Patil', '2025-09-12', '2026-09-11', '', 'sheet:tracker:195', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-03-02', ('2023-03-02')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:195' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/22', 'NGSE/WI/QA QC/22', 'QMS', 'WI', 'Truck mounted scissor lift', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1Maszv0JEzPxq1cCYVPz8xOLeBCt3SQzuwuhKkKskeUk/edit?usp=share_link', 'Google Doc', 'SOP', '1', '', 'CEO', '2023-03-02', 'Prashant M Patil', '2025-09-12', '2026-09-11', '', 'sheet:tracker:196', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-03-02', ('2023-03-02')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:196' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/23', 'NGSE/WI/QA QC/23', 'QMS', 'WI', 'Outsourced GTAW Welding', 'Quality', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/document/d/15xLCvagmD2N2zRFofMCWbFc0iY1JWUE9k6JN5iEVC4M/edit?usp=sharing', 'Google Doc', 'SOP', '1', 'Requirements from outsourced welding firm', 'CEO', '2024-02-02', 'Pankaj Sutar', '2025-09-12', '2026-09-11', '', 'sheet:tracker:197', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2024-02-02', ('2024-02-02')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:197' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/24', 'NGSE/WI/QA QC/24', 'QMS', 'WI', 'Nandan Cylinder Manufacturing / Assembly', 'Quality', null, '', 'approved', 'https://docs.google.com/document/d/1s5AALyF5HYUmj6CfTFlOFwTHny6F7wCAZ1dMGEO3nUY/edit?usp=drive_link', 'Google Doc', 'SOP', '1', '', 'CEO', '2024-08-30', 'Swapnil Ghadigaonkar', '2025-09-12', '2026-09-11', '', 'sheet:tracker:198', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2024-08-30', ('2024-08-30')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:198' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/25', 'NGSE/WI/QA QC/25', 'QMS', 'WI', 'Laser Cleaning SOP', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/18vl3aEqXAk58S0OjvcmSPfFH2clOHLBWfuLhoY3jmws/edit?pli=1&tab=t.0#heading=h.glpbat2dy3db', 'Google Doc', 'SOP', '1', '', 'CEO', '2024-11-13', 'Swapnil Ghadigaonkar', '2025-09-12', '2026-09-11', '', 'sheet:tracker:199', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2024-11-13', ('2024-11-13')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:199' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/26', 'NGSE/WI/QA QC/26', 'QMS', 'WI', 'Laser Welding SOP', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/17czopxpJY6zEFWS-lrOlobqmcc7uCiA84iOXAzIy4Ls/edit?usp=sharing', 'Google Doc', 'SOP', '1', '', 'CEO', '2024-11-13', 'Swapnil Ghadigaonkar', '2025-09-12', '2026-09-11', '', 'sheet:tracker:200', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2024-11-13', ('2024-11-13')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:200' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/27', 'NGSE/WI/QA QC/27', 'WLD', 'MAN', 'EN 1090 - Welding Manual', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'draft', 'https://docs.google.com/document/d/1aqzTa1U1cfBJ75jSXoznL-VSVlCYaT_DsGaHJ4nk6NQ/edit?usp=sharing', 'Google Doc', 'Manual', '1', '', '', null, '', null, null, '', 'sheet:tracker:201', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'draft', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:201' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/28', 'NGSE/WI/QA QC/28', 'QMS', 'WI', 'Visual testing', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'draft', 'https://docs.google.com/document/d/10Ffy5DAQ4TA5mtE0a8ls7nTgLUfpI5thvIKlOEXYuQE/edit?usp=sharing', 'Google Doc', 'SOP', '1', '', '', null, '', null, null, '', 'sheet:tracker:202', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'draft', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:202' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/29', 'NGSE/WI/QA QC/29', 'QMS', 'WI', 'Torquing', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'draft', 'https://docs.google.com/document/d/1VIToCZszaRjjkVa8VTbELFXGfypyUWCiHl-FODrvZ6A/edit?usp=sharing', 'Google Doc', 'SOP', '1', '', '', null, '', null, null, '', 'sheet:tracker:203', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'draft', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:203' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/30', 'NGSE/WI/QA QC/30', 'QMS', 'WI', 'Hot Dip Galvanising', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'draft', 'https://docs.google.com/document/d/1ck-oj1cJXqmE9CYBE-pSR-kGGIdCsaT6j8dpvmRmr7c/edit?usp=sharing', 'Google Doc', 'SOP', '1', '', '', '2025-03-03', '', null, null, '', 'sheet:tracker:204', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'draft', '2025-03-03', null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:204' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/31', 'NGSE/WI/QA QC/31', 'QMS', 'WI', 'Ultrasonic Examination of Steel Plates', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1aXxugMNl_HatH_voNeSG-RY1CA9qqzrdaJii13oPw6o/edit?usp=sharing', 'Google Doc', 'SOP', '1', '', 'CEO', '2025-04-13', 'Swapnil Ghadigaonkar', null, null, '', 'sheet:tracker:205', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-13', ('2025-04-13')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:205' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/QA QC/32', 'NGSE/WI/QA QC/32', 'QMS', 'WI', 'Ultrasonic Examination of Steel Rods', 'Quality', (select id from public.profiles where display_name ilike '%Prashant%Patil%' and disabled = false limit 1), 'Prashant M Patil', 'approved', 'https://docs.google.com/document/d/1MycIOM7kyaXD6atW00_DmOrppt68YIB8d7lF8gDuViA/edit?usp=sharing', 'Google Doc', 'SOP', '1', '', 'CEO', '2025-04-13', 'Swapnil Ghadigaonkar', null, null, '', 'sheet:tracker:206', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-04-13', ('2025-04-13')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:206' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-207', 'ERP', 'QMS', 'FRM', 'Opportunity', 'Sales & Marketing', (select id from public.profiles where display_name ilike '%Santosh%Patra%' and disabled = false limit 1), 'Santosh Patra', 'approved', 'https://nandanerp.in/app/opportunity/ENQ-202223-30687', 'ERP Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-09-12', '2026-09-11', '', 'sheet:tracker:207', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:207' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-208', 'ERP', 'QMS', 'FRM', 'Quotation creation', 'Sales & Marketing', (select id from public.profiles where display_name ilike '%Santosh%Patra%' and disabled = false limit 1), 'Santosh Patra', 'approved', 'https://nandanerp.in/app/quotation/new-quotation-1', 'ERP Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-09-12', '2026-09-11', '', 'sheet:tracker:208', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:208' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-209', 'ERP', 'QMS', 'FRM', 'Quotation submission', 'Sales & Marketing', (select id from public.profiles where display_name ilike '%Santosh%Patra%' and disabled = false limit 1), 'Santosh Patra', 'approved', 'https://nandanerp.in/app/quotation/NGSE%2FQTN%2F202223%2F10209', 'ERP Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-09-12', '2026-09-11', '', 'sheet:tracker:209', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:209' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-210', 'ERP', 'QMS', 'FRM', 'Sales Order Creation', 'Sales & Marketing', (select id from public.profiles where display_name ilike '%Santosh%Patra%' and disabled = false limit 1), 'Santosh Patra', 'approved', 'https://nandanerp.in/app/sales-order/new-sales-order-1', 'ERP Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-09-12', '2026-09-11', '', 'sheet:tracker:210', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:210' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-211', 'ERP', 'QMS', 'FRM', 'Customer Feedback', 'Sales & Marketing', (select id from public.profiles where display_name ilike '%Santosh%Patra%' and disabled = false limit 1), 'Santosh Patra', 'approved', 'https://youtu.be/w84Tv9Wg3qE', 'ERP Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-09-12', '2026-09-11', '', 'sheet:tracker:211', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:211' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-212', 'ERP', 'QMS', 'FRM', 'New Request for Quotation', 'Purchase', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://nandanerp.in/app/request-for-quotation/new-request-for-quotation-1', 'ERP Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Pankaj Sutar', '2025-10-11', '2026-10-10', '', 'sheet:tracker:212', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:212' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-213', 'ERP', 'QMS', 'FRM', 'Supplier Quotation', 'Purchase', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://nandanerp.in/app/supplier-quotation/new-supplier-quotation-2', 'ERP Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Pankaj Sutar', '2025-10-11', '2026-10-10', 'Expectation of document is pending', 'sheet:tracker:213', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:213' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-214', 'ERP', 'QMS', 'FRM', 'Material Request', 'Purchase', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://nandanerp.in/app/material-request/new-material-request-1', 'ERP Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Pankaj Sutar', '2025-10-11', '2026-10-10', 'Expectation of document is pending', 'sheet:tracker:214', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:214' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-215', 'ERP', 'QMS', 'FRM', 'New Purchase Order', 'Purchase', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://nandanerp.in/app/purchase-order/new-purchase-order-1', 'ERP Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Pankaj Sutar', '2025-10-11', '2026-10-10', 'Expectation of document is pending', 'sheet:tracker:215', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:215' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-216', 'ERP', 'QMS', 'FRM', 'New GRN', 'Purchase', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://nandanerp.in/app/purchase-receipt/new-purchase-receipt-1', 'ERP Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Pankaj Sutar', '2025-10-11', '2026-10-10', 'Expectation of document is pending', 'sheet:tracker:216', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:216' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-217', 'ERP', 'QMS', 'FRM', 'New Invoice', 'Purchase', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://nandanerp.in/app/purchase-invoice/new-purchase-invoice-1', 'ERP Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Pankaj Sutar', '2025-10-11', '2026-10-10', 'Expectation of document is pending', 'sheet:tracker:217', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:217' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-218', 'ERP', 'QMS', 'FRM', 'BOM', 'Purchase', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://nandanerp.in/app/bom/view/list?is_active=1', 'ERP Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Pankaj Sutar', '2025-10-11', '2026-10-10', 'Expectation of document is pending', 'sheet:tracker:218', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:218' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-219', 'ERP', 'QMS', 'FRM', 'Materail Resource Planning', 'Purchase', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://nandanerp.in/app/query-report/Stock%20Projected%20Qty?company=Nandan%20GSE%20Pvt%20Ltd%E2%80%8B', 'ERP Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Pankaj Sutar', '2025-10-11', '2026-10-10', 'Expectation of document is pending', 'sheet:tracker:219', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:219' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('Web-220', 'Web', 'QMS', 'FRM', 'New supplier registration form', 'Purchase', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://docs.google.com/forms/d/e/1FAIpQLSfnUlrQTjK3SYtnrc7qEGa7TCewbPor3JpVIC-l0dGnPCY5uA/viewform', 'Web', 'Format', '1', '', 'CEO', '2023-10-27', 'Pankaj Sutar', '2025-10-11', '2026-10-10', '', 'sheet:tracker:220', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-10-27', ('2023-10-27')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:220' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('Web-221', 'Web', 'QMS', 'FRM', 'Supplier Risk Assessment form', 'Purchase', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://docs.google.com/forms/d/e/1FAIpQLSd0P7pwH2-03NIR8rdyOvTcOMPfNBNPtuU9cPGHBQD8IQEcNg/viewform?vc=0&c=0&w=1&flr=0', 'Web', 'Format', '1', '', 'CEO', '2023-10-27', 'Pankaj Sutar', '2025-10-11', '2026-10-10', '', 'sheet:tracker:221', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-10-27', ('2023-10-27')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:221' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PPC/01/R0', 'NGSE/F/PPC/01/R0', 'QMS', 'FRM', 'Commissioning Certificate', 'PPC', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/document/d/1tfxviD-k_6eF3y3UVONrAuAsiTY9_1WsstDWBsglk3M/edit?usp=drive_link', 'Google Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-11-14', '2026-11-13', 'Expectation of document is pending', 'sheet:tracker:222', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:222' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PPC/02/R0', 'NGSE/F/PPC/02/R0', 'QMS', 'FRM', 'Warranty Certificate', 'PPC', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/document/d/1vOJApf09zct3wRCm-Vh5DMB-6HqolCYd-K2dmEMiU90/edit?usp=drive_link', 'Google Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-11-14', '2026-11-13', 'Expectation of document is pending', 'sheet:tracker:223', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:223' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PPC/03/R0', 'NGSE/F/PPC/03/R0', 'QMS', 'FRM', 'Training Certificate', 'PPC', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/document/d/1pbyABcag99ytcQt__0KV-EaO7jtprxFARkK06oPYrfI/edit?usp=drive_link', 'Google Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-11-14', '2026-11-13', 'Expectation of document is pending', 'sheet:tracker:224', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:224' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PPC/04/R0', 'NGSE/F/PPC/04/R0', 'QMS', 'FRM', 'Form - 22A', 'PPC', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/document/d/1GJmfjauwywn1lxPUSu6YGTC9dnEd4aEoPBsd9uFnZeA/edit?usp=drive_link', 'Google Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-11-14', '2026-11-13', 'Expectation of document is pending', 'sheet:tracker:225', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:225' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PPC/05/R0', 'NGSE/F/PPC/05/R0', 'QMS', 'FRM', 'To Whomever it may concern', 'PPC', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/document/d/1GGs4idt_rP_dQisokPixYc7eO5J0mS0VxlhHE2xj6oQ/edit?usp=drive_link', 'Google Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-11-14', '2026-11-13', 'Expectation of document is pending', 'sheet:tracker:226', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:226' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PPC/06/R0', 'NGSE/F/PPC/06/R0', 'QMS', 'FRM', 'Form - 22B (Part II)', 'PPC', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/document/d/1TYmynEO6h7E7pk7O-hua8PW_Q8Gpx7BQ5OwMxOLuHBQ/edit?usp=drive_link', 'Google Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-11-14', '2026-11-13', 'Expectation of document is pending', 'sheet:tracker:227', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:227' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PPC/07/R0', 'NGSE/F/PPC/07/R0', 'QMS', 'FRM', 'Project Kick- Off Document', 'PPC', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/document/d/1P8WTQQtRpGn9ZnqCtXsTbzqfBeMiDs0_r4tlz_3x1xo/edit?usp=drive_link', 'Google Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-11-14', '2026-11-13', 'Expectation of document is pending', 'sheet:tracker:228', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:228' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PPC/20/R0', 'NGSE/F/PPC/20/R0', 'QMS', 'FRM', 'Nandan GSE Final Dispatch Clearance', 'PPC', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/document/d/1-v0oF9G0KQzXynLCI0V41C2vs-yebQCjfIQBuNZIWe0/edit?tab=t.0', 'Google Doc', 'Format', '1', '', 'COO', '2026-02-05', 'Pankaj Sutar', '2026-02-05', '2027-02-05', '', 'sheet:tracker:229', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2026-02-05', ('2026-02-05')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:229' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-230', 'ERP', 'QMS', 'FRM', 'Project Operation Risk', 'PPC', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://nandanerp.in/app/todo/view/report/ToDo%20for%20PPC%20SnOp', 'ERP Doc', 'Format', '1', 'Operational risk of Jobs', 'CEO', '2023-09-29', 'Pankaj Sutar', '2025-11-14', '2026-11-13', '', 'sheet:tracker:230', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-09-29', ('2023-09-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:230' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PPC/08/R0', 'NGSE/F/PPC/08/R0', 'QMS', 'FRM', 'Job Card - Goods Lift', 'Production', (select id from public.profiles where display_name ilike '%Rajesh%Nayak%' and disabled = false limit 1), 'Rajesh Nayak', 'approved', 'https://docs.google.com/document/d/1-qRC8TviUA0so0SD4EoLSdrpGEPzDPEkO6YtAsE7pSQ/edit?usp=drive_link', 'Google Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-11-14', '2026-11-13', '', 'sheet:tracker:231', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:231' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PPC/09/R0', 'NGSE/F/PPC/09/R0', 'QMS', 'FRM', 'Job Card - Tail Lift', 'Production', (select id from public.profiles where display_name ilike '%Rajesh%Nayak%' and disabled = false limit 1), 'Rajesh Nayak', 'approved', 'https://docs.google.com/document/d/1n0svE5FT0Wk-kBXSuGVxiTSJjB-oRNsQQyg0FSkuXH8/edit?usp=drive_link', 'Google Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-07-14', '2026-11-13', '', 'sheet:tracker:232', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:232' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PPC/10/R0', 'NGSE/F/PPC/10/R0', 'QMS', 'FRM', 'Job Card - Scissor Lift', 'Production', (select id from public.profiles where display_name ilike '%Rajesh%Nayak%' and disabled = false limit 1), 'Rajesh Nayak', 'approved', 'https://docs.google.com/document/d/1487uUZXWIvLH5Osm2iGhFYaHITJWZwBYV3gabDHWKJ4/edit?usp=drive_link', 'Google Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-07-14', '2026-11-13', '', 'sheet:tracker:233', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:233' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PPC/11/R0', 'NGSE/F/PPC/11/R0', 'QMS', 'FRM', 'Hi-Lift Job card', 'Production', (select id from public.profiles where display_name ilike '%Rajesh%Nayak%' and disabled = false limit 1), 'Rajesh Nayak', 'approved', 'https://docs.google.com/document/d/1wtmmaZvdvNKyOQNO6u_SlcndxaHO_M7aB4dPNj_Oieg/edit?usp=sharing', 'Google Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-07-14', '2026-11-13', '', 'sheet:tracker:234', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:234' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PPC/12/R0-235', 'NGSE/F/PPC/12/R0', 'QMS', 'FRM', 'Job Card - Conveyor', 'Production', (select id from public.profiles where display_name ilike '%Rajesh%Nayak%' and disabled = false limit 1), 'Rajesh Nayak', 'approved', 'https://docs.google.com/document/d/14mPeaSTqLesggrHeenM73bnk5GxWhrAxV6UQS7fRbyk/edit?usp=sharing', 'Google Doc', 'Format', '1', '', 'CEO', '2023-11-01', 'Pankaj Sutar', '2025-10-31', '2026-10-30', '', 'sheet:tracker:235', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-11-01', ('2023-11-01')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:235' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PPC/16/R0', 'NGSE/F/PPC/16/R0', 'QMS', 'FRM', 'Job Card - Step Ladder', 'Production', (select id from public.profiles where display_name ilike '%Rajesh%Nayak%' and disabled = false limit 1), 'Rajesh Nayak', 'approved', 'https://docs.google.com/document/d/1cl7qqQrHRw2AkCJSd2wHj2Na43gdEVyyxj3v6FDE0F8/edit?usp=sharing', 'Google Doc', 'Format', '1', '', 'CEO', '2023-11-01', 'Pankaj Sutar', '2025-10-31', '2026-10-30', '', 'sheet:tracker:236', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-11-01', ('2023-11-01')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:236' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PPC/17/R0', 'NGSE/F/PPC/17/R0', 'QMS', 'FRM', 'Job Card - Catapult Drone Launcher', 'Production', (select id from public.profiles where display_name ilike '%Rajesh%Nayak%' and disabled = false limit 1), 'Rajesh Nayak', 'approved', 'https://docs.google.com/document/d/1vDWSWJLK0uxcCgmvSMdLHpaGAac4FO0vXwBCxGdHhxU/edit?usp=sharing', 'Google Doc', 'Format', '1', '', 'CEO', '2023-11-01', 'Pankaj Sutar', '2025-03-27', '2026-03-26', '', 'sheet:tracker:237', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-11-01', ('2023-11-01')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:237' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PPC/18/R0', 'NGSE/F/PPC/18/R0', 'QMS', 'FRM', 'Job Card - Turn table', 'Production', (select id from public.profiles where display_name ilike '%Rajesh%Nayak%' and disabled = false limit 1), 'Rajesh Nayak', 'approved', 'https://docs.google.com/document/d/1QfAIcJMOOZoM3lQUo6poiCOn9VKv675TbSRZCSJj_7k/edit?tab=t.0', 'Google Doc', 'Format', '1', '', 'CEO', '2023-11-01', 'Pankaj Sutar', '2025-03-27', '2026-03-26', '', 'sheet:tracker:238', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-11-01', ('2023-11-01')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:238' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PPC/19/R0', 'NGSE/F/PPC/19/R0', 'QMS', 'FRM', 'Job Card - Man lift', 'Production', (select id from public.profiles where display_name ilike '%Rajesh%Nayak%' and disabled = false limit 1), 'Rajesh Nayak', 'approved', 'https://docs.google.com/document/d/1Ris2oKy_TskqEDwpNAqahbetegqK7JHg5xXtmh_tvtA/edit?usp=sharing', 'Google Doc', 'Format', '1', '', 'CEO', '2025-10-29', 'Pankaj Sutar', '2025-10-29', '2026-10-29', '', 'sheet:tracker:239', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2025-10-29', ('2025-10-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:239' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PRD/01', 'NGSE/F/PRD/01', 'QMS', 'FRM', 'Hi-Lift production process', 'Production', (select id from public.profiles where display_name ilike '%Rajesh%Nayak%' and disabled = false limit 1), 'Rajesh Nayak', 'approved', 'https://docs.google.com/spreadsheets/d/1-AdkUJaNC1jYCcq8amuamWwT4XJrD2RRsDlIJA3ZNpc/edit#gid=751391000', 'Google Doc', 'Format', '1', '', 'CEO', '2023-10-27', 'Pankaj Sutar', '2025-10-26', '2026-10-25', '', 'sheet:tracker:240', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-10-27', ('2023-10-27')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:240' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PRD/02', 'NGSE/F/PRD/02', 'QMS', 'FRM', 'Goods-Lift production process', 'Production', (select id from public.profiles where display_name ilike '%Rajesh%Nayak%' and disabled = false limit 1), 'Rajesh Nayak', 'approved', 'https://docs.google.com/spreadsheets/d/1-AdkUJaNC1jYCcq8amuamWwT4XJrD2RRsDlIJA3ZNpc/edit#gid=1956943671', 'Google Doc', 'Format', '1', '', 'CEO', '2023-10-27', 'Pankaj Sutar', '2025-10-26', '2026-10-25', '', 'sheet:tracker:241', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-10-27', ('2023-10-27')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:241' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PRD/03', 'NGSE/F/PRD/03', 'QMS', 'FRM', 'Tail-Lift production process', 'Production', (select id from public.profiles where display_name ilike '%Rajesh%Nayak%' and disabled = false limit 1), 'Rajesh Nayak', 'approved', 'https://docs.google.com/spreadsheets/d/1-AdkUJaNC1jYCcq8amuamWwT4XJrD2RRsDlIJA3ZNpc/edit#gid=300744380', 'Google Doc', 'Format', '1', '', 'CEO', '2023-10-27', 'Pankaj Sutar', '2025-10-26', '2026-10-25', '', 'sheet:tracker:242', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-10-27', ('2023-10-27')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:242' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PRD/04', 'NGSE/F/PRD/04', 'QMS', 'FRM', 'Scissor lift production process', 'Production', (select id from public.profiles where display_name ilike '%Rajesh%Nayak%' and disabled = false limit 1), 'Rajesh Nayak', 'approved', 'https://docs.google.com/spreadsheets/d/1-AdkUJaNC1jYCcq8amuamWwT4XJrD2RRsDlIJA3ZNpc/edit#gid=0', 'Google Doc', 'Format', '1', '', 'CEO', '2023-10-27', 'Pankaj Sutar', '2025-10-26', '2026-10-25', '', 'sheet:tracker:243', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-10-27', ('2023-10-27')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:243' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PRD/05', 'NGSE/F/PRD/05', 'QMS', 'FRM', 'Man power sheet (Scissor Lift)', 'Production', (select id from public.profiles where display_name ilike '%Rajesh%Nayak%' and disabled = false limit 1), 'Rajesh Nayak', 'approved', 'https://docs.google.com/spreadsheets/d/1UB8XKIvQAwYlkXAuB13BY-r69zKH9DWRFzxo3qw2Bgs/edit#gid=1221655009', 'Google Sheet', 'Format', '1', 'Job card for excellence', 'CEO', '2023-10-30', 'Pankaj Sutar', '2025-10-29', '2026-10-28', '', 'sheet:tracker:244', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-10-30', ('2023-10-30')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:244' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PRD/06', 'NGSE/F/PRD/06', 'QMS', 'FRM', 'Man power sheet (Conveyer)', 'Production', (select id from public.profiles where display_name ilike '%Rajesh%Nayak%' and disabled = false limit 1), 'Rajesh Nayak', 'approved', 'https://docs.google.com/spreadsheets/d/1UB8XKIvQAwYlkXAuB13BY-r69zKH9DWRFzxo3qw2Bgs/edit#gid=1432874627', 'Google Sheet', 'Format', '1', 'Job card for excellence', 'CEO', '2023-10-30', 'Pankaj Sutar', '2025-10-29', '2026-10-28', '', 'sheet:tracker:245', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-10-30', ('2023-10-30')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:245' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PRD/07', 'NGSE/F/PRD/07', 'QMS', 'FRM', 'Man power sheet (Step Ladder)', 'Production', (select id from public.profiles where display_name ilike '%Rajesh%Nayak%' and disabled = false limit 1), 'Rajesh Nayak', 'approved', 'https://docs.google.com/spreadsheets/d/1UB8XKIvQAwYlkXAuB13BY-r69zKH9DWRFzxo3qw2Bgs/edit#gid=2063045925', 'Google Sheet', 'Format', '1', 'Job card for excellence', 'CEO', '2023-10-30', 'Pankaj Sutar', '2025-10-29', '2026-10-28', '', 'sheet:tracker:246', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-10-30', ('2023-10-30')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:246' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PRD/08', 'NGSE/F/PRD/08', 'QMS', 'FRM', 'Man power sheet (Hi-Lift)', 'Production', (select id from public.profiles where display_name ilike '%Rajesh%Nayak%' and disabled = false limit 1), 'Rajesh Nayak', 'approved', 'https://docs.google.com/spreadsheets/d/1UB8XKIvQAwYlkXAuB13BY-r69zKH9DWRFzxo3qw2Bgs/edit#gid=210145330', 'Google Sheet', 'Format', '1', 'Job card for excellence', 'CEO', '2023-10-30', 'Pankaj Sutar', '2025-10-29', '2026-10-28', '', 'sheet:tracker:247', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-10-30', ('2023-10-30')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:247' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PRD/09', 'NGSE/F/PRD/09', 'QMS', 'FRM', 'Man power sheet (Ambulift)', 'Production', (select id from public.profiles where display_name ilike '%Rajesh%Nayak%' and disabled = false limit 1), 'Rajesh Nayak', 'approved', 'https://docs.google.com/spreadsheets/d/1UB8XKIvQAwYlkXAuB13BY-r69zKH9DWRFzxo3qw2Bgs/edit#gid=1442632534', 'Google Sheet', 'Format', '1', 'Job card for excellence', 'CEO', '2023-10-30', 'Pankaj Sutar', '2025-10-29', '2026-10-28', '', 'sheet:tracker:248', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-10-30', ('2023-10-30')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:248' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PRD/10', 'NGSE/F/PRD/10', 'QMS', 'FRM', 'Man power sheet (Goods Lift)', 'Production', (select id from public.profiles where display_name ilike '%Rajesh%Nayak%' and disabled = false limit 1), 'Rajesh Nayak', 'approved', 'https://docs.google.com/spreadsheets/d/1UB8XKIvQAwYlkXAuB13BY-r69zKH9DWRFzxo3qw2Bgs/edit#gid=813218960', 'Google Sheet', 'Format', '1', 'Job card for excellence', 'CEO', '2023-10-30', 'Pankaj Sutar', '2025-10-29', '2026-10-28', '', 'sheet:tracker:249', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-10-30', ('2023-10-30')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:249' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PPC/12/R0-250', 'NGSE/F/PPC/12/R0', 'QMS', 'FRM', 'New Project in ERP', 'PPC', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://nandanerp.in/app/project/new-project-1', 'ERP Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-07-14', '2026-07-13', '', 'sheet:tracker:250', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:250' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PPC/13/R0-251', 'NGSE/F/PPC/13/R0', 'QMS', 'FRM', 'New Job Master in ERP', 'PPC', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://nandanerp.in/app/jobmaster/new-jobmaster-1', 'ERP Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-07-14', '2026-07-13', '', 'sheet:tracker:251', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:251' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/PPC/13/R0-252', 'NGSE/F/PPC/13/R0', 'QMS', 'FRM', 'New Gantt Chart in ERP', 'PPC', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://nandanerp.in/app/task/view/gantt?project=NGSE-PROJ-0579', 'ERP Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-07-14', '2026-07-13', '', 'sheet:tracker:252', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:252' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/PPC/01/R0', 'NGSE/R/PPC/01/R0', 'QMS', 'REG', 'Nandan PPC Dashboard', 'PPC', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://docs.google.com/spreadsheets/d/1NM5IoNB3k4R4HeLthWp29zJAJu5qCH6rfqSgjoWYOXI/edit#gid=820891500', 'Google Sheet', 'Register', '1', 'Monthly Planning & Targets of Dispatches, On time delivery analysis', 'CEO', '2023-07-18', 'Prashant M Patil', '2025-07-14', '2026-07-13', '', 'sheet:tracker:253', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-18', ('2023-07-18')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:253' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/PPC/02/R0-254', 'NGSE/R/PPC/02/R0', 'QMS', 'REG', 'Project Tracker Sheet', 'PPC', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://docs.google.com/spreadsheets/d/1WNihakaJevucli2tSgjFqmXChNFberqen3O8xMdlJ14/edit#gid=852619604', 'Google Sheet', 'Register', '1', 'All projects plan vs actual date', 'CEO', '2023-12-12', 'Pankaj Sutar', '2025-07-14', '2026-07-13', '', 'sheet:tracker:254', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-12-12', ('2023-12-12')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:254' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/PPC/02/R0-255', 'NGSE/R/PPC/02/R0', 'QMS', 'REG', 'Supplier Lead Time Analysis', 'PPC', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://docs.google.com/spreadsheets/d/1poP1A5wG-U014GbSNWjZRbxk07jTiIuzPJsmGa7fb74/edit?usp=sharing', 'Google Sheet', 'Register', '1', 'Timily delevery analysis from supplier', 'CEO', '2023-09-22', 'Pankaj Sutar', '2025-07-14', '2026-07-13', '', 'sheet:tracker:255', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-09-22', ('2023-09-22')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:255' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-256', 'ERP', 'QMS', 'REG', 'SNOP meeting', 'PPC', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://nandanerp.in/app/minutes-of-meetings/view/report', 'ERP Doc', 'Register', '1', 'Action of Plan for delayed dispatches', 'CEO', '2023-07-18', 'Pankaj Sutar', '2025-07-14', '2026-07-13', 'Filter for SNOP meeting in ERP is pending', 'sheet:tracker:256', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-18', ('2023-07-18')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:256' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-257', 'ERP', 'QMS', 'REG', 'Traceability of Raw materials, In Process and Final Product', 'PPC', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://nandanerp.in/app/query-report/Stock%20Ledger?company=Nandan%20GSE%20Pvt%20Ltd%E2%80%8B&from_date=2023-08-22&to_date=2023-09-22', 'ERP Doc', 'Register', '1', 'Stock Ledger', 'CEO', '2023-09-22', 'Pankaj Sutar', '2025-07-14', '2026-07-13', '', 'sheet:tracker:257', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-09-22', ('2023-09-22')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:257' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-258', 'ERP', 'QMS', 'FRM', 'Items', 'Store', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://nandanerp.in/app/item/view/report/Buying%20Item%20List', 'ERP Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-07-14', '2026-07-13', '', 'sheet:tracker:258', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:258' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-259', 'ERP', 'QMS', 'FRM', 'Material Request', 'Store', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://nandanerp.in/app/material-request/new-material-request-1', 'ERP Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-07-14', '2026-07-13', '', 'sheet:tracker:259', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:259' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-260', 'ERP', 'QMS', 'FRM', 'New Stock Entery', 'Store', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://nandanerp.in/app/stock-entry/new-stock-entry-1', 'ERP Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-07-14', '2026-07-13', '', 'sheet:tracker:260', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:260' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-261', 'ERP', 'QMS', 'FRM', 'New Delivery Note', 'Store', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://nandanerp.in/app/delivery-note/new-delivery-note-1', 'ERP Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-07-14', '2026-07-13', '', 'sheet:tracker:261', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:261' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-262', 'ERP', 'QMS', 'FRM', 'Stock Balance', 'Store', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://nandanerp.in/app/query-report/Stock%20Balance?company=Nandan%20GSE%20Pvt%20Ltd%E2%80%8B&from_date=2023-04-30&to_date=2023-05-31', 'ERP Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-07-14', '2026-07-13', '', 'sheet:tracker:262', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:262' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-263', 'ERP', 'QMS', 'FRM', 'New Stock Reconcillation', 'Store', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://nandanerp.in/app/stock-reconciliation/new-stock-reconciliation-1', 'ERP Doc', 'Format', '1', '', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-07-14', '2026-07-13', '', 'sheet:tracker:263', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:263' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/STR/01', 'NGSE/F/STR/01', 'QMS', 'FRM', 'Bin Card - Painting', 'Store', (select id from public.profiles where display_name ilike '%Mukesh%Tiwari%' and disabled = false limit 1), 'Mukesh Tiwari', 'approved', 'https://docs.google.com/spreadsheets/d/1CrHusvhkYqAWgKZJGqpW1p7vBg6iuURZpkgZMYIyXKI/edit?usp=sharing', 'Google Sheet', 'Format', '1', 'Paint stock allocation to job', 'CEO', '2023-09-26', 'Pankaj Sutar', '2025-07-14', '2026-07-13', '', 'sheet:tracker:264', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-09-26', ('2023-09-26')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:264' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/STR/02', 'NGSE/WI/STR/02', 'QMS', 'FRM', 'General Packing Specification for Parts', 'Store', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/document/d/1euwdnrOc3jCgP2QfIJ1DD3MHwz4jVHfnt6d3hyv6Rr4/edit?usp=sharing', 'Google Doc', 'Format', '1', 'Packing instructions and guidance', 'CEO', '2024-03-30', 'Pankaj Sutar', '2025-03-30', '2026-03-29', '', 'sheet:tracker:265', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2024-03-30', ('2024-03-30')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:265' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/WI/HR/02', 'NGSE/WI/HR/02', 'IMS', 'FRM', 'SOPs for cleaning & hygiene', 'Admin', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/document/d/1VvSDspsGxvFFe8IjnsHLcrnpoab8t7y9ZdUAYAQYEYE/edit?usp=sharing', 'Google Doc', 'Format', '1', '', 'CEO', '2024-02-01', 'Pankaj Sutar', '2025-07-26', '2026-07-25', '', 'sheet:tracker:266', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2024-02-01', ('2024-02-01')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:266' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/SYS/01', 'NGSE/F/SYS/01', 'IMS', 'FRM', 'Training Records of Department', 'HR', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1miomgoSkeeFK4nOIskUuFhaSOYJQut5DBQLdXTLaGp8/edit#gid=0', 'Printed Form', 'Format', '1', 'Every Month new form given in yellow paper both sides. HoD to return before the 4th Thursday to Pankaj', 'CEO', '2023-07-03', 'Pankaj Sutar', '2025-07-03', '2026-07-02', 'Every Month new form given in yellow paper both sides. HoD to return before the 4th Thursday to Pankaj', 'sheet:tracker:267', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-03', ('2023-07-03')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:267' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/SYS/06', 'NGSE/F/SYS/06', 'IMS', 'FRM', 'Dealer Training Record', 'HR', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1FNLPIRZ_5lOE3fJiOJs1UBSUgMuTV9W_khpf1jomvck/edit?usp=sharing', 'Printed Form', 'Format', '1', '', 'CEO', '2023-08-07', 'Pankaj Sutar', '2025-08-07', '2026-08-06', '', 'sheet:tracker:268', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-08-07', ('2023-08-07')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:268' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/D&D/01/R0', 'NGSE/F/D&D/01/R0', 'QMS', 'FRM', 'Project card', 'Design', (select id from public.profiles where display_name ilike '%Dhanesh%Patil%' and disabled = false limit 1), 'Dhanesh Patil', 'approved', 'https://docs.google.com/document/d/1bbCuIqoOyVvDT2Xe9XFm5kW1yIU1TnHFyz5aiagDJ4k/edit?usp=sharing', 'Google Doc', 'QMS', '1', 'Includes Overall Project submission Date', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-07-14', '2026-07-13', '', 'sheet:tracker:269', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:269' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-270', 'ERP', 'QMS', 'FRM', 'ECR', 'Design', (select id from public.profiles where display_name ilike '%Dhanesh%Patil%' and disabled = false limit 1), 'Dhanesh Patil', 'approved', 'https://nandanerp.in/app/ngse-ecr/new-ngse-ecr-1', 'ERP Doc', 'QMS', '', 'Engineering Change Request', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-07-14', '2026-07-13', '', 'sheet:tracker:270', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:270' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/D&D/03/R0', 'NGSE/F/D&D/03/R0', 'QMS', 'FRM', 'PDR / CDR / FDR', 'Design', (select id from public.profiles where display_name ilike '%Dhanesh%Patil%' and disabled = false limit 1), 'Dhanesh Patil', 'approved', 'https://docs.google.com/presentation/d/1PNnDvg4kzB6ZMyOuRz8RTSnZxvhkI2eP-89RkSVIvgU/edit#slide=id.p1', 'Google Doc', 'QMS', '1', 'Extrenal', 'CEO', '2023-07-15', 'Prashant M Patil', '2025-07-14', '2026-07-13', '', 'sheet:tracker:271', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-15', ('2023-07-15')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:271' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/D&D/01', 'NGSE/R/D&D/01', 'QMS', 'REG', 'FMEA of products', 'Design', null, '', 'draft', 'https://docs.google.com/document/d/10ci39JO5BZa5ISb1xoUhUUwHe4SNVBFlFo7FurAsq8s/edit?usp=sharing', '', 'QMS', '', '', '', null, '', '2025-07-14', '2026-07-13', '', 'sheet:tracker:272', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'draft', null, null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:272' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/D&D/04/R0', 'NGSE/F/D&D/04/R0', 'QMS', 'FRM', 'First Article Inspection', 'Design', (select id from public.profiles where display_name ilike '%Dhanesh%Patil%' and disabled = false limit 1), 'Dhanesh Patil', 'approved', 'https://docs.google.com/spreadsheets/d/1l_yerWBWsDbKD_F3a8F07Ox45ES0jOhJCVP-ITrRg0o/edit?usp=sharing', 'Google Sheet', 'QMS', '1', '', 'CEO', '2024-04-17', 'Pankaj Sutar', '2025-04-16', '2026-04-15', '', 'sheet:tracker:273', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2024-04-17', ('2024-04-17')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:273' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-274', 'ERP', 'IMS', 'FRM', 'Training Master Report', 'HR', (select id from public.profiles where display_name ilike '%Prasad%Tambe%' and disabled = false limit 1), 'Prasad Tambe', 'approved', 'https://nandanerp.in/app/training-master/view/report/Training%20Master%20Report', 'ERP Doc', 'IMS', '1', 'Documented information as evidence of competence by training.', 'CEO', '2023-07-07', 'Pankaj Sutar', '2025-07-06', '2026-07-05', '', 'sheet:tracker:274', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-07', ('2023-07-07')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:274' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NA-275', 'NA', 'IMS', 'FRM', 'Trainer Competancy Record', 'HR', (select id from public.profiles where display_name ilike '%Prasad%Tambe%' and disabled = false limit 1), 'Prasad Tambe', 'approved', 'https://drive.google.com/drive/folders/10axZJApSR5RzK2wro60I-YlQuO9eHqxr?usp=drive_link', 'ERP Doc', 'IMS', '1', 'Competancy record of Trainers', 'CEO', '2023-07-07', 'Pankaj Sutar', '2025-07-06', '2026-07-05', '', 'sheet:tracker:275', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-07', ('2023-07-07')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:275' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NA-276', 'NA', 'IMS', 'FRM', 'Employees Competancy Matrix', 'HR', (select id from public.profiles where display_name ilike '%Prasad%Tambe%' and disabled = false limit 1), 'Prasad Tambe', 'approved', 'https://docs.google.com/spreadsheets/d/1ROC79ABMdKe8y1BvBa9vAY7T1UiS0nQmF24WYXUo3CM/edit?usp=sharing', 'Google Sheet', 'IMS', '1', 'Skill and competancy mapping for employee', 'CEO', '2023-10-23', 'Pankaj Sutar', '2025-10-22', '2026-10-21', '', 'sheet:tracker:276', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-10-23', ('2023-10-23')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:276' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NA-277', 'NA', 'IMS', 'FRM', 'Nandan IT Inventory', 'Admin', (select id from public.profiles where display_name ilike '%Vishwas%Patil%' and disabled = false limit 1), 'Vishwas Patil', 'in_review', 'https://docs.google.com/spreadsheets/d/1Q4xqpNZzyZSv8KuA3Jjm7V4Q4ketqhFupUBJl7R_73Y/edit?usp=sharing', 'Google Sheet', 'IMS', '1', '', 'CEO', '2023-08-12', 'Swapnil Ghadigaonkar', '2025-08-13', '2026-08-12', '', 'sheet:tracker:277', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'in_review', '2023-08-12', null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:277' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/SYS/08', 'NGSE/F/SYS/08', 'ISMS', 'FRM', 'Information Security Checklist', 'Admin', (select id from public.profiles where display_name ilike '%Vishwas%Patil%' and disabled = false limit 1), 'Vishwas Patil', 'approved', 'https://docs.google.com/spreadsheets/d/15GjdFGMdnlDkgnx84kdY-NC6f9Yh8dQJn6gxiMirpPM/edit?usp=drive_link', 'Google Sheet', 'ISMS', '1', 'Information asset Management (security, confidentiality and resilience)', 'CEO', '2023-09-01', 'Pankaj Sutar', '2025-08-31', '2026-08-30', '', 'sheet:tracker:278', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-09-01', ('2023-09-01')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:278' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NA-279', 'NA', 'IMS', 'FRM', 'Driver & Vehicle details', 'Management', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://drive.google.com/drive/folders/1mETX-3sS3BnGs9V2MijNHVyXCyt2lCfB?usp=drive_link', 'PDF', 'IMS', '1', 'Control of competent & enviromental aspects', 'CEO', '2023-07-13', 'Pankaj Sutar', '2025-07-12', '2026-07-11', '', 'sheet:tracker:279', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-13', ('2023-07-13')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:279' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-280', 'ERP', 'IMS', 'FRM', 'Kaizen Sheet', 'Management', (select id from public.profiles where display_name ilike '%Rajesh%Nayak%' and disabled = false limit 1), 'Rajesh Nayak', 'approved', 'https://nandanerp.in/app/todo?status=Open&type_of_task=WCM%20Related', 'ERP Doc', 'IMS', '1', 'Continual Improvement', 'CEO', '2023-07-13', 'Pankaj Sutar', '2025-07-12', '2026-07-11', 'Previous record', 'sheet:tracker:280', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-07-13', ('2023-07-13')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:280' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/HR/01', 'NGSE/F/HR/01', 'IMS', 'FRM', 'House-Keeping checklist', 'HR', (select id from public.profiles where display_name ilike '%Prasad%Tambe%' and disabled = false limit 1), 'Prasad Tambe', 'draft', 'https://docs.google.com/spreadsheets/d/1-6c-hBhQeYlhlRKqjA1tQAvF4XUBpq8R6LCsdcuYKPE/edit#gid=0', 'Google Sheet', 'IMS', '1', 'Checklist for house keeping & factory cleaning', 'CEO', '2023-09-14', 'Pankaj Sutar', '2025-07-12', '2026-07-11', '', 'sheet:tracker:281', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'draft', '2023-09-14', null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:281' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/HR/02', 'NGSE/F/HR/02', 'IMS', 'FRM', 'Washroom Cleaning checklist', 'HR', (select id from public.profiles where display_name ilike '%Prasad%Tambe%' and disabled = false limit 1), 'Prasad Tambe', 'draft', 'https://docs.google.com/spreadsheets/d/1-6c-hBhQeYlhlRKqjA1tQAvF4XUBpq8R6LCsdcuYKPE/edit#gid=273792402', 'Google Sheet', 'IMS', '1', 'Checklist for washroom cleaning', 'CEO', '2023-09-14', 'Pankaj Sutar', '2025-07-12', '2026-07-11', '', 'sheet:tracker:282', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'draft', '2023-09-14', null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:282' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/HR/03', 'NGSE/F/HR/03', 'IMS', 'FRM', 'Safety and Security On the Job Training', 'HR', (select id from public.profiles where display_name ilike '%Prasad%Tambe%' and disabled = false limit 1), 'Prasad Tambe', 'approved', 'https://docs.google.com/spreadsheets/d/1HvqUDk19eCvGxrlAYoZ0zDE0iE_BRbTq_NdXtHV-WQI/edit?usp=sharing', 'Google Sheet', 'IMS', '1', 'Security guard training record', 'CEO', '2023-09-22', 'Pankaj Sutar', '2025-09-21', '2026-09-20', '', 'sheet:tracker:283', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-09-22', ('2023-09-22')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:283' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/HR/02', 'NGSE/R/HR/02', 'IMS', 'REG', 'Training Calender', 'HR', (select id from public.profiles where display_name ilike '%Prasad%Tambe%' and disabled = false limit 1), 'Prasad Tambe', 'approved', 'https://docs.google.com/spreadsheets/d/1ZZZj9Dj2J5affGDD85CnP_G-41zDIkyNEi5dllx5iEU/edit#gid=217108386&range=A1:B1', 'Google Doc', 'IMS', '1', 'Yearly training plan', 'CEO', '2023-04-01', 'Pankaj Sutar', '2025-09-21', '2026-09-20', '', 'sheet:tracker:284', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-04-01', ('2023-04-01')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:284' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('ERP-285', 'ERP', 'QMS', 'FRM', 'Support ticket summary', 'Service', (select id from public.profiles where display_name ilike '%Yashavnth%Nayak%' and disabled = false limit 1), 'Yashavnth Nayak', 'approved', 'https://nandanerp.in/app/issue/view/report/Support%20Tickets%20Summary', 'ERP Doc', 'IMS', '1', 'Complaint details, Cost analysis & Warrenty services', 'CEO', '2023-09-29', 'Pankaj Sutar', '2025-09-21', '2026-09-20', '', 'sheet:tracker:285', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-09-29', ('2023-09-29')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:285' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/L/SYS/06', 'NGSE/L/SYS/06', 'OHS', 'LST', 'EMERGENCY RESPONSE TEAM', 'Management', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1JfriDetsAteOAZKm7GrNFFhFMxGolx0g0xrLFwW6MAE/edit?usp=sharing', 'Google Doc', 'OHSMS', '1', 'EMERGENCY RESPONSE TEAM memebers', 'CEO', '2023-12-11', 'Pankaj Sutar', '2025-09-21', '2026-09-20', 'Sign Copy', 'sheet:tracker:286', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-12-11', ('2023-12-11')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:286' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/L/SYS/07', 'NGSE/L/SYS/07', 'OHS', 'LST', 'Emergency Contact Number', 'Management', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/document/d/1kMdWqjo0Y2OmJO5HaSB00U3wEKM0LAA_97kHLMGOkHY/edit?usp=sharing', 'Google Doc', 'OHSMS', '1', 'EMERGENCY RESPONSE TEAM memebers', 'CEO', '2023-12-11', 'Pankaj Sutar', '2025-09-21', '2026-09-20', '', 'sheet:tracker:287', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-12-11', ('2023-12-11')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:287' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/L/SYS/21', 'NGSE/L/SYS/21', 'OHS', 'LST', 'ISO 45001 :2018, 5S and Energy audit Calander', 'Management', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1rmewa6DJKcaTCzvqYxRibfiPFGxBSfJ4IP7AooPk5lU/edit?usp=sharing', 'Google Sheet', 'OHSMS', '1', 'ISO 45001 :2018, 5S and Energy audit Calander', 'CEO', '2023-12-26', 'Pankaj Sutar', '2025-09-21', '2026-09-20', '', 'sheet:tracker:288', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2023-12-26', ('2023-12-26')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:288' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/QA&QC/03', 'NGSE/R/QA&QC/03', 'OHS', 'REG', 'Light Intensity Monitoring Record', 'Quality', null, 'Swapnil G', 'approved', 'https://docs.google.com/spreadsheets/d/1TvhLXOaUfq-oxI2NxeoTgxQQ27oJtSqU4eM6BkT32Ig/edit?usp=sharing', 'Google Sheet', 'OHSMS', '1', 'Fluctuations in light levels over a specific period, noting variations in lux or lumens for various settings or locations.', 'CEO', '2024-01-02', 'Pankaj Sutar', '2025-06-05', '2026-06-04', '', 'sheet:tracker:289', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2024-01-02', ('2024-01-02')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:289' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/QA&QC/04', 'NGSE/R/QA&QC/04', 'OHS', 'REG', 'Noise Intensity Monitoring Record', 'Quality', null, 'Swapnil G', 'approved', 'https://docs.google.com/spreadsheets/d/10knuZXjeiFGnbXKiOzaYZpvHzwpqIecqJEmyDF27WzQ/edit?usp=sharing', 'Google Sheet', 'OHSMS', '1', 'A log of sound levels measured over a designated timeframe, capturing fluctuations in decibels across different environments or locations.', 'CEO', '2024-01-02', 'Pankaj Sutar', '2025-06-05', '2026-06-04', '', 'sheet:tracker:290', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2024-01-02', ('2024-01-02')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:290' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('External Lab-291', 'External Lab', 'OHS', 'FRM', 'DG Stack Emmission', 'Quality', null, 'Swapnil G', 'approved', 'https://drive.google.com/drive/folders/1HNhFeNRI1Z_T8uGBWa0TxMfbYan8BtDE?usp=drive_link', 'PDF', 'OHSMS', '1', 'Measure the', 'CEO', '2024-01-02', 'Pankaj Sutar', '2025-06-05', '2026-06-04', '', 'sheet:tracker:291', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2024-01-02', ('2024-01-02')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:291' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('External Lab-292', 'External Lab', 'OHS', 'FRM', 'Water Testing Record', 'Quality', null, 'Swapnil G', 'approved', 'https://drive.google.com/drive/folders/1_5QP5G1gxBEvCKcnwPLrjdDVdQC6ixeV?usp=drive_link', 'PDF', 'OHSMS', '1', 'Water is being tested for its consumption', 'CEO', '2024-01-02', 'Swapnil Ghadigaonkar', '2025-06-05', '2026-06-04', '', 'sheet:tracker:292', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2024-01-02', ('2024-01-02')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:292' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/21', 'NGSE/R/SYS/21', 'IMS', 'REG', 'Fire Extinguisher Survey Report', 'Management', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/18-Ao_OFNzCxMZSDHqImb_noNpnqmfRQQPQ4_KkUCkOY/edit?usp=sharing', 'Google Sheet', 'IMS', '1', 'List of fire fire extinguisher and its due date', 'CEO', '2024-01-12', 'Pankaj Sutar', '2025-06-05', '2026-06-04', '', 'sheet:tracker:293', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2024-01-12', ('2024-01-12')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:293' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/22', 'NGSE/R/SYS/22', 'IMS', 'REG', '5 S Audit Checklist', 'Management', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/17gpGmXmTbVPIrC23mtdlu9QK3kGnXdH7lPtlYNWyCNg/edit?usp=sharing', 'Google Sheet', 'IMS', '1', '5S Audit check list for shop floor and office', 'CEO', '2024-01-30', 'Pankaj Sutar', '2025-06-05', '2026-06-04', '', 'sheet:tracker:294', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2024-01-30', ('2024-01-30')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:294' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/23', 'NGSE/R/SYS/23', 'IMS', 'REG', 'CSR ANNUAL ACTION PLAN', 'Management', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'in_review', 'https://docs.google.com/spreadsheets/d/1IjAcrS22AmUgbrxF92wf-77VOjG5a_PRLmlKfJ26qdY/edit?usp=sharing', 'Google Sheet', 'IMS', '1', 'Yearly plan for CSR Plan for corporate social responsibility and monitor', 'CEO', '2024-01-30', 'Pankaj Sutar', '2025-06-05', '2026-06-04', '', 'sheet:tracker:295', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'in_review', '2024-01-30', null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:295' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/25', 'NGSE/R/SYS/25', 'IMS', 'REG', 'Technology Upgradation and Implementation Plan', 'Management', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'in_review', 'https://docs.google.com/spreadsheets/d/1AzscxjuNrRg7Eugvr2ZqzoF4VedArW6T48TEM3BaYKw/edit?usp=sharing', 'Google Sheet', 'IMS', '1', 'Yearly plan for technology upgrade', 'CEO', '2024-01-30', 'Pankaj Sutar', '2025-06-05', '2026-06-04', '', 'sheet:tracker:296', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'in_review', '2024-01-30', null, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:296' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/SYS/24', 'NGSE/R/SYS/24', 'WLD', 'REG', 'Tasks and areas of competence of the welding coordinator', 'HR', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1rgxZFtpft_bu5T5PZbbAeNyXmXb_qqDik5edOXi4-Go/edit?usp=sharing', 'Google Sheet', 'EN 1090', '1', 'Skill matrix for EN 1090', 'CEO', '2026-04-16', 'Pankaj Sutar', '2026-04-16', '2027-04-16', '', 'sheet:tracker:298', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 1, 'approved', '2026-04-16', ('2026-04-16')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:298' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/MAIN/03', 'NGSE/R/MAIN/03', 'IMS', 'REG', 'Breakdown Maintenance Analysis (MTTR & MTBF)', 'Maintenance', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/1Pq5HiPXYdysI8VTGNM3w4vs2ys2fP7SHDhZ_A92Mqa8/edit?usp=sharing', 'Google Sheet', 'IMS', '1', 'MTTR (Mean Time to Repair) and MTBF (Mean Time Between Failures)', 'CEO', '2024-02-05', 'Pankaj Sutar', '2025-06-05', '2026-06-04', '', 'sheet:tracker:299', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2024-02-05', ('2024-02-05')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:299' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/F/QA QC/63-300', 'NGSE/F/QA QC/63', 'QMS', 'FRM', 'Problem Solving A 3 Report', 'Quality', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://docs.google.com/spreadsheets/d/17B6yLukPwgb8Naez6G5N5K9ZGbyA_PaP3bf0LmahYtU/edit#gid=0', 'Google Sheet', 'IMS', '1', 'Problem solving tool A3', 'CEO', '2024-02-19', 'Pankaj Sutar', '2025-06-05', '2026-06-04', '', 'sheet:tracker:300', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2024-02-19', ('2024-02-19')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:300' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NA-301', 'NA', 'QMS', 'CHK', 'Energy Audit Checklist', 'Quality', (select id from public.profiles where display_name ilike '%Pankaj%Sutar%' and disabled = false limit 1), 'Pankaj Sutar', 'approved', 'https://app.safetyculture.com/templates/index', 'Web', 'IMS', '1', 'Energy consumption and audit checklist', 'CEO', '2024-02-28', 'Pankaj Sutar', '2025-06-05', '2026-06-04', '', 'sheet:tracker:301', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 0, 'approved', '2024-02-28', ('2024-02-28')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:301' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

insert into ims_document (doc_no, ref_no, sys, doc_type, title, department, owner_id, owner_name, status, external_url, doc_kind, source_type, issue_no, expectation, approved_by_name, approved_on, reviewed_by_name, reviewed_on, next_review, remarks, import_key, created_by) values ('NGSE/R/MAIN/25', 'NGSE/R/MAIN/25', 'WLD', 'REG', 'Equipment Master List', 'Maintenance', null, 'Pratish G', 'approved', 'https://docs.google.com/spreadsheets/d/1ozClgO2mUiV7OI9IBpV8oaEjQ5YI5QTBaoVah3_6Rlk/edit?gid=45308949#gid=45308949', 'Google Sheet', 'EN 1090', '1', '', 'CEO', '2026-01-12', 'Pankaj Sutar', '2026-01-12', '2027-01-12', '', 'sheet:tracker:302', 'import:ims-sheet') on conflict (doc_no) do nothing;

insert into ims_document_revision (document_id, rev_no, status, effective_date, approved_at, change_summary, file_path, created_by)
select d.id, 1, 'approved', '2026-01-12', ('2026-01-12')::timestamptz, 'Imported from the IMS Document and Link Tracker (L/SYS/01).', null, 'import:ims-sheet'
from ims_document d where d.import_key = 'sheet:tracker:302' and not exists (select 1 from ims_document_revision x where x.document_id = d.id);

update ims_document d set current_revision_id = r.id from ims_document_revision r
 where r.document_id = d.id and d.current_revision_id is null and d.import_key like 'sheet:tracker:%' and r.status = 'approved';

-- ------------------------------------------------------------ C. certificates and the wall

insert into ims_certificate (kind, title, certificate_no, scheme, issuing_body, issue_date, expiry_date, external_url, remarks, import_key, created_by)
values ('certification', 'AS 9100 : 2016', '1223-1226-CN AS 143', 'AS 9100 : 2016', 'NOVO STAR', '2023-12-11', '2026-12-10', 'https://drive.google.com/file/d/1jQrDLpF2AIbeUr0l0j5KQpEwx_YJHZUo/view?usp=drive_link', 'From the IMS Master Register. Reviewed 2025-10-14, next review 2026-10-13.', 'sheet:cert:3', 'import:ims-sheet')
on conflict (import_key) do nothing;

insert into ims_certificate (kind, title, certificate_no, scheme, issuing_body, issue_date, expiry_date, external_url, remarks, import_key, created_by)
values ('certification', 'ISO 9001 : 2015', 'CEA168225Q', 'ISO 9001 : 2015', 'PYRAMID CERTIFICATION LLP', '2022-03-14', '2025-03-13', 'https://drive.google.com/file/d/1kT2xs6TeWxNFDMnwqisK52Af2HeIvP2P/view?usp=sharing', 'From the IMS Master Register. Reviewed 2025-10-14, next review 2026-10-13.', 'sheet:cert:4', 'import:ims-sheet')
on conflict (import_key) do nothing;

insert into ims_certificate (kind, title, certificate_no, scheme, issuing_body, issue_date, expiry_date, external_url, remarks, import_key, created_by)
values ('certification', 'ISO 9001 : 2015', '1223-1226-CN QMS 143', 'ISO 9001 : 2015', 'NOVO STAR', '2023-12-11', '2026-12-10', 'https://drive.google.com/file/d/13BAMwnfCK-gubIPrwM5JbxjTvQm18PeI/view?usp=sharing', 'From the IMS Master Register. Reviewed 2025-10-14, next review 2026-10-13.', 'sheet:cert:5', 'import:ims-sheet')
on conflict (import_key) do nothing;

insert into ims_certificate (kind, title, certificate_no, scheme, issuing_body, issue_date, expiry_date, external_url, remarks, import_key, created_by)
values ('certification', 'ISO 14001 : 2015', 'CEA168325E', 'ISO 14001 : 2015', 'PYRAMID CERTIFICATION LLP', '2022-03-14', '2025-03-13', 'https://drive.google.com/file/d/1epDRhOK9D_CvST-23SzqLChyZYCgPe5m/view?usp=sharing', 'From the IMS Master Register. Reviewed 2025-10-14, next review 2026-10-13.', 'sheet:cert:6', 'import:ims-sheet')
on conflict (import_key) do nothing;

insert into ims_certificate (kind, title, certificate_no, scheme, issuing_body, issue_date, expiry_date, external_url, remarks, import_key, created_by)
values ('certification', 'ISO 45001 : 2018', 'CEA168425O', 'ISO 45001 : 2018', 'PYRAMID CERTIFICATION LLP', '2022-03-14', '2025-03-13', 'https://drive.google.com/file/d/19QiHNZQ5muFqdgAENU0GUlVUFlBNOqPf/view?usp=sharing', 'From the IMS Master Register. Reviewed 2025-10-14, next review 2026-10-13.', 'sheet:cert:7', 'import:ims-sheet')
on conflict (import_key) do nothing;

insert into ims_certificate (kind, title, certificate_no, scheme, issuing_body, issue_date, expiry_date, external_url, remarks, import_key, created_by)
values ('certification', 'SAMAR', '', 'SAMAR', '', '2024-02-23', null, 'https://drive.google.com/file/d/1LmlVm4_IG9iQ1LPmMUSGH-gwRGH1XoHN/view?usp=drive_link', 'From the IMS Master Register. Reviewed 2025-02-22, next review 2026-02-21.', 'sheet:cert:8', 'import:ims-sheet')
on conflict (import_key) do nothing;

insert into ims_certificate (kind, title, certificate_no, scheme, issuing_body, issue_date, expiry_date, external_url, remarks, import_key, created_by)
values ('certification', 'MSME ZED Gold', '19032024_005970', 'MSME ZED Gold', 'MSME / QCI', '2024-03-14', '2027-03-19', 'https://drive.google.com/file/d/1IHNuG7-v8zOMuHgrA0sKanXDXK7AO7hT/view?usp=drive_link', 'From the IMS Master Register. Reviewed 2025-03-13, next review 2026-03-12.', 'sheet:cert:9', 'import:ims-sheet')
on conflict (import_key) do nothing;

insert into ims_certificate (kind, title, certificate_no, scheme, issuing_body, issue_date, expiry_date, external_url, remarks, import_key, created_by)
values ('certification', 'CE of Hi Lift', '23UCAH8303', 'CE of Hi Lift', '', '2024-02-29', null, 'https://drive.google.com/file/d/12YGtW81DwD-QxRPhbZPzJprKmgoZ_96Z/view?usp=sharing', 'From the IMS Master Register. Reviewed 2025-02-28, next review 2026-02-27.', 'sheet:cert:10', 'import:ims-sheet')
on conflict (import_key) do nothing;

insert into ims_certificate (kind, title, certificate_no, scheme, issuing_body, issue_date, expiry_date, external_url, remarks, import_key, created_by)
values ('certification', 'EN 1090-2 (EXC3)', 'Nr.2518-CPR-PSC20251052', 'EN 1090-2 (EXC3)', '', null, null, 'https://drive.google.com/file/d/1Q7mSeluMH3hwFewe8zT29Ccgk0Ilcv-O/view?usp=drive_link', 'From the IMS Master Register. Reviewed -, next review -.', 'sheet:cert:11', 'import:ims-sheet')
on conflict (import_key) do nothing;

insert into ims_certification (scheme, body, status, achieved_date, notes, sort_order) values
  ('AS 9100D', 'Novo Star', 'achieved', '2023-12-11', 'Certificate 1223-1226-CN AS 143, valid till 2026-12-10.', 5),
  ('ISO 50001', '', 'in_progress', null, 'In process (IMS Master Register, Summary Data for ISO).', 45)
on conflict (scheme) do update set body = excluded.body, status = excluded.status, achieved_date = excluded.achieved_date, notes = excluded.notes;
update ims_certification set status = 'achieved', body = 'Novo Star (re-certified); first by Pyramid Certification LLP', achieved_date = '2022-03-14', notes = 'CEA168225Q (Pyramid, till 2025-03-13); 1223-1226-CN QMS 143 (Novo Star).' where scheme = 'ISO 9001:2015' and status <> 'achieved';
update ims_certification set status = 'achieved', body = 'Pyramid Certification LLP', achieved_date = '2022-03-14', notes = 'CEA168325E, valid till 2025-03-13 on the sheet - check the renewal.' where scheme = 'ISO 14001:2015' and status <> 'achieved';
update ims_certification set status = 'achieved', body = 'Pyramid Certification LLP', achieved_date = '2022-03-14', notes = 'CEA168425O, valid till 2025-03-13 on the sheet - check the renewal.' where scheme = 'ISO 45001:2018' and status <> 'achieved';
update ims_certification set status = 'in_progress', notes = 'In process (IMS Master Register).' where scheme = 'ISO/IEC 27001:2022' and status = 'target';
update ims_certification set status = 'in_progress', notes = 'In process (IMS Master Register).' where scheme = 'AWS D1.1' and status = 'target';
update ims_certification set status = 'achieved', body = 'MSME / QCI', achieved_date = '2024-03-19', notes = 'ZED Gold 19032024_005970, valid till 2027-03-19.' where scheme = 'ZED' and status <> 'achieved';
update ims_certification set status = 'achieved', achieved_date = '2025-01-01', notes = 'Nr.2518-CPR-PSC20251052 (certificate PDF on the tracker).' where scheme = 'EN 1090-2 EXC3 (CE / FPC)' and status <> 'achieved';

-- ------------------------------------------------------------ D. AS 9100D and its clauses

insert into ims_standard (code, name, sys, sort_order) values ('AS9100D', 'AS 9100D (Rev D, 2016) - Aerospace quality management systems', 'QMS', 15) on conflict (code) do update set name = excluded.name, sys = excluded.sys;

insert into ims_standard_clause (standard_id, clause_no, title, parent_clause, sort_order)
select s.id, c.clause_no, c.title, c.parent_clause, c.sort_order
from ims_standard s, (values
  ('4', 'Context of the organization', null, 10),
  ('4.1', 'Understanding the organization and its context', '4', 20),
  ('4.2', 'Understanding the needs and expectations of interested parties', '4', 30),
  ('4.3', 'Determining the scope of the quality management system', '4', 40),
  ('4.4', 'Quality management system and its processes', '4', 50),
  ('4.4.1', 'QMS processes - established, implemented, maintained', '4.4', 60),
  ('4.4.2', 'Documented information for the QMS processes', '4.4', 70),
  ('5', 'Leadership', null, 80),
  ('5.1', 'Leadership and commitment', '5', 90),
  ('5.1.1', 'General', '5.1', 100),
  ('5.1.2', 'Customer focus', '5.1', 110),
  ('5.2', 'Policy', '5', 120),
  ('5.2.1', 'Establishing the quality policy', '5.2', 130),
  ('5.2.2', 'Communicating the quality policy', '5.2', 140),
  ('5.3', 'Organizational roles, responsibilities and authorities', '5', 150),
  ('6', 'Planning', null, 160),
  ('6.1', 'Actions to address risks and opportunities', '6', 170),
  ('6.2', 'Quality objectives and planning to achieve them', '6', 180),
  ('6.3', 'Planning of changes', '6', 190),
  ('7', 'Support', null, 200),
  ('7.1', 'Resources', '7', 210),
  ('7.1.1', 'General', '7.1', 220),
  ('7.1.2', 'People', '7.1', 230),
  ('7.1.3', 'Infrastructure', '7.1', 240),
  ('7.1.4', 'Environment for the operation of processes', '7.1', 250),
  ('7.1.5', 'Monitoring and measuring resources', '7.1', 260),
  ('7.1.5.1', 'General', '7.1', 270),
  ('7.1.5.2', 'Measurement traceability', '7.1', 280),
  ('7.1.6', 'Organizational knowledge', '7.1', 290),
  ('7.2', 'Competence', '7', 300),
  ('7.3', 'Awareness', '7', 310),
  ('7.4', 'Communication', '7', 320),
  ('7.5', 'Documented information', '7', 330),
  ('7.5.1', 'General', '7.5', 340),
  ('7.5.2', 'Creating and updating', '7.5', 350),
  ('7.5.3', 'Control of documented information', '7.5', 360),
  ('8', 'Operation', null, 370),
  ('8.1', 'Operational planning and control', '8', 380),
  ('8.1.1', 'Operational risk management', '8.1', 390),
  ('8.1.2', 'Configuration management', '8.1', 400),
  ('8.1.3', 'Product safety', '8.1', 410),
  ('8.1.4', 'Prevention of counterfeit parts', '8.1', 420),
  ('8.2', 'Requirements for products and services', '8', 430),
  ('8.2.1', 'Customer communication', '8.2', 440),
  ('8.2.2', 'Determining the requirements for products and services', '8.2', 450),
  ('8.2.3', 'Review of the requirements for products and services', '8.2', 460),
  ('8.2.4', 'Changes to requirements for products and services', '8.2', 470),
  ('8.3', 'Design and development of products and services', '8', 480),
  ('8.3.1', 'General', '8.3', 490),
  ('8.3.2', 'Design and development planning', '8.3', 500),
  ('8.3.3', 'Design and development inputs', '8.3', 510),
  ('8.3.4', 'Design and development controls', '8.3', 520),
  ('8.3.4.1', 'Design and development verification and validation testing', '8.3', 530),
  ('8.3.5', 'Design and development outputs', '8.3', 540),
  ('8.3.6', 'Design and development changes', '8.3', 550),
  ('8.4', 'Control of externally provided processes, products and services', '8', 560),
  ('8.4.1', 'General', '8.4', 570),
  ('8.4.2', 'Type and extent of control', '8.4', 580),
  ('8.4.3', 'Information for external providers', '8.4', 590),
  ('8.5', 'Production and service provision', '8', 600),
  ('8.5.1', 'Control of production and service provision', '8.5', 610),
  ('8.5.1.1', 'Control of equipment, tools and software programs', '8.5', 620),
  ('8.5.1.2', 'Validation and control of special processes', '8.5', 630),
  ('8.5.1.3', 'Production process verification', '8.5', 640),
  ('8.5.2', 'Identification and traceability', '8.5', 650),
  ('8.5.3', 'Property belonging to customers or external providers', '8.5', 660),
  ('8.5.4', 'Preservation', '8.5', 670),
  ('8.5.5', 'Post-delivery activities', '8.5', 680),
  ('8.5.6', 'Control of changes', '8.5', 690),
  ('8.6', 'Release of products and services', '8', 700),
  ('8.7', 'Control of nonconforming outputs', '8', 710),
  ('9', 'Performance evaluation', null, 720),
  ('9.1', 'Monitoring, measurement, analysis and evaluation', '9', 730),
  ('9.1.1', 'General', '9.1', 740),
  ('9.1.2', 'Customer satisfaction', '9.1', 750),
  ('9.1.3', 'Analysis and evaluation', '9.1', 760),
  ('9.2', 'Internal audit', '9', 770),
  ('9.3', 'Management review', '9', 780),
  ('9.3.1', 'General', '9.3', 790),
  ('9.3.2', 'Management review inputs', '9.3', 800),
  ('9.3.3', 'Management review outputs', '9.3', 810),
  ('10', 'Improvement', null, 820),
  ('10.1', 'General', '10', 830),
  ('10.2', 'Nonconformity and corrective action', '10', 840),
  ('10.3', 'Continual improvement', '10', 850)
) as c(clause_no, title, parent_clause, sort_order)
where s.code = 'AS9100D'
on conflict (standard_id, clause_no) do update set title = excluded.title, parent_clause = excluded.parent_clause, sort_order = excluded.sort_order;

-- ------------------------------------------------------------ E. AS 9100D clause evidence

insert into ims_clause_evidence_note (clause_id, requirement, evidence, compliance, links, updated_by)
select c.id, 'The organization''s quality management system shall also address customer and applicable statutory and regulatory quality management system requirements.', 'Nandan GSE QMS - Context  of the Organisation', 'WIP', $j$[{"title": "Nandan GSE QMS - Context of the Organisation", "url": "https://docs.google.com/spreadsheets/d/1BVDI_ls_NJ10K0geFSix7PiLxSnEnd0CZifBSR10S0A/edit#gid=579413736"}]$j$::jsonb, 'import:ims-sheet'
from ims_standard_clause c join ims_standard s on s.id = c.standard_id
where s.code = 'AS9100D' and c.clause_no = '4.4.1'
on conflict (clause_id) do nothing;

insert into ims_clause_evidence_note (clause_id, requirement, evidence, compliance, links, updated_by)
select c.id, 'The organization shall establish and maintain documented information that includes: 
- a general description of relevant interested parties (see 4.2 a);
- the scope of the quality management system, including boundaries and applicability (see 4.3);
- a description of the processes needed for the quality management system and their application throughout the
organization;
- the sequence and interaction of these processes;
- assignment of the responsibilities and authorities for these processes.', 'Nandan GSE IMS MANUAL

Interested Parties - List & Requirements

Needs and Expectation of Interested Parties', 'WIP', $j$[{"title": "Nandan GSE IMS MANUAL Interested Parties - List & Requirements Needs and Expecta", "url": "https://docs.google.com/document/d/1Uphyu7rGJXf-f0_X0tb12GByGFlzlcQFTA4RJNcDBJQ/edit?usp=sharing"}]$j$::jsonb, 'import:ims-sheet'
from ims_standard_clause c join ims_standard s on s.id = c.standard_id
where s.code = 'AS9100D' and c.clause_no = '4.4.2'
on conflict (clause_id) do nothing;

insert into ims_clause_evidence_note (clause_id, requirement, evidence, compliance, links, updated_by)
select c.id, 'product and service conformity and on-time delivery performance are measured and appropriate action is taken
if planned results are not, or will not be, achieved.', 'PPC Project Tracker sheet', 'WIP', $j$[{"title": "PPC Project Tracker sheet", "url": "https://docs.google.com/spreadsheets/d/1NM5IoNB3k4R4HeLthWp29zJAJu5qCH6rfqSgjoWYOXI/edit#gid=820891500"}]$j$::jsonb, 'import:ims-sheet'
from ims_standard_clause c join ims_standard s on s.id = c.standard_id
where s.code = 'AS9100D' and c.clause_no = '5.1.2'
on conflict (clause_id) do nothing;

insert into ims_clause_evidence_note (clause_id, requirement, evidence, compliance, links, updated_by)
select c.id, 'The organization shall establish, implement, and maintain a process for the recall of monitoring and measuring
equipment requiring calibration or verification.

The organization shall maintain a register of the monitoring and measuring equipment. The register shall include
the equipment type, unique identification, location, and the calibration or verification method, frequency, and
acceptance criteria.', 'Calibration status of all the measuring instruments', 'WIP', $j$[{"title": "Calibration status of all the measuring instruments", "url": "https://nandanerp.in/app/imtes-report"}]$j$::jsonb, 'import:ims-sheet'
from ims_standard_clause c join ims_standard s on s.id = c.standard_id
where s.code = 'AS9100D' and c.clause_no = '7.1.5.2'
on conflict (clause_id) do nothing;

insert into ims_clause_evidence_note (clause_id, requirement, evidence, compliance, links, updated_by)
select c.id, 'Consideration should be given for the periodic review of the necessary competence.', 'Employees Competancy Matrix', 'WIP', $j$[{"title": "Employees Competancy Matrix", "url": "https://docs.google.com/spreadsheets/d/1ROC79ABMdKe8y1BvBa9vAY7T1UiS0nQmF24WYXUo3CM/edit?usp=sharing"}]$j$::jsonb, 'import:ims-sheet'
from ims_standard_clause c join ims_standard s on s.id = c.standard_id
where s.code = 'AS9100D' and c.clause_no = '7.2'
on conflict (clause_id) do nothing;

insert into ims_clause_evidence_note (clause_id, requirement, evidence, compliance, links, updated_by)
select c.id, 'e. relevant quality management system documented information and changes thereto;
f. their contribution to product or service conformity;
g. their contribution to product safety;
h. the importance of ethical behavior.', '', 'Pending', $j$[]$j$::jsonb, 'import:ims-sheet'
from ims_standard_clause c join ims_standard s on s.id = c.standard_id
where s.code = 'AS9100D' and c.clause_no = '7.3'
on conflict (clause_id) do nothing;

insert into ims_clause_evidence_note (clause_id, requirement, evidence, compliance, links, updated_by)
select c.id, 'Communication should include internal and external feedback relevant to the quality management system.', 'Mail', 'WIP', $j$[]$j$::jsonb, 'import:ims-sheet'
from ims_standard_clause c join ims_standard s on s.id = c.standard_id
where s.code = 'AS9100D' and c.clause_no = '7.4'
on conflict (clause_id) do nothing;

insert into ims_clause_evidence_note (clause_id, requirement, evidence, compliance, links, updated_by)
select c.id, 'NOTE: Approval implies authorized persons and approval methods are identified for the relevant types of
documented information, as determined by the organization.', 'IMS Register', 'WIP', $j$[{"title": "IMS Register", "url": "https://docs.google.com/spreadsheets/d/1BVDI_ls_NJ10K0geFSix7PiLxSnEnd0CZifBSR10S0A/edit"}]$j$::jsonb, 'import:ims-sheet'
from ims_standard_clause c join ims_standard s on s.id = c.standard_id
where s.code = 'AS9100D' and c.clause_no = '7.5.2'
on conflict (clause_id) do nothing;

insert into ims_clause_evidence_note (clause_id, requirement, evidence, compliance, links, updated_by)
select c.id, 'e. prevention of the unintended use of obsolete documented information by removal or by application of suitable
identification or controls if kept for any purpose.
When documented information is managed electronically, data protection processes shall be defined (e.g.,
protection from loss, unauthorized changes, unintended alteration, corruption, physical damage).', '', 'Pending', $j$[]$j$::jsonb, 'import:ims-sheet'
from ims_standard_clause c join ims_standard s on s.id = c.standard_id
where s.code = 'AS9100D' and c.clause_no = '7.5.3.2'
on conflict (clause_id) do nothing;

insert into ims_clause_evidence_note (clause_id, requirement, evidence, compliance, links, updated_by)
select c.id, ': Determination of requirements for the products and services should include consideration of:
- personal and product safety;
- producibility and inspectability;
- reliability, availability, and maintainability;
- suitability of parts and materials used in the product;
- selection and development of embedded software;
- product obsolescence;
- prevention, detection, and removal of foreign objects;
- handling, packaging, and preservation;
- recycling or final disposal of the product at the end of its life.
NOTE: According to the nature of the product and depending on the specified requirements, statistical
techniques can be used to support:
 - design verification (e.g., reliability, maintainability, product safety);
- process control;
 selection and verification of key characteristics;
 process capability measurements;
 statistical process control;
 design of experiments;
- verification;
- failure mode, effects, and criticality analysis.
NOTE: As an output of this planning, documented information specifying the processes of the quality management
system and the resources to be applied to a specific product, service, project, or contract can be referred
to as a quality plan.
The organization shall establish, implement, and maintain a process to plan and control the temporary or
permanent transfer of work, to ensure the continuing conformity of the work to requirements. The process shall
ensure that work transfer impacts and risks are managed.
NOTE: For the control of work transfer from the organization to an external provider, or from an external provider
to another external provider, see 8.4. For the control of work transfer from one organization facility to
another, or from an external provider to the organization, see 8.5.', 'Project section ERP

Process Capability
Product QAP', 'WIP', $j$[{"title": "Project section ERP Process Capability", "url": "https://docs.google.com/spreadsheets/d/1rm62JTR0Kz3Pe-_4uXIDEVzH2Qe0-BxxIiAZsSYwhTQ/edit?usp=sharing"}, {"title": "Product QAP", "url": "https://docs.google.com/spreadsheets/d/1bznzRR2VttQ0NddPuBxerTXR6McjavAJUgyHGzy-_B4/edit?usp=sharing"}]$j$::jsonb, 'import:ims-sheet'
from ims_standard_clause c join ims_standard s on s.id = c.standard_id
where s.code = 'AS9100D' and c.clause_no = '8.1'
on conflict (clause_id) do nothing;

insert into ims_clause_evidence_note (clause_id, requirement, evidence, compliance, links, updated_by)
select c.id, 'The organization shall plan, implement, and control a process for managing operational risks to the achievement
of applicable requirements, which includes as appropriate to the organization and the products and services:
a. assignment of responsibilities for operational risk management;
b. definition of risk assessment criteria (e.g., likelihood, consequences, risk acceptance);
c. identification, assessment, and communication of risks throughout operations;
d. identification, implementation, and management of actions to mitigate risks that exceed the defined risk
acceptance criteria;
e. acceptance of risks remaining after implementation of mitigating actions.', 'SNOP MoM sheet', 'WIP', $j$[{"title": "SNOP MoM sheet", "url": "https://docs.google.com/spreadsheets/d/1NM5IoNB3k4R4HeLthWp29zJAJu5qCH6rfqSgjoWYOXI/edit#gid=2038915225"}]$j$::jsonb, 'import:ims-sheet'
from ims_standard_clause c join ims_standard s on s.id = c.standard_id
where s.code = 'AS9100D' and c.clause_no = '8.1.1'
on conflict (clause_id) do nothing;

insert into ims_clause_evidence_note (clause_id, requirement, evidence, compliance, links, updated_by)
select c.id, 'The organization shall plan, implement, and control a process for configuration management as appropriate to the
organization and its products and services in order to ensure the identification and control of physical and
functional attributes throughout the product lifecycle. This process shall:
a. control product identity and traceability to requirements, including the implementation of identified changes;
b. ensure that the documented information (e.g., requirements, design, verification, validation and acceptance
documentation) is consistent with the actual attributes of the products and services.', 'BoM', 'WIP', $j$[]$j$::jsonb, 'import:ims-sheet'
from ims_standard_clause c join ims_standard s on s.id = c.standard_id
where s.code = 'AS9100D' and c.clause_no = '8.1.2'
on conflict (clause_id) do nothing;

insert into ims_clause_evidence_note (clause_id, requirement, evidence, compliance, links, updated_by)
select c.id, 'The organization shall plan, implement, and control the processes needed to assure product safety during the
entire product life cycle, as appropriate to the organization and the product.
Examples of these processes include:
- assessment of hazards and management of associated risks (see 8.1.1);
- management of safety critical items;
- analysis and reporting of occurred events affecting safety;
- communication of these events and training of persons.', 'Pending', 'Pending', $j$[]$j$::jsonb, 'import:ims-sheet'
from ims_standard_clause c join ims_standard s on s.id = c.standard_id
where s.code = 'AS9100D' and c.clause_no = '8.1.3'
on conflict (clause_id) do nothing;

insert into ims_clause_evidence_note (clause_id, requirement, evidence, compliance, links, updated_by)
select c.id, 'Counterfeit part prevention processes should consider:
- training of appropriate persons in the awareness and prevention of counterfeit parts;
- application of a parts obsolescence monitoring program;
- controls for acquiring externally provided product from original or authorized manufacturers,
authorized distributors, or other approved sources;
- requirements for assuring traceability of parts and components to their original or authorized
manufacturers;
- verification and test methodologies to detect counterfeit parts;
- monitoring of counterfeit parts reporting from external sources;
- quarantine and reporting of suspect or detected counterfeit parts', 'Prevention of Counterfeit parts', 'WIP', $j$[{"title": "Prevention of Counterfeit parts", "url": "https://docs.google.com/spreadsheets/d/1y4XfPMMztCgWrMUyLojKm0LoyTShKydIayqfuKZDbhM/edit?usp=sharing"}]$j$::jsonb, 'import:ims-sheet'
from ims_standard_clause c join ims_standard s on s.id = c.standard_id
where s.code = 'AS9100D' and c.clause_no = '8.1.4'
on conflict (clause_id) do nothing;

insert into ims_clause_evidence_note (clause_id, requirement, evidence, compliance, links, updated_by)
select c.id, 'If upon review the organization determines that some customer requirements cannot be met or can only partially
be met, the organization shall negotiate a mutually acceptable requirement with the customer.', 'Mail', 'WIP', $j$[]$j$::jsonb, 'import:ims-sheet'
from ims_standard_clause c join ims_standard s on s.id = c.standard_id
where s.code = 'AS9100D' and c.clause_no = '8.2.3'
on conflict (clause_id) do nothing;

insert into ims_clause_evidence_note (clause_id, requirement, evidence, compliance, links, updated_by)
select c.id, 'When appropriate, the organization shall divide the design and development effort into distinct activities and, for
each activity, define the tasks, necessary resources, responsibilities, design content, and inputs and outputs.
Design and development planning shall consider the ability to provide, verify, test and maintain products and
services (reference output of 8.1 a).', 'Project card', 'WIP', $j$[]$j$::jsonb, 'import:ims-sheet'
from ims_standard_clause c join ims_standard s on s.id = c.standard_id
where s.code = 'AS9100D' and c.clause_no = '8.3.2'
on conflict (clause_id) do nothing;

insert into ims_clause_evidence_note (clause_id, requirement, evidence, compliance, links, updated_by)
select c.id, 'NOTE: The organization can also consider as design and development inputs other information such as
benchmarking, external provider feedback, internally generated data, and in-service data.', 'AAR Report', 'WIP', $j$[]$j$::jsonb, 'import:ims-sheet'
from ims_standard_clause c join ims_standard s on s.id = c.standard_id
where s.code = 'AS9100D' and c.clause_no = '8.3.3'
on conflict (clause_id) do nothing;

insert into ims_clause_evidence_note (clause_id, requirement, evidence, compliance, links, updated_by)
select c.id, 'Participants in design and development reviews shall include representatives of functions concerned with the
design and development stage(s) being reviewed.', 'DEsign review ERP', 'WIP', $j$[]$j$::jsonb, 'import:ims-sheet'
from ims_standard_clause c join ims_standard s on s.id = c.standard_id
where s.code = 'AS9100D' and c.clause_no = '8.3.4'
on conflict (clause_id) do nothing;

insert into ims_clause_evidence_note (clause_id, requirement, evidence, compliance, links, updated_by)
select c.id, 'When tests are necessary for verification and validation, these tests shall be planned, controlled,
reviewed, and documented to ensure and prove the following:
a. test plans or specifications identify the test item being tested and the resources being used, define test
objectives and conditions, parameters to be recorded and relevant acceptance criteria;
b. test procedures describe the test methods to be used, how to perform the test, and how to record the results;
c. the correct configuration of the test item is submitted for the test;
d. the requirements of the test plan and the test procedures are observed;
e. the acceptance criteria are met.', 'QC checklist', 'WIP', $j$[]$j$::jsonb, 'import:ims-sheet'
from ims_standard_clause c join ims_standard s on s.id = c.standard_id
where s.code = 'AS9100D' and c.clause_no = '8.3.4.1'
on conflict (clause_id) do nothing;

insert into ims_clause_evidence_note (clause_id, requirement, evidence, compliance, links, updated_by)
select c.id, 'e. specify, as applicable, any critical items, including any key characteristics, and specific actions to be taken for
these items;
f. are approved by authorized person(s) prior to release.
The organization shall define the data required to allow the product to be identified, manufactured, verified, used,
and maintained.
f. determining the processes and controls needed to manage critical items, including production process
controls when key characteristics have been identified;
g. engaging representatives of affected organization functions for operational planning and control;
h. determining the process and resources to support the use and maintenance of the products and services;
i. determining the products and services to be obtained from external providers;
j. establishing the controls needed to prevent the delivery of nonconforming products and services to the
customer.
NOTE: One method to achieve operational planning and control can be through using integrated phased
processes.', 'Part List
QC Checklist
Project Card', 'WIP', $j$[]$j$::jsonb, 'import:ims-sheet'
from ims_standard_clause c join ims_standard s on s.id = c.standard_id
where s.code = 'AS9100D' and c.clause_no = '8.3.5'
on conflict (clause_id) do nothing;

-- ------------------------------------------------------------ F. two registers from the sheet

insert into ims_register_definition (slug, name, sys, description, columns, is_system, sort_order) values ('ims-mom', 'IMS Minutes of Meeting', 'IMS', 'Every ISO / IMS meeting minuted - awareness, audit preparation, clause implementation - with the link to the minutes in the ERP or on Drive.', $j$[{"key": "date", "label": "Date", "type": "date", "required": true}, {"key": "subject", "label": "Subject", "type": "short", "required": true}, {"key": "drafted_by", "label": "Drafted by", "type": "short"}, {"key": "link", "label": "Minutes", "type": "link"}, {"key": "attendees", "label": "Attendees", "type": "short"}, {"key": "decisions", "label": "Decisions / actions", "type": "text"}]$j$::jsonb, false, 60) on conflict (slug) do update set columns = excluded.columns, description = excluded.description;

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date": "2023-01-14", "subject": "Regarding implementation of ISO.", "drafted_by": "Pankaj Sutar", "link": "https://nandanerp.in/app/minutes-of-meetings/MOM-2023-01-14-Regarding%20implementation%20of%20ISO.", "import_key": "sheet:mom:2"}$j$::jsonb, 'closed', 'import:ims-sheet' from ims_register_definition d where d.slug = 'ims-mom' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:mom:2');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date": "2023-04-14", "subject": "ISO Awareness training", "drafted_by": "Pankaj Sutar", "link": "https://drive.google.com/file/d/1UBUqhv_VCE6lNzmJ054MDL10GqTZWKwg/view?usp=drive_link", "import_key": "sheet:mom:3"}$j$::jsonb, 'closed', 'import:ims-sheet' from ims_register_definition d where d.slug = 'ims-mom' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:mom:3');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date": "2023-05-06", "subject": "ISO audit findings and Departmental training (Quality)", "drafted_by": "Pankaj Sutar", "link": "https://nandanerp.in/app/minutes-of-meetings/MOM-2023-05-06-ISO%20Audit%20preparation%20for%20planning!", "import_key": "sheet:mom:4"}$j$::jsonb, 'closed', 'import:ims-sheet' from ims_register_definition d where d.slug = 'ims-mom' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:mom:4');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date": "2023-05-06", "subject": "ISO audit findings and Departmental training (Service)", "drafted_by": "Prashant Patil", "link": "https://nandanerp.in/app/minutes-of-meetings/MOM-2023-05-06-ISO%20Audit%20findings%20!", "import_key": "sheet:mom:5"}$j$::jsonb, 'closed', 'import:ims-sheet' from ims_register_definition d where d.slug = 'ims-mom' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:mom:5');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date": "2023-05-06", "subject": "ISO Audit preparation for sales & R&D", "drafted_by": "Prashant Patil", "link": "https://nandanerp.in/app/minutes-of-meetings/MOM-2023-05-06-ISO%20Audit", "import_key": "sheet:mom:6"}$j$::jsonb, 'closed', 'import:ims-sheet' from ims_register_definition d where d.slug = 'ims-mom' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:mom:6');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date": "2023-05-06", "subject": "ISO Audit preparation for planning", "drafted_by": "Prashant Patil", "link": "https://nandanerp.in/app/minutes-of-meetings/MOM-2023-05-06-ISO%20Audit%20preparation%20for%20planning", "import_key": "sheet:mom:7"}$j$::jsonb, 'closed', 'import:ims-sheet' from ims_register_definition d where d.slug = 'ims-mom' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:mom:7');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date": "2023-05-06", "subject": "ISO Audit preparation for stores", "drafted_by": "Prashant Patil", "link": "https://nandanerp.in/app/minutes-of-meetings/MOM-2023-05-06-ISO%20Audit%20preparation%20for%20stores", "import_key": "sheet:mom:8"}$j$::jsonb, 'closed', 'import:ims-sheet' from ims_register_definition d where d.slug = 'ims-mom' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:mom:8');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date": "2023-05-06", "subject": "ISO audit findings and Departmental training (Purchase)", "drafted_by": "Pankaj Sutar", "link": "https://nandanerp.in/app/minutes-of-meetings/MOM-2023-05-06-ISO%20audit%20findings%20meeting", "import_key": "sheet:mom:9"}$j$::jsonb, 'closed', 'import:ims-sheet' from ims_register_definition d where d.slug = 'ims-mom' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:mom:9');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date": "2023-05-06", "subject": "ISO audit findings and Departmental training (Production & service)", "drafted_by": "Pankaj Sutar", "link": "https://nandanerp.in/app/minutes-of-meetings/MOM-2023-05-06-ISO%20Audit%20preparation", "import_key": "sheet:mom:10"}$j$::jsonb, 'closed', 'import:ims-sheet' from ims_register_definition d where d.slug = 'ims-mom' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:mom:10');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date": "2023-05-06", "subject": "ISO audit findings and Departmental training (Design)", "drafted_by": "Prashant Patil", "link": "https://nandanerp.in/app/minutes-of-meetings/MOM-2023-05-06-ISO%20audit%20findings", "import_key": "sheet:mom:11"}$j$::jsonb, 'closed', 'import:ims-sheet' from ims_register_definition d where d.slug = 'ims-mom' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:mom:11');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date": "2023-06-10", "subject": "IMS Surveillance Audit_June 23", "drafted_by": "Pankaj Sutar", "link": "https://nandanerp.in/app/minutes-of-meetings/MOM-2023-06-10-IMS%20Surveillance%20Audit_June%2023", "import_key": "sheet:mom:12"}$j$::jsonb, 'closed', 'import:ims-sheet' from ims_register_definition d where d.slug = 'ims-mom' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:mom:12');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date": "2023-07-03", "subject": "IMS awareness on Mygyaan", "drafted_by": "Pankaj Sutar", "link": "https://nandanerp.in/app/minutes-of-meetings/MOM-2023-07-03-IMS%20implimentation", "import_key": "sheet:mom:13"}$j$::jsonb, 'closed', 'import:ims-sheet' from ims_register_definition d where d.slug = 'ims-mom' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:mom:13');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date": "2023-07-08", "subject": "ISO 27001 & AS 9100D Awareness Training", "drafted_by": "Pankaj Sutar", "link": "https://nandanerp.in/app/minutes-of-meetings/MOM-2023-07-07-ISO%2027001%20%26%20AS%209100D%20Awareness%20Training", "import_key": "sheet:mom:14"}$j$::jsonb, 'closed', 'import:ims-sheet' from ims_register_definition d where d.slug = 'ims-mom' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:mom:14');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date": "2023-07-15", "subject": "IMS documentation", "drafted_by": "Pankaj Sutar", "link": "https://nandanerp.in/app/minutes-of-meetings/MOM-2023-07-15-ISO%20Documentation", "import_key": "sheet:mom:15"}$j$::jsonb, 'closed', 'import:ims-sheet' from ims_register_definition d where d.slug = 'ims-mom' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:mom:15');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date": "2023-07-18", "subject": "Compliance of clause on-time delivery performance (AS 9100D)", "drafted_by": "Pankaj Sutar", "link": "https://nandanerp.in/app/minutes-of-meetings/MOM-2023-07-18-Compliance%20of%20clause%20on-time%20delivery%20performance%20(AS%209100D)", "import_key": "sheet:mom:16"}$j$::jsonb, 'closed', 'import:ims-sheet' from ims_register_definition d where d.slug = 'ims-mom' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:mom:16');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date": "2023-07-29", "subject": "Preparation of IMS documentation", "drafted_by": "Pankaj Sutar", "link": "https://nandanerp.in/app/minutes-of-meetings/MOM-2023-07-29-Preparation%20of%20IMS%20documentation", "import_key": "sheet:mom:17"}$j$::jsonb, 'closed', 'import:ims-sheet' from ims_register_definition d where d.slug = 'ims-mom' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:mom:17');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date": "2023-08-05", "subject": "Understanding of RARTP for ISMS", "drafted_by": "Pankaj Sutar", "link": "https://nandanerp.in/app/minutes-of-meetings/MOM-2023-08-05-ISO%20%26%20ISMS%20implementation", "import_key": "sheet:mom:18"}$j$::jsonb, 'closed', 'import:ims-sheet' from ims_register_definition d where d.slug = 'ims-mom' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:mom:18');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date": "2023-08-12", "subject": "Implimentation of AS 9100D & ISO 27001", "drafted_by": "Pankaj Sutar", "link": "https://nandanerp.in/app/minutes-of-meetings/MOM-2023-08-12-subject", "import_key": "sheet:mom:19"}$j$::jsonb, 'closed', 'import:ims-sheet' from ims_register_definition d where d.slug = 'ims-mom' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:mom:19');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date": "2023-09-25", "subject": "8.3.2 Design and Development Planning", "drafted_by": "Pankaj Sutar", "link": "https://nandanerp.in/app/minutes-of-meetings/MOM-2023-09-25-AS%209100%20D%20-%208.3.2%20Design%20and%20Development%20Planning", "import_key": "sheet:mom:20"}$j$::jsonb, 'closed', 'import:ims-sheet' from ims_register_definition d where d.slug = 'ims-mom' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:mom:20');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date": "2023-09-26", "subject": "CLAUSE 8.1.4 PREVENTION OF COUNTERFEIT PARTSS", "drafted_by": "Pankaj Sutar", "link": "https://nandanerp.in/app/print/Minutes%20of%20Meetings/MOM-2023-09-26-Clause%208.1.4%20Prevention%20of%20Counterfeit%20Parts", "import_key": "sheet:mom:21"}$j$::jsonb, 'closed', 'import:ims-sheet' from ims_register_definition d where d.slug = 'ims-mom' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:mom:21');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date": "2023-10-27", "subject": "Clause 8 Operation AS 9100 D", "drafted_by": "Pankaj Sutar", "link": "https://nandanerp.in/app/minutes-of-meetings/MOM-2023-10-27-AS%209100%20D%20clause%20requirement%20%26%20action", "import_key": "sheet:mom:22"}$j$::jsonb, 'closed', 'import:ims-sheet' from ims_register_definition d where d.slug = 'ims-mom' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:mom:22');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date": "2023-10-02", "subject": "AS 9100 D Clause implementation - Preparation of product safety register", "drafted_by": "Pankaj Sutar", "link": "https://nandanerp.in/app/minutes-of-meetings/MOM-2023-10-03-AS%209100%20D%20Clause%20implementation", "import_key": "sheet:mom:23"}$j$::jsonb, 'closed', 'import:ims-sheet' from ims_register_definition d where d.slug = 'ims-mom' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:mom:23');

insert into ims_register_definition (slug, name, sys, description, columns, is_system, sort_order) values ('as9100-plan-2022', 'AS 9100D Implementation Plan (2022)', 'QMS', 'The 2022 implementation plan for AS 9100D as it stood on the IMS Master Register - context, policy, manual, procedures, training, internal audits, management review, certification audit.', $j$[{"key": "date_start", "label": "Date start", "type": "date"}, {"key": "responsible", "label": "Responsible", "type": "short"}, {"key": "task", "label": "Task", "type": "text", "required": true}, {"key": "related_to", "label": "Related to", "type": "short"}, {"key": "target", "label": "Target date complete", "type": "short"}, {"key": "status", "label": "Status", "type": "select", "options": ["Completed", "In progress", "Pending"]}, {"key": "remarks", "label": "Remarks", "type": "text"}, {"key": "link", "label": "Link", "type": "link"}]$j$::jsonb, false, 65) on conflict (slug) do update set columns = excluded.columns, description = excluded.description;

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-06-15", "responsible": "MT", "task": "Define context of the organization and interested parties", "target": "2022-06-24", "status": "Completed", "link": "https://docs.google.com/document/d/1X12MYwB-UTPU9KSS8TNC5ZlyyjkOREwB5vFliujxPYc/edit", "import_key": "sheet:plan:2"}$j$::jsonb, 'closed', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:2');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-06-15", "responsible": "MT", "task": "Define Scope, Management Commitment and Responsibilities", "target": "2022-06-24", "link": "https://docs.google.com/document/d/1X12MYwB-UTPU9KSS8TNC5ZlyyjkOREwB5vFliujxPYc/edit#bookmark=id.lco25ic0z41o", "import_key": "sheet:plan:3"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:3');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"task": "NANDAN WCM INITIATIVES", "link": "https://docs.google.com/spreadsheets/d/1xFz77aBTaJlcnEc_m6lXKG2i3C1Ha6HjIA-kAY206nY/edit#gid=2034890946", "import_key": "sheet:plan:4"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:4');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-06-15", "responsible": "MT", "task": "Quality, Environment & Health Policy", "target": "2022-06-24", "link": "https://docs.google.com/document/d/1X12MYwB-UTPU9KSS8TNC5ZlyyjkOREwB5vFliujxPYc/edit#bookmark=id.lco25ic0z41o", "import_key": "sheet:plan:5"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:5');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-06-15", "responsible": "MT", "task": "Quality, Environment & Health Objectives", "target": "2022-06-24", "import_key": "sheet:plan:6"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:6');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-06-15", "responsible": "MT", "task": "Define Processes and Procedures - Procedure Manual for AS 9100 D", "target": "2022-06-26", "import_key": "sheet:plan:7"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:7');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-06-15", "responsible": "MT", "task": "Mandatory & Additionally Identified Procedures", "target": "2022-06-26", "import_key": "sheet:plan:8"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:8');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-06-15", "responsible": "MT", "task": "Procedure Manual for EMS and Health & Safety integration", "target": "2022-06-26", "import_key": "sheet:plan:9"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:9');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-06-15", "responsible": "MT", "task": "QHE IMS Handbook Completion - Manual", "target": "2022-06-30", "import_key": "sheet:plan:10"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:10');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-07-01", "responsible": "MT", "task": "Work instructions for identified processes", "target": "2022-07-16", "import_key": "sheet:plan:11"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:11');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-07-01", "responsible": "RG", "task": "Review of Procedures & Manual", "target": "2022-07-05", "import_key": "sheet:plan:12"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:12');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-07-01", "responsible": "RG", "task": "Finalization of Procedures & Manual", "target": "2022-07-13", "import_key": "sheet:plan:13"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:13');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-07-13", "responsible": "Nandan Team", "task": "Discussion with Nandan Team", "target": "2022-07-16", "import_key": "sheet:plan:14"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:14');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-07-13", "responsible": "MT", "task": "Update Manual & procedures if any changes from discussions", "target": "2022-07-23", "import_key": "sheet:plan:15"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:15');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-07-02", "responsible": "MT", "task": "Perform Training and Awareness Programs", "target": "2022-07-02", "import_key": "sheet:plan:16"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:16');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-07-02", "responsible": "MT", "task": "Training Records", "target": "2022-07-09", "import_key": "sheet:plan:17"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:17');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-07-01", "responsible": "MT & Nandan Team", "task": "Implement Processes, Procedures and Controls", "target": "2022-07-30", "import_key": "sheet:plan:18"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:18');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-07-01", "responsible": "Nandan Team", "task": "Records of implementation", "target": "2022-07-30", "import_key": "sheet:plan:19"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:19');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-08-01", "responsible": "MT", "task": "Internal Audit - I", "target": "2022-08-05", "import_key": "sheet:plan:20"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:20');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-08-01", "responsible": "MT", "task": "Internal Audit Report(s)", "target": "2022-08-07", "import_key": "sheet:plan:21"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:21');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-08-01", "responsible": "MT", "task": "Corrective Actions", "target": "2022-08-07", "import_key": "sheet:plan:22"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:22');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-09-02", "responsible": "MT", "task": "Internal Audit - II", "target": "2022-09-02", "import_key": "sheet:plan:23"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:23');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-09-02", "responsible": "MT", "task": "Internal Audit Report(s)", "target": "2022-09-04", "import_key": "sheet:plan:24"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:24');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-09-02", "responsible": "MT", "task": "Corrective Actions", "target": "2022-09-04", "import_key": "sheet:plan:25"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:25');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-08-01", "responsible": "MT", "task": "Choose a Certification Body", "target": "2022-08-07", "import_key": "sheet:plan:26"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:26');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-08-01", "responsible": "Nandan Team", "task": "Management Review meeting", "target": "2022-08-13", "import_key": "sheet:plan:27"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:27');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"date_start": "2022-08-01", "responsible": "Nandan Team", "task": "Management Review meeting - MOM", "target": "2022-08-13", "import_key": "sheet:plan:28"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:28');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"responsible": "Nandan Team", "task": "Certification Audit (Stage 1 Audit)", "target": "2nd week of Sep'22", "import_key": "sheet:plan:29"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:29');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"responsible": "MT", "task": "Certification Audit (Main Audit)", "target": "4th week of Sep'22", "import_key": "sheet:plan:30"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:30');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"responsible": "MT", "task": "Audit Report (from Registrar)", "target": "As per certification agency dates", "import_key": "sheet:plan:31"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:31');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"responsible": "MT", "task": "Corrective Actions", "target": "In one week from the date of Audit report", "import_key": "sheet:plan:32"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:32');

insert into ims_register_entry (register_id, data, status, created_by) select d.id, $j${"responsible": "Nandan Team", "task": "AS9100D - Certification Completion", "target": "Sep'22", "import_key": "sheet:plan:33"}$j$::jsonb, 'open', 'import:ims-sheet' from ims_register_definition d where d.slug = 'as9100-plan-2022' and not exists (select 1 from ims_register_entry e where e.register_id = d.id and e.data->>'import_key' = 'sheet:plan:33');

-- ------------------------------------------------------------ G. the clauses still to implement, as tasks

insert into core_task (module, title, description, source_type, source_key, priority, status, import_key, created_by) values ('IMS', 'ISMS: Clause 8.1.3', 'From the IMS Master Register, List of Clause to implement (ISMS). Product Safety', 'manual', 'sheet:todo:3', 'normal', 'open', 'sheet:todo:3', 'import:ims-sheet') on conflict (import_key) do nothing;

insert into core_task (module, title, description, source_type, source_key, priority, status, import_key, created_by) values ('IMS', 'ISMS: Clause 8.5.2', 'From the IMS Master Register, List of Clause to implement (ISMS). Identification and Traceability', 'manual', 'sheet:todo:4', 'normal', 'open', 'sheet:todo:4', 'import:ims-sheet') on conflict (import_key) do nothing;

insert into core_task (module, title, description, source_type, source_key, priority, status, import_key, created_by) values ('IMS', 'ISMS: Clause 8.1.4', 'From the IMS Master Register, List of Clause to implement (ISMS). Prevention of Counterfeit Parts', 'manual', 'sheet:todo:5', 'normal', 'open', 'sheet:todo:5', 'import:ims-sheet') on conflict (import_key) do nothing;

insert into core_task (module, title, description, source_type, source_key, priority, status, import_key, created_by) values ('IMS', 'ISMS: Clause 8.3.2', 'From the IMS Master Register, List of Clause to implement (ISMS). Design and Development Planning', 'manual', 'sheet:todo:6', 'normal', 'open', 'sheet:todo:6', 'import:ims-sheet') on conflict (import_key) do nothing;

insert into core_task (module, title, description, source_type, source_key, priority, status, import_key, created_by) values ('IMS', 'ISMS: Clause 8.3.3', 'From the IMS Master Register, List of Clause to implement (ISMS). Design and Development Inputs', 'manual', 'sheet:todo:7', 'normal', 'open', 'sheet:todo:7', 'import:ims-sheet') on conflict (import_key) do nothing;

insert into core_task (module, title, description, source_type, source_key, priority, status, import_key, created_by) values ('IMS', 'ISMS: Clause 8.3.4', 'From the IMS Master Register, List of Clause to implement (ISMS). Design and Development Controls', 'manual', 'sheet:todo:8', 'normal', 'open', 'sheet:todo:8', 'import:ims-sheet') on conflict (import_key) do nothing;

insert into core_task (module, title, description, source_type, source_key, priority, status, import_key, created_by) values ('IMS', 'ISMS: Clause 8.3.5', 'From the IMS Master Register, List of Clause to implement (ISMS). Design and Development Outputs abc', 'manual', 'sheet:todo:9', 'normal', 'open', 'sheet:todo:9', 'import:ims-sheet') on conflict (import_key) do nothing;

insert into core_task (module, title, description, source_type, source_key, priority, status, import_key, created_by) values ('IMS', 'ISMS: Clause 8.4', 'From the IMS Master Register, List of Clause to implement (ISMS). Control of Externally Provided Processes, Products, and Services', 'manual', 'sheet:todo:10', 'normal', 'open', 'sheet:todo:10', 'import:ims-sheet') on conflict (import_key) do nothing;

insert into core_task (module, title, description, source_type, source_key, priority, status, import_key, created_by) values ('IMS', 'ISMS: Clause 8.5.1.2', 'From the IMS Master Register, List of Clause to implement (ISMS). Validation and Control of Special Processes', 'manual', 'sheet:todo:11', 'normal', 'open', 'sheet:todo:11', 'import:ims-sheet') on conflict (import_key) do nothing;

insert into core_task (module, title, description, source_type, source_key, priority, status, import_key, created_by) values ('IMS', 'ISMS: Clause 8.7', 'From the IMS Master Register, List of Clause to implement (ISMS). Control of Nonconforming Outputs', 'manual', 'sheet:todo:12', 'normal', 'open', 'sheet:todo:12', 'import:ims-sheet') on conflict (import_key) do nothing;

insert into core_task (module, title, description, source_type, source_key, priority, status, import_key, created_by) values ('IMS', 'ISMS: Assets management', 'From the IMS Master Register, List of Clause to implement (ISMS).', 'manual', 'sheet:todo:14', 'normal', 'open', 'sheet:todo:14', 'import:ims-sheet') on conflict (import_key) do nothing;

insert into core_task (module, title, description, source_type, source_key, priority, status, import_key, created_by) values ('IMS', 'ISMS: Access control management - Privilege access rights', 'From the IMS Master Register, List of Clause to implement (ISMS).', 'manual', 'sheet:todo:15', 'normal', 'open', 'sheet:todo:15', 'import:ims-sheet') on conflict (import_key) do nothing;

insert into core_task (module, title, description, source_type, source_key, priority, status, import_key, created_by) values ('IMS', 'ISMS: Info security within supplier agreement', 'From the IMS Master Register, List of Clause to implement (ISMS).', 'manual', 'sheet:todo:16', 'normal', 'open', 'sheet:todo:16', 'import:ims-sheet') on conflict (import_key) do nothing;

insert into core_task (module, title, description, source_type, source_key, priority, status, import_key, created_by) values ('IMS', 'ISMS: Info security for cloud services', 'From the IMS Master Register, List of Clause to implement (ISMS). Need contract', 'manual', 'sheet:todo:17', 'normal', 'open', 'sheet:todo:17', 'import:ims-sheet') on conflict (import_key) do nothing;

insert into core_task (module, title, description, source_type, source_key, priority, status, import_key, created_by) values ('IMS', 'ISMS: Privacy & protection of personal identifiable information', 'From the IMS Master Register, List of Clause to implement (ISMS).', 'manual', 'sheet:todo:18', 'normal', 'open', 'sheet:todo:18', 'import:ims-sheet') on conflict (import_key) do nothing;

insert into core_task (module, title, description, source_type, source_key, priority, status, import_key, created_by) values ('IMS', 'ISMS: HR screening', 'From the IMS Master Register, List of Clause to implement (ISMS).', 'manual', 'sheet:todo:19', 'normal', 'open', 'sheet:todo:19', 'import:ims-sheet') on conflict (import_key) do nothing;

insert into core_task (module, title, description, source_type, source_key, priority, status, import_key, created_by) values ('IMS', 'ISMS: Remote working', 'From the IMS Master Register, List of Clause to implement (ISMS).', 'manual', 'sheet:todo:20', 'normal', 'open', 'sheet:todo:20', 'import:ims-sheet') on conflict (import_key) do nothing;

insert into core_task (module, title, description, source_type, source_key, priority, status, import_key, created_by) values ('IMS', 'ISMS: Storage media', 'From the IMS Master Register, List of Clause to implement (ISMS).', 'manual', 'sheet:todo:21', 'normal', 'open', 'sheet:todo:21', 'import:ims-sheet') on conflict (import_key) do nothing;

insert into core_task (module, title, description, source_type, source_key, priority, status, import_key, created_by) values ('IMS', 'ISMS: Network security', 'From the IMS Master Register, List of Clause to implement (ISMS).', 'manual', 'sheet:todo:22', 'normal', 'open', 'sheet:todo:22', 'import:ims-sheet') on conflict (import_key) do nothing;

insert into core_task (module, title, description, source_type, source_key, priority, status, import_key, created_by) values ('IMS', 'ISMS: Web filtering', 'From the IMS Master Register, List of Clause to implement (ISMS).', 'manual', 'sheet:todo:23', 'normal', 'open', 'sheet:todo:23', 'import:ims-sheet') on conflict (import_key) do nothing;

insert into core_task (module, title, description, source_type, source_key, priority, status, import_key, created_by) values ('IMS', 'ISMS: VAPT', 'From the IMS Master Register, List of Clause to implement (ISMS).', 'manual', 'sheet:todo:24', 'normal', 'open', 'sheet:todo:24', 'import:ims-sheet') on conflict (import_key) do nothing;

insert into core_task (module, title, description, source_type, source_key, priority, status, import_key, created_by) values ('IMS', 'ISMS: BCP-DR', 'From the IMS Master Register, List of Clause to implement (ISMS). Google for all staff but what about design & Account ?', 'manual', 'sheet:todo:25', 'normal', 'open', 'sheet:todo:25', 'import:ims-sheet') on conflict (import_key) do nothing;

insert into core_task (module, title, description, source_type, source_key, priority, status, import_key, created_by) values ('IMS', 'ISMS: Network diagrams', 'From the IMS Master Register, List of Clause to implement (ISMS).', 'manual', 'sheet:todo:26', 'normal', 'open', 'sheet:todo:26', 'import:ims-sheet') on conflict (import_key) do nothing;
