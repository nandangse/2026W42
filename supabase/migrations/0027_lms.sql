-- 0027_lms.sql
--
-- The Learning Management section.
--
-- The shape, and why it is this shape:
--
--   A LESSON IS NOT OWNED BY A BOOK. "Use of Digital Tools" and "Design
--   Training" both want the same CAD lesson, and copying it means two lessons
--   that drift apart until one is wrong. So lesson-in-book is its own table,
--   and the SECTION a lesson sits in lives there too -- the same lesson can be
--   filed under "Basics" in one book and "Refresher" in another.
--
--   PROGRESS IS PER PERSON, PER LESSON. Status, the date it was finished, the
--   minutes it took and what the person actually wrote down are one row. That
--   row is the unit the IDP adds up.
--
--   WHAT SOMEBODY LEARNED IS NOT OPTIONAL. A lesson cannot be marked complete
--   without at least fifty words in their own words. A tick box records
--   attendance; fifty words record learning, and the whole point of this
--   section is that the second one ends up in the IDP.
--
--   TRAINING TAKEN ELSEWHERE STILL COUNTS. lms_extra is where a course, a
--   seminar or a site visit goes, so a person's total is their real total and
--   not just the part Genie happened to publish.
--
-- ASCII only, and safe to re-run.

-- ---------------------------------------------------------------------------
-- Books -- the shelves
-- ---------------------------------------------------------------------------
create table if not exists public.lms_book (
  id         text primary key,          -- stable slug, e.g. 'wcm-kaizen'
  name       text not null,
  blurb      text,
  icon       text,                      -- one emoji, shown on the shelf
  color      text not null default '#1B3A5C',
  sort_order int  not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Sections inside a book
-- ---------------------------------------------------------------------------
create table if not exists public.lms_section (
  id         uuid primary key default gen_random_uuid(),
  book_id    text not null references public.lms_book(id) on delete cascade,
  name       text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists lms_section_book_idx on public.lms_section (book_id, sort_order);

-- ---------------------------------------------------------------------------
-- Lessons -- authored once, shelved anywhere
-- ---------------------------------------------------------------------------
create table if not exists public.lms_lesson (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  -- the body. Markdown, so it can be written in a text box and still carry
  -- headings, lists and links without an editor nobody asked for.
  content     text not null default '',
  description text not null default '',
  -- a PDF is a first-class body, not a link buried in the text: handbooks and
  -- ISO documents ARE pdfs, and this is the field that embeds one
  pdf_url     text,
  -- YouTube or a Drive share link. The player is rebuilt in the app so the
  -- viewer gets play, pause, forward and the clock and nothing else.
  video_url   text,
  -- how long the lesson should take. The minutes a person actually banks are
  -- on their progress row, because those are two different facts.
  minutes     int not null default 0,
  active      boolean not null default true,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint lms_lesson_minutes_sane check (minutes >= 0 and minutes <= 10000)
);

-- ---------------------------------------------------------------------------
-- Which books a lesson appears in, and where inside each
-- ---------------------------------------------------------------------------
create table if not exists public.lms_lesson_book (
  lesson_id  uuid not null references public.lms_lesson(id) on delete cascade,
  book_id    text not null references public.lms_book(id)   on delete cascade,
  -- null means "loose in the book", which is a real state: a lesson lands in a
  -- book before anybody has decided which section it belongs to
  section_id uuid references public.lms_section(id) on delete set null,
  sort_order int not null default 0,
  primary key (lesson_id, book_id)
);
create index if not exists lms_lesson_book_book_idx on public.lms_lesson_book (book_id, sort_order);

-- ---------------------------------------------------------------------------
-- Progress -- one row per person per lesson
-- ---------------------------------------------------------------------------
create table if not exists public.lms_progress (
  person_id    uuid not null references public.profiles(id) on delete cascade,
  lesson_id    uuid not null references public.lms_lesson(id) on delete cascade,
  status       text not null default 'planned',
  completed_on date,
  -- their own words. The fifty-word floor is enforced in the API, where the
  -- message can explain itself; the constraint here is the backstop.
  learning     text not null default '',
  -- minutes this person actually spent, which may not be the lesson's estimate
  minutes      int not null default 0,
  -- who put it on their plan: 'genie', 'self', or an admin's name
  planned_by   text,
  updated_at   timestamptz not null default now(),
  primary key (person_id, lesson_id),
  constraint lms_progress_status check (status in ('planned', 'in_progress', 'completed')),
  constraint lms_progress_minutes_sane check (minutes >= 0 and minutes <= 10000),
  -- completed means finished: a date and something written down
  constraint lms_progress_complete_is_complete
    check (status <> 'completed' or (completed_on is not null and length(btrim(learning)) > 0))
);
create index if not exists lms_progress_person_idx on public.lms_progress (person_id, status);
create index if not exists lms_progress_lesson_idx on public.lms_progress (lesson_id);

-- ---------------------------------------------------------------------------
-- Training taken outside Genie
-- ---------------------------------------------------------------------------
create table if not exists public.lms_extra (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references public.profiles(id) on delete cascade,
  title      text not null,
  provider   text,
  on_date    date,
  minutes    int not null default 0,
  learning   text not null default '',
  created_at timestamptz not null default now(),
  constraint lms_extra_minutes_sane check (minutes >= 0 and minutes <= 100000)
);
create index if not exists lms_extra_person_idx on public.lms_extra (person_id, on_date desc);

-- ---------------------------------------------------------------------------
-- The Learning Plan -- one per person, written by Genie
-- ---------------------------------------------------------------------------
create table if not exists public.lms_plan (
  person_id    uuid primary key references public.profiles(id) on delete cascade,
  plan         text not null default '',
  -- the reasoning Genie gave, kept beside the plan so a person can see why
  -- these lessons and not others
  rationale    text not null default '',
  generated_at timestamptz not null default now(),
  generated_by text
);

-- ---------------------------------------------------------------------------
-- The fifteen books, as given. Re-running never overwrites an edited name.
-- ---------------------------------------------------------------------------
insert into public.lms_book (id, name, icon, color, sort_order, blurb) values
  ('handbook',   'Nandan Employee Handbook', 'BK', '#16232F',  10, 'How this company works, and what it expects.'),
  ('wcm-kaizen', 'Nandan WCM and Kaizen',    'KZ', '#E8600A',  20, 'World Class Manufacturing and the habit of small improvement.'),
  ('production', 'Production',               'PR', '#1B3A5C',  30, 'How the works actually builds what it sells.'),
  ('design',     'Design Training',          'DS', '#7C3AED',  40, 'Engineering, drawing and the decisions made before steel is cut.'),
  ('digital',    'Use of Digital Tools',     'DT', '#0D9488',  50, 'The ERP, Genie, and everything else on the screen.'),
  ('safety',     'Safety Trainings',         'SF', '#B3261E',  60, 'Nobody gets hurt. Everything else is second.'),
  ('quality',    'Quality Trainings',        'QC', '#0D7A3F',  70, 'Making it right, and proving it was.'),
  ('iso',        'ISO Trainings',            'IS', '#5A6672',  80, 'The standards we are audited against.'),
  ('accounting', 'Accounting',               'AC', '#D97706',  90, 'What the numbers mean and where they come from.'),
  ('toc',        'ToC Trainings',            'TC', '#1B3A5C', 100, 'Theory of Constraints -- throughput, and the one thing holding it.'),
  ('leadership', 'Leadership Trainings',     'LD', '#E8600A', 110, 'Running a team, not just a task list.'),
  ('worker',     'Worker Skill Trainings',   'WS', '#0D7A3F', 120, 'Trade skill on the shop floor, trade by trade.'),
  ('meditation', 'Meditation Training',      'MD', '#7C3AED', 130, 'Attention, and how to keep it.'),
  ('mind',       'Mind Practice Training',   'MP', '#0D9488', 140, 'Habits of thinking, practised deliberately.'),
  ('emergency',  'Emergency Training',       'EM', '#B3261E', 150, 'What to do when it goes wrong, before it goes wrong.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.lms_book        enable row level security;
alter table public.lms_section     enable row level security;
alter table public.lms_lesson      enable row level security;
alter table public.lms_lesson_book enable row level security;
alter table public.lms_progress    enable row level security;
alter table public.lms_extra       enable row level security;
alter table public.lms_plan        enable row level security;

-- The course material is for everybody who works here.
drop policy if exists lms_book_read on public.lms_book;
create policy lms_book_read on public.lms_book for select to authenticated using (true);
drop policy if exists lms_section_read on public.lms_section;
create policy lms_section_read on public.lms_section for select to authenticated using (true);
drop policy if exists lms_lesson_read on public.lms_lesson;
create policy lms_lesson_read on public.lms_lesson for select to authenticated using (true);
drop policy if exists lms_lesson_book_read on public.lms_lesson_book;
create policy lms_lesson_book_read on public.lms_lesson_book for select to authenticated using (true);

-- What a person wrote is theirs. Managers read their team's through the API,
-- which walks reports_to; this policy is the backstop for a direct connection.
drop policy if exists lms_progress_own on public.lms_progress;
create policy lms_progress_own on public.lms_progress
  for select to authenticated using (person_id = auth.uid() or public.is_admin());
drop policy if exists lms_extra_own on public.lms_extra;
create policy lms_extra_own on public.lms_extra
  for select to authenticated using (person_id = auth.uid() or public.is_admin());
drop policy if exists lms_plan_own on public.lms_plan;
create policy lms_plan_own on public.lms_plan
  for select to authenticated using (person_id = auth.uid() or public.is_admin());

comment on table public.lms_lesson is
  'A lesson, authored once. Shelved into any number of books through '
  'lms_lesson_book, which also carries which section it sits in per book.';
comment on table public.lms_progress is
  'One row per person per lesson. The fifty-word learning note is what makes a '
  'completion mean something, and what the IDP adds up.';
