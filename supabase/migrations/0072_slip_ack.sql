-- 0072_slip_ack.sql
--
-- WHEN THE PERSON SAW THEIR SLIP (Dr Raghu, 27 Aug 2026): the self-service
-- page shows each person their own salary slip, and the FIRST time they open
-- it is the acknowledgement -- the datestamp HR later points to. The last
-- access is kept beside it, and the count between them.
--
-- One row per person per month's sheet. The first_at is written once and
-- never updated; a repeat visit touches last_at and opens alone. Nothing
-- here is deletable from the app -- an acknowledgement that can be unsaid
-- is not an acknowledgement.
--
-- ASCII only, additive, safe to re-run.

create table if not exists public.hrms_slip_ack (
  sheet_id    uuid not null,
  employee_id text not null,
  email       text,
  first_at    timestamptz not null default now(),
  last_at     timestamptz not null default now(),
  opens       integer not null default 1,
  primary key (sheet_id, employee_id)
);

comment on table public.hrms_slip_ack is
  'First and last time each employee opened their own salary slip. '
  'first_at is the acknowledgement date shown in HRMS.';

alter table public.hrms_slip_ack enable row level security;
revoke all on public.hrms_slip_ack from anon, authenticated;
