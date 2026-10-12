-- 0224 — LEADERS COUNCIL: A THUMBS UP, A HEART AND COMMENTS ON EVERY CHECK-IN (Genie 6.4.0.15)
--
-- Dr Raghu, 12 Oct 2026, on the check-in cards: "in the checkins also give a
-- place to react to it with a thumbs up or heart. also comment."
--
-- The council's reaction and comment tables take one more kind, 'checkin',
-- and the reaction one more value, 'heart'. One reaction per leader per
-- check-in, as everywhere else on the council.

alter table public.lc_reaction drop constraint if exists lc_reaction_ref_kind_check;
alter table public.lc_reaction add constraint lc_reaction_ref_kind_check
  check (ref_kind in ('ssc','problem','solution','checkin'));
alter table public.lc_reaction drop constraint if exists lc_reaction_value_check;
alter table public.lc_reaction add constraint lc_reaction_value_check
  check (value in ('up','down','question','heart'));

alter table public.lc_comment drop constraint if exists lc_comment_ref_kind_check;
alter table public.lc_comment add constraint lc_comment_ref_kind_check
  check (ref_kind in ('problem','ssc','meeting','presentation','section','checkin'));

insert into public.feature_request (title, body, want, status, note, by)
select 'Leaders Council — thumbs up, heart and comments on each check-in', '<p>"in the checkins also give a place to react to it with a thumbs up or heart. also comment." (Dr Raghu, 12 Oct 2026.)</p>', 'must', 'done', 'Shipped as Genie 6.4.0.15.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title like 'Leaders Council — thumbs up, heart and comments on each check-in%');

insert into public.genie_migration (name) values ('0224_lc_checkin_reactions') on conflict (name) do nothing;
