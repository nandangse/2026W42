-- 0056_landing_pages.sql — CRM database — Genie 5.0.4.0 (7 Sep 2026)
--
-- Dr Raghu: "We will have a landing page creator at nandangse.com/<lpname>.
-- That's the stuff that will be linked."
--
-- One row per landing page. The page is public — no login — and is served
-- by Genie at /lp/<slug>, and at nandangse.com/<slug> once that domain is
-- pointed at the Genie deploy. What a visitor fills in becomes a person and
-- a company in the CRM's own tables, marked as a lead and tagged.

create table if not exists mk_landing (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'),
  title text not null,                       -- the browser tab
  headline text,                             -- the big line
  subhead text,
  body_html text,                            -- the rich middle
  hero_url text,
  logo boolean not null default true,
  theme text not null default 'navy' check (theme in ('navy','white','orange')),
  form_fields text[] not null default array['name','email','phone','company'],
  cta_label text not null default 'Send',
  thank_you text,
  add_to_list_id uuid,                       -- everyone who fills it joins this list
  tag_name text default 'Landing page',
  published boolean not null default false,
  indexable boolean not null default false,  -- search engines: off unless asked
  views int not null default 0,
  submits int not null default 0,
  created_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- what a visitor sent, kept raw beside the person it became
create table if not exists mk_landing_submit (
  id uuid primary key default gen_random_uuid(),
  landing_id uuid not null references mk_landing(id) on delete cascade,
  person_id uuid references person(id) on delete set null,
  company_id uuid references company(id) on delete set null,
  name text, email text, phone text, company text, message text,
  ip_hint text,
  at timestamptz not null default now()
);
create index if not exists mk_landing_submit_idx on mk_landing_submit (landing_id, at desc);

alter table mk_landing enable row level security;
alter table mk_landing_submit enable row level security;
