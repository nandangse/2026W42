-- 0166 — SUPPORT TICKETS, AND WHAT IS ATTACHED TO THEM
-- (Dr Raghu, 9 Sep 2026: "Issues import — call it Support Tickets ... please
--  import both of these. Get in all the fields including the attachments.
--  Also the issue details to be in rich text.")
--
-- ELEVEN THOUSAND NINE HUNDRED AND FORTY-NINE of them in the ERP, going back
-- to 2016. `seva_issue` was built for tickets typed here and has fifteen
-- columns; the ERP's Issue carries thirty-four. The difference is not padding
-- — it is the FRF number and date, the checklist used, the mandays invested,
-- the cost spent, the closure rating, whether it was raised as a
-- non-conformance. Those are the questions somebody asks about a service call
-- a year later.
--
-- THE DESCRIPTION STAYS RICH. The ERP writes it as Quill HTML — paragraphs,
-- lists, the occasional table — and flattening it to text loses the shape a
-- man used to explain a fault. It is kept as it came, in `description_html`,
-- with a plain copy beside it so the table can be searched without parsing
-- markup on every keystroke.
--
-- ATTACHMENTS ARE INDEXED, NOT COPIED. There are 18,051 files on the issues
-- and 5,916 on the contracts — and every one is PRIVATE in the ERP, so the
-- bytes need its authentication to fetch. What lands here is the name, the
-- size, the date and the path, which is enough to list them, count them and
-- open them there. Copying twenty-four thousand private files into Genie is a
-- decision about storage and confidentiality that has not been taken, and a
-- migration is not the place to take it quietly.
--
-- Safe to run twice.

alter table public.seva_issue
  add column if not exists erp_name         text unique,   -- ISS-00004; the key back
  add column if not exists issue_date       date,
  add column if not exists opening_date     date,
  add column if not exists subject          text,
  add column if not exists raised_by        text,
  add column if not exists location         text,
  add column if not exists equipment        text,
  add column if not exists attended_by      text,
  add column if not exists handled_by       text,
  add column if not exists type_of_support  text,
  add column if not exists problem_type     text,
  add column if not exists job_number       text,
  add column if not exists job_numbers      text,
  add column if not exists agreement_status text,
  add column if not exists reading          text,
  add column if not exists finally_showed_to text,
  add column if not exists resolution_summary text,
  add column if not exists closure_rating   text,
  add column if not exists raised_as_nc     boolean,
  add column if not exists via_portal       boolean,
  add column if not exists amount_billed    numeric,
  add column if not exists cost_spent       numeric,
  add column if not exists costing_details  text,
  add column if not exists mandays_invested numeric,
  add column if not exists frf_no           text,
  add column if not exists frf_date         date,
  add column if not exists checklist_used   text,
  add column if not exists pending_action_status text,
  add column if not exists lead             text,
  -- the fault as the man wrote it, and a flat copy for searching
  add column if not exists description_html text,
  add column if not exists erp_modified     text,
  add column if not exists pulled_at        timestamptz;

create index if not exists seva_issue_erp_idx      on public.seva_issue (erp_name);
create index if not exists seva_issue_date_idx     on public.seva_issue (issue_date desc);
create index if not exists seva_issue_equipment_idx on public.seva_issue (equipment);
create index if not exists seva_issue_frf_idx      on public.seva_issue (frf_no);

-- ── the contract's own missing fields ──
alter table public.seva_amc
  add column if not exists amc_status        text,
  add column if not exists type_of_product   text,
  add column if not exists value_per_annum   numeric,
  add column if not exists contract_value    numeric,
  add column if not exists visits_per_annum  numeric,
  add column if not exists transaction_date  date,
  add column if not exists primary_handler   text,
  add column if not exists contact_person    text,
  add column if not exists site_contact      text,
  add column if not exists job_details       text,
  add column if not exists customer_address  text,
  add column if not exists customer_group    text,
  add column if not exists payment_status    text,
  add column if not exists amount_billed     numeric,
  add column if not exists erp_modified      text;

-- ── what is attached, to a ticket or a contract ──
create table if not exists public.seva_attachment (
  id           text primary key,            -- the File's own name in the ERP
  parent_type  text not null,               -- 'Issue' | 'Annual Maintenance Contract'
  parent_name  text not null,               -- ISS-00004 / AMC-...
  file_name    text,
  file_url     text,                        -- the ERP path; private, so opened THERE
  file_size    bigint,
  is_private   boolean default true,
  uploaded_at  timestamptz,
  pulled_at    timestamptz default now()
);
create index if not exists seva_attachment_parent_idx on public.seva_attachment (parent_type, parent_name);

alter table public.seva_attachment enable row level security;
revoke all on public.seva_attachment from public, anon, authenticated;

create table if not exists public.genie_migration (name text primary key, at timestamptz default now());
insert into public.genie_migration (name) values ('0166_seva_tickets') on conflict (name) do nothing;

notify pgrst, 'reload schema';

-- ── prove it ──
select 'seva_issue columns' as t, count(*) as n from information_schema.columns
  where table_schema='public' and table_name='seva_issue'
union all select 'seva_amc columns', count(*) from information_schema.columns
  where table_schema='public' and table_name='seva_amc'
union all select 'seva_attachment', count(*) from public.seva_attachment;
