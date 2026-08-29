-- 0100: LEARNING QUEUE ORDER (Dr Raghu, 29 Aug 2026: The Goal movie in
-- Hindi to every learning queue, at the top, then Kaizen days 1-5).
-- A queue needs an order: smaller floats up; self-planned lessons keep the
-- default 1000 and follow the assigned trainings.
--
-- Line comments only. Safe to re-run.

alter table public.lms_progress add column if not exists sort_order int not null default 1000;
