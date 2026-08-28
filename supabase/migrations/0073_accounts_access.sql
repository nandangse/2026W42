-- 0073: the Accounts module's door.
--
-- Same arrangement as hrms_access (0047) and crm_access (0055): the grant is
-- held against the EMAIL, so it can be written before the account exists and
-- survives the account being rebuilt. The owner is implicit and never has a
-- row. Granularity beyond in/out comes later as roles — for now the tick on
-- the Admin page is the whole story (Dr Raghu, 28 Aug 2026).

create table if not exists accounts_access (
  email      text primary key,
  granted_by text,
  created_at timestamptz not null default now()
);

alter table accounts_access enable row level security;
-- service key only, like every other Genie table: RLS on, no policies.
