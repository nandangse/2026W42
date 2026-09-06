-- CRM 0047 — the status check learns the whole vocabulary (30 Aug 2026)
-- 0041 widened an enum TYPE the column never used; the column is text with
-- this CHECK, so 'submitted' and 'cancelled' were silently unstorable —
-- submits fell back, amends could not cancel, and the history import choked.
alter table quotation drop constraint if exists quotation_status_chk;
alter table quotation add constraint quotation_status_chk
  check (status in ('draft','live','hotlist','submitted','cancelled','lost','expired'));
