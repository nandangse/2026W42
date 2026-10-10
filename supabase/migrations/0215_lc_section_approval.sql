-- 0215 — LEADERS COUNCIL: PRINCIPLES ARE WRITTEN BY THE COUNCIL, APPROVED BY THE OWNER (Genie 6.4.0.1)
--
-- Dr Raghu, 10 Oct 2026: "next to each show approved by and date. Inside each
-- have comments and the edit by raghu or the one who wrote."
--
-- A section (a principle, a philosophy page) now carries who wrote it and who
-- approved it; the council talks under it in lc_comment.

alter table public.lc_section add column if not exists approved_by text;
alter table public.lc_section add column if not exists approved_at timestamptz;

alter table public.lc_comment drop constraint if exists lc_comment_ref_kind_check;
alter table public.lc_comment add constraint lc_comment_ref_kind_check
  check (ref_kind in ('problem','ssc','meeting','presentation','section'));

insert into public.genie_migration (name) values ('0215_lc_section_approval') on conflict (name) do nothing;
