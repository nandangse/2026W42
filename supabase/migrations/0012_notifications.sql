-- 0012_notifications.sql
-- In-app notifications: a row lands here whenever someone is assigned a task
-- or made owner of a goal node. The header bell reads the unread count.
-- Purely additive; safe to re-run.

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('task_assigned','task_reassigned','goal_assigned')),
  title      text not null,
  body       text default '',
  ref_kind   text,            -- 'manual' | 'erp' | 'goal'
  ref_id     text,
  created_by text,            -- initials/email of whoever assigned it
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_person_idx
  on public.notifications (person_id, read_at, created_at desc);

alter table public.notifications enable row level security;

-- you see only your own; you can mark only your own read.
-- INSERTs happen exclusively through the service role (server routes), so
-- there is deliberately no insert policy.
drop policy if exists notif_read on public.notifications;
create policy notif_read on public.notifications
  for select using (person_id = auth.uid());

drop policy if exists notif_mark on public.notifications;
create policy notif_mark on public.notifications
  for update using (person_id = auth.uid()) with check (person_id = auth.uid());
