-- 0017_prospect_queue.sql
--
-- THE PROSPECTING QUEUE (Dr Raghu, 27 Aug 2026): the save icon on a deal
-- card drops it into the salesperson's OWN queue, and the home screen deals
-- the queue back one call at a time. It is a personal work list, not a
-- pipeline state -- the deal does not move, know, or care that it is queued.
--
-- One open entry per deal per person: queueing a card twice just finds the
-- first entry again. Done entries keep their row (done_at set), because
-- "how many calls did the queue produce this week" is a question the queue
-- itself should answer.
--
-- ASCII only, additive, safe to re-run.

create table if not exists prospect_queue (
  id        uuid primary key default gen_random_uuid(),
  kind      text not null check (kind in ('opportunity', 'quotation', 'sales_order', 'lead')),
  ref_id    uuid not null,
  added_by  text not null,
  added_at  timestamptz not null default now(),
  done_at   timestamptz,
  note      text
);

create unique index if not exists prospect_queue_open_uniq
  on prospect_queue (kind, ref_id, added_by) where done_at is null;
create index if not exists prospect_queue_mine
  on prospect_queue (added_by, done_at, added_at desc);

comment on table prospect_queue is
  'A salesperson''s personal call list, fed by the save icon on the deal board. '
  'Done rows are kept; the queue is also its own record of calls made.';
