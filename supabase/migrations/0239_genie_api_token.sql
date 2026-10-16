-- 0239 — A KEY PER PERSON FOR GENIE'S MCP DOOR (Genie 6.11.0.0)
--
-- Dr Raghu, 16 Oct 2026: "the Genie should be wired to ALL the modules. I
-- want it to access the others. This currently is only for me."
--
-- Every signed-in person can mint their own key at /connect and give it to
-- their agent (Perisclaw, Claude…). The agent then sees exactly what that
-- person sees in Genie — the same module doors, the same ticks — and what it
-- writes is written in their name. Only the SHA-256 of a key is kept; the key
-- itself is shown once, at minting. Revoking is a timestamp, never a delete,
-- so the trail of who connected what stays.

create table if not exists public.genie_api_token (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  label        text not null default 'My agent',
  token_hash   text not null unique,
  prefix       text not null default '',          -- the first 8 characters, to tell keys apart on the screen
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  last_tool    text,
  calls        integer not null default 0,
  revoked_at   timestamptz,
  revoked_by   text
);
create index if not exists genie_api_token_email_idx on public.genie_api_token (email, revoked_at);
alter table public.genie_api_token enable row level security;
revoke all on public.genie_api_token from anon, authenticated;

insert into public.feature_request (title, body, want, status, note, by)
select 'Genie MCP — wired to every module, a key per person, each sees what their login sees', '<p>"the genie should be wired to ALL the modules i want. i want it to access the others. this currently is only for me" (Dr Raghu, 16 Oct 2026.)</p>', 'must', 'done', 'Shipped as Genie 6.11.0.0 — /connect mints a key; /api/mcp serves tools per the caller''s module doors.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title like 'Genie MCP — wired to every module%');

insert into public.genie_migration (name) values ('0239_genie_api_token') on conflict (name) do nothing;
