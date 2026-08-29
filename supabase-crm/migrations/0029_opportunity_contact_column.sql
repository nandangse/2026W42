-- 0029_opportunity_contact_column.sql  (CRM project)
--
-- The opportunity gets its CONTACT (Dr Raghu, 29 Aug 2026: "import the
-- Customers as well as the contacts so that each is 1:1 inside this") —
-- the ERP's Opportunity carries one contact_person; ours now carries the
-- same person, matched or created by the importer through person.erp_name.
--
-- Line comments only. Safe to re-run.

alter table opportunity add column if not exists contact_id uuid references person(id);
create index if not exists opportunity_contact_idx on opportunity (contact_id);
