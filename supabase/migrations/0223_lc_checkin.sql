-- 0223 — LEADERS COUNCIL: THE LEADERS CHECK-IN ON A MEETING (Genie 6.4.0.14)
--
-- Dr Raghu, 10 Oct 2026: "On top add a button saying Leaders Check in. In
-- that: date, leader's name, Top 1 (T1), Top 2 (T2), Bottom 1 (B1), Burning
-- issue / Sounding Board for the meeting (will go to the Solution Board;
-- a problem that needs to be solved, non-transactional), My goals from the
-- last quarter audit (goal - results, add more), My plan for the next 99
-- days for the department and myself, any learning done."
--
-- One check-in per leader per meeting. The burning issue raises a problem on
-- the Solution Board the first time it is saved; the problem's id is kept so
-- a later edit changes the words and never raises a second.

-- "have a related to dropdown also" (Dr Raghu, 10 Oct 2026, on the Solution
-- Board): which part of the company the problem belongs to. One word from a
-- fixed list; a filter on the board; the check-in's burning issue picks it too.
alter table public.lc_problem add column if not exists related_to text;
create index if not exists lc_problem_related_to_idx on public.lc_problem (related_to);

create table if not exists public.lc_checkin (
  id                  uuid primary key default gen_random_uuid(),
  meeting_id          uuid not null references public.lc_meeting(id) on delete cascade,
  email               text not null,
  on_date             date not null default current_date,
  t1                  text,
  t2                  text,
  b1                  text,
  burning             text,
  burning_related_to  text,
  burning_problem_id  uuid references public.lc_problem(id) on delete set null,
  goals               jsonb not null default '[]'::jsonb,   -- [{goal, result}]
  plan_99             text,
  learning            text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (meeting_id, email)
);
alter table public.lc_checkin enable row level security;
revoke all on public.lc_checkin from anon, authenticated;

insert into public.feature_request (title, body, want, status, note, by)
select 'Leaders Council — Leaders Check-in on every meeting (T1, T2, B1, burning issue, goals, 99-day plan, learning); Related to on the Solution Board', '<p>"On top add a button saying Leaders Check in … date, leader name, T1, T2, B1, burning issue / sounding board (will go to the Solution Board), my goals from the last quarter audit (goal - results, add more), my plan for the next 99 days, any learning done." … "have a related to dropdown also." (Dr Raghu, 10 Oct 2026.)</p>', 'must', 'done', 'Shipped as Genie 6.4.0.14.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title like 'Leaders Council — Leaders Check-in%');

insert into public.genie_migration (name) values ('0223_lc_checkin') on conflict (name) do nothing;
