-- 0048_hrms_isolation.sql
--
-- HRMS DATA, ISOLATED AND NAMED AS SUCH (Dr Raghu, 22 Aug 2026).
--
-- Every table holding HR data now carries the hrms_ prefix, so there is no
-- reading of the schema in which a personnel record looks like an ordinary
-- application table:
--
--   employees         -> hrms_employees
--   employee_edits    -> hrms_employee_edits
--   employee_edit_log -> hrms_employee_edit_log
--   hrms_access        (already named)
--
-- A NAME IS NOT A GATE, so the second half of this migration states the
-- access posture explicitly rather than leaving it inherited: RLS is on for
-- all four, and NONE of them has a policy. In Postgres that means a browser
-- holding the anon key -- or a signed-in person's own key -- can read exactly
-- nothing from any of them, no matter what query it sends. The only way in is
-- the service key, used by the server strictly after requireHrms() has
-- checked who is asking.
--
-- WHY A PREFIX AND NOT A SEPARATE SCHEMA: a table in a schema other than
-- public is invisible to PostgREST unless that schema is added to the API's
-- exposed list in the Supabase dashboard -- and once it is exposed, it is
-- reachable by exactly the same keys as public, so the isolation gained is in
-- the name only. The prefix gives the same separation with no dashboard
-- setting to remember, and the deny-all RLS below is what actually keeps
-- people out.
--
-- ONE THING THIS DOES NOT CHANGE, and it should be a deliberate decision:
-- the birthday list on My Week is built from this master, server-side, and is
-- shown to everybody (0024, "birthdays are for everyone"). It reveals a name
-- and a day-and-month, never a year and never anything else. If that is now
-- unwanted, it comes out of /api/my-week -- not out of this migration.
--
-- ASCII only. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Rename, only if the old name is still there
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.employees') is not null
     and to_regclass('public.hrms_employees') is null then
    execute 'alter table public.employees rename to hrms_employees';
  end if;

  if to_regclass('public.employee_edits') is not null
     and to_regclass('public.hrms_employee_edits') is null then
    execute 'alter table public.employee_edits rename to hrms_employee_edits';
  end if;

  if to_regclass('public.employee_edit_log') is not null
     and to_regclass('public.hrms_employee_edit_log') is null then
    execute 'alter table public.employee_edit_log rename to hrms_employee_edit_log';
  end if;
end $$;

-- Indexes keep their old names through a table rename. Cosmetic, but a
-- stray employees_dob_idx is exactly the sort of thing that sends the next
-- person looking for a table that no longer exists.
do $$
declare r record;
begin
  for r in
    select indexname from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'employees_dob_idx', 'employees_active_idx', 'employees_email_idx',
        'employee_edits_field_idx', 'employee_edit_log_emp_idx'
      )
  loop
    execute format('alter index public.%I rename to %I', r.indexname, 'hrms_' || r.indexname);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Shut every door but the service key
-- ---------------------------------------------------------------------------
-- Stated here in full rather than relied upon from 0024/0047, so that this
-- one file answers "who can read HR data" without cross-referencing.
alter table public.hrms_employees         enable row level security;
alter table public.hrms_employee_edits    enable row level security;
alter table public.hrms_employee_edit_log enable row level security;
alter table public.hrms_access            enable row level security;

-- Drop anything that ever granted a browser a way in. 0047 removed
-- employees_read; this catches it on an installation where 0047 has not run,
-- and catches any policy added by hand later.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in (
        'hrms_employees', 'hrms_employee_edits',
        'hrms_employee_edit_log', 'hrms_access',
        'employees', 'employee_edits', 'employee_edit_log'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Belt and braces: even with RLS off by accident, the anon and signed-in
-- roles are not to hold table privileges on these.
revoke all on public.hrms_employees         from anon, authenticated;
revoke all on public.hrms_employee_edits    from anon, authenticated;
revoke all on public.hrms_employee_edit_log from anon, authenticated;
revoke all on public.hrms_access            from anon, authenticated;

comment on table public.hrms_employees is
  'HRMS: the employee master, uploaded from the HR sheet. Service role only -- '
  'RLS on with no policies, and no grants to anon/authenticated. Reached '
  'through /api/hrms/* behind requireHrms(), and by /api/my-week for the '
  'birthday day-and-month only.';
comment on table public.hrms_employee_edits is
  'HRMS: per-field overlay on hrms_employees, applied on read. Holds personal '
  'telephone numbers, addresses and next of kin. Service role only.';
comment on table public.hrms_employee_edit_log is
  'HRMS: append-only history of every change made in HRMS. Service role only.';
comment on table public.hrms_access is
  'HRMS: who may open /hrms, keyed by email so a grant can precede the '
  'account. Service role only.';
