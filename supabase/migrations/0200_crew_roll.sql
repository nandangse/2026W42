-- 0200_crew_roll.sql
--
-- THE NAMES ROLL FORWARD, AND THE COUNT COMES FROM THE NAMES (Dr Raghu,
-- 6 Oct 2026: "If there is no update on that, the same guy has to work on
-- the same job for the next day. Keep moving that accordingly till the time
-- it finishes. If this is not done, then the manpower count will come out
-- wrong. Right now, whatever is manually written will slowly get overridden
-- by this one ... even today ... override the manpower plan so that the
-- numbers come from the names given").
--
-- One row per working day the named crew has been carried into. It is what
-- lets the carry run once a day and never again: a job somebody emptied on
-- purpose stays empty, instead of being refilled from the day before every
-- time the board is opened.
--
-- The first time Genie opens the manpower plan after this runs, today is
-- rolled, and today’s counts, and every planned day after, are worked out
-- again from the names.
--
-- Additive, safe to re-run. Apostrophes in these comments are typographic: the Supabase SQL editor misreads a straight one in a comment.

create table if not exists public.job_crew_roll (
  day     date primary key,
  carried integer not null default 0,
  at      timestamptz not null default now()
);

comment on table public.job_crew_roll is
  'Working days into which the named manpower plan has been carried forward (once each).';

alter table public.job_crew_roll enable row level security;
revoke all on public.job_crew_roll from anon, authenticated;
