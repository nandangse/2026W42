-- 0119_saamaan_projects.sql
--
-- SAAMAAN — Projects and their BOMs (Dr Raghu, 2 Sep 2026): "Now we have
-- the projects. With each project there is a BOM mentioned. For now please
-- show me a table in Saamaan of the Projects - Name - BOM."
--
-- WHAT THE ERP ACTUALLY HOLDS, read off the doctypes' own meta before this
-- was shaped: the Project carries custom_approved_bom (a Link to BOM) plus
-- five ticks — structural, main, hydraulic, electric, long-lead — and the
-- BOM release target and released dates; and every BOM carries `project`
-- back. 1,687 projects and 782 BOMs on the day, 772 of them on a project.
--
-- Two more material_ tables, both MIRRORS — the ERP owns them, nothing is
-- typed here:
--   material_project — the projects, with the BOM fields the ERP keeps on
--                      them. Every column Saamaan reads by name; the rest
--                      of what was asked for, verbatim, in `erp`.
--   material_bom     — the BOM headers: which item, which project, active,
--                      default, submitted. The components come in a later
--                      migration, when the Bill of Materials is built here.
--
-- Line comments only. Additive and safe to re-run.

create table if not exists public.material_project (
  -- The ERP's own name (NGSE-PROJ-1740). The one key.
  project_id                  text primary key,
  project_name                text not null default '',
  status                      text not null default '',
  customer                    text not null default '',
  product_family              text not null default '',
  -- The BOM the project points at (custom_approved_bom → BOM).
  approved_bom                text not null default '',
  design_stage                text not null default '',
  bom_release_target_date     date,
  bom_released_date           date,
  structural_bom              boolean not null default false,
  main_bom                    boolean not null default false,
  hydraulic_bom               boolean not null default false,
  electric_bom                boolean not null default false,
  long_lead_items             boolean not null default false,
  -- Rich text, as the ERP holds it.
  bom_for_action              text not null default '',
  erp_modified                timestamptz,
  erp                         jsonb not null default '{}'::jsonb,
  pulled_at                   timestamptz not null default now()
);
create index if not exists material_project_status_idx on public.material_project (status);
alter table public.material_project enable row level security;

create table if not exists public.material_bom (
  -- The ERP's own name (BOM-N052488-001).
  bom_id        text primary key,
  item_code     text not null default '',
  item_name     text not null default '',
  project_id    text not null default '',
  is_active     boolean not null default false,
  is_default    boolean not null default false,
  -- 0 draft, 1 submitted, 2 cancelled — the ERP's docstatus, as it is.
  docstatus     integer not null default 0,
  quantity      numeric,
  erp_modified  timestamptz,
  erp           jsonb not null default '{}'::jsonb,
  pulled_at     timestamptz not null default now()
);
create index if not exists material_bom_project_idx on public.material_bom (project_id);
create index if not exists material_bom_item_idx on public.material_bom (item_code);
alter table public.material_bom enable row level security;

-- ---------- the ask, filed where every ask lives ----------
insert into public.feature_request (title, body, want, status, note, by)
select
  'Saamaan — Projects and their BOMs',
  '<p>Now we have the projects. With each project there is a BOM mentioned. '
  'For now please show me a table in Saamaan of the Projects - Name - BOM. '
  '(Dr Raghu, 2 Sep 2026)</p>',
  'must', 'done',
  'Shipped as Genie 4.4.0.2 — material_project and material_bom, mirrored, and the Projects table.',
  'raghu@nandan.co.in'
where not exists (
  select 1 from public.feature_request where title = 'Saamaan — Projects and their BOMs'
);
