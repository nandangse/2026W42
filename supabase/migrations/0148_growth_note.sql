-- 0148_growth_note.sql — Genie 5.0.5.0 (7 Sep 2026)
--
-- THE GROWTH NOTE (Dr Raghu, 7 Sep 2026): "also show the growth note of
-- CHRO. Write this in Raghu's voice to the person directly. Use first person
-- and also use his name at least 2 to 3 times. For the workers mention this
-- in Hindi also."
--
-- The note a person is handed at their appraisal, written as Dr Raghu
-- speaking to them. Kept on the cycle beside the brief, so it is written
-- once and read many times. Hindi beside it for the people on the floor.
alter table public.hrms_appraisal add column if not exists growth_note text;
alter table public.hrms_appraisal add column if not exists growth_note_hi text;
alter table public.hrms_appraisal add column if not exists growth_note_at timestamptz;

create table if not exists public.genie_migration (name text primary key, applied_at timestamptz not null default now());
insert into public.genie_migration (name) values ('0148_growth_note') on conflict (name) do nothing;
