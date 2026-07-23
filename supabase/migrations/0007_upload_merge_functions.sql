-- 0007_upload_merge_functions.sql
-- The upload merge, expressed as atomic set-based functions. Each RPC call runs
-- in its own transaction, giving the §4 "inside one transaction" guarantee.
-- SECURITY DEFINER + service-role-only callers; the mgmt guard trigger still
-- passes because service-role writes have a null auth.uid().
--
-- Merge semantics (spec §4):
--   apply_jobs     — upsert every row active=true; archive (never delete) jobs
--                    absent from the file; prune priority_order to survivors.
--   apply_projects — upsert projects; blank-fill jobs.own/otd/tdd (never
--                    overwrite non-null).
--   apply_owners   — blank-fill jobs.own only (own/mgmt lesson: own only here).
--   apply_tasks    — upsert erp_tasks on source_key preserving done + comments;
--                    close (done=true, never delete) keys that vanished.

create or replace function public.apply_jobs(p_jobs jsonb, p_batch uuid)
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
     own, mgmt, tp, tpv, tpp, kit, active, archived_at, updated_batch)
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
    true, null, p_batch
  from jsonb_array_elements(p_jobs) j
  on conflict (id) do update set
    tag = excluded.tag, fam = excluded.fam, cust = excluded.cust,
    val = excluded.val, tdd = excluded.tdd, otd = excluded.otd,
    start_date = excluded.start_date, proj = excluded.proj,
    stat = excluded.stat, pct = excluded.pct, note = excluded.note,
    own = excluded.own, mgmt = excluded.mgmt, tp = excluded.tp,
    tpv = excluded.tpv, tpp = excluded.tpp, kit = excluded.kit,
    active = true, archived_at = null, updated_batch = excluded.updated_batch;

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

create or replace function public.apply_projects(p_projects jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_projects is null or jsonb_array_length(p_projects) = 0 then
    return;
  end if;

  insert into public.projects (id, mgr, committed, exp_end, so, stage, job_numbers)
  select
    p ->> 'id',
    p ->> 'mgr',
    nullif(p ->> 'committed', '')::date,
    nullif(p ->> 'expEnd', '')::date,
    p ->> 'so',
    p ->> 'stage',
    '{}'::text[]
  from jsonb_array_elements(p_projects) p
  on conflict (id) do update set
    mgr = excluded.mgr, committed = excluded.committed,
    exp_end = excluded.exp_end, so = excluded.so, stage = excluded.stage;

  -- blank-fill only — never overwrite a non-null job value
  update public.jobs j set
    own = coalesce(nullif(j.own, ''), p.mgr),
    otd = coalesce(j.otd, p.committed),
    tdd = coalesce(j.tdd, p.exp_end)
  from public.projects p
  where j.proj = p.id;
end;
$$;

create or replace function public.apply_owners(p_owners jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_owners is null or p_owners = '{}'::jsonb then
    return;
  end if;

  update public.jobs j set own = o.own
  from (
    select key as id, value ->> 'own' as own
    from jsonb_each(p_owners)
  ) o
  where j.id = o.id
    and coalesce(nullif(j.own, ''), '') = ''
    and coalesce(o.own, '') <> '';
end;
$$;

create or replace function public.apply_tasks(p_tasks jsonb, p_batch uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  keys text[];
begin
  if p_tasks is null then
    return;
  end if;

  -- upsert on source_key = job_id || '||' || left(title, 60); preserve done & esc
  insert into public.erp_tasks (job_id, source_key, title, detail, who, due, cat)
  select
    t ->> 'j',
    (t ->> 'j') || '||' || left(coalesce(t ->> 't', ''), 60),
    t ->> 't',
    t ->> 'd',
    t ->> 'who',
    nullif(t ->> 'due', '')::date,
    t ->> 'cat'
  from jsonb_array_elements(p_tasks) t
  on conflict (source_key) do update set
    job_id = excluded.job_id, title = excluded.title,
    detail = excluded.detail, who = excluded.who,
    due = excluded.due, cat = excluded.cat;

  select coalesce(
    array_agg((t ->> 'j') || '||' || left(coalesce(t ->> 't', ''), 60)), '{}')
    into keys
  from jsonb_array_elements(p_tasks) t;

  -- keys that vanished from the file are closed, never deleted; comments stay
  if array_length(keys, 1) is not null then
    update public.erp_tasks set done = true
      where not (source_key = any (keys)) and done = false;
  end if;
end;
$$;
