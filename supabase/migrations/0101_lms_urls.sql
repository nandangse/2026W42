-- 0101: THE LMS SPEAKS URLS (Dr Raghu, 29 Aug 2026): genie.nandan.co.in/lms,
-- /lms/<4-digit code> for a lesson, /lms/<two-word-slug> for a library book.
-- Codes are random four digits, slugs are short dashed names — both unique,
-- both stable once given.
--
-- Line comments only. Safe to re-run.

alter table public.lms_lesson add column if not exists code text unique;
alter table public.lms_book add column if not exists slug text unique;
