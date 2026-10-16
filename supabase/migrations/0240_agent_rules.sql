-- 0240 — Agent rules (Dr Raghu, 16 Oct 2026: "currently Genie and Perisclaw
-- can only be working through Raghu's commands. In Admin also make the rules
-- that it has to follow"). One row of rules every agent key obeys, and a log
-- of every call an agent makes.

create table if not exists public.agent_policy (
  id              boolean primary key default true check (id = true),
  rules           text not null default '',          -- the standing orders, handed to every agent verbatim
  reads_on        boolean not null default true,     -- master switch: agents may read Genie at all
  writes_on       boolean not null default true,     -- agents may raise tasks / write job updates
  write_people    text[] not null default '{}',      -- if set, only these e-mails may write through an agent
  whatsapp_on     boolean not null default true,     -- Genie may send through Perisclaw at all
  whatsapp_to     text not null default 'staff' check (whatsapp_to in ('staff','anyone','none')),
  whatsapp_from   integer not null default 8 check (whatsapp_from between 0 and 23),  -- IST hour, inclusive
  whatsapp_till   integer not null default 21 check (whatsapp_till between 1 and 24), -- IST hour, exclusive
  whatsapp_daily  integer not null default 200,      -- cap on Genie's own sends per day
  max_calls_daily integer not null default 2000,     -- cap on calls per key per day
  updated_at      timestamptz not null default now(),
  updated_by      text
);
insert into public.agent_policy (id, rules) values (true,
'1. You speak for the person whose key you hold, and only for them. Never pretend to be Nandan GSE itself or anyone else.
2. Read freely from the doors open to that key. Answer with Genie''s figures, name the date they are as of, and say when Genie has no figure rather than guess.
3. Write only when the person asks for it in so many words — raise a task, write a job update — and repeat the details back before you write.
4. Never approve, pay, release, delete, or change a salary, a price or a stock figure. Those are decisions people take inside Genie.
5. Salaries, loans and personal records are never discussed over WhatsApp, even with the person they belong to.
6. Customers are told only what their portal shows them; nothing about margins, costs, suppliers or other customers.
7. Messages go out in business hours (IST), to Nandan staff unless Dr Raghu has said otherwise, and never in bulk.
8. When unsure, ask the person. When something looks wrong, say so to Dr Raghu.')
on conflict (id) do nothing;
revoke all on public.agent_policy from anon, authenticated, public;

create table if not exists public.agent_log (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  email     text not null,
  key_label text,
  tool      text not null,
  args      jsonb,
  ok        boolean not null default true,
  note      text,
  ms        integer
);
create index if not exists agent_log_at_idx on public.agent_log (at desc);
create index if not exists agent_log_email_at_idx on public.agent_log (email, at desc);
revoke all on public.agent_log from anon, authenticated, public;

insert into public.feature_request (title, body, want, status, note, by)
select 'Agent rules in Admin', '<p>"currently genie and Periclaw can only be working through raghus commands. In admin also make the rules that it has follow" (Dr Raghu, 16 Oct 2026.)</p>', 'must', 'done', 'Shipped as Genie 6.11.0.0 — Admin → Agent rules: standing orders handed to every agent, switches for reads / writes / WhatsApp, business hours, daily caps, and the log of every call.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title = 'Agent rules in Admin');
insert into public.genie_migration (name) values ('0240_agent_rules') on conflict (name) do nothing;
