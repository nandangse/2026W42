-- 0054_idp_audio.sql
--
-- THE RECORDINGS THEMSELVES, KEPT (Dr Raghu, 23 Aug 2026).
--
-- The IDP already turned speech into words. It threw the speech away, which
-- was wrong twice over: the person cannot hear back what they said, and the
-- transcript is the machine's version of them while the audio is them.
--
-- AND THEY CAN ADD MORE. A question is not answered in one breath. Each press
-- of the button adds a recording and adds its words to the box; nothing
-- replaces anything. So this is a LIST of recordings per question, not one.
--
--   { "accountability": [ {path, seconds, at}, ... ], "kpis": [ ... ] }
--
-- The audio lives in the voice-notes bucket under idp/, exactly as the
-- shop-floor notes and the role expectation notes do. The table holds paths.
--
-- ASCII only, additive, safe to re-run.

alter table public.hrms_idp add column if not exists audio jsonb not null default '{}'::jsonb;

comment on column public.hrms_idp.audio is
  'Recordings per question: { questionId: [ {path, seconds, at} ] }. Paths into '
  'the voice-notes bucket under idp/. The audio is never stored in this table. '
  'A list, not one: a question is not answered in one breath.';
