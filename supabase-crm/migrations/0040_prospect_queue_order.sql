-- CRM 0040 — the Prospecting Queue obeys the hand (30 Aug 2026)
-- "prospecting queue can be rearranged by dragging" — a sort order the drag
-- writes; rows without one keep their oldest-first place at the end.
alter table prospect_queue add column if not exists sort_order int;
