-- 0006_settings_singleton.sql
-- Ensure the single settings row exists (family templates + users are seeded by
-- scripts/seed.ts, which needs the templateFor() jsonb from the TS layer).

insert into public.settings (id, priority_order)
values (1, '{}')
on conflict (id) do nothing;
