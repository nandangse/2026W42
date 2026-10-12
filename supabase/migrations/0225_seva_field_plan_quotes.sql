-- 0225 — SEVA: FIELD ATTENDANCE, THE SERVICE TEAM PLAN, AND QUOTATIONS (Genie 6.5.0.0)
--
-- Dr Raghu, 12 Oct 2026, a list of eleven for the service team. Built now:
--   1  attendance for the outdoor service team on /idp — check in, check out,
--      the GPS position and a photo each time;
--   4  a Quotation sub-module — the ERP's quotations made by Sarita, Yash,
--      Aakash and the service team, pulled here, where each was sent, the
--      ones waiting on a PO by owner, and the follow-up updates made here;
--   5  Service Team Plan Deployment — the roster: daily, weekly, monthly,
--      quarterly; the service people on top; the AMC visits due on the
--      calendar; Aakash or Yash make it;
--   8  send a quotation from here as the CRM does, approved by the Service
--      Manager first, to the customer's remembered To, CC and BCC.
-- The rest are filed as feature requests at the foot of this file.

-- ---------- 1. THE PUNCHES ----------
create table if not exists public.seva_attendance (
  id            uuid primary key default gen_random_uuid(),
  employee_id   text not null,                 -- the employee number; half the team has no e-mail
  employee_name text not null default '',
  email         text,
  kind          text not null check (kind in ('in','out')),
  at            timestamptz not null default now(),
  day           date not null,                  -- the IST day, worked out on the server
  lat           double precision not null,
  lng           double precision not null,
  accuracy_m    integer,
  photo_path    text,                           -- private bucket field-attendance
  device        text
);
create index if not exists seva_attendance_emp_idx on public.seva_attendance (employee_id, at desc);
create index if not exists seva_attendance_day_idx on public.seva_attendance (day);
alter table public.seva_attendance enable row level security;
revoke all on public.seva_attendance from anon, authenticated;
insert into storage.buckets (id, name, public) values ('field-attendance', 'field-attendance', false) on conflict (id) do nothing;

-- ---------- 5. THE PLAN — who goes where, which day ----------
create table if not exists public.seva_plan (
  id            uuid primary key default gen_random_uuid(),
  on_date       date not null,
  employee_id   text not null,
  person_name   text not null default '',
  kind          text not null default 'AMC visit',   -- AMC visit, Breakdown, Installation, Commissioning, Training, Office, Leave, Other
  customer      text not null default '',
  site          text not null default '',
  amc_id        uuid references public.seva_amc(id) on delete set null,
  issue         text,                               -- ISS-… when it is a ticket
  backup_id     text,                               -- the backup technician's employee number
  notes         text not null default '',
  status        text not null default 'planned' check (status in ('planned','done','missed','cancelled')),
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists seva_plan_date_idx on public.seva_plan (on_date);
create index if not exists seva_plan_emp_idx on public.seva_plan (employee_id, on_date);
create index if not exists seva_plan_amc_idx on public.seva_plan (amc_id);
alter table public.seva_plan enable row level security;
revoke all on public.seva_plan from anon, authenticated;

-- ---------- 4. THE QUOTATIONS, AS THE ERP HAS THEM ----------
create table if not exists public.seva_quotation (
  erp_name        text primary key,                 -- NGSE/QTN/202627/17108
  owner           text,                             -- the ERP user who made it
  sales_person    text,
  customer        text,
  quoted_on       date,
  valid_till      date,
  target_order_on date,
  grand_total     numeric,
  base_grand_total numeric,                         -- in rupees
  currency        text,
  status          text,                             -- Open, Expired, Draft, Lost, Cancelled, Ordered…
  docstatus       integer,
  contact_person  text,
  contact_email   text,
  subject         text,
  last_status     text,
  importance      text,
  product_group   text,
  assigned_to     text,
  erp_modified    timestamptz,
  erp             jsonb not null default '{}'::jsonb,
  pulled_at       timestamptz not null default now(),
  -- what Genie says about it — the follow-up, made here
  follow_status   text,                             -- Awaiting PO, Follow-up due, Negotiating, PO received, Lost, On hold
  next_action     text,
  next_on         date,
  updated_by      text,
  updated_at      timestamptz
);
create index if not exists seva_quotation_owner_idx on public.seva_quotation (owner, quoted_on desc);
create index if not exists seva_quotation_status_idx on public.seva_quotation (status);
alter table public.seva_quotation enable row level security;
revoke all on public.seva_quotation from anon, authenticated;

create table if not exists public.seva_quote_note (
  id          uuid primary key default gen_random_uuid(),
  erp_name    text not null references public.seva_quotation(erp_name) on delete cascade,
  body        text not null,
  follow_status text,
  next_on     date,
  by          text not null,
  at          timestamptz not null default now()
);
create index if not exists seva_quote_note_q_idx on public.seva_quote_note (erp_name, at desc);
alter table public.seva_quote_note enable row level security;
revoke all on public.seva_quote_note from anon, authenticated;

-- ---------- 8. SENDING IT — asked for, approved, sent ----------
create table if not exists public.seva_quote_send (
  id            uuid primary key default gen_random_uuid(),
  erp_name      text not null references public.seva_quotation(erp_name) on delete cascade,
  mail_to       text[] not null default '{}',
  mail_cc       text[] not null default '{}',
  mail_bcc      text[] not null default '{}',
  subject       text not null,
  body_html     text not null default '',
  print_format  text,
  status        text not null default 'awaiting_approval' check (status in ('awaiting_approval','approved','sent','rejected','failed')),
  asked_by      text not null,
  asked_at      timestamptz not null default now(),
  decided_by    text,
  decided_at    timestamptz,
  reject_note   text,
  sent_from     text,
  sent_at       timestamptz,
  gmail_id      text,
  error         text
);
create index if not exists seva_quote_send_q_idx on public.seva_quote_send (erp_name, asked_at desc);
create index if not exists seva_quote_send_status_idx on public.seva_quote_send (status);
alter table public.seva_quote_send enable row level security;
revoke all on public.seva_quote_send from anon, authenticated;

-- the customer's To, CC and BCC — the master contacts, remembered from the last send and editable
create table if not exists public.seva_customer_contact (
  customer    text primary key,
  mail_to     text[] not null default '{}',
  mail_cc     text[] not null default '{}',
  mail_bcc    text[] not null default '{}',
  updated_by  text,
  updated_at  timestamptz not null default now()
);
alter table public.seva_customer_contact enable row level security;
revoke all on public.seva_customer_contact from anon, authenticated;

-- ---------- the door: Sarita sends from here, Aakash plans and approves ----------
insert into public.seva_access (email, granted_by) values
  ('sarita@nandan.co.in', 'raghu@nandan.co.in'),
  ('aakash@nandan.co.in', 'raghu@nandan.co.in')
on conflict (email) do nothing;

-- ---------- the list, filed ----------
insert into public.feature_request (title, body, want, status, note, by)
select x.title, x.body, x.want, x.status, x.note, 'raghu@nandan.co.in'
from (values
  ('Seva 1 — Attendance for the outdoor service team on /idp (check in / out, GPS, photo)', '<p>"in genie.nandan.co.in/idp show attendance. Keep it such that they can go there and show a button check in - check out with gps coordinates captured and also photo."</p>', 'must', 'done', 'Shipped as Genie 6.5.0.0.'),
  ('Seva 2 — Spare part pricing pulled from Genie in to the quotation, with manual override', '<p>"The system should automatically pull current spare part pricing from Genie in to the quotation module while allowing manual overrides." Dr Raghu: WIP — do not work on it yet.</p>', 'good', 'open', 'WIP — on hold by Dr Raghu, 12 Oct 2026.'),
  ('Seva 3 — Service rates at buying cost + 40%, with manual override', '<p>"The system must auto-populate service rates from Genie calculated at buying cost plus 40%, while allowing manual price overrides during quote creation." Dr Raghu: WIP — do not work on it yet.</p>', 'good', 'open', 'WIP — on hold by Dr Raghu, 12 Oct 2026.'),
  ('Seva 4 — Quotation sub-module: the service quotations off the ERP, pending POs by owner, updates here', '<p>"Real-time dashboard visibility in to pending POs by owner, along with automated WhatsApp notifications." Dr Raghu: "Can we pull quotations from erp and see where its sent by Sarita, Yash, Aakash or the service team and pull here. Updates also made here. Make a sub module called quotation."</p>', 'must', 'done', 'Shipped as Genie 6.5.0.0 — the automated WhatsApp nudges are still to come.'),
  ('Seva 5 — Service Team Plan Deployment: AMC visits on a daily / weekly / monthly / quarterly calendar', '<p>"Schedule all AMC visit dates, a monthly calendar view, WhatsApp reminders to the technician and zone manager two days before." Dr Raghu: "This is like the roster. Service Team Plan Deployment — calendar daily, weekly, monthly, quarterly. Show the service persons on top. AMC due should be seen also based on calendar. Aakash or Yash can make this."</p>', 'must', 'done', 'Shipped as Genie 6.5.0.0 — the two-days-before WhatsApp reminders are still to come.'),
  ('Seva 6 — WhatsApp the Service Coordinator 30 days before an AMC expires, to start the renewal quotation', '<p>"Genie shall track live AMC expiration dates and send an automated WhatsApp reminder to the Service Coordinator 30 days prior to contract expiration to initiate the renewal quotation."</p>', 'must', 'open', 'The expiring-in-30-days list shows on the Plan from 6.5.0.0; the WhatsApp send is to come.'),
  ('Seva 7 — Digital equipment audits: custom inspection checklists, recommended spares and service actions', '<p>"Genie shall support digital Equipment Audits featuring custom inspection checklists, recommended spare replacement lists, and recommended service actions." Dr Raghu: "This will be developed in Audits."</p>', 'good', 'planned', 'To be built in Audits.'),
  ('Seva 8 — Generate Quotation: master rates, Service Manager approval, e-mail to the client''s master contacts', '<p>"Upon clicking Generate Quotation the system must fetch master rates, draft the quotation and route it to the Service Manager for approval. Once approved, e-mail the finalised quotation to the client (primary, CC, BCC)." Dr Raghu: "We can do the same quotation like in CRM so that Sarita can send from here."</p>', 'must', 'done', 'Shipped as Genie 6.5.0.0 — send from Seva with approval, on the ERP''s quotation and print format; master rates wait on items 2 and 3.'),
  ('Seva 9 — Auto-generated 12-month AMC visit plan, balanced by territory, backup technicians, WhatsApp reminders', '<p>"Genie shall auto-generate and publish a comprehensive 12-month AMC visit plan based on Master Lists for Zone Managers, Technicians, and Breakdown Teams; balance workload across territories; assign backup technicians; dispatch scheduled WhatsApp reminders."</p>', 'good', 'open', 'The plan, the AMC dues and a backup per visit are in 6.5.0.0; the automatic 12-month spread and the balancing are to come.'),
  ('Seva 10 — Ticket booking reminder for out-of-Mumbai sites', '<p>"Ticket booking Reminder for out of Mumbai Sites — we will discuss this." WIP.</p>', 'future', 'open', 'To be discussed — WIP.'),
  ('Seva 11 — AMC proposal e-mail 30 days before warranty expiry, WhatsApp to the Coordinator and Zone Manager', '<p>"Genie shall automatically draft and generate AMC proposal emails 30 days prior to warranty expiration, and trigger WhatsApp reminders to the Service Coordinator and Zone Manager." WIP.</p>', 'good', 'open', 'WIP.')
) as x(title, body, want, status, note)
where not exists (select 1 from public.feature_request f where f.title = x.title);

insert into public.genie_migration (name) values ('0225_seva_field_plan_quotes') on conflict (name) do nothing;
