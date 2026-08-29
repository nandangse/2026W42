-- 0030: COMPANIES AND CONTACTS JOIN THE DIAL QUEUE (Dr Raghu, 29 Aug 2026):
-- the blue strip's ☎ now stands on company and contact records too, so the
-- kind check widens. The inline check from 0017 got the default name.
--
-- Line comments only. Safe to re-run.

alter table prospect_queue drop constraint if exists prospect_queue_kind_check;
alter table prospect_queue add constraint prospect_queue_kind_check
  check (kind in ('opportunity', 'quotation', 'sales_order', 'lead', 'company', 'person'));
