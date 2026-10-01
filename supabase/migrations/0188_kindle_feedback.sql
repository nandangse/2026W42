-- 0188 — KINDLE: FEEDBACK ON EACH MEETING (Kindle 1.1)
--
-- Dr Raghu, 1 Oct 2026, the afternoon of the October meeting: "TG Meetings
-- need to be a section. The meeting of today. Have a poll from all people
-- and also take feedback. We will ensure this is done once meeting is
-- complete."
--
-- The constitution’s standard agenda already has a "meeting quality check"
-- at item 6.6; this is that check, written by each member on his phone as
-- the meeting closes, instead of said aloud and lost. One row per member
-- per meeting; a second submission replaces the first. The polls table
-- (0187) needs nothing new.

create table if not exists public.kindle_meeting_feedback (
  meeting_id    uuid not null references public.kindle_meeting(id) on delete cascade,
  member_id     uuid not null references public.kindle_member(id) on delete cascade,
  rating        int not null check (rating between 1 and 10),
  went_well     text,
  improve       text,
  takeaway      text,
  next_topic    text,
  anonymous     boolean not null default false,
  submitted_at  timestamptz not null default now(),
  primary key (meeting_id, member_id)
);
alter table public.kindle_meeting_feedback enable row level security;
revoke all on public.kindle_meeting_feedback from anon, authenticated;

insert into public.feature_request (title, body, want, status, note, by)
select 'Kindle — feedback and a poll after every TG meeting', '<p>"TG Meetings need to be a section. The meeting of today. Have a poll from all people and also take feedback. We will ensure this is done once meeting is complete." (Dr Raghu, 1 Oct 2026.)</p>', 'must', 'done', 'Shipped as Kindle 1.1 — the feedback form on each meeting page, polls live.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title = 'Kindle — feedback and a poll after every TG meeting');

insert into public.genie_migration (name) values ('0188_kindle_feedback') on conflict (name) do nothing;
