-- 0069_offer_documents.sql
--
-- THE CANDIDATE'S FILE (Dr Raghu, 24 Aug 2026): "the resume needs to be kept
-- on record. Later when the employee is created, this also will flow into his
-- google drive folder along with the offer letter and the appointment letter
-- and the notes. Notes can be multiple files. It may even be handwritten."
--
-- Every document belonging to one offer, in one list: the resume, scans of
-- handwritten interview notes, whatever else arrives. Each carries a KIND so
-- that when the person joins, the right ones can be pushed into their Drive
-- folder ("Active - 6001 - Name") without a human sorting them first.
--
-- Stored as jsonb on the offer rather than a table of its own: the list is
-- short, it is only ever read with the offer, and it must travel with the
-- offer when the offer becomes an employee.
--
--   [ { id, name, kind, path, size, mime, at, by, note } ]
--
-- Also: the phone country code, kept apart from the number because we hire
-- in India for now and a bare ten digits is what every other system wants.
--
-- ASCII only, additive, safe to re-run.

alter table public.hrms_offer
  add column if not exists documents    jsonb not null default '[]'::jsonb,
  add column if not exists country_code text default '+91';

comment on column public.hrms_offer.documents is
  'Every file for this candidate: resume, interview notes, signed acceptance. '
  'Each has a kind so the right ones can flow into the Drive folder on joining.';
