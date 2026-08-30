-- CRM 0034 — the quote desk cleaned to Dr Raghu's hand (30 Aug 2026)
-- "Closure Draft until sent · valid till the last date of next month ·
--  delivery 8-12 weeks · payment terms a Masters dropdown · address from
--  the client · To and CC on the quote · remove the rest."

-- Draft leads the quotation ladder — a quote is Draft until it is sent
insert into stage (code, name, sort_order, colour, is_terminal, is_won, weight_pct, entity)
values ('q_draft', 'Draft', 0, '#8A94A0', false, false, 10, 'quotation')
on conflict (code) do nothing;

-- delivery becomes words: "8-12 weeks" does not fit an integer
alter table quotation alter column delivery_weeks type text using delivery_weeks::text;

-- the Payment Terms master
create table if not exists payment_term (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
insert into payment_term (name, sort_order) values
  ('100% Advance', 1),
  ('50% Advance, 50% before dispatch', 2),
  ('30% Advance, 70% before dispatch', 3),
  ('100% against delivery', 4)
on conflict (name) do nothing;

-- the client's address on the quote, and who the quote mails To / CC
alter table quotation add column if not exists address_id uuid references address(id);
alter table quotation add column if not exists mail_to jsonb not null default '[]'::jsonb;
alter table quotation add column if not exists mail_cc jsonb not null default '[]'::jsonb;
