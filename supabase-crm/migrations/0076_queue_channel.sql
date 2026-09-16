/*
  0076 — WHICH ADDRESS IT LEAVES FROM.

  Dr Raghu, 16 Sep 2026, on the follow-up draft: "in this also choose channel
  to send!!!"

  Until now a queued e-mail could only go one way: through the sender's own
  connected Gmail. That is the right default for a note to somebody met an
  hour ago — it arrives from a person, in a thread they can reply to — but it
  is not the only case. A follow-up from the GSE brand belongs on the GSE
  domain, and Marketing already keeps those addresses and their keys in
  mk_channel.

  So the queue row remembers the channel it was written for. Null means what
  it has always meant: the sender's own Gmail.

  WHAT A PERSONAL FOLLOW-UP MUST NEVER CARRY, whichever address it leaves
  from: a tracking pixel, an unsubscribe footer, a rewritten link. Those
  belong to a campaign. This is one person writing to one person they just
  met, and the moment it carries marketing furniture it stops being that and
  the whole premise collapses.
*/

alter table public.outbound_queue
  add column if not exists channel_id uuid references public.mk_channel(id) on delete set null;

comment on column public.outbound_queue.channel_id is
  'The sending address from mk_channel. Null = the sender''s own connected Gmail, which is the default for a personal follow-up.';

create index if not exists outbound_queue_channel on public.outbound_queue (channel_id);
