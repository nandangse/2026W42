-- 0229 — LMS: THE SERVICE REPAIRS LIBRARY (Genie 6.9.0.0)
--
-- Dr Raghu, 12 Oct 2026: "In the LMS, make one more library called Service
-- Repairs. This has to be accessible only to the service team and also to the
-- leaders' council. Within that, we'll start making subsections about videos
-- … This LMS library can be seen in our Seva also, so that all the service
-- people can see it there, and Yash can start adding small videos."
--
-- The audience is two groups the LMS works out for itself: Service (on the
-- HRMS roll in the Service department) and Leaders Council (profiles.lc). No
-- one has to be ticked in to a group by hand.

insert into public.lms_book (id, name, blurb, icon, color, sort_order, audience, slug)
values ('service-repairs', 'Service Repairs', 'How we find and fix faults on site — short videos by the service team, section by section.', '🔧', '#0E7490', 60, '{Service,"Leaders Council"}', 'service-repairs')
on conflict (id) do update set audience = excluded.audience, slug = coalesce(public.lms_book.slug, excluded.slug);

insert into public.feature_request (title, body, want, status, note, by)
select 'LMS — Service Repairs library, for the service team and the Leaders Council, also in Seva', '<p>"In the LMS, make one more library called Service Repairs … accessible only to the service team and also to the leaders'' council … subsections about videos … seen in our Seva also … Yash can start adding small videos." (Dr Raghu, 12 Oct 2026.)</p>', 'must', 'done', 'Shipped as Genie 6.9.0.0.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title like 'LMS — Service Repairs library%');

insert into public.genie_migration (name) values ('0229_lms_service_repairs') on conflict (name) do nothing;
