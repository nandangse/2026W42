-- 0199 — a task may hang off a goal, or a project, as well as a job
-- (Dr Raghu, 5 Oct 2026: "in this have a tasklist - My Tasks … Show options
-- for By Project, By Goals … make provision to add by lightbox tasks").
--
-- Until now a manual task knew only its job; the project was read off the
-- job and a goal was not a thing a task could name. The Brain Dump pad has
-- carried project and goal_id since 0090 and lost both the moment a line
-- was promoted. These two columns let a task say which goal or project it
-- serves even when it has no job — and My Tasks groups on them.

alter table public.manual_tasks add column if not exists goal_id uuid references public.goal_item (id) on delete set null;
alter table public.manual_tasks add column if not exists project text;
create index if not exists manual_tasks_goal_idx on public.manual_tasks (goal_id);

comment on column public.manual_tasks.goal_id is 'The goal, sub goal or initiative this task serves (goal_item.id). Null when it serves none.';
comment on column public.manual_tasks.project is 'The ERP project (NGSE-PROJ-…) when the task is on a project rather than one job. The job''s own project still counts when this is null.';

-- The Brain Dump pad’s goal column still pointed at goal_node, the goals
-- layer before 0019, so no goal from today’s tree could be filed on a line.
-- It now points where the rest of Genie’s goals live.
alter table public.brain_dump drop constraint if exists brain_dump_goal_id_fkey;
update public.brain_dump set goal_id = null
 where goal_id is not null and goal_id not in (select id from public.goal_item);
alter table public.brain_dump add constraint brain_dump_goal_id_fkey
  foreign key (goal_id) references public.goal_item (id) on delete set null;
