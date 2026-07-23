-- 0001_init_extensions_profiles.sql
-- Extensions, the profiles table (role store), and new-user handling.
-- Run migrations strictly in order (0001…000N); stop on any error and repair.

create extension if not exists pgcrypto;      -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- profiles: one row per auth.users, keyed on id = auth.users.id (no separate
-- user_id column — the intern-portal lesson). role drives every RLS policy.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  role       text not null default 'planner'
             check (role in ('admin', 'planner', 'uploader')),
  disabled   boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'App roles keyed to auth.users.id. role ∈ {admin, planner, uploader}.';

-- Auto-create a profile whenever an auth user is created (role comes from the
-- admin-supplied user_metadata.role when present, else defaults to planner).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'planner')
  )
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
