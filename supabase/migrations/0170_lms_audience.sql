-- 0170_lms_audience.sql
--
-- WHO EACH LIBRARY IS FOR, AND WHO MAY ONLY LEARN.
--
-- Dr Raghu, 27 Sep 2026: "can the LMS in the genie be given access to other
-- people as a standalone user. For each library we can set up: All Logged in
-- Genie Users / Sales / Operations / Worker / Consultant / Lean."
--
-- THE AUDIENCE IS A LIST, AND AN EMPTY LIST MEANS EVERYBODY. Said that way
-- round, a library made today is open by default and is narrowed on purpose,
-- which is the safe direction for a training library: the failure of an open
-- library is that somebody reads a course meant for another team; the failure
-- of a closed one is that the training nobody can see goes undone.
--
-- LMS-ONLY IS A PERSON, NOT A ROLE. A consultant or a contractor given a
-- login for the training library alone has no business seeing jobs, salaries
-- or the order book, so the flag closes every other door rather than opening
-- one.
--
-- NOTES ARE NOT THE FIFTY WORDS. Kept in their own column so a person can
-- scribble while a video runs without any of it counting towards the floor
-- that decides whether a lesson is complete. The floor only means something
-- because it is written after, about what was taken from the lesson.
--
-- ASCII only, additive, safe to re-run.

-- which groups a person belongs to; empty is nobody's group, not everybody's
alter table profiles add column if not exists lms_groups text[] not null default '{}';

-- a person whose only door is the training library
alter table profiles add column if not exists lms_only boolean not null default false;

-- who the library is for; EMPTY MEANS EVERY LOGGED-IN GENIE USER
alter table lms_book add column if not exists audience text[] not null default '{}';

-- scratch notes taken while watching, kept apart from the learning text
alter table lms_progress add column if not exists notes text not null default '';

create index if not exists profiles_lms_only_idx on profiles (lms_only) where lms_only;

comment on column lms_book.audience is
  'Groups that may see this library. EMPTY = every logged-in Genie user. '
  'Values come from LMS_GROUPS in src/lib/lms.ts.';
comment on column profiles.lms_only is
  'This person may open the LMS and nothing else in Genie.';
comment on column lms_progress.notes is
  'Scratch notes taken while watching. Never counts towards the fifty words.';
