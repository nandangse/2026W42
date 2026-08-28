-- 0082: RELATED TO on tasks (Dr Raghu, 28 Aug 2026) — the swimlane a task
-- belongs to, trackable in Kuber's Tasking and the main Tasking alike:
-- job · goal · rock (Quarterly Rocks) · audit · strategic (Strategic
-- Actions). A task with a job_id is a Jobs task without needing the tag.
-- Line comments only. Additive and safe to re-run.

alter table public.manual_tasks add column if not exists related_to text;
create index if not exists manual_tasks_related_idx on public.manual_tasks (related_to) where related_to is not null;
