-- 0123_saamaan_rbom.sql
--
-- SAAMAAN — the RBOM, the Real BOM, Genie's own (Dr Raghu, 3 Sep 2026): "we will make
-- a seperate BOM now in the Genie. This BOM will be the last BOM that is
-- submitted in the system, eg for project no 1637, BOM-N050184-005 is shown
-- in the system. Replicate them into a BOM in our Genie called
-- BOM-N050184-100. Put in all the contents of BOM-N050184-005 and change
-- the bom_status for each item to 'Released'. Then look if there is
-- BOM-N050184-006 and see what all items in that are added that were not
-- in previous version. Take those items into BOM-N050184-100 also and mark
-- them 'Draft'. Mention in the table also as 'RBOM' in Genie of this
-- version. This will help solve the problem of maintaining the details in
-- one place and also to have a final version in the ERP!" Then: "RBOM is
-- Real BOM."
--
-- THE FIRST material_ TABLES THAT ARE GENIE'S OWN. Everything before this
-- was a mirror; the RBOM is built FROM the mirror and then belongs to
-- Genie. A rebuild only ADDS lines the RBOM has not seen — it never
-- touches a line already there, because those are the ones the team will
-- be maintaining here.
--
--   material_rbom      — one per project: BOM-<item>-100, the submitted
--                        revision it was built from, the draft revisions
--                        merged in after it, who built it and when.
--   material_rbom_item — the lines. bom_status is 'Released' for what came
--                        from the submitted revision, 'Draft' for what a
--                        later draft added; source_bom says which.
--
-- Line comments only. Additive and safe to re-run.

create table if not exists public.material_rbom (
  -- BOM-N050184-100: the ERP's item code, revision 100. Genie's number.
  rbom_id       text primary key,
  project_id    text not null,
  item_code     text not null default '',
  item_name     text not null default '',
  -- The submitted ERP revision the Released lines came from.
  base_bom      text not null default '',
  -- The later ERP drafts whose additions came in as Draft, in order.
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
  -- Released (from the submitted revision) or Draft (from a later draft).
  -- Text, not an enum: the words are his, and he may add to them.
  bom_status      text not null default 'Draft',
  bom_remark      text not null default '',
  bom_no          text not null default '',
  is_sub_assembly boolean not null default false,
  -- Which ERP BOM the line was copied from, and which row of it.
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

-- ---------- the ask, filed where every ask lives ----------
insert into public.feature_request (title, body, want, status, note, by)
select
  'Saamaan — the RBOM, the Real BOM',
  '<p>we will make a seperate BOM now in the Genie. This BOM will be the last '
  'BOM that is submitted in the system, eg for project no 1637, BOM-N050184-005 '
  'is shown in the system. Replicate them into a BOM in our Genie called '
  'BOM-N050184-100. Put in all the contents of BOM-N050184-005 and change the '
  'bom_status for each item to "Released". Then look if there is '
  'BOM-N050184-006 and see what all items in that are added that were not in '
  'previous version. Take those items into BOM-N050184-100 also and mark them '
  '"Draft". Mention in the table also as "RBOM" in Genie of this version. This '
  'will help solve the problem of maintaining the details in one place and '
  'also to have a final version in the ERP! (Dr Raghu, 3 Sep 2026)</p>',
  'must', 'done',
  'Shipped as Genie 4.4.1.1 — material_rbom and material_rbom_item, Build RBOM on the BOM front, the RBOM in its own lightbox.',
  'raghu@nandan.co.in'
where not exists (
  select 1 from public.feature_request where title = 'Saamaan — the RBOM, the Real BOM'
);
