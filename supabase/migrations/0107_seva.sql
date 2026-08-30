-- 0107_seva.sql
--
-- SEVA — the customer-service module, Genie's sixth door (Dr Raghu,
-- 30 Aug 2026): "Seva - customer service. follow same genie database.
-- import annual maintenance. issues. add fields as needed. all masters in
-- settings. access to those that need to be given in users."
--
-- Four tables:
--   seva_access — the door: the same email-keyed grant as every module,
--                 owner implicit, nobody by default.
--   seva_master — every dropdown the module uses, one table, kind-keyed:
--                 issue categories, issue statuses, AMC statuses, service
--                 engineers, reported-via. Managed in Seva → Settings.
--   seva_amc    — the annual-maintenance register. Fills by paste-import
--                 from the Excel or by hand, one row per contract.
--   seva_issue  — customer issues: what went wrong, on whose machine,
--                 who owns it, by when, and how it ended.
--   seva_push   — the 1:1 push: one named person hands one named person a
--                 thing to do, and the answer comes back on the same row.
--
-- Line comments only. Additive and safe to re-run.

-- ---------- Seva's door ----------
create table if not exists seva_access (
  email      text primary key,
  granted_by text,
  created_at timestamptz not null default now()
);
alter table seva_access enable row level security;

-- ---------- the masters, all of them, in Settings ----------
create table if not exists public.seva_master (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,
  label      text not null,
  sort_order integer not null default 0,
  by         text,
  at         timestamptz not null default now(),
  unique (kind, label)
);

-- The starting vocabulary — editable, removable, extendable in Settings.
insert into public.seva_master (kind, label, sort_order) values
  ('issue_category', 'Breakdown',        1),
  ('issue_category', 'Spares',           2),
  ('issue_category', 'Quality',          3),
  ('issue_category', 'Installation',     4),
  ('issue_category', 'Training',         5),
  ('issue_category', 'Other',            6),
  ('issue_status',   'Open',             1),
  ('issue_status',   'In progress',      2),
  ('issue_status',   'Waiting customer', 3),
  ('issue_status',   'Resolved',         4),
  ('issue_status',   'Closed',           5),
  -- The AMC statuses are the ERP'S OWN WORDS, read off the 362 contracts on
  -- nandanerp rather than invented here: "AMC valid paid", "AMC lapse",
  -- "AMC cancelled", "Warranty", "Visit AMC Chargable". A pull that had to
  -- translate them would be a pull nobody could reconcile against the ERP.
  ('amc_status',     'AMC valid paid',      1),
  ('amc_status',     'AMC lapse',           2),
  ('amc_status',     'AMC cancelled',       3),
  ('amc_status',     'Warranty',            4),
  ('amc_status',     'Visit AMC Chargable', 5),
  ('reported_via',   'Phone',            1),
  ('reported_via',   'Email',            2),
  ('reported_via',   'WhatsApp',         3),
  ('reported_via',   'Site visit',       4),
  ('reported_via',   'Other',            5)
on conflict (kind, label) do nothing;

-- ---------- the annual-maintenance register ----------
-- WHAT THE ERP ACTUALLY HOLDS, read off nandanerp's 362 Annual Maintenance
-- Contracts before this table was shaped:
--   the parent carries customer, amc_status, transaction_date (the contract's
--   start), visits_per_annum, amc_value_per_annum, amc_contract_value,
--   amount_billed and territory;
--   the `items` child — which would carry the machine, the start and end
--   dates and the visit count — is EMPTY on 349 of the 362. Only 13 item
--   rows exist in the whole register, and just one of the 68 live contracts
--   has one.
--
-- So the end date is DERIVED on import: one year from the contract date, less
-- a day. That is what an annual contract means, and without it the renewal
-- view has nothing to stand on. It is not passed off as the ERP's word:
-- `dates_derived` marks every such row, and the screen shows those dates with
-- a ≈ so nobody mistakes an inference for a fact.
create table if not exists public.seva_amc (
  id             uuid primary key default gen_random_uuid(),
  customer       text not null,
  machine        text not null default '',
  serial_no      text not null default '',
  contract_no    text not null default '',
  location       text not null default '',
  start_date     date,
  end_date       date,
  visits_planned integer,
  visits_done    integer not null default 0,
  value          numeric,
  engineer       text not null default '',
  status         text not null default 'AMC valid paid',
  notes          text not null default '',
  /** The ERP's document name (AMS000247). Null on a row typed here; unique
   *  where present, so a re-pull UPDATES rather than duplicates. */
  erp_name       text unique,
  /** What has been invoiced against the contract, from the ERP. */
  billed         numeric,
  territory      text not null default '',
  /** True when the end date was inferred rather than read. */
  dates_derived  boolean not null default false,
  /** When this row last came down from the ERP. */
  pulled_at      timestamptz,
  by             text,
  at             timestamptz not null default now()
);
create index if not exists seva_amc_end_idx on public.seva_amc (end_date);
create index if not exists seva_amc_customer_idx on public.seva_amc (customer);

-- Re-runnable: the columns above arrive even where an earlier 0107 ran first.
alter table public.seva_amc add column if not exists erp_name      text;
alter table public.seva_amc add column if not exists billed        numeric;
alter table public.seva_amc add column if not exists territory     text not null default '';
alter table public.seva_amc add column if not exists dates_derived boolean not null default false;
alter table public.seva_amc add column if not exists pulled_at     timestamptz;
do $$ begin
  alter table public.seva_amc add constraint seva_amc_erp_name_key unique (erp_name);
exception when duplicate_table or duplicate_object then null;
end $$;

-- ---------- the issues register ----------
create table if not exists public.seva_issue (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  customer     text not null default '',
  machine      text not null default '',
  serial_no    text not null default '',
  category     text not null default '',
  reported_via text not null default '',
  status       text not null default 'Open',
  owner        text not null default '',
  due          date,
  description  text not null default '',
  resolution   text not null default '',
  resolved_at  date,
  by           text,
  at           timestamptz not null default now()
);
create index if not exists seva_issue_status_idx on public.seva_issue (status);
create index if not exists seva_issue_customer_idx on public.seva_issue (customer);

-- ---------- the 1:1 push ----------
--
-- "build a 1:1 push system here" (Dr Raghu, 30 Aug 2026).
--
-- ONE SENDER, ONE RECIPIENT, ALWAYS. Not a group thread, not a broadcast, not
-- a comment stream anybody may wander into: a push is handed from one named
-- person to one named person, and it stays between them. That is the whole
-- point — a message with two names on it cannot be ignored on the grounds
-- that somebody else would surely pick it up.
--
-- A push carries its own answer back. The recipient SEES it (stamped), then
-- REPLIES (stamped), and either side may close it. Nothing is deleted: the
-- ledger of what was asked and what came back is the reason it exists.
create table if not exists public.seva_push (
  id           uuid primary key default gen_random_uuid(),
  from_email   text not null,
  to_email     text not null,
  /** Resolved when the recipient has a Genie account — the bell needs it. */
  to_person_id uuid,
  subject      text not null,
  body         text not null default '',
  /** What it is about, when it was pushed from a record: 'issue' | 'amc'. */
  ref_kind     text not null default '',
  ref_id       uuid,
  priority     text not null default 'normal'
               check (priority in ('normal', 'urgent')),
  status       text not null default 'sent'
               check (status in ('sent', 'seen', 'replied', 'closed')),
  reply        text not null default '',
  seen_at      timestamptz,
  replied_at   timestamptz,
  closed_at    timestamptz,
  at           timestamptz not null default now()
);
create index if not exists seva_push_to_idx on public.seva_push (to_email, status, at desc);
create index if not exists seva_push_from_idx on public.seva_push (from_email, at desc);
create index if not exists seva_push_ref_idx on public.seva_push (ref_kind, ref_id);

-- The bell already exists; it only needs to admit one more kind of ring.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('task_assigned', 'task_reassigned', 'goal_assigned', 'seva_push'));

-- ---------- the ask, filed where every ask lives ----------
insert into public.feature_request (title, body, want, status, note, by)
select
  'Seva — the customer-service module',
  '<p>Seva - customer service. follow same genie database. import annual maintenance. issues. add fields as needed. all masters in settings. access to those that need to be given in users. (Dr Raghu, 30 Aug 2026)</p>',
  'must', 'done', 'Shipped as Genie 4.0.0.0 — the sixth door.', 'raghu@nandan.co.in'
where not exists (
  select 1 from public.feature_request where title = 'Seva — the customer-service module'
);
