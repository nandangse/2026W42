-- 0073_profile_self.sql
--
-- PROFILE, SELF-SERVICE (Dr Raghu, 25 Aug 2026): a person may keep their own
-- WhatsApp number current from the Profile card; name, initials, role and
-- ERP owner stay admin-set. oauth_available is the admin's mark that this
-- person may connect Gmail -- the connect itself happens with an
-- administrator in tow, in the comms build.
--
-- ASCII only, additive, safe to re-run.

alter table public.profiles add column if not exists whatsapp_no text;
alter table public.profiles add column if not exists oauth_available boolean not null default false;
alter table public.profiles add column if not exists oauth_connected_at timestamptz;
