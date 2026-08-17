-- 0028_escalation_and_goal_category.sql
--
-- 1. Current Project Escalation, from the Jobmaster. It belongs beside the
--    status and the money on the job page: what is holding a job up is the
--    other half of what it is worth.
--
-- 2. A category on every goal, sub-goal and initiative -- pointed at the
--    swimlanes table that has existed since 0010 and is already managed from
--    Admin. A free-text category would have become fifteen spellings of
--    "Operations" inside a month; a foreign key cannot.
--
-- Additive and safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Escalation on a job
-- ---------------------------------------------------------------------------
alter table public.jobs add column if not exists escalation text;

comment on column public.jobs.escalation is
  'Current Project Escalation from the Jobmaster export. Free text: what is '
  'holding this job up, in the words of whoever raised it.';

-- ---------------------------------------------------------------------------
-- 1b. apply_jobs carries it, on the same per-sheet rule as the money fields
-- ---------------------------------------------------------------------------
-- A column absent from today's export must never blank what is already banked,
-- so escalation joins p_money_fields rather than being written unconditionally.
drop function if exists public.apply_jobs(jsonb, uuid, text[]);

create or replace function public.apply_jobs(
  p_jobs jsonb,
  p_batch uuid,
  p_money_fields text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ids text[];
begin
  if p_jobs is null or jsonb_array_length(p_jobs) = 0 then
    return;
  end if;

  select coalesce(array_agg(j ->> 'id'), '{}') into ids
  from jsonb_array_elements(p_jobs) j;

  insert into public.jobs
    (id, tag, fam, cust, val, tdd, otd, start_date, proj, stat, pct, note,
     own, mgmt, tp, tpv, tpp, kit, active, archived_at, updated_batch,
     client_update, cashflow, amt_needed, pay_on_delivery, escalation)
  select
    j ->> 'id',
    j ->> 'tag',
    j ->> 'fam',
    j ->> 'cust',
    coalesce((j ->> 'val')::numeric, 0),
    nullif(j ->> 'tdd', '')::date,
    nullif(j ->> 'otd', '')::date,
    nullif(j ->> 'start', '')::date,
    j ->> 'proj',
    j ->> 'stat',
    coalesce((j ->> 'pct')::numeric, 0),
    j ->> 'note',
    j ->> 'own',
    nullif(j ->> 'mgmt', '')::date,
    coalesce((j ->> 'tp')::numeric, 0),
    coalesce((j ->> 'tpv')::numeric, 0),
    coalesce((j ->> 'tpp')::numeric, 0),
    coalesce((j ->> 'kit')::numeric, 0),
    true, null, p_batch,
    j ->> 'clientUpdate',
    j ->> 'cashflow',
    nullif(j ->> 'amtNeeded', '')::numeric,
    nullif(j ->> 'payOnDelivery', '')::numeric,
    j ->> 'escalation'
  from jsonb_array_elements(p_jobs) j
  on conflict (id) do update set
    tag = excluded.tag, fam = excluded.fam, cust = excluded.cust,
    val = excluded.val, tdd = excluded.tdd, otd = excluded.otd,
    start_date = excluded.start_date, proj = excluded.proj,
    stat = excluded.stat, pct = excluded.pct, note = excluded.note,
    own = excluded.own, mgmt = excluded.mgmt, tp = excluded.tp,
    tpv = excluded.tpv, tpp = excluded.tpp, kit = excluded.kit,
    active = true, archived_at = null, updated_batch = excluded.updated_batch,
    client_update = case when 'clientUpdate' = any (p_money_fields)
                         then excluded.client_update else jobs.client_update end,
    cashflow = case when 'cashflow' = any (p_money_fields)
                    then excluded.cashflow else jobs.cashflow end,
    amt_needed = case when 'amtNeeded' = any (p_money_fields)
                      then excluded.amt_needed else jobs.amt_needed end,
    pay_on_delivery = case when 'payOnDelivery' = any (p_money_fields)
                           then excluded.pay_on_delivery else jobs.pay_on_delivery end,
    escalation = case when 'escalation' = any (p_money_fields)
                      then excluded.escalation else jobs.escalation end;

  update public.jobs
    set active = false, archived_at = now()
    where active = true and not (id = any (ids));

  update public.settings
    set priority_order = coalesce((
      select array_agg(x order by ord)
      from unnest(priority_order) with ordinality as t(x, ord)
      where x = any (ids)
    ), '{}')
    where id = 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Goal category
-- ---------------------------------------------------------------------------
-- Pointed at swimlanes (0010), which Admin already manages, so the categories
-- a goal can carry and the swimlanes a board can be grouped into are one list
-- rather than two that drift.
alter table public.goal_item
  add column if not exists swimlane_id uuid references public.swimlanes(id) on delete set null;

create index if not exists goal_item_swimlane_idx on public.goal_item (swimlane_id);

comment on column public.goal_item.swimlane_id is
  'Goal Category. Set on any goal, sub-goal or initiative; the swimlane a '
  'board groups by later is this same list.';
