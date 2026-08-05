-- 0010_goals_layer.sql
-- Goals layer: OPSP → five goals → cascade → tactic, with the To-Do engine.
--
-- PURELY ADDITIVE BY DESIGN. This migration creates new tables and adds only
-- nullable columns to existing ones. It never alters or drops anything the
-- current app reads, so the previous release keeps working unchanged and a
-- rollback is a code revert alone — these tables simply sit unused.

-- ---------------------------------------------------------------------------
-- 1. Masters the cascade reads from
-- ---------------------------------------------------------------------------
create table if not exists public.swimlanes (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  color      text default '#8A94A0',
  sort_order integer default 0
);

create table if not exists public.units (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique,   -- ₹ Cr, %, Jobs, Days, Nos …
  sort_order integer default 0
);

insert into public.swimlanes (name, color, sort_order) values
  ('Growth',     '#0D7A3F', 1),
  ('Operations', '#1B3A5C', 2),
  ('People',     '#7C3AED', 3),
  ('Quality',    '#0D9488', 4),
  ('Cash',       '#D97706', 5)
on conflict (name) do nothing;

insert into public.units (label, sort_order) values
  ('₹ Cr', 1), ('₹ Lakh', 2), ('%', 3), ('Nos', 4), ('Jobs', 5),
  ('Days', 6), ('Weeks', 7), ('Hours', 8), ('Roles', 9), ('Vendors', 10), ('Tonnes', 11)
on conflict (label) do nothing;

-- people master gap-fill (org chart + identity), all nullable
alter table public.profiles add column if not exists reports_to  uuid references public.profiles (id) on delete set null;
alter table public.profiles add column if not exists designation text;
alter table public.profiles add column if not exists department  text;
alter table public.profiles add column if not exists location    text;

create index if not exists profiles_reports_to_idx on public.profiles (reports_to);

-- ---------------------------------------------------------------------------
-- 2. The cascade — one self-referencing table for every level
-- ---------------------------------------------------------------------------
create table if not exists public.goal_node (
  id             uuid primary key default gen_random_uuid(),
  node_type      text not null check (node_type in ('goal','project','objective','key_result','tactic')),
  parent_id      uuid references public.goal_node (id) on delete cascade,
  goal_id        uuid references public.goal_node (id) on delete cascade,  -- denormalised root
  sort_order     integer default 0,
  goal_num       integer,                       -- 1..5 on goals only

  what           text not null default '',
  how            text default '',

  swimlane_id    uuid references public.swimlanes (id) on delete set null,
  period         text default 'FY2026-27',      -- decided now: retrofitting periods later is painful
  start_date     date,
  end_date       date,
  original_end   date,                          -- set once, never overwritten
  push_count     integer not null default 0,    -- times the date was moved
  carry_count    integer not null default 0,    -- days carried without closing

  completion_pct numeric default 0,             -- used only when there are no numbers and no children
  start_no       numeric,
  current_no     numeric,
  target_no      numeric,
  unit_id        uuid references public.units (id) on delete set null,
  weight         numeric not null default 1,    -- present now so value-weighting can be switched on later

  -- optional live feed: when set, current_no is read from the planning data
  -- instead of being typed. See src/lib/goal-metrics.ts.
  metric_source  text,

  status         text not null default 'not_started'
                 check (status in ('not_started','on_track','at_risk','blocked','done')),
  unaligned      boolean not null default false, -- a project with no goal is information, not an error

  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists goal_node_parent_idx on public.goal_node (parent_id);
create index if not exists goal_node_goal_idx   on public.goal_node (goal_id);
create index if not exists goal_node_type_idx   on public.goal_node (node_type);
create index if not exists goal_node_period_idx on public.goal_node (period);

-- owners: goals may have 2, lower levels default to 1
create table if not exists public.goal_node_owner (
  node_id   uuid not null references public.goal_node (id) on delete cascade,
  person_id uuid not null references public.profiles (id) on delete cascade,
  primary key (node_id, person_id)
);
create index if not exists goal_node_owner_person_idx on public.goal_node_owner (person_id);

-- comments stay visible after completion — they are the audit trail of the number
create table if not exists public.goal_node_comment (
  id         uuid primary key default gen_random_uuid(),
  node_id    uuid not null references public.goal_node (id) on delete cascade,
  by         text,
  at         timestamptz not null default now(),
  body       text not null
);
create index if not exists goal_node_comment_node_idx on public.goal_node_comment (node_id);

-- Critical Success Factors live with the OPSP; a goal links to several
create table if not exists public.csf (
  id    uuid primary key default gen_random_uuid(),
  label text not null unique
);
create table if not exists public.goal_csf_link (
  goal_id uuid not null references public.goal_node (id) on delete cascade,
  csf_id  uuid not null references public.csf (id) on delete cascade,
  primary key (goal_id, csf_id)
);

-- OPSP: structured rows alongside the uploaded one-pager
create table if not exists public.opsp_section (
  id         uuid primary key default gen_random_uuid(),
  period     text not null default 'FY2026-27',
  label      text not null,
  body       text default '',
  sort_order integer default 0
);

-- ---------------------------------------------------------------------------
-- 3. Access: granted, not default — and separate from planning access
-- ---------------------------------------------------------------------------
create table if not exists public.goal_access (
  person_id  uuid primary key references public.profiles (id) on delete cascade,
  can_edit   boolean not null default false,   -- false = read the tree only
  granted_at timestamptz not null default now()
);

-- Two DIFFERENT permission checks, kept apart from day one (spec §9):
--   has_goals_access() — may see the tree
--   owns_goal_node()   — always sees their own work, tree or no tree
create or replace function public.has_goals_access()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_admin(), false)
      or exists (select 1 from public.goal_access g where g.person_id = auth.uid());
$$;

create or replace function public.can_edit_goals()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_admin(), false)
      or exists (select 1 from public.goal_access g where g.person_id = auth.uid() and g.can_edit);
$$;

create or replace function public.owns_goal_node(p_node uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.goal_node_owner o
    where o.node_id = p_node and o.person_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
alter table public.swimlanes         enable row level security;
alter table public.units             enable row level security;
alter table public.goal_node         enable row level security;
alter table public.goal_node_owner   enable row level security;
alter table public.goal_node_comment enable row level security;
alter table public.csf               enable row level security;
alter table public.goal_csf_link     enable row level security;
alter table public.opsp_section      enable row level security;
alter table public.goal_access       enable row level security;

-- masters: readable by any signed-in user, admin-managed
drop policy if exists swimlanes_read on public.swimlanes;
create policy swimlanes_read on public.swimlanes for select using (auth.uid() is not null);
drop policy if exists swimlanes_write on public.swimlanes;
create policy swimlanes_write on public.swimlanes for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists units_read on public.units;
create policy units_read on public.units for select using (auth.uid() is not null);
drop policy if exists units_write on public.units;
create policy units_write on public.units for all using (public.is_admin()) with check (public.is_admin());

-- the tree: visible to grantees, PLUS always your own nodes
drop policy if exists goal_node_read on public.goal_node;
create policy goal_node_read on public.goal_node
  for select using (public.has_goals_access() or public.owns_goal_node(id));

drop policy if exists goal_node_write on public.goal_node;
create policy goal_node_write on public.goal_node
  for all using (public.can_edit_goals() or public.owns_goal_node(id))
  with check (public.can_edit_goals() or public.owns_goal_node(id));

drop policy if exists goal_owner_read on public.goal_node_owner;
create policy goal_owner_read on public.goal_node_owner
  for select using (public.has_goals_access() or person_id = auth.uid());
drop policy if exists goal_owner_write on public.goal_node_owner;
create policy goal_owner_write on public.goal_node_owner
  for all using (public.can_edit_goals()) with check (public.can_edit_goals());

drop policy if exists goal_comment_read on public.goal_node_comment;
create policy goal_comment_read on public.goal_node_comment
  for select using (public.has_goals_access() or public.owns_goal_node(node_id));
drop policy if exists goal_comment_write on public.goal_node_comment;
create policy goal_comment_write on public.goal_node_comment
  for all using (public.has_goals_access() or public.owns_goal_node(node_id))
  with check (public.has_goals_access() or public.owns_goal_node(node_id));

drop policy if exists csf_read on public.csf;
create policy csf_read on public.csf for select using (auth.uid() is not null);
drop policy if exists csf_write on public.csf;
create policy csf_write on public.csf for all using (public.can_edit_goals()) with check (public.can_edit_goals());

drop policy if exists goal_csf_read on public.goal_csf_link;
create policy goal_csf_read on public.goal_csf_link for select using (public.has_goals_access());
drop policy if exists goal_csf_write on public.goal_csf_link;
create policy goal_csf_write on public.goal_csf_link for all using (public.can_edit_goals()) with check (public.can_edit_goals());

drop policy if exists opsp_read on public.opsp_section;
create policy opsp_read on public.opsp_section for select using (public.has_goals_access());
drop policy if exists opsp_write on public.opsp_section;
create policy opsp_write on public.opsp_section for all using (public.can_edit_goals()) with check (public.can_edit_goals());

drop policy if exists goal_access_read on public.goal_access;
create policy goal_access_read on public.goal_access
  for select using (person_id = auth.uid() or public.is_admin());
drop policy if exists goal_access_write on public.goal_access;
create policy goal_access_write on public.goal_access
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. Keep updated_at honest, and stamp original_end once
-- ---------------------------------------------------------------------------
create or replace function public.touch_goal_node()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  -- the first end date a node is given is the commitment; never overwrite it
  if new.original_end is null then
    new.original_end = new.end_date;
  end if;
  -- moving the date forward is a push, and it is counted
  if tg_op = 'UPDATE'
     and new.end_date is distinct from old.end_date
     and old.end_date is not null then
    new.push_count = coalesce(old.push_count, 0) + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists goal_node_touch on public.goal_node;
create trigger goal_node_touch
  before insert or update on public.goal_node
  for each row execute function public.touch_goal_node();
