-- 0019_goals_v2.sql
-- The Goals section, rebuilt.
--
-- The 0010 layer modelled one fixed shape: five organisational goals with a
-- five-level cascade below each. That is not how the company actually sets
-- goals, so this replaces it with six views over one goal table:
--
--   Company Goals            scope = 'company'    admin writes, everyone reads
--   Quarterly Rocks          rock_project + goals hung off it
--   Departmental Goals       scope = 'department'
--   My Goals                 scope = 'personal'
--   My Key Result Areas      kra
--   KPIs Relevant to me      kpi
--
-- PURELY ADDITIVE. Nothing from 0010 is altered or dropped — goal_node and its
-- companions simply stop being read. That keeps a rollback to a code revert,
-- and keeps the old tree available if anything in it is worth re-typing.

-- ---------------------------------------------------------------------------
-- 1. Masters: departments and audience bands
-- ---------------------------------------------------------------------------
create table if not exists public.departments (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  code           text,
  color          text default '#1B3A5C',
  head_person_id uuid references public.profiles (id) on delete set null,
  sort_order     integer default 0,
  active         boolean not null default true
);

insert into public.departments (name, code, color, sort_order) values
  ('Design & Engineering', 'DES', '#1B3A5C', 1),
  ('Production',           'PRD', '#0D7A3F', 2),
  ('Quality',              'QLY', '#0D9488', 3),
  ('Supply Chain',         'SCM', '#D97706', 4),
  ('Projects',             'PRJ', '#7C3AED', 5),
  ('Sales & Marketing',    'SLS', '#E8600A', 6),
  ('Service & Support',    'SVC', '#0EA5E9', 7),
  ('Finance',              'FIN', '#B3261E', 8),
  ('HR & Admin',           'HRA', '#8A94A0', 9),
  ('IT',                   'IT',  '#5A6672', 10)
on conflict (name) do nothing;

-- a person belongs to one department; the column drives "my department's goals"
alter table public.profiles add column if not exists department_id uuid
  references public.departments (id) on delete set null;
create index if not exists profiles_department_idx on public.profiles (department_id);

-- Audience bands. A goal carries any number of them; a person belongs to any
-- number of them. 'all' is the open band — a goal marked 'all' is visible to
-- everyone who can open the Goals section at all.
create table if not exists public.goal_band (
  code       text primary key,
  label      text not null,
  note       text,
  sort_order integer default 0
);

insert into public.goal_band (code, label, note, sort_order) values
  ('management', 'Management', 'The leadership group.', 1),
  ('stratcom',   'Stratcom',   'The strategy committee.', 2),
  ('lc',         'LC',         'The leadership circle.', 3),
  ('all',        'All',        'Open to everyone with Goals access.', 4)
on conflict (code) do nothing;

create table if not exists public.person_band (
  person_id uuid not null references public.profiles (id) on delete cascade,
  band      text not null references public.goal_band (code) on delete cascade,
  primary key (person_id, band)
);
create index if not exists person_band_person_idx on public.person_band (person_id);

-- ---------------------------------------------------------------------------
-- 2. Quarterly Rocks — named projects that goals hang off
-- ---------------------------------------------------------------------------
create table if not exists public.rock_project (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  detail      text default '',
  quarter     text not null default 'Q1',            -- Q1 … Q4
  period      text not null default 'FY2026-27',
  owner_id    uuid references public.profiles (id) on delete set null,
  dept_id     uuid references public.departments (id) on delete set null,
  start_date  date,
  due_date    date,
  status      text not null default 'not_started'
              check (status in ('not_started','on_track','at_risk','blocked','done')),
  bands       text[] not null default '{all}',
  color       text default '#E8600A',
  sort_order  integer default 0,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists rock_period_idx on public.rock_project (period, quarter);

-- ---------------------------------------------------------------------------
-- 3. Key Result Areas — standing responsibility areas, assigned by admin
-- ---------------------------------------------------------------------------
create table if not exists public.kra (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references public.profiles (id) on delete cascade,
  dept_id    uuid references public.departments (id) on delete set null,
  title      text not null,
  detail     text default '',
  weight     numeric not null default 1,             -- share of the role, for the ring
  sort_order integer default 0,
  active     boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists kra_person_idx on public.kra (person_id);

-- ---------------------------------------------------------------------------
-- 4. KPIs — named measures, owned by a person or a department
-- ---------------------------------------------------------------------------
create table if not exists public.kpi (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  detail        text default '',
  unit          text default '',
  owner_id      uuid references public.profiles (id) on delete set null,
  dept_id       uuid references public.departments (id) on delete set null,
  start_value   numeric,
  current_value numeric,
  target_value  numeric,
  -- when set, current_value is READ from the planning data by
  -- src/lib/goal-metrics.ts instead of being typed in a review
  metric_source text,
  cadence       text default 'monthly',
  period        text not null default 'FY2026-27',
  bands         text[] not null default '{all}',
  sort_order    integer default 0,
  active        boolean not null default true,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists kpi_owner_idx on public.kpi (owner_id);
create index if not exists kpi_dept_idx  on public.kpi (dept_id);

-- people explicitly told to watch a KPI they neither own nor sit under
create table if not exists public.kpi_watcher (
  kpi_id    uuid not null references public.kpi (id) on delete cascade,
  person_id uuid not null references public.profiles (id) on delete cascade,
  primary key (kpi_id, person_id)
);
create index if not exists kpi_watcher_person_idx on public.kpi_watcher (person_id);

-- ---------------------------------------------------------------------------
-- 5. The goal itself — one self-referencing table for goal / sub-goal /
--    initiative, at every scope
-- ---------------------------------------------------------------------------
create table if not exists public.goal_item (
  id             uuid primary key default gen_random_uuid(),

  -- which tab this belongs to. Inherited by every descendant, so a sub-goal
  -- of a company goal never drifts into someone's personal list.
  scope          text not null default 'company'
                 check (scope in ('company','rock','department','personal')),
  kind           text not null default 'goal'
                 check (kind in ('goal','subgoal','initiative')),

  parent_id      uuid references public.goal_item (id) on delete cascade,
  root_id        uuid references public.goal_item (id) on delete cascade,
  rock_id        uuid references public.rock_project (id) on delete cascade,
  kra_id         uuid references public.kra (id) on delete set null,
  kpi_id         uuid references public.kpi (id) on delete set null,

  title          text not null default '',
  detail         text default '',

  -- assigned to a PERSON or a DEPARTMENT, never both (the radio button)
  assignee_type  text not null default 'person' check (assignee_type in ('person','department')),
  assignee_id    uuid references public.profiles (id) on delete set null,
  dept_id        uuid references public.departments (id) on delete set null,

  start_date     date,
  due_date       date,
  original_due   date,                                -- stamped once, never overwritten
  push_count     integer not null default 0,

  -- the three numbers that decide % completion
  start_metric   numeric,
  current_metric numeric,
  goal_metric    numeric,
  metric_unit    text default '',
  -- used only when there are no numbers and no children
  manual_pct     numeric not null default 0,
  weight         numeric not null default 1,          -- share of the parent's roll-up

  status         text not null default 'not_started'
                 check (status in ('not_started','on_track','at_risk','blocked','done')),
  bands          text[] not null default '{all}',
  period         text not null default 'FY2026-27',
  sort_order     integer default 0,

  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists goal_item_parent_idx   on public.goal_item (parent_id);
create index if not exists goal_item_root_idx     on public.goal_item (root_id);
create index if not exists goal_item_scope_idx    on public.goal_item (scope, period);
create index if not exists goal_item_rock_idx     on public.goal_item (rock_id);
create index if not exists goal_item_assignee_idx on public.goal_item (assignee_id);
create index if not exists goal_item_dept_idx     on public.goal_item (dept_id);

create table if not exists public.goal_item_comment (
  id      uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.goal_item (id) on delete cascade,
  by      text,
  at      timestamptz not null default now(),
  body    text not null
);
create index if not exists goal_item_comment_item_idx on public.goal_item_comment (item_id);

-- ---------------------------------------------------------------------------
-- 6. Visibility helpers, mirroring src/lib/goals-v2.ts
-- ---------------------------------------------------------------------------
create or replace function public.my_bands()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(band), '{}'::text[])
  from public.person_band where person_id = auth.uid();
$$;

create or replace function public.my_department()
returns uuid language sql stable security definer set search_path = public as $$
  select department_id from public.profiles where id = auth.uid();
$$;

/**
 * The band rule, in one place: a row is visible when it is open to all, when
 * you are in one of its bands, or when it is yours. Admins see everything —
 * bands hide work from the wider company, not from the people running it.
 */
create or replace function public.band_visible(p_bands text[], p_person uuid, p_dept uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_admin(), false)
      or p_bands is null
      or 'all' = any(p_bands)
      or p_bands && public.my_bands()
      or (p_person is not null and p_person = auth.uid())
      or (p_dept   is not null and p_dept   = public.my_department());
$$;

-- ---------------------------------------------------------------------------
-- 7. RLS — a backstop. The API routes read with the service client and apply
--    the same rules in TypeScript, so these policies exist to make a direct
--    connection safe rather than to shape what the app sees.
-- ---------------------------------------------------------------------------
alter table public.departments       enable row level security;
alter table public.goal_band         enable row level security;
alter table public.person_band       enable row level security;
alter table public.rock_project      enable row level security;
alter table public.kra               enable row level security;
alter table public.kpi               enable row level security;
alter table public.kpi_watcher       enable row level security;
alter table public.goal_item         enable row level security;
alter table public.goal_item_comment enable row level security;

drop policy if exists departments_read on public.departments;
create policy departments_read on public.departments for select using (auth.uid() is not null);
drop policy if exists departments_write on public.departments;
create policy departments_write on public.departments for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists goal_band_read on public.goal_band;
create policy goal_band_read on public.goal_band for select using (auth.uid() is not null);
drop policy if exists goal_band_write on public.goal_band;
create policy goal_band_write on public.goal_band for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists person_band_read on public.person_band;
create policy person_band_read on public.person_band
  for select using (person_id = auth.uid() or public.is_admin());
drop policy if exists person_band_write on public.person_band;
create policy person_band_write on public.person_band for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists rock_read on public.rock_project;
create policy rock_read on public.rock_project
  for select using (public.has_goals_access() and public.band_visible(bands, owner_id, dept_id));
drop policy if exists rock_write on public.rock_project;
create policy rock_write on public.rock_project for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists kra_read on public.kra;
create policy kra_read on public.kra
  for select using (person_id = auth.uid() or public.is_admin() or public.can_edit_goals());
drop policy if exists kra_write on public.kra;
create policy kra_write on public.kra for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists kpi_read on public.kpi;
create policy kpi_read on public.kpi
  for select using (public.has_goals_access() and public.band_visible(bands, owner_id, dept_id));
drop policy if exists kpi_write on public.kpi;
create policy kpi_write on public.kpi
  for all using (public.is_admin() or owner_id = auth.uid())
  with check (public.is_admin() or owner_id = auth.uid());

drop policy if exists kpi_watcher_read on public.kpi_watcher;
create policy kpi_watcher_read on public.kpi_watcher
  for select using (person_id = auth.uid() or public.is_admin());
drop policy if exists kpi_watcher_write on public.kpi_watcher;
create policy kpi_watcher_write on public.kpi_watcher for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists goal_item_read on public.goal_item;
create policy goal_item_read on public.goal_item
  for select using (public.has_goals_access() and public.band_visible(bands, assignee_id, dept_id));

-- Company goals are the admin's to set. Everything else may also be written by
-- a goals editor, and always by the person it is assigned to.
drop policy if exists goal_item_write on public.goal_item;
create policy goal_item_write on public.goal_item
  for all using (
    public.is_admin()
    or (scope <> 'company' and (public.can_edit_goals() or assignee_id = auth.uid()))
  )
  with check (
    public.is_admin()
    or (scope <> 'company' and (public.can_edit_goals() or assignee_id = auth.uid()))
  );

drop policy if exists goal_comment_v2_read on public.goal_item_comment;
create policy goal_comment_v2_read on public.goal_item_comment
  for select using (public.has_goals_access());
drop policy if exists goal_comment_v2_write on public.goal_item_comment;
create policy goal_comment_v2_write on public.goal_item_comment
  for all using (public.has_goals_access()) with check (public.has_goals_access());

-- ---------------------------------------------------------------------------
-- 8. Triggers — honest timestamps, and a due date that remembers its first
--    promise (the same rule the 0010 layer used, kept because it is right)
-- ---------------------------------------------------------------------------
create or replace function public.touch_goal_item()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  if new.original_due is null then
    new.original_due = new.due_date;
  end if;
  if tg_op = 'UPDATE'
     and new.due_date is distinct from old.due_date
     and old.due_date is not null then
    new.push_count = coalesce(old.push_count, 0) + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists goal_item_touch on public.goal_item;
create trigger goal_item_touch
  before insert or update on public.goal_item
  for each row execute function public.touch_goal_item();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rock_touch on public.rock_project;
create trigger rock_touch before update on public.rock_project
  for each row execute function public.touch_updated_at();
drop trigger if exists kra_touch on public.kra;
create trigger kra_touch before update on public.kra
  for each row execute function public.touch_updated_at();
drop trigger if exists kpi_touch on public.kpi;
create trigger kpi_touch before update on public.kpi
  for each row execute function public.touch_updated_at();
