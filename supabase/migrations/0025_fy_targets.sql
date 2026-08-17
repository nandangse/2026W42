-- 0025_fy_targets.sql
--
-- The financial-year targets, and nothing else.
--
-- Decided by Dr Raghu: targets are FY-wide (not monthly, not quarterly), and
-- only raghu@nandan.co.in may change them. Everyone else reads them as fixed,
-- which is the point -- a target the board can edit is not a target.
--
-- One row per financial year, keyed by the label the rest of the suite already
-- uses (fyLabel() in src/lib/delivered.ts -> "FY2026-27"). Keyed by year rather
-- than a singleton so last year's target survives the roll-over: on 1 April the
-- app looks up the new FY, finds nothing, and says "no target set" instead of
-- silently measuring this year against last year's number.
--
-- Amounts are plain rupees, like every other value in the suite. 100 Cr is
-- 1000000000. The UI does the Cr formatting.
--
-- Additive and safe to re-run.

create table if not exists public.fy_targets (
  fy                text primary key,
  sales_target      numeric not null default 0,
  throughput_target numeric not null default 0,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.profiles(id),
  constraint fy_targets_sales_nonneg      check (sales_target >= 0),
  constraint fy_targets_throughput_nonneg check (throughput_target >= 0)
);

-- FY2026-27, as given: sales 100 Cr, throughput 40 Cr.
-- on conflict do nothing, so re-running never overwrites an edited target.
insert into public.fy_targets (fy, sales_target, throughput_target)
values ('FY2026-27', 1000000000, 400000000)
on conflict (fy) do nothing;

alter table public.fy_targets enable row level security;

-- Everyone signed in reads them: the run-rate card is on the Job Delivery
-- Board and on Delivered Jobs, which every role can open.
drop policy if exists fy_targets_read on public.fy_targets;
create policy fy_targets_read on public.fy_targets
  for select to authenticated
  using (true);

-- Only the owner writes. is_owner() is the same helper the goals tier uses
-- (migration 0011); the API route gates on it too, and this is the backstop
-- that survives a mistake in application code.
drop policy if exists fy_targets_write on public.fy_targets;
create policy fy_targets_write on public.fy_targets
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

comment on table public.fy_targets is
  'FY-wide sales and throughput targets, one row per financial year. '
  'Owner-only writes. Drives the Required Run Rate card.';
