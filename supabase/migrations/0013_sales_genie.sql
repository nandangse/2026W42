-- 0013_sales_genie.sql
-- Sales Genie: the Sales Regrow playbook served as a gated workspace tab.
-- Additive and safe to re-run.
--
-- Two tables:
--   sales_access  — per-person grant, default NOBODY. Seeded below for
--                   raghu@nandan.co.in and medhansh@nandan.co.in only.
--   sales_content — the playbook HTML itself, stored byte-for-byte. Every
--                   import adds a NEW row (the latest wins); nothing is ever
--                   overwritten, so any earlier version can be recovered.

create table if not exists public.sales_access (
  person_id  uuid primary key references public.profiles (id) on delete cascade,
  granted_by text,
  granted_at timestamptz not null default now()
);

create table if not exists public.sales_content (
  id          uuid primary key default gen_random_uuid(),
  filename    text,
  html        text not null,
  uploaded_by text,
  uploaded_at timestamptz not null default now()
);

create index if not exists sales_content_time_idx on public.sales_content (uploaded_at desc);

alter table public.sales_access  enable row level security;
alter table public.sales_content enable row level security;

-- you may see whether YOU hold the grant; admins see the list.
drop policy if exists sales_access_read on public.sales_access;
create policy sales_access_read on public.sales_access
  for select using (person_id = auth.uid() or public.is_admin());

-- grants are managed through the admin API (service role); no direct writes.
-- content is served exclusively through the server route (service role), so it
-- deliberately has NO select policy — per the spec, this is commercially
-- sensitive material and must never be readable by a browser query.

-- ---------------------------------------------------------------------------
-- Seed: as of now, only these two accounts can open Sales Genie.
-- ---------------------------------------------------------------------------
insert into public.sales_access (person_id, granted_by)
select id, 'migration 0013'
from public.profiles
where lower(email) in ('raghu@nandan.co.in', 'medhansh@nandan.co.in')
on conflict (person_id) do nothing;
