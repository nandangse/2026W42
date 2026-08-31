-- 0049_periskope_queue.sql  (CRM project)
--
-- THE WHATSAPP BUSINESS QUEUE (Dr Raghu, 31 Aug 2026):
--
--   "This periskope will be for automation. personalised messages can be
--    created and sent from this. keep settings for it also. messages / hr
--    max - 100. Min time between two message - 10 sec. max per day 500.
--    create a queue for this automation too. While creating it put into
--    queue and when clicked and sent send it. After sending and its
--    delivered put it into communication as Whatsapp Biz message."
--
-- ONE ROW PER MESSAGE TO ONE PERSON, and it moves in one direction:
--
--   queued → sending → sent → delivered        (or failed / cancelled)
--
-- WHY A QUEUE AT ALL. A WhatsApp Business number that sends 500 personalised
-- messages in a burst is a WhatsApp Business number that gets banned. The
-- three ceilings he set — 100 an hour, 500 a day, 10 seconds between any two
-- — are not decoration: they are what keeps the number alive, and they are
-- checked HERE, against this table's own history, at the moment of sending.
-- A ceiling enforced only in the screen is a ceiling that a second browser
-- tab walks straight through.
--
-- NOTHING SENDS ITSELF. Creating a message queues it; a human clicks to send
-- it. That is his instruction and it is also the honest design: the queue
-- holds intent, a person releases it.
--
-- The message lands in Communication only once the provider says DELIVERED,
-- as a WhatsApp Biz message on the record — never at the moment we merely
-- handed it over.
--
-- Line comments only. Additive and safe to re-run.

create table if not exists wa_queue (
  id             uuid primary key default gen_random_uuid(),

  -- who it goes to, and the record it belongs against
  phone          text not null,
  person_id      uuid references person(id),
  company_id     uuid references company(id),
  opportunity_id uuid references opportunity(id),
  quotation_id   uuid references quotation(id),
  lead_id        uuid references lead(id),

  -- what is actually sent: the template it came from, and the personalised
  -- text AFTER the {{variables}} were filled, so what was queued is exactly
  -- what goes out and can be read back later
  template_name  text not null default '',
  body           text not null,

  status         text not null default 'queued'
                 check (status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'cancelled')),

  -- the provider's own handle on it, for delivery receipts
  provider       text not null default 'periskope',
  external_id    text,
  error          text not null default '',

  -- a batch is one "create" action — 40 personalised messages made together
  batch_id       uuid,

  queued_by      uuid references profile(id),
  queued_at      timestamptz not null default now(),
  sent_at        timestamptz,
  delivered_at   timestamptz,

  -- the Communication row written on delivery, so it is written exactly once
  message_id     uuid references message(id)
);

create index if not exists wa_queue_status_idx on wa_queue (status, queued_at);
create index if not exists wa_queue_sent_idx   on wa_queue (sent_at desc);
create index if not exists wa_queue_person_idx on wa_queue (person_id);
create index if not exists wa_queue_batch_idx  on wa_queue (batch_id);
-- The throttle counts sent_at over windows; this is the index it leans on.
create index if not exists wa_queue_throttle_idx on wa_queue (sent_at)
  where status in ('sent', 'delivered');

alter table wa_queue enable row level security;

-- The same arrangement as every other CRM table: the anon key sees nothing
-- and every read goes through a server route that has already established
-- who is asking.
