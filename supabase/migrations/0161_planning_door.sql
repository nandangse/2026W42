-- 0161 — Planning becomes a door (Dr Raghu, 8 Sep 2026, of the Apps list on a
-- login: "in this we will want to go to Planning also").
--
-- Every other module is a tick; Planning was the exception, open to every
-- login that exists. That was fine while everybody in Genie was a planner. It
-- is not fine now: two hundred men have logins for their payslip, and the
-- Apps list should be able to say that Planning is not one of their doors.
--
-- THE DANGEROUS PART, HANDLED. Turning an open room into a locked one locks
-- everybody out on the instant the code ships. So this migration SEEDS the
-- new table with every login that exists today: nobody loses anything, and
-- from tomorrow a tick is a tick like all the others. The only people who
-- will ever need granting are the ones created after this runs.
--
-- Safe to run twice.

create table if not exists public.planning_access (
  email       text primary key,
  granted_by  text,
  granted_at  timestamptz default now()
);

comment on table public.planning_access is
  'Who may open Planning at /. Seeded 8 Sep 2026 with every login then in existence, so making it a door took nothing away from anyone.';

alter table public.planning_access enable row level security;
revoke all on public.planning_access from public, anon, authenticated;

-- ── grandfather everybody who already has a login ──
insert into public.planning_access (email, granted_by)
select lower(p.email), 'seeded by migration 0161 — had it before Planning became a door'
from public.profiles p
where p.email is not null
on conflict (email) do nothing;

create table if not exists public.genie_migration (name text primary key, at timestamptz default now());
insert into public.genie_migration (name) values ('0161_planning_door') on conflict (name) do nothing;

notify pgrst, 'reload schema';

select count(*) as logins_granted_planning from public.planning_access;
