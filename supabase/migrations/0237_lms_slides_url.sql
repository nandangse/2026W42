-- 0237 — LMS: A GOOGLE SLIDES / DOC LINK ON A LESSON (Genie 6.10.2.4)
--
-- Dr Raghu, 15 Oct 2026: "In the LMS, also put in one more field, which is
-- going to be the Google Slides link or the doc link that will show that item
-- in view mode … so that, in the display, it can be seen as Google Slides
-- itself."

alter table public.lms_lesson add column if not exists slides_url text;

-- the five Nandan TOC decks carry their links from the day they were made
update public.lms_lesson set slides_url = pdf_url
 where slides_url is null and title like 'Nandan TOC %' and pdf_url is not null;

insert into public.feature_request (title, body, want, status, note, by)
select 'LMS — a Google Slides / Doc link on every lesson, shown as the slides themselves', '<p>"In the LMS, also put in one more field, which is going to be the Google Slides link or the doc link that will show that item in view mode. The file I gave, please make sure that you put them into that so that, in the display, it can be seen as Google Slides itself." (Dr Raghu, 15 Oct 2026.)</p>', 'must', 'done', 'Shipped as Genie 6.10.2.4.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title like 'LMS — a Google Slides / Doc link%');

insert into public.genie_migration (name) values ('0237_lms_slides_url') on conflict (name) do nothing;
