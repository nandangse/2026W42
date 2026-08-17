-- 0022_initials_three.sql
-- Initials may be two OR three letters, and must still be unique.
--
-- Two letters ran out. With enough people the pairs collide, and the initials
-- are not decoration — they are the key tasks are assigned by and the boards
-- filter on, so a collision is two people sharing a to-do list.
--
-- Uniqueness was already enforced by profiles_initials_key (0008) and is
-- untouched here; only the length rule changes. Widening a CHECK can never
-- invalidate an existing row, so this is safe on live data.

alter table public.profiles drop constraint if exists profiles_initials_fmt;
alter table public.profiles
  add constraint profiles_initials_fmt
  check (initials is null or initials ~ '^[A-Z]{2,3}$');

-- Designation and department already exist (0010 and 0019 respectively); they
-- are surfaced in Admin -> Users from this release, and are what the Goals
-- cascade and the Team/IDP tabs read.
comment on column public.profiles.designation is
  'Job title, e.g. "Head - Works". Shown in Admin -> Users; read by Goals.';
