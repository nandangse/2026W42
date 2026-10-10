-- 0213 — LEADERS COUNCIL (Genie 5.10.0.0)
--
-- Dr Raghu, 10 Oct 2026: "Make a new module called Leaders Council. This has
-- to be only accessible to those who are marked in the LC … make sure that
-- nobody else can get into this LC module."
--
-- THE DOOR IS THE LC MARK THAT ALREADY EXISTS. profiles.lc (the Leadership
-- Circle room, src/lib/groups.ts) is the tick on Admin → Groups; the owner is
-- implicit. No new grant table: the people he has already marked are the
-- people who may come in, and one mark cannot drift from another.
--
-- Every table wears the lc_ prefix — the module boundary inside the one
-- database, the way Saamaan's wear material_.
--
-- The rooms, in the order of his telling:
--   Philosophy   — values, OPSP, quarterly reports; owner writes, all read
--   Principles   — what we do and what we do not; owner writes, all read
--   Meetings     — minutes: date, from–to (hours computed), place, attendees
--   Knowledge    — files and references; owner adds; every file is pushed to
--                  the Drive folder once it is in the bucket
--   Presentations— who added, who presents, link or file, topic, Genie summary
--   Start Stop Continue — a three-column board, thumbs, colour per leader,
--                  the owner's Print PDF
--   Solution Board — problem, description, crowdsourced solutions, LC
--                  discussion, Genie summary, status, tentative date
--   KPIs         — company-wide, assigned to a leader, number or currency,
--                  a value a month, read by month or quarter

-- ───────────────────────── pages: Philosophy & Principles ─────────────────────────
create table if not exists public.lc_section (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('philosophy','principles')),
  title       text not null,
  body        text,                              -- sanitized HTML
  sort        int  not null default 0,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.lc_section enable row level security;
revoke all on public.lc_section from anon, authenticated;

insert into public.lc_section (kind, title, sort, created_by)
select 'philosophy', t, s, 'raghu@nandan.co.in' from (values ('Values', 1), ('OPSP', 2), ('Quarterly reports', 3)) as v(t, s)
where not exists (select 1 from public.lc_section where kind = 'philosophy');

-- ───────────────────────── Knowledge ─────────────────────────
create table if not exists public.lc_knowledge (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  note        text,                              -- sanitized HTML
  url         text,                              -- a reference: a Drive folder, a sheet, a page
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.lc_knowledge enable row level security;
revoke all on public.lc_knowledge from anon, authenticated;

-- ───────────────────────── files, for every room ─────────────────────────
-- Stored in the private 'lc' bucket first, then pushed to the Leaders Council
-- Drive folder. drive_status says where the push stands; a failed push is
-- retried the next time anybody opens the list, never lost.
create table if not exists public.lc_file (
  id            uuid primary key default gen_random_uuid(),
  ref_kind      text not null check (ref_kind in ('knowledge','meeting','presentation','section','problem','ssc')),
  ref_id        uuid,
  path          text not null,
  name          text not null,
  mime          text,
  bytes         bigint,
  drive_id      text,
  drive_url     text,
  drive_status  text not null default 'pending' check (drive_status in ('pending','done','failed','skipped')),
  drive_error   text,
  uploaded_by   text,
  created_at    timestamptz not null default now()
);
create index if not exists lc_file_ref on public.lc_file (ref_kind, ref_id);
alter table public.lc_file enable row level security;
revoke all on public.lc_file from anon, authenticated;

insert into storage.buckets (id, name, public) values ('lc', 'lc', false) on conflict (id) do nothing;

-- ───────────────────────── settings (the Drive folder, and whatever comes next) ─────────────────────────
create table if not exists public.lc_setting (
  key         text primary key,
  value       text,
  updated_by  text,
  updated_at  timestamptz not null default now()
);
alter table public.lc_setting enable row level security;
revoke all on public.lc_setting from anon, authenticated;

-- ───────────────────────── Meetings ─────────────────────────
create table if not exists public.lc_meeting (
  id          uuid primary key default gen_random_uuid(),
  held_on     date not null,
  from_time   time,
  to_time     time,
  location    text,
  attendees   text[] not null default '{}',
  minutes     text,                              -- sanitized HTML; Genie formats on request
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.lc_meeting enable row level security;
revoke all on public.lc_meeting from anon, authenticated;

-- ───────────────────────── Presentations ─────────────────────────
create table if not exists public.lc_presentation (
  id          uuid primary key default gen_random_uuid(),
  topic       text,                              -- typed, or Genie's when the summary is asked for
  presenter   text,                              -- a name or an e-mail, typed
  file_url    text,                              -- a link to the deck, when it lives elsewhere
  summary     text,                              -- sanitized HTML, Genie's
  notes       text,                              -- sanitized HTML, the presenter's
  presented_on date,
  added_by    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.lc_presentation enable row level security;
revoke all on public.lc_presentation from anon, authenticated;

-- ───────────────────────── Start · Stop · Continue ─────────────────────────
create table if not exists public.lc_ssc (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('start','stop','continue')),
  title       text not null,                     -- the two or three sentences
  details     text,                              -- sanitized HTML: the detail and how it touches the company
  added_by    text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.lc_ssc enable row level security;
revoke all on public.lc_ssc from anon, authenticated;

-- one reaction per person per thing: up, down, or "needs clarity"
create table if not exists public.lc_reaction (
  ref_kind    text not null check (ref_kind in ('ssc','problem','solution')),
  ref_id      uuid not null,
  email       text not null,
  value       text not null check (value in ('up','down','question')),
  created_at  timestamptz not null default now(),
  primary key (ref_kind, ref_id, email)
);
alter table public.lc_reaction enable row level security;
revoke all on public.lc_reaction from anon, authenticated;

-- ───────────────────────── Solution Board ─────────────────────────
create table if not exists public.lc_problem (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,                            -- sanitized HTML, pictures pasted in
  lc_summary    text,                            -- sanitized HTML, Genie's summary of every solution
  status        text not null default 'new' check (status in ('new','under_process','needs_deep_dive','deployed','cancelled')),
  tentative_on  date,
  added_by      text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  closed_at     timestamptz                      -- set when status becomes deployed or cancelled
);
alter table public.lc_problem enable row level security;
revoke all on public.lc_problem from anon, authenticated;

create table if not exists public.lc_solution (
  id          uuid primary key default gen_random_uuid(),
  problem_id  uuid not null references public.lc_problem(id) on delete cascade,
  body        text not null,                     -- sanitized HTML
  added_by    text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.lc_solution enable row level security;
revoke all on public.lc_solution from anon, authenticated;

-- the LC discussion, in the lightbox; also minutes talk on a meeting
create table if not exists public.lc_comment (
  id          uuid primary key default gen_random_uuid(),
  ref_kind    text not null check (ref_kind in ('problem','ssc','meeting','presentation')),
  ref_id      uuid not null,
  body        text not null,
  added_by    text not null,
  created_at  timestamptz not null default now()
);
create index if not exists lc_comment_ref on public.lc_comment (ref_kind, ref_id);
alter table public.lc_comment enable row level security;
revoke all on public.lc_comment from anon, authenticated;

-- ───────────────────────── KPIs ─────────────────────────
create table if not exists public.lc_kpi (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  assigned_to text,                              -- a leader's e-mail
  type        text not null default 'number' check (type in ('number','currency')),
  unit        text,                              -- "nos", "%", "days" … shown after a number
  agg         text not null default 'sum' check (agg in ('sum','avg','last')),  -- how a quarter is read from its months
  target      numeric,                           -- a month's target, when there is one
  sort        int not null default 0,
  active      boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now()
);
alter table public.lc_kpi enable row level security;
revoke all on public.lc_kpi from anon, authenticated;

create table if not exists public.lc_kpi_value (
  kpi_id      uuid not null references public.lc_kpi(id) on delete cascade,
  month       date not null,                     -- the first of the month
  value       numeric not null,
  note        text,
  entered_by  text,
  updated_at  timestamptz not null default now(),
  primary key (kpi_id, month)
);
alter table public.lc_kpi_value enable row level security;
revoke all on public.lc_kpi_value from anon, authenticated;

-- ───────────────────────── Health Check — the Rockefeller Habits Checklist ─────────────────────────
-- Dr Raghu, 10 Oct 2026: "give this Rockefeller checklist and let them fill
-- it out … The answers will be anonymous. Be very clear on that."
--
-- ANONYMOUS BY SHAPE, NOT BY PROMISE. An answer row carries the round and the
-- forty ticks and NOTHING ELSE — no e-mail, no id, not even a timestamp. A
-- separate table records only WHO has filled a round, so a person cannot
-- fill it twice and the council can see "7 of 9 have answered". The two
-- tables share no key, so no query joins a person to an answer. Results are
-- shown only once three or more have answered, to everybody including the
-- owner, because one answer in a round of one is not anonymous.
create table if not exists public.lc_health_round (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,                     -- "Q3 FY 2026-27"
  opened_on   date not null default current_date,
  closed_on   date,
  created_by  text
);
alter table public.lc_health_round enable row level security;
revoke all on public.lc_health_round from anon, authenticated;

create table if not exists public.lc_health_answer (
  id          uuid primary key default gen_random_uuid(),
  round_id    uuid not null references public.lc_health_round(id) on delete cascade,
  ticks       boolean[] not null                 -- forty, in checklist order
);
alter table public.lc_health_answer enable row level security;
revoke all on public.lc_health_answer from anon, authenticated;

create table if not exists public.lc_health_done (
  round_id    uuid not null references public.lc_health_round(id) on delete cascade,
  email       text not null,
  on_date     date not null default current_date,
  primary key (round_id, email)
);
alter table public.lc_health_done enable row level security;
revoke all on public.lc_health_done from anon, authenticated;

-- ───────────────────────── the ask, on the record ─────────────────────────
insert into public.feature_request (title, body, want, status, note, by)
select 'Leaders Council — a module only for those marked LC', '<p>"Make a new module called Leaders Council. This has to be only accessible to those who are marked in the LC … Philosophy, Principles, Meetings, Knowledge, Presentations, Start Stop Continue, Solution Board, KPIs." (Dr Raghu, 10 Oct 2026.)</p>', 'must', 'done', 'Shipped as Genie 5.10.0.0.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title like 'Leaders Council — a module%');

insert into public.genie_migration (name) values ('0213_leaders_council') on conflict (name) do nothing;
