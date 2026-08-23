-- 0059_idp_final.sql
--
-- THE LAST PAGE OF THE IDP (Dr Raghu, 23 Aug 2026): the thank-you, the
-- salary table, the compulsory voice reply about cost and value, and any
-- documents the person wants to attach.
--
-- One column. The voice reply reuses the per-question audio jsonb that 0054
-- built (under the id "final_voice"), and the written extras reuse answers.
-- Only the ATTACHMENTS need a home of their own: they are documents rather
-- than recordings, and mixing the two in one list would make every reader
-- of either check which it is holding.
--
-- The files themselves go to the voice-notes bucket under idp/<id>/files/.
-- The table holds paths, names and sizes -- never bytes.
--
-- ASCII only, additive, safe to re-run.

alter table public.hrms_idp add column if not exists attachments jsonb not null default '[]'::jsonb;

comment on column public.hrms_idp.attachments is
  'Documents the person attached on the final page: [ {path, name, size, at} ]. '
  'Paths into the voice-notes bucket under idp/<id>/files/. Never bytes.';
