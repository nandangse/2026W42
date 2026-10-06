-- 0187 — KINDLE: THE TRUST GROUP’S OWN SITE (Kindle 1.0 — not a Genie module, not in Genie’s numbering)
--
-- Dr Raghu, 1 Oct 2026: "I want to create a website for this. Currently, put
-- it under genie.nandan.co.in/kindle. Whatever is there in the sheet, I
-- wanted it replicated... At minimum, I wanted to have the constitution... a
-- directory with the attendance, late coming, fees... all the check-ins...
-- a complete section on goals... message boards... exercises... meetings and
-- minutes... polls... finances... one-to-ones... agenda... photo gallery... the
-- participation of each of us... This has to have a login page where only
-- 10 of us can log in with the official mail ID that is given in the
-- directory."
--
-- Kindle is the Ascent Foundation trust group Dr Raghu belongs to — ten
-- entrepreneurs, Mumbai chapter, "Keeping the fire alive." It is NOT a
-- Nandan module: its members have no Genie login and must never get one.
-- So this is a second login realm inside the one app (the /idp pattern of
-- 0150: hashed password, signed cookie, nothing shared), and every table
-- wears the kindle_ prefix (the Saamaan rule) so the module is one prefix
-- in the database and can be lifted out whole.
--
-- The schema is written for all five phases at once so the data model is
-- settled before the screens arrive; phase 1 fills members, meetings,
-- attendance, the constitution and the fine rules. Everything here is
-- additive and idempotent. Row-level security is on with no policies: the
-- browser never holds a key for these tables; the server reads with the
-- service role after checking the Kindle session.

-- ---------------------------------------------------------------- members
create table if not exists public.kindle_member (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique check (email = lower(email)),
  name            text not null,
  short_name      text,                       -- what the room calls him: Raghu, Valay
  company         text,
  sector          text,
  designation     text,
  phone           text,
  linkedin        text,
  city            text default 'Mumbai',
  birthday        date,
  stay_at         text,
  office_at       text,
  about           text,
  photo_path      text,                       -- in the private ’kindle’ bucket
  roles           text[] not null default '{}',   -- facilitator, co_facilitator, treasurer, scribe, timekeeper
  is_admin        boolean not null default false, -- the settings gear
  active          boolean not null default true,
  joined_on       date,
  left_on         date,
  sort_order      int not null default 100,
  -- the login
  pw_salt         text,
  pw_hash         text,
  pw_version      int not null default 1,     -- bumped on every change; sessions carry it
  must_change     boolean not null default true,
  invite_token    text unique,                -- the one-time link in the welcome mail
  invite_expires  timestamptz,
  invited_at      timestamptz,
  last_login_at   timestamptz,
  login_count     int not null default 0,
  onboarded_at    timestamptz,                -- the first-login profile form, done
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.kindle_member enable row level security;
revoke all on public.kindle_member from anon, authenticated;

-- spouse and children — birthdays go out only for the legal ones (his words)
create table if not exists public.kindle_family (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.kindle_member(id) on delete cascade,
  relation    text not null check (relation in ('spouse','child','parent','other')),
  name        text not null,
  birthday    date,
  is_legal    boolean not null default true,
  mail_wishes boolean not null default true,
  note        text,
  created_at  timestamptz not null default now()
);
alter table public.kindle_family enable row level security;
revoke all on public.kindle_family from anon, authenticated;
create index if not exists kindle_family_member on public.kindle_family(member_id);

-- ------------------------------------------------------------ constitution
create table if not exists public.kindle_constitution (
  id          uuid primary key default gen_random_uuid(),
  version     text not null,
  revised_on  date,
  passed_by   text[] not null default '{}',
  body        text not null,                  -- markdown, section headings as ##
  is_current  boolean not null default false,
  saved_by    text,
  created_at  timestamptz not null default now()
);
alter table public.kindle_constitution enable row level security;
revoke all on public.kindle_constitution from anon, authenticated;

-- the fines as rules, so an amount is computed from minutes, never typed
create table if not exists public.kindle_fine_rule (
  code        text primary key,
  label       text not null,
  amount      numeric(10,2) not null,
  sort_order  int not null default 100,
  active      boolean not null default true
);
alter table public.kindle_fine_rule enable row level security;
revoke all on public.kindle_fine_rule from anon, authenticated;

-- ---------------------------------------------------------------- meetings
create table if not exists public.kindle_meeting (
  id          uuid primary key default gen_random_uuid(),
  meeting_on  date not null,
  date_exact  boolean not null default true,  -- false where the sheet gave only the month
  kind        text not null default 'monthly' check (kind in ('monthly','outbound','dinner','zoom','special')),
  title       text,
  venue       text,
  host_id     uuid references public.kindle_member(id),
  starts_at   time default '15:00',
  ends_at     time default '19:00',
  agenda      text,                           -- markdown
  minutes     text,                           -- markdown
  minutes_url text,                           -- the old MoM link, where one exists
  guru        text,                           -- Knowledge Guru that day
  presenters  uuid[] not null default '{}',
  status      text not null default 'planned' check (status in ('planned','held','cancelled')),
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (meeting_on, kind)
);
alter table public.kindle_meeting enable row level security;
revoke all on public.kindle_meeting from anon, authenticated;

create table if not exists public.kindle_attendance (
  meeting_id   uuid not null references public.kindle_meeting(id) on delete cascade,
  member_id    uuid not null references public.kindle_member(id) on delete cascade,
  status       text not null check (status in ('present','absent','zoom','excused')),
  late_min     int not null default 0,        -- arrived after 3 pm, in minutes
  early_min    int not null default 0,        -- left before close, in minutes
  notice_hours numeric(6,1),                  -- how far ahead an absence was notified
  note         text,
  marked_by    text,
  marked_at    timestamptz not null default now(),
  primary key (meeting_id, member_id)
);
alter table public.kindle_attendance enable row level security;
revoke all on public.kindle_attendance from anon, authenticated;

-- ------------------------------------------------------------------- fines
create table if not exists public.kindle_fine (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.kindle_member(id) on delete cascade,
  meeting_id  uuid references public.kindle_meeting(id) on delete set null,
  rule_code   text references public.kindle_fine_rule(code),
  amount      numeric(10,2) not null,
  reason      text,
  levied_on   date not null default current_date,
  paid_on     date,
  paid_amount numeric(10,2),
  waived      boolean not null default false,
  waived_by   text,
  note        text,
  created_by  text,
  created_at  timestamptz not null default now()
);
alter table public.kindle_fine enable row level security;
revoke all on public.kindle_fine from anon, authenticated;
create index if not exists kindle_fine_member on public.kindle_fine(member_id);

-- --------------------------------------------------------------- check-ins
create table if not exists public.kindle_checkin (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.kindle_member(id) on delete cascade,
  period        date not null,                -- first of the month the check-in is FOR
  meeting_id    uuid references public.kindle_meeting(id) on delete set null,
  submitted_at  timestamptz not null default now(),
  prof_rating   int check (prof_rating between 0 and 10),
  pers_rating   int check (pers_rating between 0 and 10),
  prof_notes    text,                         -- professional highlights
  pers_notes    text,                         -- personal highlights
  learning      text,                         -- inspiration and learning
  challenge     text,                         -- leadership challenge
  sounding      text,                         -- sounding board / burning issue
  one_to_one    text,                         -- whom did you meet, what came of it
  update_note   text,                         -- any personal or professional update
  suggestions   text,                         -- for team engagement
  new_goals     text,
  source        text not null default 'site' check (source in ('site','form2022','form2025','form2026')),
  raw           jsonb,                        -- the form row as it came, for the record
  unique (member_id, period, submitted_at)
);
alter table public.kindle_checkin enable row level security;
revoke all on public.kindle_checkin from anon, authenticated;
create index if not exists kindle_checkin_member on public.kindle_checkin(member_id, period);

-- ------------------------------------------------------------------- goals
create table if not exists public.kindle_goal_set (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.kindle_member(id) on delete cascade,
  year_label     text not null,               -- ’2026-27’
  failed_last    text,
  start_doing    text,
  stop_doing     text,
  one_thing      text,
  accountable_to text,
  support_needed text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (member_id, year_label)
);
alter table public.kindle_goal_set enable row level security;
revoke all on public.kindle_goal_set from anon, authenticated;

create table if not exists public.kindle_goal (
  id          uuid primary key default gen_random_uuid(),
  set_id      uuid not null references public.kindle_goal_set(id) on delete cascade,
  member_id   uuid not null references public.kindle_member(id) on delete cascade,
  kind        text not null check (kind in ('professional','personal')),
  seq         int not null default 1,
  title       text not null,
  measure     text,
  due_on      date,
  status      text not null default 'on_track' check (status in ('on_track','behind','done','dropped')),
  progress    int not null default 0 check (progress between 0 and 100),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.kindle_goal enable row level security;
revoke all on public.kindle_goal from anon, authenticated;
create index if not exists kindle_goal_member on public.kindle_goal(member_id);

-- a goal’s monthly word, normally written inside that month’s check-in
create table if not exists public.kindle_goal_update (
  id          uuid primary key default gen_random_uuid(),
  goal_id     uuid not null references public.kindle_goal(id) on delete cascade,
  member_id   uuid not null references public.kindle_member(id) on delete cascade,
  checkin_id  uuid references public.kindle_checkin(id) on delete set null,
  period      date not null,
  note        text,
  status      text check (status in ('on_track','behind','done','dropped')),
  progress    int check (progress between 0 and 100),
  created_at  timestamptz not null default now()
);
alter table public.kindle_goal_update enable row level security;
revoke all on public.kindle_goal_update from anon, authenticated;
create index if not exists kindle_goal_update_goal on public.kindle_goal_update(goal_id, period);

-- ----------------------------------------------------------------- 1-2-1s
create table if not exists public.kindle_one_to_one (
  id          uuid primary key default gen_random_uuid(),
  period      date not null,                  -- the month it is due
  member_a    uuid not null references public.kindle_member(id) on delete cascade,
  member_b    uuid not null references public.kindle_member(id) on delete cascade,
  planned     boolean not null default true,  -- from the year’s pairing plan
  done_on     date,
  mode        text check (mode in ('in_person','call','video')),
  note_a      text,
  note_b      text,
  created_at  timestamptz not null default now(),
  unique (period, member_a, member_b)
);
alter table public.kindle_one_to_one enable row level security;
revoke all on public.kindle_one_to_one from anon, authenticated;

-- --------------------------------------------------------------- learnings
create table if not exists public.kindle_learning (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.kindle_member(id) on delete cascade,
  noted_on    date not null,
  body        text not null,
  checkin_id  uuid references public.kindle_checkin(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.kindle_learning enable row level security;
revoke all on public.kindle_learning from anon, authenticated;

-- ---------------------------------------------------- burning issues board
create table if not exists public.kindle_issue (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.kindle_member(id) on delete cascade,
  submitted_at  timestamptz not null default now(),
  statement     text not null,
  efforts       text,
  why_important text,
  accomplished  text,
  urgency       int check (urgency between 1 and 10),
  related_to    text,
  theme         text,                         -- one of the nine, or free
  status        text not null default 'open' check (status in ('open','discussed','resolved','parked')),
  discussed_in  uuid references public.kindle_meeting(id) on delete set null,
  outcome       text
);
alter table public.kindle_issue enable row level security;
revoke all on public.kindle_issue from anon, authenticated;

-- ------------------------------------------------------------------- polls
create table if not exists public.kindle_poll (
  id          uuid primary key default gen_random_uuid(),
  question    text not null,
  options     jsonb not null,                 -- ["Option A", "Option B"]
  multi       boolean not null default false,
  anonymous   boolean not null default false,
  closes_at   timestamptz,
  created_by  uuid references public.kindle_member(id),
  created_at  timestamptz not null default now()
);
alter table public.kindle_poll enable row level security;
revoke all on public.kindle_poll from anon, authenticated;

create table if not exists public.kindle_poll_vote (
  poll_id     uuid not null references public.kindle_poll(id) on delete cascade,
  member_id   uuid not null references public.kindle_member(id) on delete cascade,
  choices     int[] not null,
  voted_at    timestamptz not null default now(),
  primary key (poll_id, member_id)
);
alter table public.kindle_poll_vote enable row level security;
revoke all on public.kindle_poll_vote from anon, authenticated;

-- ----------------------------------------------------------- message board
create table if not exists public.kindle_topic (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text,
  created_by  uuid references public.kindle_member(id),
  pinned      boolean not null default false,
  closed      boolean not null default false,
  created_at  timestamptz not null default now(),
  last_post_at timestamptz not null default now()
);
alter table public.kindle_topic enable row level security;
revoke all on public.kindle_topic from anon, authenticated;

create table if not exists public.kindle_post (
  id          uuid primary key default gen_random_uuid(),
  topic_id    uuid not null references public.kindle_topic(id) on delete cascade,
  member_id   uuid references public.kindle_member(id),
  body        text not null,
  reply_to    uuid references public.kindle_post(id) on delete set null,
  created_at  timestamptz not null default now(),
  edited_at   timestamptz
);
alter table public.kindle_post enable row level security;
revoke all on public.kindle_post from anon, authenticated;
create index if not exists kindle_post_topic on public.kindle_post(topic_id, created_at);

-- ---------------------------------------------------------------- finances
create table if not exists public.kindle_ledger (
  id          uuid primary key default gen_random_uuid(),
  entry_on    date not null,
  kind        text not null check (kind in ('collection','fine','expense','opening','adjustment')),
  member_id   uuid references public.kindle_member(id) on delete set null,
  meeting_id  uuid references public.kindle_meeting(id) on delete set null,
  fine_id     uuid references public.kindle_fine(id) on delete set null,
  head        text,                           -- venue, food, speaker, gift…
  amount      numeric(12,2) not null,         -- positive in, negative out
  note        text,
  created_by  text,
  created_at  timestamptz not null default now()
);
alter table public.kindle_ledger enable row level security;
revoke all on public.kindle_ledger from anon, authenticated;

create table if not exists public.kindle_budget (
  id          uuid primary key default gen_random_uuid(),
  year        int not null,                   -- calendar year, per the constitution
  head        text not null,
  amount      numeric(12,2) not null,
  note        text,
  unique (year, head)
);
alter table public.kindle_budget enable row level security;
revoke all on public.kindle_budget from anon, authenticated;

-- --------------------------------------------------------------- exercises
create table if not exists public.kindle_exercise (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  intro       text,
  questions   jsonb not null default '[]',    -- [{id,label,help,rows}]
  created_by  uuid references public.kindle_member(id),
  open        boolean not null default true,
  due_on      date,
  created_at  timestamptz not null default now()
);
alter table public.kindle_exercise enable row level security;
revoke all on public.kindle_exercise from anon, authenticated;

create table if not exists public.kindle_exercise_answer (
  exercise_id   uuid not null references public.kindle_exercise(id) on delete cascade,
  member_id     uuid not null references public.kindle_member(id) on delete cascade,
  answers       jsonb not null default '{}',
  private       boolean not null default false,
  submitted_at  timestamptz not null default now(),
  primary key (exercise_id, member_id)
);
alter table public.kindle_exercise_answer enable row level security;
revoke all on public.kindle_exercise_answer from anon, authenticated;

-- ----------------------------------------------------------------- gallery
create table if not exists public.kindle_album (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  taken_on    date,
  meeting_id  uuid references public.kindle_meeting(id) on delete set null,
  created_by  uuid references public.kindle_member(id),
  created_at  timestamptz not null default now()
);
alter table public.kindle_album enable row level security;
revoke all on public.kindle_album from anon, authenticated;

create table if not exists public.kindle_photo (
  id          uuid primary key default gen_random_uuid(),
  album_id    uuid not null references public.kindle_album(id) on delete cascade,
  path        text not null,                  -- in the private ’kindle’ bucket
  caption     text,
  width       int, height int, bytes int,
  uploaded_by uuid references public.kindle_member(id),
  created_at  timestamptz not null default now()
);
alter table public.kindle_photo enable row level security;
revoke all on public.kindle_photo from anon, authenticated;

insert into storage.buckets (id, name, public) values ('kindle', 'kindle', false)
on conflict (id) do nothing;

-- -------------------------------------------------- mail log + audit trail
create table if not exists public.kindle_mail (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,                  -- welcome, birthday, checkin_reminder…
  to_email    text not null,
  subject     text,
  ref         text,                           -- what it was about (member id, date)
  sent_at     timestamptz not null default now(),
  ok          boolean not null default true,
  error       text,
  unique (kind, to_email, ref)
);
alter table public.kindle_mail enable row level security;
revoke all on public.kindle_mail from anon, authenticated;

create table if not exists public.kindle_audit (
  id          bigserial primary key,
  member_id   uuid references public.kindle_member(id) on delete set null,
  email       text,
  action      text not null,
  detail      jsonb,
  at          timestamptz not null default now()
);
alter table public.kindle_audit enable row level security;
revoke all on public.kindle_audit from anon, authenticated;

-- ============================================================ SEED: members
-- From the Directory tab of "Ascent Kindle 2026" and the member profile
-- doc. E-mails are the directory’s, as he asked. Roles for 2026 are the
-- constitution’s: Jigar facilitator, Amit co-facilitator, Niraj treasurer
-- and scribe, Ravi time keeper. Dr Raghu holds the settings gear.
insert into public.kindle_member (email, name, short_name, company, sector, phone, roles, is_admin, joined_on, sort_order) values
  ('amitgupta@cccpl.net',            'Amit Gupta',           'Amit',     'CCPL',                                   'Transport',                                       '8779240225', '{co_facilitator}',   false, '2024-01-05', 10),
  ('anil@artis.in',                  'Anil Daryani',         'Anil',     'Kunhar Peripherals Pvt Ltd',             'Technology hardware, electronic manufacturing',   '9820159700', '{}',                 false, '2023-01-06', 20),
  ('bharat@mahavirhomestore.com',    'Bharat Haria',         'Bharat',   'Mahavir The Home Store',                 'Home store, retail',                              '9920010000', '{}',                 false, '2023-01-06', 30),
  ('jaydev@aarviencon.com',          'Jaydev Sanghavi',      'Jaydev',   'Aarvi Encon Ltd',                        'Engineering manpower, HR',                        '9821064726', '{}',                 false, '2023-01-06', 40),
  ('tojigarshah@gmail.com',          'Jigar Shah',           'Jigar',    'Banyan Tree Advisors Pvt Ltd',           'Banking and financial services',                  '9821754837', '{facilitator}',      false, '2023-01-06', 50),
  ('nirajt7011@gmail.com',           'Niraj Thakkar',        'Niraj',    'Precision Rubber Inds Pvt Ltd',          'Manufacturing, rubber; Clean&Crafted breads',     '9820700069', '{treasurer,scribe}', false, '2023-01-06', 60),
  ('raghu@nandan.co.in',             'Raghunandan Jagdish',  'Raghu',    'Nandan GSE Pvt Ltd',                     'Ground support equipment manufacturing',          '9322692934', '{}',                 true,  '2023-01-06', 70),
  ('rlodha@gmail.com',               'Ravi Lodha',           'Ravi',     'Alpine Stampings',                       'Manufacturing, electrical steel trading',         '9867241800', '{timekeeper}',       false, '2023-01-06', 80),
  ('shailesh.jain@mirraw.com', 'Shailesh Jain',        'Shailesh', 'Mirraw Online Services Pvt Ltd',         'E-commerce, fashion, logistics',                  '9822847935', '{}',                 false, '2023-01-06', 90),
  ('valay.lakdavala@neoniche.com',   'Valay Lakdawala',      'Valay',    'NeoNiche Integrated Solutions Pvt Ltd',  'Event agency',                                    '9769204531', '{}',                 false, '2023-01-06', 100)
on conflict (email) do nothing;

-- ========================================================= SEED: fine rules
insert into public.kindle_fine_rule (code, label, amount, sort_order) values
  ('late_5',        'Up to 5 minutes late coming or early going',                         1000, 10),
  ('late_15',       '5 to 15 minutes late coming or early going',                         2000, 20),
  ('late_more',     'Above 15 minutes late coming or early going',                        5000, 30),
  ('presentation',  'Missing a presentation (not intimated a month before)',             10000, 40),
  ('absent_24h',    'Missing the meeting with less than 24 hours'' intimation',          10000, 50),
  ('absent_3rd',    'Missing the meeting for the 3rd time in the year',                  15000, 60),
  ('absent_4th',    'Missing the meeting for the 4th time in the year',                  25000, 70),
  ('phone',         'Answering the phone or looking at WhatsApp in the meeting',          1000, 80),
  ('no_121',        'Missing the monthly 1-2-1 (per person)',                             5000, 90),
  ('deck_late',     'Presentation copy not sent to the group a week before',             10000, 100),
  ('checkin_late',  'Check-in not received three days before the meeting',               3000, 110)
on conflict (code) do update set label = excluded.label, amount = excluded.amount, sort_order = excluded.sort_order;

-- ======================================================= SEED: constitution
insert into public.kindle_constitution (version, revised_on, passed_by, is_current, saved_by, body)
select '5.2', '2026-09-03',
  array['Anil Daryani','Bharat Haria','Jaydev Sanghavi','Jigar Shah','Niraj Thakkar','Raghunandan Jagdish','Ravi Lodha','Shailesh Jain','Valay Lakdawala','Amit Gupta'],
  true, 'import',
'
## 1. Purpose

To create an environment that leads to collaborative growth through experience sharing, mutual trust and transparent feedback.

## 2. Slogan

**Keeping the fire alive.**

## 3. Composition

3.1.1 We are a Trust Group of not more than 12 members placed by ASCENT Foundation to ensure diversity and no conflict of interest through our businesses.

3.1.2 New member(s) can join with an unanimous approval of the group.

3.1.3 Members may voluntarily resign from Kindle after discussing and consulting with the Facilitator and after taking permission of the group.

3.1.4 The resigned member will need a NOC from Kindle to join another Ascent Trust Group.

3.1.5 The decision to continue or disband as a Group will be taken by the group through consent of the members, by simple majority after consultation with Ascent office.

3.1.6 The Group may ask a member to resign in the event of any breach of confidentiality, lack of commitment or illegal or unethical practice that may surface subsequent to his/her joining Kindle.

3.1.7 Should a conflict of interest arise between members through change or expansion of businesses, the member with the changed circumstance may resign from the group after consulting with the facilitator and the members of the group.

3.1.8 A member leaving a Trust Group is expected to maintain confidentiality of the Group in good faith.

3.1.9 No sabbatical will be allowed to the members. Members requesting for the same shall exit from the group and rejoin through Ascent / Kindle. The only sabbatical case to be considered is relocation out of the country, and that for three months.

3.1.10 Two-third majority (7/10) related to the quorum of that day''s meeting will be required for any decisions of the group.

3.1.11 In case there is no quorum for a particular day, a date change can be done with a vote of more than 70% of the members. Any member who is absent in a date-change month will be condoned for the absence of that month.

3.2 The Group shall consist of only entrepreneurs and no professionals.

3.3 The financial and operational year of the group will be the calendar year.

## 4. Meetings

4.1 The Kindle meetings will be held on the FIRST THURSDAY of every month. The agenda will be sent by the facilitator one week prior to the meeting.

4.2 The time for the meeting will be 3 PM to 7 PM.

4.3 Arrival time for the meeting will be 2.45 pm. All meetings will start punctually at 3 pm and end at the appointed time. If the quorum is less than 50% of the number of attending members then the meeting will start when 50% of attending members arrive.

4.4 The penalty time will start from the commencement of the appointed time, 3 pm.

4.5 A member arriving after the start of the meeting or leaving before the close will be penalised: up to 5 minutes Rs. 1,000; 5 to 15 minutes Rs. 2,000; above 15 minutes Rs. 5,000. The penalty is paid in cash, placed on the table before joining the meeting.

4.6 Tips for synergy: don''t advise; share from experience; listen patiently; don''t be judgmental.

4.7 One Zoom / Skype meeting is allowed in the year.

4.8 Only two absences from the meeting are allowed in a year.

4.9 On the 3rd physical absence the member will be asked to resign from the Trust Group. As an alternative, considering the member''s contribution, the member can be asked to pay a fine of Rs. 15,000 and continue with the approval of the TG. On the 4th physical absence the member will be asked to resign; as an alternative a fine of Rs. 25,000 and continuation with the approval of the TG. This is a situation that will be discussed by the TG.

4.10 A member cannot leave before the end of the scheduled time without the permission of the majority of the members. Only in case of emergency or health issues is late coming or early going allowed, and it is not appreciated. The late or early timing carries the fine above.

4.11 Any delay or absence in attending a Trust Group meeting must be notified to all members by mail or WhatsApp at least 24 hours prior. Last-minute (less than 24 hours) cancellation attracts a penalty of Rs. 10,000. This also allows the Facilitator to ensure a proper quorum.

4.12 Kindlers will engage with a Knowledge Guru once every quarter, based on the group''s need.

4.13 Engagement and confidentiality will be fostered by holding meetings in an undisturbed venue with all phones and devices switched off or silent. A breach in mobile usage attracts a penalty of Rs. 1,000. Mobiles can be accessed during breaks and are kept aside during the meeting.

4.14 All content and discussions of the meeting will be held confidential as requested by the Knowledge Guru or the member who is sharing it.

4.15 Violation of confidentiality will be ground for disqualification of membership with the group''s two-third majority.

4.16 Any financial or business transaction between two members will be reported back to the group to ensure transparency and equality.

4.17 Member information provided or received through the Ascent Kindle Trust Group must be kept confidential and in no circumstances disseminated to a non-Kindle member.

4.18 Attendance and punctuality are key to our Group. Full attendance is expected, with the only exception being an emergency as defined and interpreted by the Group.

4.19 The calendar for the year''s meetings will be decided in the January meeting and all 12 dates confirmed.

4.20 Expenses for the balance / extra meetings will be borne by the entire group.

4.21 The group''s constitution can be amended with a two-third majority of the group.

4.22 A presentation to be made by a group member must be sent to the facilitator / coach and members over e-mail at least 7 days prior to the meeting.

4.23 No sabbatical, except relocation out of the country for three months.

4.24 A 1-2-1 is mandatory every month. Penalty of Rs. 5,000 for no 1-2-1.

4.25 All check-ins are to be done three days prior to the meeting. Fine of Rs. 3,000 if not received.

4.26 Last-minute cancellation is allowed only for: a death in the family; family illness or care; self-illness.

## 5. Voluntary roles

**5.1 Facilitator** — term one year. Selected by the Group, with the support of the initiator if applicable; primarily the co-facilitator is considered. Trained by ASCENT Foundation before assuming the role. Responsible for a homogeneous atmosphere with no advising or superiority during the meeting, and for the quality of check-ins. KRA: follow the meeting agenda per the prescribed protocol; finalise the minutes before the next meeting incorporating members'' comments; be the point of contact with the Ascent Foundation. **Jigar Shah is the Facilitator up to December 2026.**

**5.2 Co-facilitator** — term one year, selected and trained the same way. Helps the facilitator, learns the facilitator''s functions, and conducts the meeting in the facilitator''s absence. **Amit Gupta is the Co-facilitator up to December 2026.**

**5.3 Treasurer** — term one year. Manages the group''s finances and submits the annual statement in every January meeting. KRA: an annual budget covering meeting and venue costs, audio-visual equipment, food, gifts and tokens of appreciation or fees for speakers, and the collection of advance fees. **Niraj Thakkar is the Treasurer up to December 2026.**

**5.4 Time keeper** — term one year. Keeps the time lines for the meetings; in his absence any member can volunteer for that meeting. **Ravi Lodha is the Time Keeper up to December 2026.**

**5.5 Scribe** — keeps the record of attendance, takes notes of the proceedings, drafts the minutes within one week and sends them to all members by e-mail; in his absence any member can volunteer for that meeting. **Niraj Thakkar is the Scribe up to December 2026.**

## 6. Standard agenda

Published monthly by the Facilitator; subject to change for the Group''s requirements, announced before the meeting.

| Item | Minutes |
| --- | --- |
| Review of previous meeting minutes | 10 |
| Check-ins — 4 minutes plus 3 minutes per person; filled on the form 48 hours before | 90 to 100 |
| Bio break | 10 |
| Main presentation | up to 60 |
| Second presentation | up to 60 |
| Burning issue — meeting quality check, next meeting points | 10 |
| Closing | 15 |

## 7. Review

This constitution is reviewed once a year, in December.

## Fines

| # | Breach | Fine (Rs) |
| --- | --- | --- |
| 1 | Up to 5 minutes late coming or early going | 1,000 |
| 2 | 5 to 15 minutes late coming or early going | 2,000 |
| 3 | Above 15 minutes late coming or early going | 5,000 |
| 4 | Each missing of presentation, if not intimated one month before | 10,000 |
| 5 | Missing the meeting with intimation of less than 24 hours | 10,000 |
| 6 | Missing the meeting for the 3rd time in the year | 15,000 |
| 7 | Missing the meeting for the 4th time in the year, in addition to the 3rd | 25,000 |
| 8 | Phone answering in the meeting or looking at WhatsApp, including on a computer, each time | 1,000 |
| 9 | Missing a 1-2-1, per person | 5,000 |
| 10 | Not sending the presentation copy to the group one week before the due date | 10,000 |
| 11 | Check-in not received three days before the meeting | 3,000 |
'
where not exists (select 1 from public.kindle_constitution where version = '5.2');

-- ========================================= SEED: meetings (Directory tab)
insert into public.kindle_meeting (meeting_on, date_exact, kind, title, status, created_by) values
  ('2023-01-06', false, 'monthly', null, 'held', 'import'),
  ('2023-02-03', false, 'monthly', null, 'held', 'import'),
  ('2023-03-03', false, 'monthly', null, 'held', 'import'),
  ('2023-04-07', false, 'outbound', 'Outbound 2023', 'held', 'import'),
  ('2023-05-05', false, 'monthly', null, 'held', 'import'),
  ('2023-06-02', false, 'monthly', null, 'held', 'import'),
  ('2023-07-07', false, 'monthly', null, 'held', 'import'),
  ('2023-08-04', false, 'monthly', null, 'held', 'import'),
  ('2023-09-01', false, 'monthly', null, 'held', 'import'),
  ('2023-10-06', false, 'monthly', null, 'held', 'import'),
  ('2023-11-03', true, 'monthly', null, 'held', 'import'),
  ('2023-12-08', true, 'monthly', null, 'held', 'import'),
  ('2024-01-05', true, 'monthly', null, 'held', 'import'),
  ('2024-02-02', true, 'monthly', null, 'held', 'import'),
  ('2024-03-01', true, 'monthly', null, 'held', 'import'),
  ('2024-03-22', true, 'dinner', 'Kindle dinner', 'held', 'import'),
  ('2024-04-19', true, 'monthly', null, 'held', 'import'),
  ('2024-05-03', true, 'monthly', null, 'held', 'import'),
  ('2024-06-07', true, 'monthly', null, 'held', 'import'),
  ('2024-07-05', true, 'monthly', null, 'held', 'import'),
  ('2024-08-02', true, 'monthly', null, 'held', 'import'),
  ('2024-09-06', true, 'monthly', null, 'held', 'import'),
  ('2024-10-04', true, 'monthly', null, 'held', 'import'),
  ('2024-11-15', true, 'monthly', null, 'held', 'import'),
  ('2024-12-06', true, 'monthly', null, 'held', 'import'),
  ('2025-01-10', true, 'monthly', null, 'held', 'import'),
  ('2025-02-07', true, 'monthly', null, 'held', 'import'),
  ('2025-03-07', true, 'monthly', null, 'held', 'import'),
  ('2025-04-04', true, 'monthly', null, 'held', 'import'),
  ('2025-05-02', true, 'monthly', null, 'held', 'import'),
  ('2025-06-06', true, 'monthly', null, 'held', 'import'),
  ('2025-07-04', true, 'monthly', null, 'held', 'import'),
  ('2025-08-01', true, 'monthly', null, 'held', 'import'),
  ('2025-09-05', true, 'monthly', null, 'held', 'import'),
  ('2025-10-03', true, 'monthly', null, 'held', 'import'),
  ('2025-11-07', true, 'monthly', null, 'held', 'import'),
  ('2025-12-10', true, 'monthly', null, 'held', 'import'),
  ('2026-01-08', true, 'monthly', null, 'held', 'import'),
  ('2026-02-05', true, 'monthly', null, 'held', 'import'),
  ('2026-03-05', true, 'monthly', null, 'held', 'import'),
  ('2026-04-02', false, 'monthly', null, 'held', 'import'),
  ('2026-05-07', false, 'monthly', null, 'held', 'import'),
  ('2026-06-04', false, 'monthly', null, 'held', 'import'),
  ('2026-07-02', false, 'monthly', null, 'held', 'import'),
  ('2026-08-06', false, 'monthly', null, 'held', 'import'),
  ('2026-09-03', false, 'monthly', null, 'held', 'import'),
  ('2026-10-01', true, 'monthly', null, 'held', 'import'),
  ('2026-11-05', true, 'monthly', null, 'planned', 'import'),
  ('2026-12-03', true, 'monthly', null, 'planned', 'import')
on conflict (meeting_on, kind) do nothing;

-- ============================= SEED: attendance (Directory tab, as marked)
-- P present, A absent, Z present on Zoom, L present but late; a blank cell in
-- the sheet is no record, not an absence.
insert into public.kindle_attendance (meeting_id, member_id, status, late_min, note, marked_by) values
  ((select id from public.kindle_meeting where meeting_on = '2024-01-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'amitgupta@cccpl.net'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-02-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'amitgupta@cccpl.net'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-03-01' and kind = 'monthly'), (select id from public.kindle_member where email = 'amitgupta@cccpl.net'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-03-22' and kind = 'dinner'), (select id from public.kindle_member where email = 'amitgupta@cccpl.net'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-04-19' and kind = 'monthly'), (select id from public.kindle_member where email = 'amitgupta@cccpl.net'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-05-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'amitgupta@cccpl.net'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-06-07' and kind = 'monthly'), (select id from public.kindle_member where email = 'amitgupta@cccpl.net'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-07-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'amitgupta@cccpl.net'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-08-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'amitgupta@cccpl.net'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-09-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'amitgupta@cccpl.net'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-10-04' and kind = 'monthly'), (select id from public.kindle_member where email = 'amitgupta@cccpl.net'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-11-15' and kind = 'monthly'), (select id from public.kindle_member where email = 'amitgupta@cccpl.net'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2025-05-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'amitgupta@cccpl.net'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2025-12-10' and kind = 'monthly'), (select id from public.kindle_member where email = 'amitgupta@cccpl.net'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2026-01-08' and kind = 'monthly'), (select id from public.kindle_member where email = 'amitgupta@cccpl.net'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2026-02-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'amitgupta@cccpl.net'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-01-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-02-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-03-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-04-07' and kind = 'outbound'), (select id from public.kindle_member where email = 'anil@artis.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-05-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-06-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-07-07' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-08-04' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-09-01' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-10-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-11-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-12-08' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-01-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-02-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-03-01' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-03-22' and kind = 'dinner'), (select id from public.kindle_member where email = 'anil@artis.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-04-19' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-05-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-06-07' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'zoom', 0, 'Present on Zoom', 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-07-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-08-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-09-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-10-04' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-11-15' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2025-05-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2025-12-10' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2026-01-08' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2026-02-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2026-03-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'anil@artis.in'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-01-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-02-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-03-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-04-07' and kind = 'outbound'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-05-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-06-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-07-07' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-08-04' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-09-01' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-10-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-11-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-12-08' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-01-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-02-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-03-01' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-03-22' and kind = 'dinner'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-04-19' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-05-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-06-07' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-07-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-08-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-09-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-10-04' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-11-15' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2025-05-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2025-12-10' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2026-01-08' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2026-02-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'bharat@mahavirhomestore.com'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-01-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-02-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-03-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-04-07' and kind = 'outbound'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-05-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-06-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-07-07' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-08-04' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-09-01' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-10-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-11-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-12-08' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-01-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-02-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-03-01' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-03-22' and kind = 'dinner'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-04-19' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-05-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-06-07' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-07-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-08-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-09-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-10-04' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-11-15' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2025-05-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2025-12-10' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2026-01-08' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2026-02-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2026-03-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'jaydev@aarviencon.com'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-01-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-02-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-03-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-04-07' and kind = 'outbound'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-05-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-06-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-07-07' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-08-04' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-09-01' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-10-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-11-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-12-08' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-01-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-02-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-03-01' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-03-22' and kind = 'dinner'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-04-19' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-05-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-06-07' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-07-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-08-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-09-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-10-04' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-11-15' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2025-05-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2025-12-10' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2026-01-08' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2026-02-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'tojigarshah@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-01-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-02-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-03-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-04-07' and kind = 'outbound'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-05-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-06-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-07-07' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-08-04' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-09-01' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-10-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-11-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-12-08' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-01-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-02-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-03-01' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-03-22' and kind = 'dinner'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-04-19' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-05-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-06-07' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-07-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-08-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-09-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-10-04' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-11-15' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2025-05-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2025-12-10' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2026-01-08' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2026-02-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'nirajt7011@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-01-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-02-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-03-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-04-07' and kind = 'outbound'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-05-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-06-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-07-07' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-08-04' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-09-01' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-10-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-11-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-12-08' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-01-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-02-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-03-01' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-03-22' and kind = 'dinner'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-04-19' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-05-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-06-07' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-07-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-08-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-09-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-10-04' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-11-15' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2025-05-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2025-12-10' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2026-01-08' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2026-02-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'raghu@nandan.co.in'), 'present', 60, 'Present, late by an hour (sheet)', 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-01-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-02-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-03-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-04-07' and kind = 'outbound'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-05-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-06-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-07-07' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-08-04' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-09-01' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-10-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-11-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-12-08' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-01-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-02-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-03-01' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-03-22' and kind = 'dinner'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-04-19' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-05-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-06-07' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-07-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-08-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-09-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-10-04' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-11-15' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2025-05-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2025-12-10' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2026-01-08' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2026-02-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2026-03-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'rlodha@gmail.com'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-01-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-02-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-03-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-04-07' and kind = 'outbound'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-05-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-06-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-07-07' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-08-04' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-09-01' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-10-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-11-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-12-08' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-01-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-02-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-03-01' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-03-22' and kind = 'dinner'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-04-19' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-05-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-06-07' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-07-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-08-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-09-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-10-04' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-11-15' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2025-05-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2025-12-10' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2026-01-08' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2026-02-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2026-03-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'shailesh.jain@mirraw.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-01-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-02-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-03-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-04-07' and kind = 'outbound'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-05-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-06-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-07-07' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-08-04' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-09-01' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-10-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-11-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2023-12-08' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-01-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-02-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-03-01' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-03-22' and kind = 'dinner'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-04-19' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-05-03' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-06-07' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-07-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-08-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-09-06' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-10-04' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2024-11-15' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2025-05-02' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2025-12-10' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2026-01-08' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'present', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2026-02-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'absent', 0, null, 'import'),
  ((select id from public.kindle_meeting where meeting_on = '2026-03-05' and kind = 'monthly'), (select id from public.kindle_member where email = 'valay.lakdavala@neoniche.com'), 'absent', 0, null, 'import')
on conflict (meeting_id, member_id) do nothing;

-- ======================================================= the asks, on record
insert into public.feature_request (title, body, want, status, note, by)
select t, b, 'must', s, n, 'raghu@nandan.co.in' from (values
  ('Kindle — the trust group''s own site under /kindle', '<p>"I want to create a website for this. Currently, put it under genie.nandan.co.in/kindle. Whatever is there in the sheet, I wanted it replicated." (Asked by Dr Raghu in the build chat, 1 Oct 2026.) The ninth door, with its own login realm for the ten Kindlers.</p>', 'done', 'Shipped as Kindle 1.0 — schema for all phases, login, logo, constitution, directory with attendance, settings.'),
  ('Kindle — login for the ten members only, official e-mail, first-login password change', '<p>"This has to have a login page where only 10 of us can log in with the official mail ID that is given in the directory… They have to change the password on the first login itself." (Dr Raghu, 1 Oct 2026.)</p>', 'done', 'Shipped as Kindle 1.0 — invite link opens the site once, a new password is forced before anything else.'),
  ('Kindle — welcome mail to each member with a temporary link', '<p>"Once you create the mail IDs, later on you need to send a welcome mail to everybody with a login and a link that will temporarily open it up." (Dr Raghu, 1 Oct 2026.)</p>', 'open', 'Phase 5 — the invite links exist from Kindle 1.0; the mail goes when he says go.'),
  ('Kindle — settings gear for the facilitator', '<p>"On the top, in the settings, keep an icon so that the facilitator can log in and start changing whatever they want." (Dr Raghu, 1 Oct 2026.)</p>', 'done', 'Shipped as Kindle 1.0 — gear top right for facilitator, co-facilitator and admin.'),
  ('Kindle — a logo for Ascent Kindle', '<p>"We can then create a logo for Ascent Kindle. Right now, we don''t have a logo. Create one of your own as you deem fit." (Dr Raghu, 1 Oct 2026.)</p>', 'done', 'Shipped as Kindle 1.0 — a flame mark with the slogan, as an SVG.'),
  ('Kindle — check-ins per member, readable across months', '<p>"The check-in should have subsections like Valay, Jigar, and Jaydev. If Valay clicks on it, he should be seeing all his check-ins in a nice manner that he can check it across." (Dr Raghu, 1 Oct 2026.)</p>', 'open', 'Phase 2.'),
  ('Kindle — goals set and tracked, carried into each check-in', '<p>"A complete section on goals so that we can set the goals, and then we can track it up. These goals will then become part of the check-in later on so that every person can have independent goals." (Dr Raghu, 1 Oct 2026.)</p>', 'open', 'Phase 2.'),
  ('Kindle — meetings, minutes and agenda', '<p>"All the meetings and the minutes of meetings that we are doing for the monthly meetings should be captured in this… The meeting agenda should be put in." (Dr Raghu, 1 Oct 2026.)</p>', 'open', 'Phase 3 — the meeting list and attendance are in from Kindle 1.0.'),
  ('Kindle — 1-2-1s with details', '<p>"The one-to-ones that each one is doing and the details thereof should be put in." (Dr Raghu, 1 Oct 2026.)</p>', 'open', 'Phase 3.'),
  ('Kindle — message board', '<p>"One section for message boards so that a topic can be put in, and we can use it for conversation with each other." (Dr Raghu, 1 Oct 2026.)</p>', 'open', 'Phase 4.'),
  ('Kindle — polls', '<p>"We should have the facility to make polls so that whatever we want, the polls are captured." (Dr Raghu, 1 Oct 2026.)</p>', 'open', 'Phase 4.'),
  ('Kindle — finances month on month', '<p>"Finances should be kept properly so that month on month, the collections, as well as the budget and other things, can be known." (Dr Raghu, 1 Oct 2026.)</p>', 'open', 'Phase 4.'),
  ('Kindle — exercises a member creates and others take', '<p>"There can be exercises that Valay can maybe create and put in, and we can just go and say, take that exercise." (Dr Raghu, 1 Oct 2026.)</p>', 'open', 'Phase 4.'),
  ('Kindle — photo gallery', '<p>"There has to be a photo gallery which should capture photos from all the times that we''ve been doing." (Dr Raghu, 1 Oct 2026.)</p>', 'open', 'Phase 4.'),
  ('Kindle — participation and progress, computed not typed', '<p>"The system should then be able to see what the participation of each of us is and be able to showcase the progress of whatever we are doing, rather than it being people-enabled." (Dr Raghu, 1 Oct 2026.)</p>', 'open', 'Phase 5.'),
  ('Kindle — birthday mails for members, legal spouses and legal children', '<p>"For everybody''s birthdays, whenever it comes, please make sure there is an email sent out to everybody… Also do that for the legally wedded wife and children… only the legal spouses and legal children." (Dr Raghu, 1 Oct 2026.)</p>', 'open', 'Phase 5 — kindle_family carries is_legal from Kindle 1.0.'),
  ('Kindle — AI built in later', '<p>"We will later on also have AI built into this." (Dr Raghu, 1 Oct 2026.)</p>', 'open', 'After phase 5.')
) as v(t, b, s, n)
where not exists (select 1 from public.feature_request f where f.title = v.t);

insert into public.genie_migration (name) values ('0187_kindle') on conflict (name) do nothing;

-- ---------------------------------------------------- the group’s settings
-- Small named values the facilitator edits from the gear: the WhatsApp
-- group link, the Drive folder the gallery seeds from, the meeting venue.
create table if not exists public.kindle_setting (
  key        text primary key,
  value      text,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.kindle_setting enable row level security;
revoke all on public.kindle_setting from anon, authenticated;
insert into public.kindle_setting (key, value, updated_by) values
  ('whatsapp_link', 'https://chat.whatsapp.com/8kuOSwvWo8p7mBrELZ81r9?mode=gi_t', 'raghu@nandan.co.in'),
  ('drive_photos_folder', '', 'raghu@nandan.co.in'),
  ('meeting_venue', '', 'raghu@nandan.co.in'),
  ('meeting_day', 'First Thursday, 3 pm to 7 pm', 'raghu@nandan.co.in')
on conflict (key) do nothing;
