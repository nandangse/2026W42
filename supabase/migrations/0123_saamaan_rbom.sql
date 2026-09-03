-- 0123_saamaan_rbom.sql
--
-- SAAMAAN: the RBOM, the Real BOM, Genie own copy of a project BOM
-- (Dr Raghu, 3 Sep 2026). The last SUBMITTED revision on the ERP is copied
-- into BOM-<item>-100 with every line marked Released; anything a later
-- DRAFT revision adds comes in marked Draft. Once built it belongs to
-- Genie: a rebuild only adds lines it has not seen and never touches a
-- line already there.
--
-- Plain comments on purpose: no quotes or apostrophes anywhere above the
-- statements, so no SQL editor can split the file in the wrong place.
--
-- Additive and safe to re-run.

create table if not exists public.material_rbom (
  rbom_id       text primary key,
  project_id    text not null,
  item_code     text not null default '',
  item_name     text not null default '',
  base_bom      text not null default '',
  draft_boms    jsonb not null default '[]'::jsonb,
  built_by      text,
  built_at      timestamptz not null default now(),
  refreshed_by  text,
  refreshed_at  timestamptz,
  note          text not null default ''
);
create unique index if not exists material_rbom_project_uq on public.material_rbom (project_id);
alter table public.material_rbom enable row level security;

create table if not exists public.material_rbom_item (
  id              uuid primary key default gen_random_uuid(),
  rbom_id         text not null,
  idx             integer not null default 0,
  item_code       text not null default '',
  item_name       text not null default '',
  item_group      text not null default '',
  qty             numeric,
  uom             text not null default '',
  stock_qty       numeric,
  stock_uom       text not null default '',
  rate            numeric,
  amount          numeric,
  description     text not null default '',
  bom_status      text not null default 'Draft',
  bom_remark      text not null default '',
  bom_no          text not null default '',
  is_sub_assembly boolean not null default false,
  source_bom      text not null default '',
  source_row_id   text not null default '',
  added_by        text,
  added_at        timestamptz not null default now(),
  updated_by      text,
  updated_at      timestamptz
);
create index if not exists material_rbom_item_rbom_idx on public.material_rbom_item (rbom_id, idx);
create index if not exists material_rbom_item_item_idx on public.material_rbom_item (item_code);
alter table public.material_rbom_item enable row level security;

insert into public.feature_request (title, body, want, status, note, by)
select
  'Saamaan - the RBOM, the Real BOM',
  '<p>Replicate the last submitted BOM of each live project into BOM-item-100 in Genie: every line Released, anything a later draft added as Draft. Maintain the details in one place, keep a final version in the ERP. (Dr Raghu, 3 Sep 2026)</p>',
  'must', 'done',
  'Shipped as Genie 4.4.1.1 - material_rbom and material_rbom_item, Build RBOM on the BOM front.',
  'raghu@nandan.co.in'
where not exists (
  select 1 from public.feature_request where title = 'Saamaan - the RBOM, the Real BOM'
);
