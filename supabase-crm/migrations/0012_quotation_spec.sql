-- 0012: the quotation, in Dr Raghu's words (Genie 3.23.1.25, 26 Aug 2026)
--
-- · quoted_on    — DATE OF QUOTE, its own field (sent_at was a timestamp
--                  nobody typed; this is the business date).
-- · quoted_value — VALUE OF QUOTE, typed by the salesperson. The computed
--                  grand_total still wins once lines exist; this carries the
--                  value for imported shells and quick quotes.
-- · status       — exactly five words: draft · live · hotlist · lost ·
--                  expired. Column becomes text (the old enum allowed no new
--                  values inside one transaction); every current 'sent' row
--                  becomes 'live'. The STAGE stays the closure ladder — Sent,
--                  Long Term, the month buckets, Order Received — because
--                  importance of closure IS the stage.

alter table quotation alter column status drop default;
alter table quotation alter column status type text using status::text;

update quotation set status = 'live'    where status in ('sent', 'revised', 'accepted', 'approved', 'internal_review');
update quotation set status = 'lost'    where status = 'rejected';
-- 'draft' and 'expired' already say what they mean

alter table quotation alter column status set default 'draft';
alter table quotation drop constraint if exists quotation_status_chk;
alter table quotation add constraint quotation_status_chk
  check (status in ('draft', 'live', 'hotlist', 'lost', 'expired'));

alter table quotation add column if not exists quoted_on date;
alter table quotation add column if not exists quoted_value numeric(16,2);

-- the existing book: date every quote from what we know
update quotation
   set quoted_on = coalesce(quoted_on, sent_at::date, created_at::date)
 where quoted_on is null;

create index if not exists quote_quoted_on_idx on quotation (quoted_on desc);
