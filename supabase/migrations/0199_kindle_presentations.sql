-- 0199 — KINDLE: PRESENTATIONS (Kindle 1.4)
--
-- Dr Raghu, 4 Oct 2026: "also add one more — Presentations. In this have a
-- video, PPT/PDF, Notes, Comments. Also track back who watched it." After
-- Burning issues in the menu.
--
-- A presentation is a member’s deck to the TG (constitution 6.4, 6.5): the
-- recording (a link — YouTube, Drive, Zoom), the deck (PPT or PDF in the
-- private bucket), the presenter’s notes, the room’s comments, and a view
-- row per member the first time he opens it — so "who watched it" is a
-- fact, not a question.

create table if not exists public.kindle_presentation (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  presenter_id  uuid references public.kindle_member(id) on delete set null,
  meeting_id    uuid references public.kindle_meeting(id) on delete set null,
  presented_on  date,
  video_url     text,
  notes         text,
  created_by    uuid references public.kindle_member(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.kindle_presentation enable row level security;
revoke all on public.kindle_presentation from anon, authenticated;

create table if not exists public.kindle_presentation_file (
  id               uuid primary key default gen_random_uuid(),
  presentation_id  uuid not null references public.kindle_presentation(id) on delete cascade,
  path             text not null,
  name             text not null,
  mime             text,
  bytes            int,
  uploaded_by      uuid references public.kindle_member(id),
  created_at       timestamptz not null default now()
);
alter table public.kindle_presentation_file enable row level security;
revoke all on public.kindle_presentation_file from anon, authenticated;

create table if not exists public.kindle_presentation_comment (
  id               uuid primary key default gen_random_uuid(),
  presentation_id  uuid not null references public.kindle_presentation(id) on delete cascade,
  member_id        uuid references public.kindle_member(id),
  body             text not null,
  created_at       timestamptz not null default now()
);
alter table public.kindle_presentation_comment enable row level security;
revoke all on public.kindle_presentation_comment from anon, authenticated;

create table if not exists public.kindle_presentation_view (
  presentation_id  uuid not null references public.kindle_presentation(id) on delete cascade,
  member_id        uuid not null references public.kindle_member(id) on delete cascade,
  first_at         timestamptz not null default now(),
  last_at          timestamptz not null default now(),
  opens            int not null default 1,
  primary key (presentation_id, member_id)
);
alter table public.kindle_presentation_view enable row level security;
revoke all on public.kindle_presentation_view from anon, authenticated;

insert into public.feature_request (title, body, want, status, note, by)
select 'Kindle — Presentations: video, PPT/PDF, notes, comments, who watched', '<p>"also add one more - Presentations. in this have a video, PPT/PDF, Notes, Comments. Also track back who watched it… after burning issues" (Dr Raghu, 4 Oct 2026.)</p>', 'must', 'done', 'Shipped as Kindle 1.4.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title like 'Kindle — Presentations%');

insert into public.genie_migration (name) values ('0199_kindle_presentations') on conflict (name) do nothing;
