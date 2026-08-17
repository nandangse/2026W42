-- 0024_esc_rename_and_employees.sql
--
-- 1. Rename the escalation level on tasks ALREADY raised.
--
--    3.0.1.1 changed the dropdown to "L2 - Leaders", but esc is stored as the
--    literal label, so every task raised before that still holds "L2 -
--    Production Head" — and By Escalations groups on the stored string, so the
--    old wording stayed on screen in its own lane. Renaming the option without
--    rewriting the rows split one level into two.
--
-- 2. The employee master, so Genie knows who works here and when their
--    birthday is. Uploaded from the HR sheet; see src/lib/sources.ts.

-- ---------------------------------------------------------------------------
-- 1. Escalation labels, everywhere they are stored
-- ---------------------------------------------------------------------------
update public.manual_tasks set esc = 'L2 — Leaders' where esc = 'L2 — Production Head';
update public.erp_tasks    set esc = 'L2 — Leaders' where esc = 'L2 — Production Head';

-- the same field on the brain dump, when that table is present
do $$
begin
  if to_regclass('public.brain_dump') is not null then
    execute $q$update public.brain_dump set esc = 'L2 — Leaders' where esc = 'L2 — Production Head'$q$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Employee master
-- ---------------------------------------------------------------------------
create table if not exists public.employees (
  -- the HR sheet's own employee code where it has one, else a slug of the name
  id          text primary key,
  name        text not null,
  email       text,
  dob         date,
  doj         date,
  department  text,
  designation text,
  location    text,
  active      boolean not null default true,
  -- Everything else the sheet carried, kept verbatim. The master will grow
  -- columns over time and re-migrating for each one is how a feed dies; this
  -- way an added column survives the next upload without a schema change.
  extra       jsonb not null default '{}'::jsonb,
  first_seen  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists employees_dob_idx    on public.employees ((extract(month from dob)), (extract(day from dob)));
create index if not exists employees_active_idx on public.employees (active);
create index if not exists employees_email_idx  on public.employees (lower(email));

alter table public.employees enable row level security;

-- Birthdays are for everyone; the rest of the master is not sensitive either,
-- but writing is the owner's alone and goes through the service role.
drop policy if exists employees_read on public.employees;
create policy employees_read on public.employees
  for select using (auth.uid() is not null);

comment on table public.employees is
  'Active-employee master, uploaded from the HR sheet by the owner. Drives the '
  'birthday list; extra jsonb carries whatever else the sheet holds.';
