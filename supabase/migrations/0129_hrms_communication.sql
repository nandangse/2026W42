-- 0129_hrms_communication.sql
--
-- COMMUNICATION (Dr Raghu, 4 Sep 2026): "in this put another tab
-- communication. Also in masters keep a provision to add template. Have a
-- list of variables in the side."
--
-- Two things, both additive:
--
--   1. hrms_communication -- every mail Genie sends a person from HRMS, kept
--      against the employee: to which address, what was said (rendered, with
--      the variables filled in), who sent it, and what the mail server
--      answered. The record's Communication tab reads this. Append-only.
--
--   2. hrms_text_master grows a KIND ('text' for letter paragraphs, 'email'
--      for a mail template) and a SUBJECT (for e-mail kinds), so a template
--      added from the Masters screen can be picked when writing to a person.
--
-- ASCII only, safe to re-run.

create table if not exists public.hrms_communication (
  id            uuid primary key default gen_random_uuid(),
  employee_id   text not null,
  channel       text not null default 'email',
  to_address    text,
  subject       text,
  body          text not null default '',
  template_key  text,
  status        text not null default 'sent',
  error         text,
  sent_by       text,
  sent_at       timestamptz not null default now(),
  meta          jsonb
);

create index if not exists hrms_communication_employee_idx
  on public.hrms_communication (employee_id, sent_at desc);

comment on table public.hrms_communication is
  'Every message HRMS sent a person -- rendered text, address, sender, and what the mail server said. Append-only.';

alter table public.hrms_communication enable row level security;
revoke all on public.hrms_communication from anon, authenticated;

alter table public.hrms_text_master add column if not exists kind    text not null default 'text';
alter table public.hrms_text_master add column if not exists subject text;

comment on column public.hrms_text_master.kind is
  'text = a paragraph that goes into letters; email = a mail template with a subject, offered when writing to a person.';
