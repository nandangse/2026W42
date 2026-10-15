-- 0235 — THE QUERY SOLVER (Genie 6.10.2.0)
--
-- Dr Raghu, 15 Oct 2026, on the project book's Real Issues Solving tab: "this
-- Real Issues is Query Solver. In that also keep two types — client and ours.
-- Keep the task list item as: Query Solver — yes or no; Client shared — yes or
-- no. The department, assigned, etc are as per normal. It will be assigned to
-- projects; this will also be visible to clients — in the portal also it
-- will come up."
--
-- A query is a task that says so. Nothing new to raise, assign or close: the
-- same task list, two ticks on the task. A task ticked Query Solver earns a
-- number (Q-0001, stable for life); ticked Client shared, it shows on the
-- customer's portal under Query solver, read-only there.

create sequence if not exists public.query_solver_seq;

alter table public.manual_tasks add column if not exists query_solver  boolean not null default false;
alter table public.manual_tasks add column if not exists query_kind    text check (query_kind in ('client','ours'));
alter table public.manual_tasks add column if not exists client_shared boolean not null default false;
alter table public.manual_tasks add column if not exists query_no      integer;
alter table public.manual_tasks add column if not exists raised_on     date;

alter table public.erp_tasks add column if not exists query_solver  boolean not null default false;
alter table public.erp_tasks add column if not exists query_kind    text check (query_kind in ('client','ours'));
alter table public.erp_tasks add column if not exists client_shared boolean not null default false;
alter table public.erp_tasks add column if not exists query_no      integer;
alter table public.erp_tasks add column if not exists raised_on     date;

create index if not exists manual_tasks_query_idx on public.manual_tasks (query_solver) where query_solver;
create index if not exists erp_tasks_query_idx    on public.erp_tasks (query_solver) where query_solver;

insert into public.feature_request (title, body, want, status, note, by)
select 'Query Solver — Real Issues Solving becomes the Query Solver; client / ours; two ticks on every task; shown to the client on the portal', '<p>"this real issues is query solver. in that also keep two types - client and ours. Keep the task list item as Query Solver - Yes or no, Client shared - yes or no. The department, assigned, etc are as per normal … it will be assigned to projects, this will also be visible to clients, in this portal also it will come up and be seen" (Dr Raghu, 15 Oct 2026.)</p>', 'must', 'done', 'Shipped as Genie 6.10.2.0.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title like 'Query Solver — Real Issues Solving becomes%');

insert into public.genie_migration (name) values ('0235_query_solver') on conflict (name) do nothing;
