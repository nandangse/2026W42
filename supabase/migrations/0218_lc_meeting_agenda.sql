-- 0218 — LEADERS COUNCIL: THE AGENDA AND THE PRE-READING STAND APART FROM THE MINUTES (Genie 6.4.0.5)
--
-- Dr Raghu, 10 Oct 2026: "have a top slot split into two: left put all the
-- content, right show agenda. Once written can be collapsed. Below, message
-- will be full."
alter table public.lc_meeting add column if not exists agenda  text;   -- sanitized HTML, the right half
alter table public.lc_meeting add column if not exists reading text;   -- sanitized HTML, the left half: links, references, what to read before
insert into public.genie_migration (name) values ('0218_lc_meeting_agenda') on conflict (name) do nothing;
