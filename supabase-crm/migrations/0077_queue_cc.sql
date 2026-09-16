/*
  0077 — WHO ELSE SEES IT.

  Dr Raghu, 16 Sep 2026: "in the email also make a cc (and mention add more
  with comma)."

  A follow-up often needs the colleague who will actually handle it on the
  thread from the first message, so the handover happens in the open rather
  than as a forward a week later.

  Comma-separated, stored as typed. It is read back into the same box it was
  typed into, so what somebody sees is what will be on the mail.
*/

alter table public.outbound_queue
  add column if not exists cc text;

comment on column public.outbound_queue.cc is
  'Comma-separated addresses copied on the mail. Stored as typed, so the box reads back what will be sent.';
