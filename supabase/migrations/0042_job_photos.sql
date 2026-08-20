-- 0042_job_photos.sql
--
-- Photographs of a job as it is built.
--
-- Production completion is a number somebody types. A photograph is not
-- arguable: it says what the machine looked like on the day, and a row of them
-- in date order is the build history nothing else in Genie holds.
--
-- Each photo carries the COMPLETION AT THE TIME IT WAS TAKEN, not a link to
-- whatever the job says today. The percentage on a job moves; the photo does
-- not. Storing the number beside the picture is what makes the pair mean
-- something in six weeks -- "70% on 12 August" rather than "70%, taken at some
-- point".
--
-- IN STORAGE, NOT IN THE DATABASE. Photographs are the largest thing Genie
-- will ever hold and would dwarf every table in it. The bucket is billed apart
-- from the database; this table holds a path, a caption and a number.
--
-- Dr Raghu's intention is to move these to Google Drive later. Nothing here
-- blocks that: the row keeps a path and a bucket, so a move becomes a copy
-- plus a rewrite of one column rather than a re-modelling.
--
-- Additive and safe to re-run.

create table if not exists public.job_photo (
  id      uuid primary key default gen_random_uuid(),
  job_id  text not null,
  path    text not null,
  /** What it shows. Optional -- a photograph often says it. */
  caption text not null default '',
  /** Production completion on the day it was taken. Frozen on purpose. */
  pct     integer,
  mime    text,
  bytes   bigint,
  /** The day the photo is OF, which is not always the day it was uploaded. */
  taken_on date not null default (now() at time zone 'Asia/Kolkata')::date,
  by      text,
  at      timestamptz not null default now(),
  constraint job_photo_pct_range check (pct is null or (pct >= 0 and pct <= 100))
);

comment on table public.job_photo is
  'The build history of a job in pictures. Files live in the job-photos bucket; pct is frozen at the moment of the photo.';

create index if not exists job_photo_job_idx on public.job_photo (job_id, taken_on desc, at desc);

alter table public.job_photo enable row level security;

-- Everybody signed in looks at them. A photo nobody can see is not evidence.
drop policy if exists job_photo_read on public.job_photo;
create policy job_photo_read on public.job_photo
  for select to authenticated
  using (true);

-- Writes go through /api/job-photo with the service key, which is what checks
-- the caller and cleans up an object whose row failed to save.

-- Private, like the voice notes: these are photographs of customer equipment.
insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', false)
on conflict (id) do nothing;
