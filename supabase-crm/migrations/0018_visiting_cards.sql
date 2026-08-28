-- 0018_visiting_cards.sql
--
-- ADD VISITING CARD (Dr Raghu, 28 Aug 2026): a card photographed at a meeting
-- becomes a Contact and a Company in one motion. The image is KEPT -- the
-- card is the evidence the record was typed from, and the extraction is
-- stored beside what it produced so a wrong field can be traced to the
-- picture instead of argued about (the resume reader's rule, applied again).
--
-- ASCII only, additive, safe to re-run.

create table if not exists visiting_card (
  id          uuid primary key default gen_random_uuid(),
  image_path  text not null,
  extracted   jsonb,
  company_id  uuid,
  person_id   uuid,
  added_by    text not null,
  added_at    timestamptz not null default now()
);

create index if not exists visiting_card_by on visiting_card (added_by, added_at desc);

comment on table visiting_card is
  'Scanned visiting cards: the image, what was read off it, and the company '
  'and contact it became.';

insert into storage.buckets (id, name, public)
values ('cards', 'cards', false)
on conflict (id) do nothing;
