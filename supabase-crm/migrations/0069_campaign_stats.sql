/*
  0069 — WHAT EACH CAMPAIGN ACTUALLY DID, COUNTED IN THE DATABASE.

  Dr Raghu, 15 Sep 2026, on the campaign list: "Date - Campaign - Subject -
  Lists - Contacts - Sent - Delivered (%) - Opened (%) - Replied (%) - By -
  Bounced - U/s", with the same figures as cards across the top, obeying the
  filters.

  TWO THINGS ARE NEEDED FOR THAT, and only one of them is arithmetic.

  1. DELIVERED HAD NO PLACE TO LIVE. `status` is one value per row and the
     states are exclusive — a row is 'sent' or 'opened' or 'bounced'. A
     delivery is not a state, it is a fact that arrives later and sits beside
     whatever the row goes on to become, so it gets its own column. Resend
     already knows it: the first employee mail read back on 14 Sep carried
     last_event "delivered". We were simply never listening. The webhook now
     takes email.delivered and stamps it here.

  2. COUNTING IN THE API DOES NOT SCALE. PostgREST cannot GROUP BY, so the
     honest choices are to drag every mk_send row into the route and tally it
     in JavaScript, or to ask the database the question it is good at. At
     5–10,000 sends a day — 240,000 a month — the first is absurd: a list of
     a dozen campaigns would read a quarter of a million rows to print twelve
     numbers. So the aggregate is a view, read in one query.

  WHAT IS STILL NOT MEASURED, and is not being invented: REPLIED. Nothing in
  Genie sees an answer. Replies go to sales@nandan.co.in, which is a Google
  mailbox the CRM can pull from, so it is buildable — but it is inbound mail
  matching, not a column, and until it exists that figure must read "not
  measured" rather than nought. A nought would say nobody answered.
*/

alter table public.mk_send
  add column if not exists delivered_at timestamptz;

comment on column public.mk_send.delivered_at is
  'When the provider confirmed delivery (Resend email.delivered). Independent of status: a row can be delivered and later opened, or delivered and later bounced.';

create index if not exists mk_send_delivered_idx on public.mk_send (campaign_id, delivered_at);

/*
  One row per campaign. `sent` counts every row that actually left — a row
  that bounced or unsubscribed was necessarily sent first, while 'skipped'
  (already unsubscribed when its turn came) and 'failed' never went.
*/
create or replace view public.mk_campaign_stat
with (security_invoker = on) as
select
  campaign_id,
  count(*)::int                                                          as contacts,
  count(*) filter (where status = 'queued')::int                         as queued,
  count(*) filter (where status in ('sent','opened','bounced','unsubscribed'))::int as sent,
  count(*) filter (where delivered_at is not null)::int                  as delivered,
  count(*) filter (where status = 'opened')::int                         as opened,
  count(*) filter (where status = 'bounced')::int                        as bounced,
  count(*) filter (where status = 'unsubscribed')::int                   as unsubscribed,
  count(*) filter (where status = 'failed')::int                         as failed,
  count(*) filter (where status = 'skipped')::int                        as skipped
from public.mk_send
group by campaign_id;

comment on view public.mk_campaign_stat is
  'Per-campaign tallies for the Email Marketing list. security_invoker = on, so it can see no more than the caller could.';

revoke all on public.mk_campaign_stat from anon;
