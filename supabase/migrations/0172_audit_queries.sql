-- 0172_audit_queries.sql
--
-- AUDIT QUERIES — the Accounts Management Review, brought inside.
--
-- Dr Raghu, 29 Sep 2026: "make a section called Audit Queries. We will get the
-- Auditors to put it here itself from now on ... I want us to be able to get
-- ALL the details in this so that the Accounts management review file with
-- manual work is redundant."
--
-- THE SHEET IS THE SPEC. 1,905 rows going back to April 2021 — who asked, who
-- it went to, against which ledger, what was asked, what it was worth, where
-- it stands, and what was said when it was closed. Every column is kept
-- because every column is somebody's answer to a question an auditor asked.
--
-- THE DATES IN IT ARE NOT ALL DATES. "20/04/2021" sits beside "8" and beside
-- "Immediately on priority"; Verified Date holds "17.05.21" and "22-5-2021".
-- So each date is stored TWICE: the text exactly as written, and a real date
-- only where one could be read with confidence. Parsing "8" into the eighth of
-- some month would be inventing a fact about an audit query, and an audit
-- trail that quietly invents is worse than one with gaps in it.
--
-- THE SAME IS TRUE OF AMOUNT: "16.31 lakhs", "71 Lakhs", "80000" and "3.1
-- Lakhs" are all in that column. The text is kept whole and the rupee figure
-- is filled in only where the words say plainly what they mean.
--
-- ASCII only, additive, safe to re-run.

create table if not exists public.audit_query (
  id             uuid primary key default gen_random_uuid(),

  assigned_text  text,                    -- exactly as written
  assigned_on    date,                    -- only where it reads as a date
  instructed_by  text,
  assigned_to    text,
  related_to     text,                    -- the vendor or the ledger
  instruction    text,
  target_text    text,
  target_on      date,
  amount_text    text,
  amount         numeric,                 -- rupees, only where unambiguous
  status         text not null default 'Pending',
  remarks        text,
  verified_text  text,
  verified_on    date,

  -- where the row came from, so an imported row and a typed one are never
  -- confused for one another
  source         text not null default 'typed',
  -- the sheet's own row number, so a re-import updates rather than doubles
  sheet_row      integer,

  added_by       text,
  added_at       timestamptz not null default now(),
  updated_by     text,
  updated_at     timestamptz not null default now()
);

create unique index if not exists audit_query_sheet on public.audit_query (sheet_row) where sheet_row is not null;
create index if not exists audit_query_status on public.audit_query (status);
create index if not exists audit_query_to on public.audit_query (lower(assigned_to));
create index if not exists audit_query_when on public.audit_query (assigned_on desc nulls last);

comment on table public.audit_query is
  'The Accounts Management Review query sheet, live. Auditors write here.';
comment on column public.audit_query.assigned_text is
  'The date exactly as written in the sheet. assigned_on is filled only where it reads as a real date.';
