-- 0049_hrms_masters.sql
--
-- MODULE MASTERS — every dropdown in HRIS, in one table (Dr Raghu, 23 Aug 2026).
--
-- A master is the list of things a field is allowed to say. Department, Grade,
-- Type, Shift, Blood Group and the rest were free text, which is how a master
-- of 380 people ends up with "B+", "B +ve" and "B Positive" as three different
-- blood groups and no report can count any of them.
--
-- ONE TABLE, not fifteen. Fifteen tables would mean fifteen screens, fifteen
-- routes and fifteen chances for the next list to be built slightly
-- differently. `kind` says which list a row belongs to.
--
-- ROLE vs DESIGNATION, which is the distinction that made this necessary:
-- the ROLE is enforceable and comes from this master -- it is what the person
-- is accountable for, and the Goalbook defines a JD, a deliverable and a
-- metric against it. The DESIGNATION is what goes on a visiting card. It
-- defaults to the role and may be overwritten, because vanity is real and
-- harmless as long as it cannot be mistaken for the role.
--
-- Seeded FROM THE DATA THAT IS ALREADY THERE, so no list starts empty and
-- nobody has to type 380 people's worth of history back in. Dr Raghu will
-- prune them afterwards -- that is expected, and it is why deleting a master
-- value asks what to do with the records using it.
--
-- ASCII only, additive, safe to re-run.

create table if not exists public.hrms_master (
  kind        text not null,
  value       text not null,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now(),
  primary key (kind, value)
);

comment on table public.hrms_master is
  'HRIS dropdown masters. kind = role, department, grade, status, type, '
  'location, qualification, shirt_size, pant_size, shoe_size, blood_group, '
  'religion, marital_status, gender, shift. Service role only, like every '
  'other hrms_ table.';

create index if not exists hrms_master_kind_idx on public.hrms_master (kind, sort_order, value);

alter table public.hrms_master enable row level security;
revoke all on public.hrms_master from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed 1: the two lists that are fixed by policy rather than by history
-- ---------------------------------------------------------------------------
insert into public.hrms_master (kind, value, sort_order, created_by) values
  ('status', 'Active',            1, 'migration 0049'),
  ('status', 'Resigned',          2, 'migration 0049'),
  ('status', 'Terminated',        3, 'migration 0049'),
  ('status', 'Doubtful',          4, 'migration 0049'),
  ('status', 'Notice Period',     5, 'migration 0049'),
  ('status', 'F&F Due',           6, 'migration 0049'),
  ('type',   'Management',        1, 'migration 0049'),
  ('type',   'Staff',             2, 'migration 0049'),
  ('type',   'Labour',            3, 'migration 0049'),
  ('type',   'Contractor',        4, 'migration 0049'),
  ('type',   'Labour - Contract', 5, 'migration 0049'),
  ('type',   'Trainee',           6, 'migration 0049'),
  ('type',   'Staff - Contract',  7, 'migration 0049')
on conflict (kind, value) do nothing;

-- ---------------------------------------------------------------------------
-- Seed 2: everything else, from what the 380 records actually say today
-- ---------------------------------------------------------------------------
do $$
declare
  m record;
  -- kind, and where its values live: a named column, or a key in extra
  pairs text[][] := array[
    ['department',     'col:department'],
    ['location',       'col:location'],
    ['role',           'col:designation'],
    ['qualification',  'ext:Qualification'],
    ['shirt_size',     'ext:Shirt Size'],
    ['pant_size',      'ext:Pant Size'],
    ['shoe_size',      'ext:Shoe Size'],
    ['blood_group',    'ext:Blood Group'],
    ['religion',       'ext:Religion'],
    ['marital_status', 'ext:Marital Status'],
    ['gender',         'ext:Gender'],
    ['shift',          'ext:Shift']
  ];
  k text;
  src text;
  i int;
begin
  if to_regclass('public.hrms_employees') is null then return; end if;

  for i in 1 .. array_length(pairs, 1) loop
    k   := pairs[i][1];
    src := pairs[i][2];
    if src like 'col:%' then
      execute format(
        'insert into public.hrms_master (kind, value, created_by)
           select distinct %L, btrim(%I::text), ''migration 0049 (from the data)''
           from public.hrms_employees
          where btrim(coalesce(%I::text, '''')) <> ''''
            and btrim(coalesce(%I::text, '''')) not in (''N/A'', ''NA'', ''-'')
         on conflict (kind, value) do nothing',
        k, substring(src from 5), substring(src from 5), substring(src from 5));
    else
      execute format(
        'insert into public.hrms_master (kind, value, created_by)
           select distinct %L, btrim(extra->>%L), ''migration 0049 (from the data)''
           from public.hrms_employees
          where btrim(coalesce(extra->>%L, '''')) <> ''''
            and btrim(coalesce(extra->>%L, '''')) not in (''N/A'', ''NA'', ''-'')
         on conflict (kind, value) do nothing',
        k, substring(src from 5), substring(src from 5), substring(src from 5));
    end if;
  end loop;
end $$;

-- Grade has no history to seed from -- the Goalbook holds it and it has not
-- been imported. Left deliberately empty rather than guessed at.
