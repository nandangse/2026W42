-- 0108_erp_sync_log.sql
--
-- THE SYNCHRONISE LEDGER (Dr Raghu, 1 Sep 2026):
--
--   "just make a button there saying Synchronise … Anybody pressing that will
--    just synchronise it once again. Otherwise it should just mention that, in
--    the last one day, whatever changes have happened in the last one week or
--    last one month. Just make a table which showcases what summary has
--    happened and that you make it in the morning of updates."
--
-- A button that only says "done" teaches nobody anything. What the morning
-- actually needs to know is WHAT MOVED — which delivery dates slipped, which
-- jobs arrived, which left the board — and it needs to be able to look back a
-- day, a week or a month without anybody keeping a note.
--
-- So every run writes a row here, and every FIELD that changed is written with
-- it: the job, the column, what it was, what it became. The summary table on
-- Morning Update is read straight off this.
--
-- Line comments only. Additive and safe to re-run.

create table if not exists public.erp_sync_log (
  id            uuid primary key default gen_random_uuid(),
  at            timestamptz not null default now(),
  by            text,
  /** A dry run reads the ERP and writes nothing — logged too, so a rehearsal
   *  is distinguishable from the real thing rather than invisible. */
  dry           boolean not null default false,
  ok            boolean not null default true,
  error         text not null default '',

  jobs_new      integer not null default 0,
  jobs_changed  integer not null default 0,
  jobs_archived integer not null default 0,
  proj_new      integer not null default 0,
  proj_changed  integer not null default 0,
  deliv_new     integer not null default 0,
  deliv_changed integer not null default 0,

  /** The field-level detail:
   *  [{ kind:'job'|'project'|'delivered', id, field, from, to }]
   *  Capped when a run is enormous — the counts above stay true regardless. */
  changes       jsonb not null default '[]'::jsonb,
  notes         text[] not null default '{}',
  seconds       numeric
);

create index if not exists erp_sync_log_at_idx on public.erp_sync_log (at desc);

alter table public.erp_sync_log enable row level security;
-- Read through the server routes only, as with every other Genie table.
