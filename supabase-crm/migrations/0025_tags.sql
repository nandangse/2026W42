-- 0025_tags.sql  (CRM project)
--
-- TAGS on companies, contacts and opportunities (Dr Raghu, 28 Aug 2026):
-- each salesperson creates their own, type-along, one or more per record.
-- PRIVACY IS THE POINT: a salesperson sees only THEIR OWN tags; typing a
-- tag name that already exists (exactly) shows all records carrying that
-- name; Raghu and the Sales Head see everyone's. The visibility rules live
-- in /api/crm/tags — the tables just hold the facts.
--
-- Line comments only. Safe to re-run.

create table if not exists crm_tag (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  owner_id   uuid references profile(id),
  created_at timestamptz not null default now(),
  unique (name, owner_id)
);
create index if not exists crm_tag_name_idx on crm_tag (lower(name));

create table if not exists crm_tag_link (
  id         uuid primary key default gen_random_uuid(),
  tag_id     uuid not null references crm_tag(id) on delete cascade,
  entity     text not null check (entity in ('company', 'person', 'opportunity')),
  entity_id  uuid not null,
  created_at timestamptz not null default now(),
  unique (tag_id, entity, entity_id)
);
create index if not exists crm_tag_link_entity_idx on crm_tag_link (entity, entity_id);
create index if not exists crm_tag_link_tag_idx on crm_tag_link (tag_id);
