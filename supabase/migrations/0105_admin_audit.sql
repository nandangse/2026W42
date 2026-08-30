-- Genie 0105 — the user-management ledger (30 Aug 2026)
-- "we should log it" — every change of hands in Admin → Users, kept.
create table if not exists admin_audit (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  by_email text not null,
  action text not null,
  target text,
  detail jsonb
);
create index if not exists admin_audit_at on admin_audit (at desc);
alter table admin_audit enable row level security;
