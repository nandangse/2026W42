-- 0182 — AUDIT QUERIES GROW A THREAD
--
-- Dr Raghu, 30 Sep 2026:
--   "on clicking put a lightbox to open, show the query. Below that show a
--    genie icon so that suresh can click on it and it will give greater
--    insight about this. this will be seen."
--   "also make the comment there. and make it log change from pending to
--    done for review and then close."
--
-- A query is not a row that flips state; it is a conversation with a record.
-- Jyoti raises it, Suresh answers it, Sandesh checks it, and the interesting
-- part is what was said in between and how long each leg took. That cannot
-- live in one 'remarks' column, so it gets its own table.
--
-- EVERY EVENT IS APPEND-ONLY. Nothing here is ever updated, because an audit
-- trail that can be edited after the fact is not one.

create table if not exists audit_query_event (
  id          uuid primary key default gen_random_uuid(),
  query_id    uuid not null references audit_query(id) on delete cascade,
  -- 'status' a state change, 'comment' somebody wrote, 'ai' Genie's reading
  kind        text not null default 'comment',
  from_status text,
  to_status   text,
  body        text,
  by_email    text,
  at          timestamptz not null default now()
);

create index if not exists audit_query_event_q on audit_query_event (query_id, at desc);
create index if not exists audit_query_event_kind on audit_query_event (kind, at desc);

-- Genie's reading of the query, kept on the row so the list can show that one
-- exists without reading every thread.
alter table audit_query add column if not exists ai_note text;
alter table audit_query add column if not exists ai_at   timestamptz;
alter table audit_query add column if not exists ai_by   text;

-- The clock on each leg: when it first went out for answer, and when it came
-- back. Filled by the route on the status change, so "how long did Suresh
-- take" is a subtraction rather than a trawl through the thread.
alter table audit_query add column if not exists answered_at timestamptz;
alter table audit_query add column if not exists closed_at   timestamptz;

alter table audit_query_event enable row level security;
revoke all on audit_query_event from public, anon;
