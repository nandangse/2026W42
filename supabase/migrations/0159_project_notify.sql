-- 0159 — who to tell, kept on the PROJECT (Dr Raghu, 8 Sep 2026, asked who
-- the "concerned people" of an RBOM release are: "the rule will come in
-- projects").
--
-- So it does not live on the RBOM, and it is not guessed from the job's
-- owners. It is set once per project and every RBOM released against that
-- project reads it — which is right, because the people who need to know a
-- BOM has moved are a property of the job, not of the document.
--
-- It gets its own table rather than a column on material_project, because
-- that one is an ERP MIRROR: nothing in it is typed by hand, and a pull would
-- wipe anything that were. This is Saamaan's own, and survives every pull.
--
-- Safe to run twice.

create table if not exists public.material_project_notify (
  project_id   text primary key,
  emails       jsonb not null default '[]'::jsonb,   -- the addresses, in order
  note         text,                                  -- why these people
  updated_by   text,
  updated_at   timestamptz default now()
);

comment on table public.material_project_notify is
  'Who is told when an RBOM on this project is released. Saamaan''s own — material_project is an ERP mirror and a pull would wipe anything typed into it.';

alter table public.material_project_notify enable row level security;
revoke all on public.material_project_notify from public, anon, authenticated;

create table if not exists public.genie_migration (name text primary key, at timestamptz default now());
insert into public.genie_migration (name) values ('0159_project_notify') on conflict (name) do nothing;

notify pgrst, 'reload schema';

select count(*) as projects_with_a_notify_list from public.material_project_notify;
