-- 0026_job_money_and_hint_cache.sql
--
-- 1. The money side of a job, from the Jobmaster export.
--
--    A job has always been read here as dates, throughput and kitting -- what
--    it costs to build and when it goes out. What it does to the bank has been
--    missing entirely, so "which job should we finish first" could only ever be
--    answered on delivery pressure, never on cash. These four columns are in
--    the Jobmaster export; Genie simply never read them.
--
--    Matched by MEANING, not by exact header (see EXTRA_JOB_FIELDS in
--    src/lib/parse-upload.ts), and the upload summary names the header each one
--    matched -- the same way the delivered-date column was confirmed. If a
--    header does not match, the field stays null and the summary says so
--    rather than the number silently reading zero.
--
-- 2. A SHARED cache for the Genie hint.
--
--    The hint was cached in a JavaScript Map in module scope. On Vercel every
--    serverless instance holds its own, so the second person to open a job paid
--    for a whole fresh generation, and a cold start threw the lot away. That is
--    why it read as "click it again for each person". A row in Postgres is one
--    cache for everybody: the first person to open a job pays, everyone else
--    reads what they paid for.
--
-- Additive and safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Job money fields
-- ---------------------------------------------------------------------------
alter table public.jobs add column if not exists client_update    text;
alter table public.jobs add column if not exists cashflow         text;
alter table public.jobs add column if not exists amt_needed       numeric;
alter table public.jobs add column if not exists pay_on_delivery  numeric;

comment on column public.jobs.client_update is
  'Latest word from the customer, from the Jobmaster export. Free text.';
comment on column public.jobs.cashflow is
  'Cash flow note for this job, from the Jobmaster export. Free text.';
comment on column public.jobs.amt_needed is
  'Amount still needed to finish the job, in rupees.';
comment on column public.jobs.pay_on_delivery is
  'Payment that falls due when this job is delivered, in rupees. Sortable on '
  'the job list: it is what makes "finish this one next" a cash decision.';

-- Sorting the board by what is collectable on delivery is the whole point of
-- carrying the column, so it gets an index.
create index if not exists jobs_pay_on_delivery_idx
  on public.jobs (pay_on_delivery desc nulls last) where active;

-- ---------------------------------------------------------------------------
-- 1b. apply_jobs carries the money fields -- and only when the sheet had them
-- ---------------------------------------------------------------------------
-- p_money_fields lists the keys the parser actually BOUND to a header on this
-- sheet. A field not in that list is left exactly as it was banked, so an
-- export that drops a column (or a second export that never carried it) cannot
-- wipe a payment figure to null. Writing an explicit null when the column IS
-- present is correct: that means the cell was blank today.
--
-- The old two-argument signature is dropped rather than left beside this one:
-- two overloads differing only by a defaulted argument make every existing
-- call ambiguous.
drop function if exists public.apply_jobs(jsonb, uuid);

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
    return;  -- never archive the whole board on an empty payload
  end if;

  select coalesce(array_agg(j ->> 'id'), '{}') into ids
  from jsonb_array_elements(p_jobs) j;

  insert into public.jobs
    (id, tag, fam, cust, val, tdd, otd, start_date, proj, stat, pct, note,
     own, mgmt, tp, tpv, tpp, kit, active, archived_at, updated_batch,
     client_update, cashflow, amt_needed, pay_on_delivery)
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
    nullif(j ->> 'payOnDelivery', '')::numeric
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
                           then excluded.pay_on_delivery else jobs.pay_on_delivery end;

  -- jobs that left the export are archived, never deleted (plans stay reachable)
  update public.jobs
    set active = false, archived_at = now()
    where active = true and not (id = any (ids));

  -- priority_order: drop archived ids, keep order (new jobs appended at read time)
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
-- 2. Genie hint cache, shared by everyone
-- ---------------------------------------------------------------------------
-- No foreign key to jobs on purpose: this is a cache, and a stale row for a
-- job that has gone is harmless, whereas a delete that fails because a cache
-- row exists is not.
create table if not exists public.job_hint (
  job_id     text primary key,
  hint       jsonb not null,
  built_at   timestamptz not null default now(),
  -- who paid for it, so the panel can say whose read this is and when
  built_by   text,
  -- the model that wrote it: a hint from an older model should be re-read
  -- rather than trusted forever
  model      text
);

create index if not exists job_hint_built_at_idx on public.job_hint (built_at desc);

alter table public.job_hint enable row level security;

-- Everyone signed in reads it. Writes go through the service role in
-- /api/genie-hint, which is the only thing that can afford to write one.
drop policy if exists job_hint_read on public.job_hint;
create policy job_hint_read on public.job_hint
  for select to authenticated
  using (true);

comment on table public.job_hint is
  'Shared cache of the written Genie brief, one row per job. Replaces a '
  'per-instance in-memory Map that made every reader pay for their own copy.';
