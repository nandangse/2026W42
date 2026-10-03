-- 0193 — MRP as per reorder level: the Kanban (Dr Raghu, 3 Oct 2026).
--
-- "A Kanban system for Class C items — bolt, nut, small small items, even an
-- angle of 25 by 25 — so that at any point in time we keep a reorder level.
-- For this reorder level I will try to put some AI based on the consumption
-- of the last 6 months … dynamic buffer management … in 3 to 4 months a
-- minimum stock that is always maintained, realistic and required based on
-- past trends." One row per Kanban item: its buffer (the reorder level),
-- what to order when it falls below, what the last six months consumed, and
-- which zone it stands in today. Buffer changes are logged, every DBM run is
-- a row, and the cap on the whole Kanban's value is a setting.

create table if not exists public.material_kanban (
  item_code       text primary key,
  active          boolean not null default true,
  buffer_qty      numeric not null default 0,        -- the reorder level: red below a third of it, green above it
  reorder_qty     numeric not null default 0,        -- what to order when it falls into red; 0 = up to the buffer
  basis           text not null default 'seed'       -- seed | erp | consumption | typed
                  check (basis in ('seed', 'erp', 'consumption', 'typed')),
  consumption_6m  numeric,                           -- issued out of the Stock warehouses, last 6 months (ERP stock ledger)
  monthly_avg     numeric,
  months_seen     integer,
  stock           numeric,                           -- as read at the last run
  ordered         numeric,
  rate            numeric,
  zone            text not null default '',          -- red | yellow | green | '' (never read)
  red_runs        integer not null default 0,        -- consecutive DBM runs in red — the buffer grows after two
  green_runs      integer not null default 0,        -- consecutive runs green with nothing on order — shrinks after three
  dbm_at          timestamptz,
  dbm_note        text not null default '',
  note            text not null default '',
  added_by        text,
  added_at        timestamptz not null default now(),
  updated_by      text,
  updated_at      timestamptz
);
create index if not exists material_kanban_zone_idx on public.material_kanban (active, zone);

create table if not exists public.material_kanban_run (
  id              uuid primary key default gen_random_uuid(),
  at              timestamptz not null default now(),
  by              text not null default '',
  items           integer not null default 0,
  red             integer not null default 0,
  yellow          integer not null default 0,
  green           integer not null default 0,
  buffer_value    numeric,
  stock_value     numeric,
  to_order_value  numeric,
  note            text not null default ''
);

create table if not exists public.material_kanban_log (
  id         uuid primary key default gen_random_uuid(),
  item_code  text not null,
  at         timestamptz not null default now(),
  by         text not null default '',
  from_qty   numeric,
  to_qty     numeric,
  why        text not null default ''
);
create index if not exists material_kanban_log_item_idx on public.material_kanban_log (item_code, at desc);

do $$
declare t text;
begin
  foreach t in array array['material_kanban','material_kanban_run','material_kanban_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
  end loop;
end $$;

-- the cap on the whole Kanban's buffer value — ₹1 Cr to begin with ("I will give a dedicated value, let's say 1 crore")
insert into public.material_setting (key, value, updated_by, updated_at)
values ('kanban_cap', '10000000', 'migration 0193', now())
on conflict (key) do nothing;

comment on table public.material_kanban is 'MRP as per reorder level — the Kanban of class C items, their buffers (DBM) and zones.';
