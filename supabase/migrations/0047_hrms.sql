-- 0047_hrms.sql
--
-- HRMS — the people side of Genie, at /hrms.
--
-- A SEPARATE SPACE, NOT A TAB. It has its own URL because it is a different
-- kind of thing from the planning boards: the boards are about jobs and are
-- read by everybody, and this is about people and is read by three.
--
-- Three tables and one policy change:
--
--   hrms_access       — who may open it. Keyed by EMAIL, not by profile id,
--                       which is the one difference from sales_access (0013)
--                       and it is deliberate: hr@nandan.co.in has no Genie
--                       login yet, and a grant that cannot be written until
--                       the account exists is a grant somebody forgets to
--                       write. The row waits; the moment the account is
--                       created it is already admitted.
--
--   employee_edits    — the OVERLAY. `employees` is fed by the HR sheet and
--                       every upload upserts it wholesale (upload-merge.ts),
--                       so anything typed into a sheet-carried column would be
--                       silently overwritten the next morning. Instead an edit
--                       is stored here, per field, and applied on READ. The
--                       sheet keeps its value; HRMS shows the edited one and
--                       says what the sheet still holds. Fields the sheet does
--                       not carry at all (phone, emergency contact, blood
--                       group) live here too, by the same mechanism.
--
--   employee_edit_log — append-only history: field, from, to, who, when.
--                       "History of changes" is not a nice-to-have on a people
--                       record; it is the whole reason anybody trusts one.
--
-- ASCII-safe wording in code, additive, safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Who may open HRMS
-- ---------------------------------------------------------------------------
create table if not exists public.hrms_access (
  email      text primary key,
  granted_by text,
  granted_at timestamptz not null default now()
);

comment on table public.hrms_access is
  'Who may open /hrms. Email-keyed so a grant can be made before the account '
  'exists. The owner is admitted implicitly and is not stored here.';

alter table public.hrms_access enable row level security;

-- No select policy: the check runs server-side with the service key
-- (requireHrms). A browser has no business enumerating who can see HR data.

-- ---------------------------------------------------------------------------
-- 2. The overlay on the employee master
-- ---------------------------------------------------------------------------
create table if not exists public.employee_edits (
  employee_id text not null references public.employees (id) on delete cascade,
  field       text not null,
  value       text,
  edited_by   text,
  edited_at   timestamptz not null default now(),
  primary key (employee_id, field)
);

comment on table public.employee_edits is
  'Per-field overlay on public.employees. Applied on read by /api/hrms. The '
  'HR-sheet upload never touches this table, so an edit survives the next '
  'morning upload.';

create index if not exists employee_edits_field_idx on public.employee_edits (field);

alter table public.employee_edits enable row level security;
-- Deliberately no policies. Personal telephone numbers, addresses and next of
-- kin are in here; they are served only through the HRMS routes, which check
-- hrms_access first.

-- ---------------------------------------------------------------------------
-- 3. History
-- ---------------------------------------------------------------------------
create table if not exists public.employee_edit_log (
  id          uuid primary key default gen_random_uuid(),
  employee_id text not null,
  field       text not null,
  old_value   text,
  new_value   text,
  edited_by   text,
  edited_at   timestamptz not null default now()
);

comment on table public.employee_edit_log is
  'Append-only record of every change made in HRMS. Never updated, never '
  'deleted -- a people record with no history is worth nothing in a dispute.';

create index if not exists employee_edit_log_emp_idx
  on public.employee_edit_log (employee_id, edited_at desc);

alter table public.employee_edit_log enable row level security;
-- service role only, as above.

-- ---------------------------------------------------------------------------
-- 4. Close the employee master to the browser
-- ---------------------------------------------------------------------------
-- 0024 gave public.employees a read policy for every signed-in user, on the
-- grounds that birthdays are for everyone. They are -- but the birthday list
-- is built SERVER-SIDE in /api/my-week with the service key, and nothing in
-- the browser has ever queried this table. The policy therefore protected
-- nothing and permitted a signed-in person to pull all 364 rows, dates of
-- birth and joining included, straight from PostgREST with the anon key.
--
-- Verified before removing: the only readers are /api/my-week (service key)
-- and upload-merge.ts (service key). Both are unaffected.
drop policy if exists employees_read on public.employees;

comment on table public.employees is
  'Active-employee master, uploaded from the HR sheet. Service-role reads '
  'only (0047) -- reached through /api/my-week for birthdays and through the '
  'HRMS routes for everything else. Edits live in public.employee_edits.';

-- ---------------------------------------------------------------------------
-- 5. Seed: the three people HRMS is for
-- ---------------------------------------------------------------------------
-- hr@nandan.co.in is the HR Manager's address on the employee master and has
-- no Genie login yet. The grant is written anyway -- see the note at the top.
insert into public.hrms_access (email, granted_by)
values
  ('raghu@nandan.co.in',  'migration 0047'),
  ('tushar@nandan.co.in', 'migration 0047'),
  ('hr@nandan.co.in',     'migration 0047')
on conflict (email) do nothing;
