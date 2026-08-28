-- 0021_card_followup.sql
--
-- THE CARD'S FOLLOW-UP (Dr Raghu, 28 Aug 2026): "the use of this is when we
-- meet someone -- quickly scan the card, add to CRM, with some automation of
-- a thank you or nice-meeting-you mail or WhatsApp sent within a day."
--
-- Scanning the card queues the courtesy; the queue surfaces it on the
-- Dashboard the next morning with the message already written, one tap from
-- going out. The sending hand stays HUMAN -- what the automation removes is
-- the forgetting, not the judgement.
--
-- ASCII only, additive, safe to re-run.

create table if not exists card_followup (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null,
  company_id uuid,
  card_id    uuid,
  channel    text not null check (channel in ('email', 'whatsapp')),
  due_at     timestamptz not null,
  status     text not null default 'open' check (status in ('open', 'done', 'skipped')),
  added_by   text not null,
  added_at   timestamptz not null default now(),
  done_at    timestamptz
);

create index if not exists card_followup_mine on card_followup (added_by, status, due_at);

comment on table card_followup is
  'Thank-you / nice-meeting-you courtesies queued by a card scan, due within '
  'a day, dealt from the Dashboard. Removes the forgetting, not the judgement.';
