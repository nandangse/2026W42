-- 0191 — KINDLE: A NUMBER AND THREE ACTION POINTS ON EVERY GOAL (Kindle 1.3.1)
--
-- Dr Raghu, 1 Oct 2026, on the Goals page: "each goal needs to have a Number
-- next to it and also the three action points for it."
--
-- The number is the measure the goal is judged by (120 cr; 6.5; 15
-- countries) — kindle_goal.measure, which 0187 already had. The three
-- action points are new: what he will do to get there.

alter table public.kindle_goal add column if not exists actions text[] not null default '{}';

insert into public.feature_request (title, body, want, status, note, by)
select 'Kindle — a number and three action points on every goal', '<p>"each goals need to have a Number next to it and also the three action points for it" (Dr Raghu, 1 Oct 2026.)</p>', 'must', 'done', 'Shipped as Kindle 1.3.1.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title = 'Kindle — a number and three action points on every goal');

insert into public.genie_migration (name) values ('0191_kindle_goal_actions') on conflict (name) do nothing;
