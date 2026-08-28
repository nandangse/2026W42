-- 0022_outbound_queue.sql
--
-- THE OUTBOUND QUEUES (Dr Raghu, 28 Aug 2026): Tools grows an Email Queue
-- and a WhatsApp Queue. A message is COMPOSED AND KEPT -- rendered whole at
-- queue time, so what the system wrote is what the record holds -- then
-- either sent by hand from the queue, or, for mail marked auto, sent by the
-- 6 AM cron so it greets the person before their day starts.
--
-- WhatsApp is never auto-sent: it goes from the salesperson's own phone, so
-- Send opens WhatsApp with the words ready, and THAT is the moment the
-- message enters Communication.
--
-- Supersedes card_followup (0021), which stays for its few early rows.
--
-- ASCII only, additive, safe to re-run.

create table if not exists outbound_queue (
  id            uuid primary key default gen_random_uuid(),
  channel       text not null check (channel in ('email', 'whatsapp')),
  person_id     uuid,
  company_id    uuid,
  card_id       uuid,
  to_email      text,
  to_phone      text,
  subject       text,
  body          text,
  template_name text,
  send_mode     text not null default 'manual' check (send_mode in ('manual', 'auto')),
  due_at        timestamptz,
  status        text not null default 'queued' check (status in ('queued', 'sent', 'cancelled')),
  added_by      text not null,
  added_at      timestamptz not null default now(),
  sent_at       timestamptz,
  sent_note     text
);

create index if not exists outbound_queue_work on outbound_queue (status, channel, due_at);
create index if not exists outbound_queue_mine on outbound_queue (added_by, status, added_at desc);

comment on table outbound_queue is
  'Messages composed and kept until sent. Email may auto-send at 6 AM; '
  'WhatsApp always goes by hand from the queue, logging to Communication as it opens.';
