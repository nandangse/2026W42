-- 0029_my_week.sql
--
-- Two small things My Week needs, and nothing else.
--
-- 1. HOW'S MY DAY. One row per person per day. It is deliberately tiny: five
--    faces and an optional line. The value is not any single day's answer, it
--    is the run of them -- which is why the primary key is (person, date) and
--    a second click the same day CHANGES the answer rather than adding one.
--
-- 2. IMAGE QUOTES. The Drive folder they live in is not public, and enumerating
--    a Drive folder needs an API key even when it is. So the links are held
--    here and pasted in from Admin -- one row per image, one shown per day,
--    the same one for everybody.
--
-- ASCII only, safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. How's my day
-- ---------------------------------------------------------------------------
create table if not exists public.day_mood (
  person_id  uuid not null references public.profiles(id) on delete cascade,
  on_date    date not null,
  -- five, and only five. A ten-point scale invites deliberation; five faces
  -- get answered honestly in the second before somebody thinks about it.
  mood       text not null,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (person_id, on_date),
  constraint day_mood_scale check (mood in ('great', 'good', 'ok', 'low', 'rough'))
);

create index if not exists day_mood_date_idx on public.day_mood (on_date desc);

alter table public.day_mood enable row level security;

-- How somebody says their day is going is theirs. Managers see a team's shape
-- through the API, which walks reports_to; this is the backstop.
drop policy if exists day_mood_own on public.day_mood;
create policy day_mood_own on public.day_mood
  for select to authenticated
  using (person_id = auth.uid() or public.is_admin());

comment on table public.day_mood is
  'How each person said their day was going. One row per person per day; '
  'answering again the same day replaces the answer rather than adding one.';

-- ---------------------------------------------------------------------------
-- 2. Image quotes
-- ---------------------------------------------------------------------------
create table if not exists public.image_quote (
  id         uuid primary key default gen_random_uuid(),
  -- as pasted. A Google Drive share link is converted to a viewable URL when
  -- it is read, so whoever adds one does not have to know the trick.
  url        text not null,
  caption    text,
  active     boolean not null default true,
  sort_order int not null default 0,
  added_by   uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists image_quote_active_idx on public.image_quote (active, sort_order);

alter table public.image_quote enable row level security;

drop policy if exists image_quote_read on public.image_quote;
create policy image_quote_read on public.image_quote
  for select to authenticated
  using (true);

comment on table public.image_quote is
  'Image quotes for My Week. A CACHE of a public Drive folder, refreshed from '
  'Admin. One is chosen per day from the active rows, the same one for '
  'everybody, so a day has a picture rather than a shuffle.';

-- Which folder to read them from. Held as a setting rather than in code so the
-- folder can be changed without a deploy -- and cached into image_quote above,
-- so a bad morning at Google leaves yesterday's pictures working instead of a
-- blank panel.
alter table public.app_settings add column if not exists quote_folder text;

update public.app_settings
   set quote_folder = '18YpET3C1DOgSssADYfB8qTzZdJbJNaqI'
 where id = true and coalesce(quote_folder, '') = '';

comment on column public.app_settings.quote_folder is
  'Google Drive folder id holding the image quotes. Must be shared '
  '"anyone with the link".';
