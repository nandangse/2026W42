-- 0217 — LEADERS COUNCIL: ATTENDEES ARE EMPLOYEES FIRST, THEN GUESTS (Genie 6.4.0.3)
--
-- Dr Raghu, 10 Oct 2026, on the attendees box: "this should have it from
-- writing employees first, then mention non-employees. This then can become
-- the standard MoM in system!!! Also put in template. It will come from
-- template."
--
-- attendees stays the employees (picked from HRMS); guests are the names of
-- those who are not on the rolls. The minutes template lives in lc_setting
-- under 'mom_template' — Dr Raghu edits it once, every new set of minutes
-- opens on it.

alter table public.lc_meeting add column if not exists guests text[] not null default '{}';

insert into public.genie_migration (name) values ('0217_lc_meeting_guests') on conflict (name) do nothing;
