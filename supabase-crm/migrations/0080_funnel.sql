-- 0080_funnel.sql
--
-- THE FUNNEL — and the one tick it needed that did not exist.
--
-- Dr Raghu, 30 Sep 2026, against a SALT screenshot: "In the crm can we have a
-- funnel like this created? List Building = Leads, Account Qualified =
-- Company, Contact verified = Email Sent or put a tick in Contact Verified,
-- Nurturing Relationship = Email replied or Interaction done, Opportunity
-- Identified = Opportunity."
--
-- FOUR OF THE FIVE STAGES WERE ALREADY ANSWERABLE. A lead is a lead, an
-- interaction is an interaction, an opportunity is an opportunity. Only
-- "verified" had no record anywhere: 15,509 contacts and not one of them
-- carrying whether a human had ever confirmed the address is real.
--
-- IT KEEPS WHO AND WHEN, not just a boolean. "Verified" with nobody's name
-- against it is a claim, and this is the stage where the whole funnel stops
-- being a list and starts being work somebody did.
--
-- ASCII only, additive, safe to re-run.

alter table person add column if not exists verified_at   timestamptz;
alter table person add column if not exists verified_by   text;
alter table person add column if not exists verified_how  text;

create index if not exists person_verified_idx on person (verified_at desc) where verified_at is not null;

comment on column person.verified_at is
  'When somebody confirmed this contact is real and reachable. Null means nobody has.';
comment on column person.verified_by is
  'Who confirmed it. A verification with no name against it is a claim, not a record.';
comment on column person.verified_how is
  'ticked | email sent | replied — how it was established.';
