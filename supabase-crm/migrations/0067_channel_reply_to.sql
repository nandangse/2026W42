/*
  0067 — WHERE AN ANSWER GOES.

  Dr Raghu, 14 Sep 2026: "make the default reply to as sales@nandan.co.in
  which will make it useful for me too. later once more mailboxes are
  available we can use that too."

  Until now the marketing send set only a From header, so every reply went
  back to the sending address. For the Resend channel that address is
  raghu@nandangse.com — a domain whose MX points at Zoho, not at the Google
  Workspace mailbox anybody actually reads. Replies were arriving in a room
  with nobody in it.

  A Reply-To header separates the two jobs: the mail goes out branded from
  the domain Resend is verified for, and the answer comes back to a mailbox
  that is read and that the CRM can pull from.

  The column is per-channel and editable, so when more mailboxes exist each
  channel can point its answers wherever it should. The default is only a
  default.
*/

alter table public.mk_channel
  add column if not exists reply_to text;

comment on column public.mk_channel.reply_to is
  'Where answers should go, when that is not the sending address. Blank = reply to the sending address.';

-- Every channel that has not been told otherwise answers to sales@.
update public.mk_channel
   set reply_to = 'sales@nandan.co.in'
 where reply_to is null;

alter table public.mk_channel
  alter column reply_to set default 'sales@nandan.co.in';
