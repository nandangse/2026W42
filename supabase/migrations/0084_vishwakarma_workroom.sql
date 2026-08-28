-- 0084: VISHWAKARMA'S WORKROOM (Dr Raghu, 28 Aug 2026) — the design team's
-- app: "references, ideas, problem solving, getting into root causes,
-- planning how they complete the projects; use me [Genie] for solutions,
-- and Consult Raghu for reviews."
--
-- Five tables, one per way of thinking:
--   references — the library the drawings lean on
--   ideas      — caught raw, grown deliberately
--   problems   — driven to root cause through the Five Whys
--   plans      — what design must deliver per job, by when
--   reviews    — the bench: anything sent up, Consult Raghu's read, and the
--                verdict a human signs
--
-- Line comments only. Additive and safe to re-run.

create table if not exists public.vishwa_reference (
  id       uuid primary key default gen_random_uuid(),
  title    text not null,
  category text not null default '',
  link     text not null default '',
  notes    text not null default '',
  tags     text not null default '',
  by       text,
  at       timestamptz not null default now()
);

create table if not exists public.vishwa_idea (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  detail     text not null default '',
  value_note text not null default '',
  status     text not null default 'raw' check (status in ('raw', 'exploring', 'adopted', 'parked')),
  genie      text not null default '',
  by         text,
  at         timestamptz not null default now()
);

create table if not exists public.vishwa_problem (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  job            text not null default '',
  machine        text not null default '',
  description    text not null default '',
  whys           jsonb not null default '[]'::jsonb,
  root_cause     text not null default '',
  countermeasure text not null default '',
  status         text not null default 'open' check (status in ('open', 'analysing', 'countermeasure', 'verified', 'closed')),
  owner          text not null default '',
  genie          text not null default '',
  by             text,
  at             timestamptz not null default now()
);

create table if not exists public.vishwa_plan (
  id          uuid primary key default gen_random_uuid(),
  job         text not null default '',
  deliverable text not null,
  owner       text not null default '',
  target      date,
  status      text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  note        text not null default '',
  by          text,
  at          timestamptz not null default now()
);
create index if not exists vishwa_plan_target_idx on public.vishwa_plan (target);

create table if not exists public.vishwa_review (
  id          uuid primary key default gen_random_uuid(),
  source_kind text not null default '',
  source_id   uuid,
  title       text not null,
  question    text not null default '',
  ai_review   text not null default '',
  verdict     text not null default '',
  verdict_by  text,
  status      text not null default 'waiting' check (status in ('waiting', 'reviewed')),
  by          text,
  at          timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['vishwa_reference','vishwa_idea','vishwa_problem','vishwa_plan','vishwa_review'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
  end loop;
end $$;

-- Writes go through /api/vishwakarma/* with the service key, which checks
-- the caller holds the Vishwakarma grant.
