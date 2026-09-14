-- 0167 — THE LEDGER TELLS THE TRUTH ABOUT ITSELF.
--
-- Not a schema change. This corrects a RECORD that is wrong, and the record
-- being wrong is dangerous in one specific way.
--
-- Counted 14 Sep 2026: 169 migration files, 166 rows in genie_migration.
-- Three are missing — and all three HAVE been run. Probed rather than
-- believed, because the ledger is exactly what is in question:
--
--   0136_material_po          material_po holds 20,928 rows,
--                             material_po_item holds 77,584.
--   0138_ims_register_import  ims_register_entry holds 273 rows.
--   0156_idp_login_lockdown   the browser key is refused with 401 on
--                             hrms_idp_login — the lockdown is in force.
--
-- WHY THIS MATTERS. The next person to read that ledger will believe those
-- three are pending and run them. Two are IMPORT migrations: running them
-- again could duplicate ninety-eight thousand rows. A record that
-- understates what has happened invites somebody to do it twice.
--
-- Each insert is guarded on the evidence, so this file cannot claim a
-- migration was applied unless the thing it creates is actually there.
-- Safe to run twice.

-- 0136 — the purchase-order tables
insert into public.genie_migration (name)
select '0136_material_po'
 where to_regclass('public.material_po') is not null
   and to_regclass('public.material_po_item') is not null
on conflict (name) do nothing;

-- 0138 — the IMS register import
insert into public.genie_migration (name)
select '0138_ims_register_import'
 where to_regclass('public.ims_register_entry') is not null
on conflict (name) do nothing;

-- 0156 — the IDP login lockdown. The evidence is the REVOKED privilege,
-- not the table's existence: the table pre-dates the migration.
insert into public.genie_migration (name)
select '0156_idp_login_lockdown'
 where to_regclass('public.hrms_idp_login') is not null
   and not has_table_privilege('anon', 'public.hrms_idp_login', 'SELECT')
on conflict (name) do nothing;

-- ── prove it ──
select
  (select count(*) from public.genie_migration)                       as rows_in_ledger,
  (select count(*) from public.genie_migration
     where name in ('0136_material_po','0138_ims_register_import',
                    '0156_idp_login_lockdown'))                       as the_three;
