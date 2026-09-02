-- 0110_feature_click.sql
--
-- WHO ACTUALLY OPENS WHAT (Dr Raghu, 2 Sep 2026, of Genie's read of a job:
-- "Please take a count of how many people are clicking it").
--
-- A fair question, and one Genie has never been able to answer about any of
-- its own features. Everything built here has been judged by whether it
-- looked right in a review; nothing has been judged by whether anybody opened
-- it twice. A folded panel is the honest test — it costs a click, so the
-- click means something.
--
-- DELIBERATELY GENERIC. `feature` is the thing, `ref` is what it was about
-- (a job id, a quote number, nothing at all), so the next "is anyone using
-- this?" has somewhere to be answered from without another migration.
--
-- ONE ROW PER CLICK, not a counter: a counter answers "how many times" and
-- loses "how many people", and his question was the second one. Counting
-- distinct emails over a window is a query; un-summing a counter is not.
--
-- Line comments only. Additive and safe to re-run.

create table if not exists public.feature_click (
  id      bigserial primary key,
  feature text not null,
  ref     text not null default '',
  by      text,
  at      timestamptz not null default now()
);

create index if not exists feature_click_what_idx on public.feature_click (feature, at desc);
create index if not exists feature_click_who_idx  on public.feature_click (feature, by);

alter table public.feature_click enable row level security;

comment on table public.feature_click is
  'One row per deliberate open of a feature. Read it as: how many PEOPLE '
  '(distinct by) opened FEATURE in a period — not how many times it rendered.';
