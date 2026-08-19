-- 0040_on_floor_voice.sql
--
-- The On Floor page: who owns each job, and voice notes against it.
--
-- 1. QUALITY OWNER
--
--    jobs.own is the Planning Owner -- the person who owns the DATE. Quality is
--    a different person with a different answer, and today the only way to know
--    who is to ask. A second column rather than a shared "owners" text field,
--    because two names in one box cannot be filtered, counted or notified.
--
-- 2. VOICE NOTES
--
--    Somebody standing at a machine will say what is happening. They will not
--    type it. So: record, and keep BOTH the recording and its words -- the
--    recording because tone carries what the transcript loses, the text because
--    nobody scrubs through ninety seconds of audio to find out whether the
--    part arrived.
--
--    THREE PER JOB, oldest dropped. Not a limitation -- the point. An unbounded
--    log of voice notes is a thing nobody listens to; the last three are what
--    is happening now. Enforced in the API, which knows the order.
--
--    THE AUDIO IS NOT IN THE DATABASE. It goes in a Storage bucket, which is
--    object storage billed separately -- the table holds a path, a transcript
--    and a summary, all of them text. Three notes on every one of 116 jobs is
--    well under a hundred megabytes of objects, and not one row heavier here.
--
-- Additive and safe to re-run.

alter table public.jobs add column if not exists quality_owner text;

comment on column public.jobs.quality_owner is
  'Who owns QUALITY on this job. jobs.own owns the date; this is a different question and usually a different person.';

create table if not exists public.job_voice_note (
  id         uuid primary key default gen_random_uuid(),
  job_id     text not null,
  /** Path inside the voice-notes bucket. The audio itself is never stored here. */
  audio_path text,
  /** Seconds. Shown before somebody commits to listening. */
  seconds    integer,
  /** What was said, as the browser heard it. May be empty if dictation was off. */
  transcript text not null default '',
  /** One line, so the table can be read without playing anything. */
  summary    text not null default '',
  by         text,
  at         timestamptz not null default now()
);

comment on table public.job_voice_note is
  'Voice notes against a job. Latest three per job are kept; the audio lives in Storage.';

create index if not exists job_voice_note_job_idx on public.job_voice_note (job_id, at desc);

alter table public.job_voice_note enable row level security;

-- Everyone signed in reads them: a note nobody can hear is a note not worth
-- recording. Writes go through /api/voice-note with the service key, which is
-- what enforces the three-per-job rule -- so there is deliberately no insert
-- policy for a browser to go around it.
drop policy if exists job_voice_note_read on public.job_voice_note;
create policy job_voice_note_read on public.job_voice_note
  for select to authenticated
  using (true);

-- The bucket. Private: these are recordings of people talking about customers,
-- so they are served through signed links rather than left open on a URL that
-- would work for anybody who guessed it.
insert into storage.buckets (id, name, public)
values ('voice-notes', 'voice-notes', false)
on conflict (id) do nothing;
