-- 0115_job_mandays.sql
--
-- APPROX MANDAYS (Dr Raghu, 2 Sep 2026: "in the jobs make a fied called
-- Approx Mandays — B/O, 0-50, 51-100, 101-200, 201-300, 301-400, 401-500,
-- 501-600, 601-700, 700+. Put it next to Pending Payment").
--
-- A BAND, NOT A NUMBER, and stored as the band. Nobody knows a job is 237
-- mandays; they know it is a two-to-three-hundred job, and a spurious 237
-- would be planned against as though it were measured. B/O is the honest
-- answer for a bought-out job that Nandan does not build at all -- which is
-- not zero mandays, and must not average in as though it were.
--
-- TEXT rather than an enum: the bands are Raghu's and he may re-cut them.
-- A check constraint would turn a re-cut into a migration and a deploy.
alter table public.jobs add column if not exists mandays text;

comment on column public.jobs is
  'mandays: Genie''s own field -- the ERP has no band for it. B/O | 0-50 | 51-100 | 101-200 | 201-300 | 301-400 | 401-500 | 501-600 | 601-700 | 700+';
