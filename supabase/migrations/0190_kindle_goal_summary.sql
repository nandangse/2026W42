-- 0190 — KINDLE: GENIE'S SUMMARY OF A MEMBER'S GOALS (Kindle 1.3)
--
-- Dr Raghu, 1 Oct 2026: "In October all can write there and then every
-- month's check-in should give update. The Genie can be built in to
-- summarise it." The summary is written by Claude from the goal set and
-- every month's word on each goal, kept on the set with its time, and
-- re-made on request. It obeys Genie's AI master switch (app_settings.ai_paused).

alter table public.kindle_goal_set add column if not exists ai_summary text;
alter table public.kindle_goal_set add column if not exists ai_summary_at timestamptz;

insert into public.feature_request (title, body, want, status, note, by)
select 'Kindle — goals: three and three, set in October, updated in every check-in, summarised by Genie', '<p>"i want the goals to be built. 3 personal and 3 professional. In October all can write there and then every months checkin it should give update. the Genie can be in built in this to summarise it." (Dr Raghu, 1 Oct 2026.)</p>', 'must', 'done', 'Shipped as Kindle 1.3 — Goals section, the check-in carries the goals, Genie summary on the set.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title like 'Kindle — goals: three and three%');

insert into public.genie_migration (name) values ('0190_kindle_goal_summary') on conflict (name) do nothing;
