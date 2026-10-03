-- 0192 — the MRP run remembers who generated it, when and why (Dr Raghu,
-- 3 Oct 2026: "show, at the top, the last MRP run on this date and time by
-- this person, so that they can also know, on record, who has last run it
-- and why it has been run"). The run row carries the latest; the log keeps
-- every generation, so a run regenerated four times a day reads as four lines.

alter table public.material_mrp add column if not exists generated_by text;
alter table public.material_mrp add column if not exists generated_note text not null default '';

create table if not exists public.material_mrp_gen (
  id      uuid primary key default gen_random_uuid(),
  mrp_id  uuid not null references public.material_mrp(id) on delete cascade,
  at      timestamptz not null default now(),
  by      text not null default '',
  note    text not null default ''
);
create index if not exists material_mrp_gen_mrp_idx on public.material_mrp_gen (mrp_id, at desc);

alter table public.material_mrp_gen enable row level security;
drop policy if exists material_mrp_gen_read on public.material_mrp_gen;
create policy material_mrp_gen_read on public.material_mrp_gen for select to authenticated using (true);

comment on table public.material_mrp_gen is 'Every GENERATE on an MRP run — when, by whom, and the reason typed.';
