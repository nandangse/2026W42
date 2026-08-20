-- 0045_feature_requests.sql
--
-- Asking for something in Genie, inside Genie.
--
-- Requests currently arrive as a sentence in a chat, a screenshot, or a
-- remark on a call, and the ones that are not acted on the same day are
-- gone. This gives them somewhere to sit with what was actually meant --
-- the words, a picture of the screen, and how badly it is wanted.
--
-- WANT IS A FIELD, NOT A TONE. "Must have", "Good to have" and "Future
-- potential" are stated by the person asking rather than inferred from how
-- forcefully they asked. Everything sounds urgent in the sentence it is
-- written in; almost nothing is, and the person asking knows which.
--
-- Anyone signed in may raise one and read the rest. A backlog only the person
-- who owns it can see is a list nobody else stops duplicating.
--
-- Additive and safe to re-run.

create table if not exists public.feature_request (
  id       uuid primary key default gen_random_uuid(),
  title    text not null,
  /** Rich text, stored as a small allow-list of HTML the API enforces. */
  body     text not null default '',
  want     text not null default 'good'
           check (want in ('must', 'good', 'future')),
  status   text not null default 'open'
           check (status in ('open', 'planned', 'done', 'declined')),
  /** Why it was declined, or what it shipped as. */
  note     text not null default '',
  by       text,
  at       timestamptz not null default now(),
  acted_by text,
  acted_at timestamptz,
  constraint feature_request_title_len check (length(btrim(title)) >= 3)
);

comment on table public.feature_request is
  'Asks for Genie. Raised by anyone signed in; status is the owner''s to set.';

create index if not exists feature_request_open_idx on public.feature_request (status, want, at desc);

create table if not exists public.feature_file (
  id      uuid primary key default gen_random_uuid(),
  req_id  uuid not null references public.feature_request(id) on delete cascade,
  name    text not null,
  path    text not null,
  mime    text,
  bytes   bigint,
  at      timestamptz not null default now()
);

create index if not exists feature_file_req_idx on public.feature_file (req_id);

alter table public.feature_request enable row level security;
alter table public.feature_file enable row level security;

drop policy if exists feature_request_read on public.feature_request;
create policy feature_request_read on public.feature_request
  for select to authenticated using (true);

drop policy if exists feature_file_read on public.feature_file;
create policy feature_file_read on public.feature_file
  for select to authenticated using (true);

-- Writes go through /api/feature with the service key: it sanitises the HTML,
-- stamps who asked, and refuses a status change from anyone but the owner.

-- Screenshots. Private -- they are pictures of the company's own boards.
insert into storage.buckets (id, name, public)
values ('feature-files', 'feature-files', false)
on conflict (id) do nothing;
