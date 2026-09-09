-- 0064 — THE BROADCAST: one document per send, and the rows under it.
--
-- Dr Raghu, 9 Sep 2026: "in the contacts we will apply filter etc, then
-- after choosing make the select of the contacts, then click the button on
-- top which is Send Email / Send WA ... this will go in a queue in a
-- separate document related to Communication ... can it also put it into
-- the particular contacts as well as deals communication?"
--
-- WHY A DOCUMENT AND NOT JUST QUEUE ROWS. Forty messages sent together are
-- ONE act — one template, one attachment, one decision, one person
-- answering for it. Spread across forty queue rows there is nothing to open
-- afterwards and nothing to say "this went to these forty on Tuesday".
-- Every row therefore points back at its broadcast, and the broadcast
-- carries what was decided once: the channel, the template, the body as it
-- was written with its {{variables}} still in it, and the attachments.
--
-- WHY THE ROWS STAY IN THE EXISTING QUEUES. outbound_queue and wa_queue
-- already know how to send, throttle, retry and report. A broadcast that
-- invented a third queue would be a third thing to keep in step with
-- AiSensy, Periskope and Gmail. It adds a column, not a road.
--
-- Line comments only. Safe to re-run.

create table if not exists public.broadcast (
  id            uuid primary key default gen_random_uuid(),
  channel       text not null check (channel in ('email','whatsapp')),
  title         text not null default '',
  -- The message AS WRITTEN, variables unresolved. Each row keeps its own
  -- rendered copy; this is the thing a person edits and re-reads.
  subject       text,
  body          text not null default '',
  template_name text,
  -- AiSensy sends a CAMPAIGN, not prose. Kept beside the body rather than
  -- instead of it, so the same document reads sensibly on either road.
  campaign      text,
  params        jsonb,
  attachments   jsonb not null default '[]'::jsonb,
  -- How many were picked, and how many could actually be written to.
  picked        int not null default 0,
  queued        int not null default 0,
  skipped       int not null default 0,
  -- Why each skipped contact was skipped, so a short queue is explained
  -- rather than merely noticed.
  skip_note     jsonb not null default '[]'::jsonb,
  status        text not null default 'queued'
                check (status in ('draft','queued','sending','done','cancelled')),
  created_by    text not null default '',
  created_at    timestamptz not null default now()
);
create index if not exists broadcast_recent on public.broadcast (created_at desc);

alter table if exists public.outbound_queue
  add column if not exists broadcast_id uuid references public.broadcast(id) on delete set null,
  -- outbound_queue was built before deals existed on it. A broadcast has to
  -- be able to land on the deal as well as the contact.
  add column if not exists opportunity_id uuid,
  add column if not exists attachments jsonb;
alter table if exists public.wa_queue
  add column if not exists broadcast_id uuid references public.broadcast(id) on delete set null;

create index if not exists outbound_queue_broadcast on public.outbound_queue (broadcast_id);
create index if not exists wa_queue_broadcast       on public.wa_queue (broadcast_id);

comment on table public.broadcast is
  'One send to many contacts, as a single document. The messages themselves '
  'live in outbound_queue / wa_queue and point back here.';

-- RLS, per 0061/0062: nothing here is readable by a browser key.
alter table public.broadcast enable row level security;
revoke all on public.broadcast from public, anon, authenticated;
