-- 0234 — LMS ADMINS (Genie 6.10.1.0)
--
-- Dr Raghu, 15 Oct 2026: "in LMS make an admin page. Shweta and Raghu are LMS
-- admins for now." An LMS admin writes the library, sets who sees which
-- library, and reads everybody's learning record. Until this runs, Genie's own
-- admins and Dr Raghu keep the library as before.

create table if not exists public.lms_admin (
  email     text primary key,
  added_by  text,
  added_at  timestamptz not null default now()
);
alter table public.lms_admin enable row level security;
revoke all on public.lms_admin from anon, authenticated;

insert into public.lms_admin (email, added_by) values
  ('raghu@nandan.co.in', 'raghu@nandan.co.in'),
  ('shweta@nandan.co.in', 'raghu@nandan.co.in')
on conflict (email) do nothing;

insert into public.feature_request (title, body, want, status, note, by)
select 'LMS — an Admin page; Shweta and Raghu the LMS admins', '<p>"in LMS make an admin page. Shweta and raghu are LMS admins for now" (Dr Raghu, 15 Oct 2026.)</p>', 'must', 'done', 'Shipped as Genie 6.10.1.0.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title like 'LMS — an Admin page%');

insert into public.feature_request (title, body, want, status, note, by)
select 'LMS — My Team shows everybody at once, as a table', '<p>"show all in this also to me ! … as a table" (Dr Raghu, 15 Oct 2026, on My Team.)</p>', 'must', 'done', 'Shipped as Genie 6.10.1.0.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title like 'LMS — My Team shows everybody%');

insert into public.genie_migration (name) values ('0234_lms_admin') on conflict (name) do nothing;
