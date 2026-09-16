/*
  0075 — THE TAG, AND THE MEETING THAT COUNTS.

  Dr Raghu, 16 Sep 2026: "also make the tag ... add this to interaction so it
  adds to my meeting quota :) with the tag. Last filled tag continues."

  TWO THINGS, and the second is the one that makes the app worth opening.

  A meeting recorded in People I Met but nowhere else is a private note. The
  CRM already counts interactions — 974 follow-up calls, 3 visits — and that
  count is what a month is judged on. So every person met becomes an
  interaction of kind "Meeting" as well, and the work done at a show shows up
  where the work is counted instead of in a side list nobody totals.

  IT IS A LINK, NOT A COPY. met_person.interaction_id remembers the row it
  made, so editing the context updates that same interaction rather than
  leaving a second, staler one behind. Forty people met at a show must be
  forty interactions, not eighty.

  THE TAG IS A PLAIN LIST OF WORDS, deliberately. crm_tag exists for the
  formal taxonomy on companies and people; this is the label on a day's work
  — "GSE Expo 2026", "Met" — typed once at a stand and carried to every card
  after it. A taxonomy would need maintaining. A label does not, and anything
  that needs maintaining at a trade show does not get maintained.
*/

alter table public.met_person
  add column if not exists tags           text[] not null default '{}',
  add column if not exists interaction_id uuid references public.interaction(id) on delete set null;

alter table public.interaction
  add column if not exists tags text[] not null default '{}';

create index if not exists met_person_tags_idx  on public.met_person  using gin (tags);
create index if not exists interaction_tags_idx on public.interaction using gin (tags);

comment on column public.met_person.tags is
  'The label on a day''s work — the show, the trip. Carried to the next person met, so it is typed once.';
comment on column public.met_person.interaction_id is
  'The interaction this meeting created, so an edit updates it rather than leaving a staler twin.';
comment on column public.interaction.tags is
  'Same labels as met_person, so a month''s meetings can be counted by show.';

/*
  THE SELFIE (Dr Raghu, 16 Sep 2026: "also make a place for selfie photo.
  this will also be part of whatsapp message").

  A photograph of the two of them at the stand does more than any sentence
  can. It is the proof that the conversation happened, and it arrives on
  WhatsApp as a picture of a person the recipient met an hour ago rather than
  as a message from a company.

  It rides in the SAME bucket as the visiting cards, because a selfie and a
  card are the same kind of thing: a private image belonging to one record,
  read back through a signed URL that expires. Nothing here is public.
*/
alter table public.met_person
  add column if not exists selfie_path text;

comment on column public.met_person.selfie_path is
  'Path inside the private "cards" bucket. Read back through a signed URL; never public.';
