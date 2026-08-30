-- CRM 0031 — remove the junk "Total" opportunity (30 Aug 2026)
-- A stray total line came in with the 26 Aug ERP pull as an opportunity named
-- "Total" — no company, no amount, nothing but the word. The pull cursor is
-- already past its creation date, so once removed it does not come back.

delete from record_link where opportunity_id = '20871d35-b013-496f-9a43-3450b2748dc5';
delete from activity    where opportunity_id = '20871d35-b013-496f-9a43-3450b2748dc5';
delete from crm_audit   where entity = 'opportunity' and entity_id = '20871d35-b013-496f-9a43-3450b2748dc5';
delete from opportunity where id = '20871d35-b013-496f-9a43-3450b2748dc5';
