-- 0014_sales_plan.sql
-- My Sales Plan — the interactive sales-planning app (companies, industries,
-- products, people, to-dos) folded into the Sales Genie workspace.
--
-- Access model: the SAME per-person grant as the playbook (sales_access,
-- default NOBODY, owner implicit). One grant opens the whole Sales Genie
-- workspace — both the playbook and this plan.
--
-- Data model kept from the standalone app: one jsonb document per row, the
-- app diff-syncs whole rows and streams changes to teammates via realtime.
-- Tables are prefixed sp_ so they can never collide with the planning layer
-- (Genie already owns `settings`; the rest are prefixed for symmetry).
-- Additive and safe to re-run.

create table if not exists public.sp_settings   (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.sp_industries (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.sp_products   (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.sp_companies  (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.sp_people     (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.sp_todos      (id text primary key, data jsonb not null, updated_at timestamptz not null default now());

-- updated_at touch — server-side truth for freshness
create or replace function public.sp_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['sp_settings','sp_industries','sp_products','sp_companies','sp_people','sp_todos'] loop
    execute format('drop trigger if exists sp_touch_updated_at on public.%I', t);
    execute format('create trigger sp_touch_updated_at before update on public.%I
                    for each row execute function public.sp_touch_updated_at()', t);
  end loop;
end $$;

-- relationship lookups inside the jsonb documents
create index if not exists idx_sp_people_company on public.sp_people ((data->>'companyId'));
create index if not exists idx_sp_todos_company  on public.sp_todos  ((data->>'companyId'));
create index if not exists idx_sp_todos_status   on public.sp_todos  ((data->>'status'));
create index if not exists idx_sp_companies_industry on public.sp_companies ((data->>'industry'));

-- ---------------------------------------------------------------------------
-- Access helper: the sales_access grant (0013), owner implicit (0011),
-- disabled accounts excluded. security definer so RLS can consult the grant
-- and profile tables without recursion.
-- ---------------------------------------------------------------------------
create or replace function public.has_sales_plan_access()
returns boolean language sql stable security definer set search_path = public as $$
  select (
    coalesce(public.is_owner(), false)
    or exists (select 1 from public.sales_access s where s.person_id = auth.uid())
  )
  and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.disabled);
$$;

grant execute on function public.has_sales_plan_access() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
--   · only granted people can read or write anything
--   · deleting a company is admin-only (matches the UI)
--   · sp_settings rows are never deleted by clients
-- ---------------------------------------------------------------------------
alter table public.sp_settings   enable row level security;
alter table public.sp_industries enable row level security;
alter table public.sp_products   enable row level security;
alter table public.sp_companies  enable row level security;
alter table public.sp_people     enable row level security;
alter table public.sp_todos      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sp_settings','sp_industries','sp_products','sp_companies','sp_people','sp_todos'] loop
    execute format('drop policy if exists sp_member_select on public.%I', t);
    execute format('create policy sp_member_select on public.%I
                    for select to authenticated using (public.has_sales_plan_access())', t);
    execute format('drop policy if exists sp_member_insert on public.%I', t);
    execute format('create policy sp_member_insert on public.%I
                    for insert to authenticated with check (public.has_sales_plan_access())', t);
    execute format('drop policy if exists sp_member_update on public.%I', t);
    execute format('create policy sp_member_update on public.%I
                    for update to authenticated
                    using (public.has_sales_plan_access()) with check (public.has_sales_plan_access())', t);
  end loop;
end $$;

-- deletes: members everywhere EXCEPT companies (admin-only) and settings (never)
do $$
declare t text;
begin
  foreach t in array array['sp_industries','sp_products','sp_people','sp_todos'] loop
    execute format('drop policy if exists sp_member_delete on public.%I', t);
    execute format('create policy sp_member_delete on public.%I
                    for delete to authenticated using (public.has_sales_plan_access())', t);
  end loop;
end $$;

drop policy if exists sp_admin_delete on public.sp_companies;
create policy sp_admin_delete on public.sp_companies
  for delete to authenticated
  using (public.has_sales_plan_access() and public.is_admin());

-- ---------------------------------------------------------------------------
-- Realtime — stream changes to the granted teammates (RLS still applies:
-- only accounts passing has_sales_plan_access() receive events).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
begin
  begin alter publication supabase_realtime add table public.sp_settings;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.sp_industries; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.sp_products;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.sp_companies;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.sp_people;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.sp_todos;      exception when duplicate_object then null; end;
end $$;
