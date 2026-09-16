/*
  0074 — PEOPLE I MET.

  Dr Raghu, 16 Sep 2026: "in sales crm make an app called people i met. I
  should be able to add from database or from card or add alone. Add a field
  to add context. With each contact have option for personalised email and
  message ... the queue on wa also should be made so it can be sent manually
  from my own wa."

  THE CONTEXT IS THE WHOLE RECORD. A name and a company are already in the
  CRM and already useless on their own; what decides whether a follow-up is
  worth sending is the thing nobody writes down — which hall, what was said,
  what was promised. By the evening they are a face half remembered. By next
  week they are nobody.

  THREE DOORS IN, one row out. From the database when they are already known,
  from a scanned card, or typed from nothing at a stand with no card at all.
  Whichever door, the row carries the same context and can produce the same
  two messages.

  A PERSON IS OPTIONAL ON PURPOSE. Somebody met at a show with no card and no
  e-mail is still somebody met, and refusing to record them until they have a
  CRM record is how the record never gets made. person_id fills in later if
  they become a contact.

  The messages themselves do not live here — they go to outbound_queue, which
  already knows how to hold an e-mail or a WhatsApp, manual or automatic, and
  already records what was sent and when. One queue, not a second one.
*/

create table if not exists public.met_person (
  id           uuid primary key default gen_random_uuid(),

  -- where it came from, and what it is attached to
  source       text not null default 'typed' check (source in ('database', 'card', 'typed')),
  person_id    uuid references public.person(id) on delete set null,
  company_id   uuid references public.company(id) on delete set null,
  card_id      uuid,

  -- what we know, whether or not there is a person record behind it
  name         text not null,
  company_name text,
  job_title    text,
  email        text,
  phone        text,

  -- the point of the whole thing
  context      text,
  met_on       date not null default (now() at time zone 'Asia/Kolkata')::date,
  event        text,
  /* One of the six the follow-up turns on: supply, partnership, sourcing,
     referral, keep_warm, wrong_person. Never written into the message — it
     decides the last line and whether there is an ask at all. */
  reason       text not null default 'keep_warm'
                 check (reason in ('supply', 'partnership', 'sourcing', 'referral', 'keep_warm', 'wrong_person')),

  added_by     text not null,
  added_at     timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists met_person_mine on public.met_person (added_by, met_on desc);
create index if not exists met_person_event on public.met_person (event);
create index if not exists met_person_person on public.met_person (person_id);

comment on table public.met_person is
  'People met at shows and meetings: the context nobody else writes down, and the follow-ups it produces.';
comment on column public.met_person.context is
  'What the card does not say — where you met, what was said, what was promised. This is the record.';

alter table public.met_person enable row level security;

/*
  The queue learns which meeting a message belongs to, so a person's screen
  can show what is already written and waiting instead of offering to write
  the same message twice.
*/
alter table public.outbound_queue
  add column if not exists met_id uuid references public.met_person(id) on delete cascade;

create index if not exists outbound_queue_met on public.outbound_queue (met_id, channel, status);
