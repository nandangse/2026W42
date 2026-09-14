/*
  0068 — ONE-CLICK UNSUBSCRIBE, AND A CHOICE INSTEAD OF A CLIFF.

  Dr Raghu, 15 Sep 2026: "yes one click unsubscribe is a must, we should have
  an unsubscribe link at the bottom which be chosen as a choice."

  TWO SEPARATE THINGS, and they are not alternatives.

  ONE-CLICK is the header pair RFC 8058 defines — List-Unsubscribe and
  List-Unsubscribe-Post. The mail client shows its own Unsubscribe button and
  POSTs to us; the reader never opens the message. Google has required this of
  anybody sending more than 5,000 a day to Gmail since 2024, and at the 5–10k
  a day being planned it is not optional. It always unsubscribes outright:
  a header is not the place to offer options.

  THE FOOTER LINK is for the reader who is inside the message, and it now
  opens a choice rather than a trapdoor. "Pause for three months" keeps a
  relationship that "unsubscribe" ends for ever, and — this is the part that
  matters commercially — someone who is given an easy way out does not press
  "report spam" instead. A complaint costs far more than an opt-out: it is
  counted against the sending domain by every mailbox provider watching.

  So `until` carries the whole model. NULL means gone for good, which is what
  every existing row means and why the default is right. A date means
  suppressed until then, after which they become mailable again on their own.

  `show_unsub_link` lets a campaign decide whether the visible footer link is
  drawn. It defaults to true and should stay true: the one-click header is
  what Google wants, but a visible opt-out in the body is what CAN-SPAM
  requires, and they are different obligations.
*/

alter table public.mk_unsubscribe
  add column if not exists until timestamptz;

comment on column public.mk_unsubscribe.until is
  'NULL = suppressed for good. A date = suppressed until then, then mailable again.';

create index if not exists mk_unsubscribe_until_idx on public.mk_unsubscribe (until);

alter table public.mk_campaign
  add column if not exists show_unsub_link boolean not null default true;

comment on column public.mk_campaign.show_unsub_link is
  'Draw the visible unsubscribe link in the footer. The List-Unsubscribe header is sent regardless.';
