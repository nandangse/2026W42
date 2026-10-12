-- 0228 — SEVA: THE JOBS AS THE ERP KNOWS THEM, WARRANTY, AND THE AMC CRM (Genie 6.8.0.0)
--
-- Dr Raghu, 12 Oct 2026: "On the left side, also make CRM … jobs that did not
-- have an AMC or are under warranty, so that they know what jobs are under
-- warranty today … a warranty date by default: 12 months; whichever is 24
-- months will get extended … contact the customer for taking AMC … the list of
-- all the customers and sites, and what jobs are there within that site … a
-- call or an email … the more visibility we show, the more Sarita can work on
-- it." And: "In the installation, I want to check out the cost incurred in
-- installation. That also should come on the dashboard."

-- every job on the ERP's Jobmaster: its customer, site, delivery and installation
-- dates and the installation's cost — refreshed every hour; the warranty is Genie's
create table if not exists public.seva_job_info (
  job_id              text primary key,
  customer            text,
  tag                 text,
  fam                 text,
  status              text,          -- the ERP's classifier: Delivered, Installation Stage, Jobs in Process, Cancelled…
  job_status          text,
  delivered_on        date,
  install_started_on  date,
  installed_on        date,
  delivery_location   text,
  location_of_job     text,
  installation_engineer text,
  mandays_at_site     numeric,
  transport_cost      numeric,
  site_expense        numeric,
  total_site_expense  numeric,
  warranty_months     integer not null default 12,
  warranty_note       text,
  warranty_by         text,
  warranty_at         timestamptz,
  pulled_at           timestamptz not null default now()
);
create index if not exists seva_job_info_customer_idx on public.seva_job_info (customer);
alter table public.seva_job_info enable row level security;
revoke all on public.seva_job_info from anon, authenticated;

-- every call, mail, visit or quote made to a customer about an AMC
create table if not exists public.seva_crm_touch (
  id        uuid primary key default gen_random_uuid(),
  customer  text not null,
  kind      text not null default 'Call' check (kind in ('Call','E-mail','Visit','Quotation','WhatsApp','Note')),
  job_ids   text[] not null default '{}',
  note      text not null default '',
  outcome   text,
  next_on   date,
  by        text,
  at        timestamptz not null default now()
);
create index if not exists seva_crm_touch_cust_idx on public.seva_crm_touch (customer, at desc);
alter table public.seva_crm_touch enable row level security;
revoke all on public.seva_crm_touch from anon, authenticated;

insert into public.feature_request (title, body, want, status, note, by)
select x.title, x.body, 'must', 'done', 'Shipped as Genie 6.8.0.0.', 'raghu@nandan.co.in'
from (values
  ('Seva — CRM: jobs under warranty (12 months by default, extendable), AMC prospects by customer and site, calls and mails', '<p>"On the left side, also make CRM … jobs that did not have an AMC or are under warranty … warranty date by default 12 months, whichever is 24 months will get extended … contact the customer for taking AMC … all the customers and sites, and what jobs are there within that site … a call or an email." (Dr Raghu, 12 Oct 2026.)</p>'),
  ('Seva — Installation cost on the installation screen and the dashboard', '<p>"In the installation, I want to check out the cost incurred in installation. That also should come on the dashboard." (Dr Raghu, 12 Oct 2026.)</p>')
) as x(title, body)
where not exists (select 1 from public.feature_request f where f.title = x.title);

insert into public.genie_migration (name) values ('0228_seva_crm_jobs') on conflict (name) do nothing;
