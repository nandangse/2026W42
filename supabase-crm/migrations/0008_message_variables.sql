-- ============================================================================
-- NANDAN CRM — 0008 — MESSAGE VARIABLES
-- Dr Raghu, 25 Aug 2026: variables for messaging — {{name}}, {{qtn_no}},
-- {{next_monday}}, {{khalapur_address}} — unique keys, correct data, admin-
-- addable. BUILTIN variables are computed live from the record and the
-- calendar; STATIC ones hold whatever the admin types (addresses, terms).
-- The resolver lives in src/crm/variables.ts; every messaging surface the
-- comms build brings will render through it.
--
-- Additive. Run AFTER 0007. Idempotent — safe to re-run.
-- ============================================================================

create table if not exists message_variable (
  key         text primary key check (key = lower(key) and key ~ '^[a-z0-9_]+$'),
  kind        text not null default 'static' check (kind in ('static','builtin')),
  value       text,                              -- statics only; builtins compute
  description text,
  updated_by  uuid references profile(id),
  updated_at  timestamptz not null default now()
);
drop trigger if exists message_variable_touch on message_variable;
create trigger message_variable_touch before update on message_variable
  for each row execute function crm_touch();
alter table message_variable enable row level security;
alter table message_variable force row level security;

-- The builtins, seeded so the key can never be taken twice.
insert into message_variable (key, kind, description) values
  ('name',              'builtin', 'The contact''s full name'),
  ('small_name',        'builtin', 'The contact''s first name, for the informal line'),
  ('company_name',      'builtin', 'The customer company''s name'),
  ('enq_no',            'builtin', 'The opportunity''s ENQ number'),
  ('qtn_no',            'builtin', 'The quotation''s number'),
  ('qtn_subject',       'builtin', 'The quotation''s subject — the opportunity it answers'),
  ('today',             'builtin', 'Today''s date, DD/MM/YYYY'),
  ('next_monday',       'builtin', 'The date of the coming Monday'),
  ('next_tuesday',      'builtin', 'The date of the coming Tuesday'),
  ('next_wednesday',    'builtin', 'The date of the coming Wednesday'),
  ('next_thursday',     'builtin', 'The date of the coming Thursday'),
  ('next_friday',       'builtin', 'The date of the coming Friday'),
  ('next_saturday',     'builtin', 'The date of the coming Saturday'),
  ('outstanding_amount','builtin', 'The customer''s outstanding — wires in when the receivables land')
on conflict (key) do nothing;

-- The statics the admin fills in.
insert into message_variable (key, kind, value, description) values
  ('khalapur_address', 'static', '', 'The Khalapur works address, as it should read in a message'),
  ('belapur_address',  'static', '', 'The Belapur office address, as it should read in a message')
on conflict (key) do nothing;
