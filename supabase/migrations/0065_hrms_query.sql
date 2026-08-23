-- 0065_hrms_query.sql
--
-- RJ APPROVAL - SALARY QUERIES (Dr Raghu, 23 Aug 2026): "this is when HR
-- raises queries to me for discussion and approvals".
--
-- Not a form and not a ticket queue -- a CONVERSATION with a decision at the
-- end of it. HR raises a question (usually about one person's pay, sometimes
-- not about anybody in particular), the owner and HR talk it through in
-- writing, and then it is ANSWERED and closed. The thread is kept because
-- six months later the question is never "what did we decide" alone, it is
-- "what did we decide and why".
--
-- The thread is a jsonb array of { by, at, text } so a reply costs no schema.
--
-- ASCII only, additive, safe to re-run.

create table if not exists public.hrms_query (
  id           uuid primary key default gen_random_uuid(),
  /** Optional -- a query may be about a person, or about a policy. */
  employee_id  text,
  subject      text not null,
  question     text not null,
  /** Salary, Increment, Deduction, Statutory, Policy, Other. */
  topic        text not null default 'Salary',
  /** Open -> Answered. Nothing is deleted. */
  status       text not null default 'Open',
  thread       jsonb not null default '[]'::jsonb,
  answer       text,
  raised_by    text,
  raised_at    timestamptz not null default now(),
  answered_by  text,
  answered_at  timestamptz,
  updated_at   timestamptz not null default now()
);

create index if not exists hrms_query_status_idx on public.hrms_query (status, raised_at desc);

comment on table public.hrms_query is
  'A question HR has put to the owner for discussion and a decision. '
  'Raised, discussed in the thread, answered, and closed on the record.';

alter table public.hrms_query enable row level security;
revoke all on public.hrms_query from anon, authenticated;
