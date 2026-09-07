-- 0152_material_received_at.sql — Genie 5.0.11.3 (7 Sep 2026)
--
-- Dr Raghu, 7 Sep 2026: "the recieved should change status" — and, on being
-- asked whether he wanted a Received-on field: "not recieved ON... when the
-- status is changed to recieved its the date the task is closed."
--
-- So the date is not something anybody types. The moment a line is marked
-- Received the clock is read and that is the receipt date; move it back to
-- Yet to receive or QC Defective and the date goes, because the thing is no
-- longer received and a stale date would say it was.
alter table public.materials add column if not exists received_at timestamptz;
create index if not exists materials_received_idx on public.materials (received_at desc);

create table if not exists public.genie_migration (name text primary key, applied_at timestamptz not null default now());
insert into public.genie_migration (name) values ('0152_material_received_at') on conflict (name) do nothing;
