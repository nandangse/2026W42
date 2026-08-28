-- 0090: design stages become SPANS (Dr Raghu, 28 Aug 2026): "I need a start
-- date, end date, and how many days it is taking… change 5 to 6 and the end
-- date will change automatically — a simple system so the design team can
-- plan the design project in a better manner."
--
-- Three fields that keep each other honest: start + end computes the days
-- (inclusive); change the days and the end moves. The old single date is
-- carried over as the end date, losing nothing.
--
-- Line comments only. Safe to re-run.

alter table public.vishwa_design_plan add column if not exists start_date date;
alter table public.vishwa_design_plan add column if not exists end_date   date;
alter table public.vishwa_design_plan add column if not exists days       integer;

update public.vishwa_design_plan set end_date = on_date
where end_date is null and on_date is not null;

-- Same day, minutes later: THIS WEEK'S WORKING ties to a PROJECT and a
-- STAGE (Project name, BOM, GAD, Manuf, As-built per date) — the designer ×
-- date calendar reads these for load visibility.
alter table public.vishwa_week_work add column if not exists project_id text;
alter table public.vishwa_week_work add column if not exists stage      text;
