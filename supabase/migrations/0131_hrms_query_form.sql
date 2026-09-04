-- 0131_hrms_query_form.sql
--
-- HR QUERIES (Dr Raghu, 4 Sep 2026): "recreate a form like this for the
-- guy who will be logged in. HR can also fill in. Have two buttons: HR
-- Queries for self and HR query for others."
--
-- The Google Form "How can we help you?" becomes a screen. Each submission
-- is one hrms_query row (the table RJ Approval - Salary Queries already
-- uses), with topic 'HR Query' and the form's ticks kept whole in FORM so
-- nothing the person said is flattened away. FOR_SELF says whether the
-- person raised it themselves or HR did it for them.
--
-- ASCII only, additive, safe to re-run.

alter table public.hrms_query add column if not exists form      jsonb;
alter table public.hrms_query add column if not exists for_self  boolean not null default true;
alter table public.hrms_query add column if not exists raised_email text;

create index if not exists hrms_query_raised_email_idx on public.hrms_query (raised_email);

comment on column public.hrms_query.form is
  'The HR Queries form as submitted: ticked issues by section, free text, and the contact block. Null for queries raised the old way.';
