-- 0020_delivered_jobs.sql
-- The fourth morning file: "Delivered Jobs for Analysis" (Jobmaster report).
--
-- WHY THIS EXISTS. Until now Genie only ever saw jobs IN PROGRESS. The moment a
-- job was delivered it vanished from the Jobmaster export and was archived with
-- whatever status it happened to hold last — so the app has never known that a
-- single job was delivered, nor when. Delivered history is its own dataset with
-- its own merge rule, deliberately NOT mixed into public.jobs:
--
--   jobs            = a live snapshot. Rows absent from the file are archived.
--   delivered_jobs  = an accumulating ledger. Rows are NEVER archived or
--                     deleted, because a delivery is a fact that happened. The
--                     report may only carry a recent window; older deliveries
--                     already banked must survive an upload that omits them.
--
-- That difference is the whole reason apply_delivered is not apply_jobs.
-- Additive and idempotent, per the migration contract.

create table if not exists public.delivered_jobs (
  id            text primary key,                 -- 10-digit ERP job id
  tag           text,
  fam           text,
  cust          text,
  val           numeric default 0,
  -- The point of the whole table: when the job ACTUALLY got delivered.
  -- Nullable because the source column is matched by name at parse time and a
  -- renamed column must degrade to "banked but undated", never to a wrong date.
  delivered_on  date,
  -- Which header the date was read from, so a silent mis-match is visible in
  -- the data rather than only in one upload's summary.
  date_source   text,
  tdd           date,                             -- target delivery date at the end
  otd           date,                             -- customer commitment (OTD)
  start_date    date,
  proj          text,
  stat          text,
  pct           numeric default 0,
  own           text,
  tp            numeric default 0,
  tpv           numeric default 0,
  tpp           numeric default 0,
  kit           numeric default 0,
  first_seen    timestamptz not null default now(),
  updated_batch uuid
);

create index if not exists delivered_jobs_delivered_on_idx
  on public.delivered_jobs (delivered_on);
create index if not exists delivered_jobs_fam_idx on public.delivered_jobs (fam);

-- ---- the live jobmaster learns that a job was delivered -------------------
--
-- A job is LIVE, DELIVERED, or in INSTALLATION. Until now Genie could not tell
-- "delivered" from "vanished": both simply stopped appearing in the morning
-- export and were archived with whatever status they last held — which is why
-- five cancelled jobs sat archived at "S: Order Received" looking identical to
-- a real delivery. These two columns end that ambiguity on the jobs table
-- itself, so the jobmaster tells the truth about its own rows.
--
-- Everything already written against the job — plan, milestones, baseline,
-- materials, tasks, comments — keys on job_id and is untouched by delivery.
-- It stays retrievable forever; it simply stops being editable (enforced in
-- the API layer, see src/lib/job-state.ts).
alter table public.jobs add column if not exists delivered boolean not null default false;
alter table public.jobs add column if not exists delivered_on date;

create index if not exists jobs_delivered_idx on public.jobs (delivered);

-- Widen the batch-kind constraint to admit the new file.
alter table public.import_batches drop constraint if exists import_batches_kind_check;
alter table public.import_batches add constraint import_batches_kind_check
  check (kind in ('jobs', 'projects', 'tasks', 'pre', 'delivered'));

-- ---- merge: upsert only, never archive (see the note at the top) ----
create or replace function public.apply_delivered(p_jobs jsonb, p_batch uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_jobs is null or jsonb_array_length(p_jobs) = 0 then
    return;
  end if;

  insert into public.delivered_jobs
    (id, tag, fam, cust, val, delivered_on, date_source, tdd, otd, start_date,
     proj, stat, pct, own, tp, tpv, tpp, kit, updated_batch)
  select
    j ->> 'id',
    j ->> 'tag',
    j ->> 'fam',
    j ->> 'cust',
    coalesce((j ->> 'val')::numeric, 0),
    nullif(j ->> 'delivered', '')::date,
    nullif(j ->> 'dateSource', ''),
    nullif(j ->> 'tdd', '')::date,
    nullif(j ->> 'otd', '')::date,
    nullif(j ->> 'start', '')::date,
    j ->> 'proj',
    j ->> 'stat',
    coalesce((j ->> 'pct')::numeric, 0),
    j ->> 'own',
    coalesce((j ->> 'tp')::numeric, 0),
    coalesce((j ->> 'tpv')::numeric, 0),
    coalesce((j ->> 'tpp')::numeric, 0),
    coalesce((j ->> 'kit')::numeric, 0),
    p_batch
  from jsonb_array_elements(p_jobs) j
  on conflict (id) do update set
    tag = excluded.tag, fam = excluded.fam, cust = excluded.cust,
    val = excluded.val,
    -- a re-upload may correct a date, but must never blank one already banked
    delivered_on = coalesce(excluded.delivered_on, delivered_jobs.delivered_on),
    date_source = coalesce(excluded.date_source, delivered_jobs.date_source),
    tdd = excluded.tdd, otd = excluded.otd, start_date = excluded.start_date,
    proj = excluded.proj, stat = excluded.stat, pct = excluded.pct,
    own = excluded.own, tp = excluded.tp, tpv = excluded.tpv,
    tpp = excluded.tpp, kit = excluded.kit,
    updated_batch = excluded.updated_batch;

  -- Stamp the live jobmaster row for every delivered job Genie already knows.
  -- The report is the authority on delivery, so its Job Status wins here: a job
  -- archived at "P: Hydraulics Stage" because it fell off the in-progress export
  -- is corrected to "D: Delivered" / its installation status.
  --
  -- Rows the report carries that Genie has never seen (delivered before the
  -- app went live) simply have no jobs row to stamp — they live in
  -- delivered_jobs alone, which is exactly what the ledger is for.
  --
  -- NOTE: nothing here deletes, archives or detaches anything. Plans,
  -- milestones, baselines, materials, tasks and comments are keyed on job_id
  -- and survive delivery untouched — that is the point.
  --
  -- `active` is deliberately NOT touched. The in-progress export owns that flag;
  -- this report owns delivery. A job at "I: Installation in progress" is
  -- legitimately both delivered and still live, which is precisely the third
  -- state the board needs to be able to show.
  update public.jobs j
    set delivered = true,
        delivered_on = coalesce(nullif(d ->> 'delivered', '')::date, j.delivered_on),
        stat = coalesce(nullif(d ->> 'stat', ''), j.stat)
  from jsonb_array_elements(p_jobs) d
  where j.id = d ->> 'id';
end;
$$;

-- ---- RLS: same contract as jobs — readers read, only the service role writes ----
alter table public.delivered_jobs enable row level security;

drop policy if exists delivered_jobs_read on public.delivered_jobs;
create policy delivered_jobs_read on public.delivered_jobs
  for select using (public.is_reader());
