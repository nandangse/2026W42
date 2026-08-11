-- 0015_sales_plan_deals.sql
-- My Sales Plan upgrade to MSP 3.2: the Deals pipeline and the Support Needed
-- tab. Upstream stored both only in memory (a persistence gap — mastersOf()
-- never wrote them); per the project's own forward note they now get real
-- tables, matching the other sp_ document tables exactly.
-- (salesStats and salesPlan are keyed objects, not row collections — they ride
-- inside the sp_settings masters blob instead.)
-- Additive and safe to re-run. Requires 0014.

create table if not exists public.sp_deals   (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.sp_support (id text primary key, data jsonb not null, updated_at timestamptz not null default now());

do $$
declare t text;
begin
  foreach t in array array['sp_deals','sp_support'] loop
    execute format('drop trigger if exists sp_touch_updated_at on public.%I', t);
    execute format('create trigger sp_touch_updated_at before update on public.%I
                    for each row execute function public.sp_touch_updated_at()', t);
  end loop;
end $$;

create index if not exists idx_sp_deals_company on public.sp_deals ((data->>'companyId'));
create index if not exists idx_sp_deals_stage   on public.sp_deals ((data->>'stage'));
create index if not exists idx_sp_support_status on public.sp_support ((data->>'status'));

alter table public.sp_deals   enable row level security;
alter table public.sp_support enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sp_deals','sp_support'] loop
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
    execute format('drop policy if exists sp_member_delete on public.%I', t);
    execute format('create policy sp_member_delete on public.%I
                    for delete to authenticated using (public.has_sales_plan_access())', t);
  end loop;
end $$;

do $$
begin
  begin alter publication supabase_realtime add table public.sp_deals;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.sp_support; exception when duplicate_object then null; end;
end $$;
