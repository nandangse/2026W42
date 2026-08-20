-- 0044_task_proposals.sql
--
-- Tasks Genie hears in a shop-floor voice note -- PROPOSED, never created.
--
-- WHY PROPOSALS AND NOT TASKS
--
-- A task list is only worth opening if everything on it was put there on
-- purpose. The fastest way to make one untrustworthy is to have things appear
-- in it that nobody asked for: within a fortnight people stop reading the list
-- and start asking each other what is actually needed, which is the problem
-- the list existed to solve.
--
-- So Genie proposes and a person accepts. Accepting creates an ordinary task,
-- indistinguishable from a typed one, and the proposal records which task it
-- became. Dismissing keeps the proposal with its reason -- a suggestion
-- rejected twice for the same reason is a prompt that needs fixing, and that
-- is only visible if the rejections are kept.
--
-- ONE TASK PER PROPOSAL. Dr Raghu's word: singular. "Chase the gearbox and
-- call Monopol" is two, and two things on one line is the line nobody can
-- close.
--
-- Additive and safe to re-run.

create table if not exists public.task_proposal (
  id        uuid primary key default gen_random_uuid(),
  job_id    text not null,
  /** Where it came from -- today always a voice note. */
  source    text not null default 'voice',
  source_id uuid,
  title     text not null,
  detail    text not null default '',
  cat       text,
  /** What Genie heard as the deadline, if anything was said. */
  due       date,
  status    text not null default 'proposed'
            check (status in ('proposed', 'accepted', 'dismissed')),
  /** The task it became, once somebody accepted it. */
  task_id   uuid,
  acted_by  text,
  acted_at  timestamptz,
  /** Why it was turned down. A pattern here is a prompt worth changing. */
  reason    text,
  at        timestamptz not null default now(),
  constraint task_proposal_title_len check (length(btrim(title)) >= 3)
);

comment on table public.task_proposal is
  'Tasks Genie heard in a voice note. Proposed only -- a person accepts before anything reaches a task list.';

create index if not exists task_proposal_open_idx
  on public.task_proposal (job_id, at desc) where status = 'proposed';

alter table public.task_proposal enable row level security;

-- Everybody signed in sees them; they are about work on the shop floor.
drop policy if exists task_proposal_read on public.task_proposal;
create policy task_proposal_read on public.task_proposal
  for select to authenticated
  using (true);

-- Accept and dismiss go through /api/task-proposal with the service key, which
-- is what creates the task and links it back. No client-side write policy.
