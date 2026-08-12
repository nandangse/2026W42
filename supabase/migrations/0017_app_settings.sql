-- 0017_app_settings.sql
-- Singleton table for the app's own identity — the name shown next to the
-- logo and the "theme" line under it (currently "Nandan Breakthrough
-- 2026-27"). Editable from Admin so a new theme name doesn't need a code
-- change/deploy. Logo stays a bundled asset (src/lib/logo.ts) for now — this
-- table only carries a URL override for when that changes.
-- Additive and safe to re-run.

create table if not exists public.app_settings (
  id boolean primary key default true, -- exactly one row ever (id = true)
  app_name text not null default 'Genie',
  theme_name text not null default 'Nandan Breakthrough 2026-27',
  logo_url text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  constraint app_settings_singleton check (id)
);

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- everyone signed in reads it (it drives the header for all roles)
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select to authenticated
  using (true);

-- only admins change it
drop policy if exists app_settings_write on public.app_settings;
create policy app_settings_write on public.app_settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
