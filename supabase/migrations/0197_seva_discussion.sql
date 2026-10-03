-- 0197 — discussion points (Dr Raghu, 3 Oct 2026: "show discussion points as
-- a menu item too. It will have a table with Open issues. This is something
-- that they need to discuss with me"). Every open ticket is a point until it
-- is closed; the team writes the point beside it, and he ticks it discussed.

alter table public.seva_issue add column if not exists discuss_note  text not null default '';
alter table public.seva_issue add column if not exists discussed_at  date;
