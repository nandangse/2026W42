/*
  0071 — WHERE YOU MET THEM.

  Dr Raghu, 15 Sep 2026: "also make a textbox in that which will give me
  context. Call it context. Also tag make it so that can add a tag. By
  default show the last ones. eg 'GSE Expo 2026' 'Met'. I'll put two for all
  the cards I meet today, next cards will also be the same."

  A card records what is PRINTED on it. What is never printed is the only
  thing that will matter in six months: which hall, which stand, what was
  said, what was promised. Without it a scan becomes a name nobody can place
  — and a stack of forty cards from one show is forty names nobody can place.

  So the context is typed once and carried. The tags are the same thought in
  a form the CRM can filter on: "GSE Expo 2026" finds the show, "Met" says
  this was a hand shaken and not a list bought.

  The tags themselves already exist — crm_tag and crm_tag_link from 0025 —
  and are reused rather than duplicated here. Only the sentence needed a home.
*/

alter table public.visiting_card
  add column if not exists context text;

comment on column public.visiting_card.context is
  'What the card does not say: where they were met, what was discussed, what was promised. Typed by the person who took the card.';
