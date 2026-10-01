-- 0189 — KINDLE: I ACCEPT THE CONSTITUTION, ON RECORD (Kindle 1.1)
--
-- Dr Raghu, 1 Oct 2026, looking at the constitution page: "on this put a
-- I Accept button… and maintain track of it."
--
-- One row per member per constitution version. A new version starts with
-- nobody accepted; the page shows each member his own state and the
-- facilitator the whole list. Never deleted: a withdrawn acceptance is a
-- new row with accepted = false, so the trail reads in order.

create table if not exists public.kindle_constitution_accept (
  id               bigserial primary key,
  constitution_id  uuid not null references public.kindle_constitution(id) on delete cascade,
  member_id        uuid not null references public.kindle_member(id) on delete cascade,
  accepted         boolean not null default true,
  note             text,
  accepted_at      timestamptz not null default now(),
  ip               text,
  user_agent       text
);
alter table public.kindle_constitution_accept enable row level security;
revoke all on public.kindle_constitution_accept from anon, authenticated;
create index if not exists kindle_constitution_accept_cm on public.kindle_constitution_accept(constitution_id, member_id, accepted_at desc);

insert into public.feature_request (title, body, want, status, note, by)
select 'Kindle — I Accept on the constitution, tracked per member and version', '<p>"on this put a I Accept button… and maintain track of it." (Dr Raghu, 1 Oct 2026.)</p>', 'must', 'done', 'Shipped as Kindle 1.1.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title = 'Kindle — I Accept on the constitution, tracked per member and version');
insert into public.feature_request (title, body, want, status, note, by)
select 'Kindle — the check-in screen: this month one at a time with a timer and ringer, then every member''s history scrolling sideways', '<p>"build the checkin. In this this months checkin to be shown. Can see one at a time. show next previous. have a timer on the screen. Able to feed the time and then start to have a countdown. once it gets done it has to have a ringer… and then have a subsection below that by person. In that he should be able to see on screen all his checkins. Pref one screen high with right scrolling." (Dr Raghu, 1 Oct 2026.)</p>', 'must', 'done', 'Shipped as Kindle 1.1 — with the check-in form itself, so the Google Form can close.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title like 'Kindle — the check-in screen%');

insert into public.genie_migration (name) values ('0189_kindle_accept') on conflict (name) do nothing;
