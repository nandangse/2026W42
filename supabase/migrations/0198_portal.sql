-- 0198 — THE PORTAL (Dr Raghu, 3 Oct 2026: "Make a new app currently in
-- genie.nandan.co.in/portal, and this will have a login ID and password
-- separately for portal customer as well as portal supplier. The way it will
-- be is /portal/veda, for example, or /taj.")
--
-- A customer or a supplier opens their own page and sees what Nandan holds
-- for them: the orders open against us, the jobs under delivery with the
-- engine, chassis and model on each, what has been delivered, the service
-- calls on their machines, their questions and our answers, and whatever
-- Nandan chooses to put up for them — FAQs, newsletters, advisories.
--
-- Nothing of Genie is re-typed here. The jobs are the jobmaster’s rows, the
-- PO number is read off the CRM’s sales order through the project, the
-- service calls are Seva’s tickets. This migration holds only what those
-- cannot know: who may log in and for whom, the slug on the door, the
-- things typed beside a job (vehicle number, invoice, location, remarks),
-- the queries, and the content.
--
-- Every table wears the portal_ prefix — the module boundary inside the one
-- database, as Saamaan’s material_ does.

-- ------------------------------------------------- the organisations (doors)
create table if not exists public.portal_org (
  slug         text primary key check (slug = lower(slug) and slug ~ '^[a-z0-9][a-z0-9-]{1,30}$'),
  name         text not null,
  kind         text not null default 'customer' check (kind in ('customer', 'supplier')),
  -- the names this organisation goes by on jobs.cust, seva_issue.customer
  -- and material_po.supplier_name — lower-cased, trimmed; matched exactly
  match_names  text[] not null default '{}',
  -- what Nandan writes on their front page, in markdown
  intro        text not null default '',
  logo_path    text,
  active       boolean not null default true,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.portal_org enable row level security;
revoke all on public.portal_org from anon, authenticated;

-- ------------------------------------------------------------ the people
-- One table for everybody who signs in at /portal: the customer’s people,
-- the supplier’s people, and Nandan’s own portal staff. The role says which.
--   customer / supplier       — see their own organisation only
--   admin                     — everything, and Settings
--   national_manager          — everything, read
--   location_manager          — the jobs and tickets at their locations
--   location_technician       — the same, at their locations
create table if not exists public.portal_user (
  id               uuid primary key default gen_random_uuid(),
  email            text not null unique check (email = lower(email)),
  name             text not null,
  phone            text,
  role             text not null default 'customer'
                   check (role in ('customer', 'supplier', 'admin', 'national_manager', 'location_manager', 'location_technician')),
  org_slug         text references public.portal_org(slug) on delete set null,
  locations        text[] not null default '{}',
  -- Commercials: "only a few people in the organisation can see"
  sees_commercials boolean not null default false,
  active           boolean not null default true,
  -- the login
  pw_salt          text,
  pw_hash          text,
  pw_version       int not null default 1,
  must_change      boolean not null default true,
  invite_token     text unique,
  invite_expires   timestamptz,
  invited_at       timestamptz,
  last_login_at    timestamptz,
  login_count      int not null default 0,
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists portal_user_org_idx on public.portal_user (org_slug);
alter table public.portal_user enable row level security;
revoke all on public.portal_user from anon, authenticated;

-- ---------------------------------------------------------- the locations
create table if not exists public.portal_location (
  name        text primary key,
  sort_order  int not null default 100,
  active      boolean not null default true
);
alter table public.portal_location enable row level security;
revoke all on public.portal_location from anon, authenticated;

-- ------------------------------------- beside a job: what the ERP cannot say
create table if not exists public.portal_job (
  job_id        text primary key,            -- jobs.id, the 10-digit ERP job id
  po_no         text,                        -- typed when the CRM has none
  vehicle_no    text,                        -- the registration, once it has one
  vehicle_type  text,                        -- overrides the family when it must
  invoice_no    text,
  location      text,                        -- a portal_location name
  remarks       text,
  by            text,
  at            timestamptz not null default now()
);
alter table public.portal_job enable row level security;
revoke all on public.portal_job from anon, authenticated;

-- ------------------------------------------------------------ the queries
-- "Query solver, where all the queries and everything regarding this will be
-- showcased." A question from the customer’s side or a note from ours, on a
-- job or in general; the thread under it; open until somebody closes it.
create table if not exists public.portal_query (
  id          uuid primary key default gen_random_uuid(),
  org_slug    text not null references public.portal_org(slug) on delete cascade,
  job_id      text,
  subject     text not null,
  body        text not null default '',
  status      text not null default 'open' check (status in ('open', 'answered', 'closed')),
  by_user     uuid references public.portal_user(id) on delete set null,
  by_name     text not null default '',
  by_side     text not null default 'them' check (by_side in ('them', 'us')),
  at          timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists portal_query_org_idx on public.portal_query (org_slug, status, updated_at desc);
alter table public.portal_query enable row level security;
revoke all on public.portal_query from anon, authenticated;

create table if not exists public.portal_query_reply (
  id          uuid primary key default gen_random_uuid(),
  query_id    uuid not null references public.portal_query(id) on delete cascade,
  body        text not null,
  by_user     uuid references public.portal_user(id) on delete set null,
  by_name     text not null default '',
  by_side     text not null default 'us' check (by_side in ('them', 'us')),
  -- a note between Nandan’s own people, never shown to the customer
  internal    boolean not null default false,
  at          timestamptz not null default now()
);
create index if not exists portal_query_reply_q_idx on public.portal_query_reply (query_id, at);
alter table public.portal_query_reply enable row level security;
revoke all on public.portal_query_reply from anon, authenticated;

-- -------------------------------------------- FAQs, newsletters, advisories
create table if not exists public.portal_content (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('faq', 'newsletter', 'advisory')),
  title       text not null,
  body        text not null default '',        -- markdown
  org_slug    text references public.portal_org(slug) on delete cascade,   -- null = everyone
  audience    text not null default 'all' check (audience in ('all', 'customer', 'supplier')),
  published   boolean not null default false,
  pinned      boolean not null default false,
  published_on date,
  by          text,
  at          timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists portal_content_kind_idx on public.portal_content (kind, published, pinned desc, published_on desc);
alter table public.portal_content enable row level security;
revoke all on public.portal_content from anon, authenticated;

-- ---------------------------------------------------- mail log + audit trail
create table if not exists public.portal_mail (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,
  to_email    text not null,
  subject     text,
  ref         text,
  sent_at     timestamptz not null default now(),
  ok          boolean not null default true,
  error       text,
  unique (kind, to_email, ref)
);
alter table public.portal_mail enable row level security;
revoke all on public.portal_mail from anon, authenticated;

create table if not exists public.portal_audit (
  id          bigserial primary key,
  user_id     uuid,
  email       text,
  action      text not null,
  detail      jsonb,
  at          timestamptz not null default now()
);
create index if not exists portal_audit_email_idx on public.portal_audit (email, action, at desc);
alter table public.portal_audit enable row level security;
revoke all on public.portal_audit from anon, authenticated;

-- logos and attachments, private
insert into storage.buckets (id, name, public) values ('portal', 'portal', false)
on conflict (id) do nothing;
