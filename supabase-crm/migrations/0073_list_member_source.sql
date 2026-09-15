/*
  0073 — WHERE THIS NAME CAME FROM.

  Dr Raghu, 15 Sep 2026, uploading Aahar 2024.xlsx into "Various Exhibition
  Visitors 2024-26": "in list and upload add a source and keep the name of
  the file in it."

  A list called "Various Exhibition Visitors 2024-26" is, by its own name,
  several shows in one. Once four files have gone into it, nobody can say
  which of the four a given name arrived on — and that is exactly the
  question somebody asks when a reply comes back: was this Aahar, or Lisbon?

  IT BELONGS ON THE MEMBERSHIP, NOT ON THE PERSON. The same person can turn
  up at Aahar in 2024 and again at the Lisbon expo in 2026; they are one
  contact with two reasons to be on the list, and a column on `person` could
  only ever hold the last one.

  `person.source` stays what it is — 'crm' or 'apollo', the system that
  created the record. This is a different question: not which software made
  the row, but which file put this name on this list.
*/

alter table public.mk_list_member
  add column if not exists source text;

comment on column public.mk_list_member.source is
  'What put this person on this list — usually the uploaded file name, editable at upload time.';

create index if not exists mk_list_member_source_idx on public.mk_list_member (list_id, source);
