-- 0063 — AISENSY'S WEBHOOK: what happened to a message after we sent it,
-- and what came back.
--
-- Dr Raghu sent the Project Webhook reference on 9 Sep 2026. Until now the
-- client said so itself: "Replies and delivery receipts are not documented,
-- so nothing here pretends to read them: a send is recorded as sent." They
-- ARE documented, so a send need no longer be the end of the story.
--
-- Three things follow from their specification and shape this file:
--
--   1. A NOTIFICATION ARRIVES AT LEAST ONCE, and may arrive out of order.
--      Their words. So every notification is written by its own id and a
--      repeat is a no-op — wa_webhook_event is the ledger that makes the
--      endpoint idempotent, not a debugging luxury.
--
--   2. STATUS ONLY EVER MOVES FORWARD. Out-of-order delivery means a
--      "sent" can land after a "read". The route enforces the ladder;
--      these columns hold each moment separately so a late notification
--      can fill a gap without overwriting a later truth.
--
--   3. A REPLY IS NOT A QUEUE ROW. message.sender.user is somebody
--      writing to us; it has no outbound row to update and belongs in its
--      own table.
--
-- Line comments only. Safe to re-run.

-- ---- what happened to what we sent ---------------------------------------
alter table if exists public.wa_queue
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at      timestamptz,
  add column if not exists failed_at    timestamptz;

comment on column public.wa_queue.read_at is
  'When AiSensy told us the contact READ it. Delivered is the phone; read is the person.';

-- 'read' was not in the original ladder because nothing could report it.
do $$
begin
  alter table public.wa_queue drop constraint if exists wa_queue_status_check;
  alter table public.wa_queue add constraint wa_queue_status_check
    check (status in ('queued','sending','sent','delivered','read','failed','cancelled'));
exception when undefined_table then null;
end $$;

-- ---- the ledger that makes the endpoint idempotent -----------------------
create table if not exists public.wa_webhook_event (
  id         text primary key,          -- their notification id
  topic      text not null default '',
  attempt    int,                       -- delivery_attempt, as they sent it
  project_id text,
  payload    jsonb,
  at         timestamptz not null default now()
);
create index if not exists wa_webhook_event_at on public.wa_webhook_event (at desc);

-- ---- somebody wrote to us ------------------------------------------------
create table if not exists public.wa_inbound (
  id           uuid primary key default gen_random_uuid(),
  message_id   text unique,             -- their messageId; the de-duplicator
  phone        text not null default '',
  contact_name text,
  contact_id   text,
  body         text not null default '',
  message_type text,
  campaign     text,
  sent_at      timestamptz,
  raw          jsonb,
  at           timestamptz not null default now()
);
create index if not exists wa_inbound_phone on public.wa_inbound (phone);
create index if not exists wa_inbound_at    on public.wa_inbound (at desc);

-- ---- RLS, per 0061/0062: nothing here is readable by a browser key -------
alter table public.wa_webhook_event enable row level security;
alter table public.wa_inbound       enable row level security;
revoke all on public.wa_webhook_event from public, anon, authenticated;
revoke all on public.wa_inbound       from public, anon, authenticated;

-- ---- the shared secret joins the other AiSensy settings ------------------
update public.integration_setting
   set config = config || jsonb_build_object('webhook_secret', coalesce(config->>'webhook_secret',''))
 where key = 'aisensy';
