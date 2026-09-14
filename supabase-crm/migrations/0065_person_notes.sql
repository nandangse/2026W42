-- 0065 — a person can carry a note, as a company already can.
--
-- Dr Raghu, 14 Sep 2026: "collect as much data as you can and put in leads,
-- other data pour in the notes."
--
-- The aviation list carries eighteen columns the CRM has no field for: the
-- biography, the events somebody was seen at, alternative job titles and
-- companies, which source tabs a row was merged from, the conflicts flagged
-- for review. Thirteen hundred of those biographies belong to people already
-- in the CRM, and today there is nowhere to put a single one of them.
--
-- `company` has had `notes` since 0001. `person` never did — the asymmetry
-- was an oversight, not a decision. This closes it.
--
-- WHY A COLUMN AND NOT AN INTERACTION ROW. An interaction is something that
-- HAPPENED — a call, a mail, a meeting, on a date, by a person. A biography
-- is not an event; it is a standing fact about somebody. Filing it as an
-- interaction would put a false date on it and bury it in a timeline.
--
-- Additive and re-runnable, per the migration contract.

alter table if exists public.person
  add column if not exists notes text;

comment on column public.person.notes is
  'Standing facts about the person that have no column of their own — a '
  'biography, events attended, alternative titles or companies, where an '
  'imported row came from. NOT a timeline: things that happened are '
  'interactions.';
