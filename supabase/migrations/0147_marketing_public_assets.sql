-- 0147_marketing_public_assets.sql — Genie 5.0.3.0 (6 Sep 2026)
--
-- Dr Raghu: "it has to be hosted in a public place through the Genie itself!"
--
-- A marketing mail's pictures must be fetchable by Gmail, Outlook and every
-- other reader — none of them can sign in — so this bucket is PUBLIC, the
-- first in Genie. Everything else (voice notes, job photos, principle docs,
-- Tally XMLs) stays private and signed.
--
-- WHAT GOES IN: pictures and files meant for the outside world — mail
-- bodies, landing pages, brochures. NOTHING ELSE. Anybody with the address
-- can read it; the address is a long random path, but that is not a lock.
--
-- Writes go through /api/marketing/asset with the service key, which checks
-- the caller holds Marketing first.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketing-public', 'marketing-public', true, 20971520,
  array['image/png','image/jpeg','image/gif','image/webp','image/svg+xml','application/pdf'])
on conflict (id) do update set
  public = true,
  file_size_limit = 20971520,
  allowed_mime_types = array['image/png','image/jpeg','image/gif','image/webp','image/svg+xml','application/pdf'];

-- read for everyone, writes only by the service key (no policy = no access
-- for anon/authenticated, which is what we want for insert and delete)
drop policy if exists "marketing public read" on storage.objects;
create policy "marketing public read" on storage.objects
  for select using (bucket_id = 'marketing-public');

create table if not exists public.genie_migration (name text primary key, applied_at timestamptz not null default now());
insert into public.genie_migration (name) values ('0147_marketing_public_assets') on conflict (name) do nothing;
