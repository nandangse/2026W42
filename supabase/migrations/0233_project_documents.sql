-- 0233 — THE PROJECT'S DOCUMENTS (PCD) (Genie 6.10.0.11)
--
-- Dr Raghu, 14 Oct 2026, on the project book: "move the PCD to the front
-- before the TDS. Have a Type drop down (type of project document) — Unpriced
-- PO, Client TDS, GA Drawing Approved, etc — make up as many as needed and
-- show in alphabetical order. Have a button to add type. Then give a place to
-- upload, and show what was uploaded by who and when. Save all this in the
-- drive. Keep this in project memory."
--
-- The file goes browser -> the private 'project-docs' bucket (a signed upload,
-- so no size wall at Vercel) -> the shared Drive, under
-- Projects / <project> / PCD / <type>. Once the Drive copy is made the bucket
-- copy is dropped; the row below is the project's memory of the document —
-- what it is, who filed it, when, and where it lives.

create table if not exists public.project_doc_type (
  name      text primary key,
  added_by  text,
  added_at  timestamptz not null default now()
);
alter table public.project_doc_type enable row level security;
revoke all on public.project_doc_type from anon, authenticated;

insert into public.project_doc_type (name, added_by) values
  ('Advance Bank Guarantee', 'Genie'), ('Amendment to PO', 'Genie'), ('As-Built Drawings', 'Genie'),
  ('Bill of Quantities (BOQ)', 'Genie'), ('Calibration Certificates', 'Genie'), ('Client Correspondence', 'Genie'),
  ('Client Specification', 'Genie'), ('Client TDS', 'Genie'), ('Commercial Offer', 'Genie'),
  ('Delivery Challan', 'Genie'), ('Dispatch Clearance', 'Genie'), ('Drawing Approval Letter', 'Genie'),
  ('FAT Report', 'Genie'), ('GA Drawing Approved', 'Genie'), ('GA Drawing Submitted', 'Genie'),
  ('Handing Over Certificate', 'Genie'), ('Inspection Call / Report', 'Genie'), ('Installation & Commissioning Report', 'Genie'),
  ('Invoice', 'Genie'), ('Letter of Intent (LOI)', 'Genie'), ('Material Test Certificates', 'Genie'),
  ('Minutes of Meeting', 'Genie'), ('NDA', 'Genie'), ('Operation & Maintenance Manual', 'Genie'),
  ('Packing List', 'Genie'), ('Performance Bank Guarantee', 'Genie'), ('Priced PO', 'Genie'),
  ('QAP Approved', 'Genie'), ('SAT Report', 'Genie'), ('Technical Offer', 'Genie'),
  ('Tender Document', 'Genie'), ('Training Record', 'Genie'), ('Unpriced PO', 'Genie'),
  ('Warranty Certificate', 'Genie'), ('Work Order', 'Genie')
on conflict (name) do nothing;

create table if not exists public.project_file (
  id            uuid primary key default gen_random_uuid(),
  project_id    text not null,
  section       text not null default 'pcd',
  doc_type      text not null,
  name          text not null,
  mime          text,
  bytes         bigint,
  path          text,                         -- the bucket copy, until the Drive copy is made
  note          text,
  drive_id      text,
  drive_url     text,
  drive_folder  text,                         -- the project's own Drive folder, reused for its next file
  drive_status  text not null default 'pending' check (drive_status in ('pending','done','failed','skipped')),
  drive_error   text,
  uploaded_by   text not null,               -- e-mail
  uploaded_name text,
  uploaded_at   timestamptz not null default now()
);
create index if not exists project_file_project on public.project_file (project_id, section, uploaded_at desc);
alter table public.project_file enable row level security;
revoke all on public.project_file from anon, authenticated;

insert into storage.buckets (id, name, public) values ('project-docs', 'project-docs', false) on conflict (id) do nothing;

insert into public.feature_request (title, body, want, status, note, by)
select 'Project book — PCD first: typed project documents uploaded to the Drive, who and when', '<p>"pl move the PCD to the front before the TDS. Have a Type - Drop down (Type of Project document) - Unpriced PO, Client TDS, GA Drawing Approved, etc ... make up as many as needed and show in alphabetical order. Have a button to add type. Then give a place to upload and show what was uploaded by who and when. Save all this in the drive. Keep this in project memory" (Dr Raghu, 14 Oct 2026.)</p>', 'must', 'done', 'Shipped as Genie 6.10.0.11.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title like 'Project book — PCD first%');

insert into public.feature_request (title, body, want, status, note, by)
select 'Project book — Design Section linked to Vishwakarma: view here, designers edit there', '<p>"Design Section is detailed and should be linked to the vishwakarma. Show all that here in view mode. Designer can see it in edit. Will explain separately" (Dr Raghu, 14 Oct 2026.)</p>', 'must', 'planned', '6.10.0.11 shows Vishwakarma''s design facts and plan read-only on the project book, with the way to Vishwakarma for designers. The detailed design section waits for Dr Raghu''s explanation.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title like 'Project book — Design Section linked to Vishwakarma%');

insert into public.genie_migration (name) values ('0233_project_documents') on conflict (name) do nothing;
