-- 0026_tags_everywhere.sql  (CRM project)
--
-- Tags widen to QUOTATIONS, SALES ORDERS and LEADS (Dr Raghu, 28 Aug 2026,
-- pointing at a quotation: "this will have the tags at the bottom right").
-- Same tables, same privacy rules — only the entity fence moves.
--
-- Line comments only. Safe to re-run.

alter table crm_tag_link drop constraint if exists crm_tag_link_entity_check;
alter table crm_tag_link add constraint crm_tag_link_entity_check
  check (entity in ('company', 'person', 'opportunity', 'quotation', 'sales_order', 'lead'));
