-- 0212 — after the audit of 9 Oct 2026: no SVG on the public bucket (S15).
--
-- marketing-public (0147) is read by anybody with the address and accepted
-- image/svg+xml. An SVG is a document that can carry script; served from a
-- public bucket it is a page anybody can be sent to. PNG, JPEG, GIF, WebP
-- and PDF stay. An SVG already stored is not removed by this — list them
-- with the check at the end and decide each by hand.
--
-- Safe to run twice.

update storage.buckets
   set allowed_mime_types = array['image/png','image/jpeg','image/gif','image/webp','application/pdf']
 where id = 'marketing-public';

create table if not exists public.genie_migration (name text primary key, at timestamptz default now());
insert into public.genie_migration (name) values ('0212_audit_no_svg_public') on conflict (name) do nothing;

-- PROVE IT: the first row shows the new list; any rows after it are SVGs
-- already on the bucket, to be looked at one by one.
select id, allowed_mime_types::text as detail from storage.buckets where id = 'marketing-public'
union all
select name, 'existing SVG object' from storage.objects
 where bucket_id = 'marketing-public' and lower(name) like '%.svg';
