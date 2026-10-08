-- 0207 · VENDOR REGISTRATION FORM (Dr Raghu, 8 Oct 2026): "the vendor registration form that Mukesh had made
-- (nandan.co.in/nandan-vendor-registration-form-2025-26) … openly available as genie.nandan.co.in/portal/vrf.
-- Don't put any year into that. Filled by existing suppliers as well as new … database accessible in the
-- backend by the purchase team." The form as it stands on the website, field for field; files in the
-- private `portal` bucket under vrf/<id>/. Nothing is exposed to the browser key — the public route inserts
-- with the service key and the purchase team reads through Saamaan.
create table if not exists public.portal_vrf (
  id                 uuid primary key default gen_random_uuid(),
  at                 timestamptz not null default now(),
  email              text not null,
  supplier_id        text not null default '',          -- "Supplier ID (In Nandan Scope)"
  relationship       text not null default '',          -- Existing / New invited / New need to enter
  storage_facility   text not null default '',
  inspection_facility text not null default '',
  inhouse_mfg        text not null default '',
  outsourced_processes text not null default '',
  company_name       text not null,
  contact_name       text not null,
  contact_mobile     text not null,
  company_email      text not null,
  company_phone      text not null,
  address            text not null,
  city               text not null,
  pin                text not null,
  established_year   text not null default '',
  pan_no             text not null default '',
  company_type       text not null default '',
  gst_no             text not null default '',
  items_supplied     text[] not null default '{}',
  other_items        text not null default '',
  brief              text not null default '',
  bank_name          text not null,
  account_no         text not null,
  ifsc               text not null,
  branch             text not null,
  accounts_contact   text not null,
  send_copy          boolean not null default false,
  files              jsonb not null default '[]'::jsonb,   -- [{ kind: pan|gst|brochure|cheque, name, path, size }]
  status             text not null default 'new' check (status in ('new', 'reviewed', 'approved', 'rejected')),
  review_note        text not null default '',
  reviewed_by        text,
  reviewed_at        timestamptz,
  ip                 text,
  user_agent         text
);
create index if not exists portal_vrf_at on public.portal_vrf (at desc);
create index if not exists portal_vrf_company on public.portal_vrf (lower(company_name));
alter table public.portal_vrf enable row level security;
revoke all on public.portal_vrf from anon, authenticated;
create table if not exists public.genie_migration (name text primary key, applied_at timestamptz not null default now());
insert into public.genie_migration (name) values ('0207_vendor_registration') on conflict (name) do nothing;
