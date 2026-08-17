-- 0018_brain_dump.sql
-- Brain Dump: the private capture pad behind Nandan Tasking's last tab.
--
-- One row per captured thought. Everything except the title is optional so a
-- line can be dumped in two seconds and filled in later. Rows are PRIVATE to
-- the person who wrote them (RLS below) — this is a scratch pad, not a board.
-- "Add to board" promotes a row into a real manual_task and stamps
-- promoted_task_id so it can never be promoted twice.
--
-- Purely additive: one new table. Nothing existing is altered.
--
-- NOTE: profiles.reports_to / department / designation / location already
-- exist (migration 0010) — the org chart needed no new columns here.

create table if not exists public.brain_dump (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,

  title       text not null,                       -- WHAT
  detail      text,                                -- HOW
  who         text,                                -- assignee: initials key
  due         date,
  cat         text not null default 'Production',  -- the grouping key below the line
  esc         text default 'None',

  job_id      text references public.jobs (id) on delete set null,
  project     text,                                -- free text: ERP project / order
  goal_id     uuid references public.goal_node (id) on delete set null,

  done        boolean not null default false,
  done_at     timestamptz,
  -- set when the line has been pushed onto the Tasking board; a promoted line
  -- is read-only from then on, so the same thought can't spawn two tasks
  promoted_task_id uuid,
  promoted_at timestamptz,

  created_at  timestamptz not null default now()
);

create index if not exists brain_dump_user_idx on public.brain_dump (user_id, done, created_at desc);
create index if not exists brain_dump_cat_idx  on public.brain_dump (user_id, cat);

comment on table public.brain_dump is
  'Private per-user capture pad. Lines are either ticked DONE or promoted into manual_tasks.';

-- ---------------------------------------------------------------------------
-- RLS: strictly your own lines. No admin override — a scratch pad nobody else
-- can read is the whole point; anything meant to be shared gets promoted.
-- ---------------------------------------------------------------------------
alter table public.brain_dump enable row level security;

drop policy if exists brain_dump_own on public.brain_dump;
create policy brain_dump_own on public.brain_dump
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
