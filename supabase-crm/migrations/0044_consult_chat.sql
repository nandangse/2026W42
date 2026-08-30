-- CRM 0044 — Consult Raghu's chair (30 Aug 2026)
-- Every consultation is kept whole: the record it stood on, who sat down,
-- every word both ways — the raw material for training the advisor and for
-- reading what the team is really thinking.
create table if not exists consult_chat (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid,
  target_type  text not null,
  target_id    text not null,
  started_at   timestamptz not null default now()
);
create index if not exists consult_chat_target_idx on consult_chat (target_type, target_id);
create index if not exists consult_chat_person_idx on consult_chat (profile_id, started_at desc);

create table if not exists consult_msg (
  id        uuid primary key default gen_random_uuid(),
  chat_id   uuid not null references consult_chat(id) on delete cascade,
  role      text not null check (role in ('user', 'assistant')),
  content   text not null,
  at        timestamptz not null default now()
);
create index if not exists consult_msg_chat_idx on consult_msg (chat_id, at);
