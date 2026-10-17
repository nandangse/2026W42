-- 0242 — KINDLE 1.5.0: LEARNINGS, PARTICIPATION, GENIE ON THE BOARD
--
-- Dr Raghu, 17 Oct 2026: "first complete what you want for kindle!" — the
-- three things left open on the 4 October list.
--
--   1. Learnings as a section of its own. The rows have been in
--      kindle_learning since 0187 (94 of them, one from every check-in that
--      carried an "inspiration and learning"); a learning noted between
--      meetings now goes in the same table without a check-in behind it.
--      Only an index is new.
--   2. Participation this year on Home — computed in the boot read from
--      attendance, check-ins, 1-2-1s and meeting feedback. Nothing stored.
--   3. Genie on the message board: a reading of a topic, kept on the topic
--      with its time, re-made on request, the same way the goal set keeps
--      its summary (0190). Obeys the AI master switch.

create index if not exists kindle_learning_member_on on public.kindle_learning (member_id, noted_on desc);

alter table public.kindle_topic add column if not exists ai_summary text;
alter table public.kindle_topic add column if not exists ai_summary_at timestamptz;

insert into public.feature_request (title, body, want, status, note, by)
select 'Kindle — Learnings section, participation score on Home, Genie on the message board', '<p>"first complete what you want for kindle!" (Dr Raghu, 17 Oct 2026.) The three items left open after 1.4.0: the learnings data shown as its own section, the participation score on Home, Genie on the message board.</p>', 'should', 'done', 'Shipped as Kindle 1.5.0 — Learnings after Goals; Participation this year on Home with the room’s table; Genie, sum it up on any topic with replies.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title like 'Kindle — Learnings section%');

insert into public.genie_migration (name) values ('0242_kindle_learnings_participation') on conflict (name) do nothing;
