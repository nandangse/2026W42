-- 0194 — the Item master writes back to the ERP (Dr Raghu, 3 Oct 2026, "go";
-- "yes add the item changes").
--
-- Until today Saamaan read the ERP and wrote nothing. From today Mukesh and
-- Rameez may change an item's class, group, price and master-data fields,
-- and merge items — each change pushed to the ERP as it is made, each one
-- on record here with the ERP's answer beside it. A merge is the hardest
-- write there is: it runs through the ERP's own Rename-and-Merge and is
-- kept whole, loser by loser, in material_merge.

alter table public.material_item add column if not exists merged_into text;

create table if not exists public.material_item_edit (
  id          uuid primary key default gen_random_uuid(),
  item_code   text not null,
  field       text not null,
  from_value  text,
  to_value    text,
  by          text not null default '',
  at          timestamptz not null default now(),
  erp_status  text not null default 'pending',   -- pending | done | failed
  erp_error   text not null default ''
);
create index if not exists material_item_edit_item_idx on public.material_item_edit (item_code, at desc);

create table if not exists public.material_merge (
  id          uuid primary key default gen_random_uuid(),
  master      text not null,
  losers      jsonb not null default '[]'::jsonb,
  by          text not null default '',
  at          timestamptz not null default now(),
  status      text not null default 'running',   -- running | done | partial | failed
  steps       jsonb not null default '[]'::jsonb, -- one entry per loser: erp ok/err, genie counts
  note        text not null default ''
);

do $$
declare t text;
begin
  foreach t in array array['material_item_edit','material_merge'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
  end loop;
end $$;

comment on table public.material_item_edit is 'Every change made to an item from Saamaan, with whether the ERP took it.';
comment on table public.material_merge is 'Every merge of items — the master, the losers, and what happened on the ERP and in Genie for each.';
