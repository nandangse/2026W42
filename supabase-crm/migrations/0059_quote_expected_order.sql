-- 0059 — the date the order is expected, on the quote (Dr Raghu, 8 Sep 2026:
-- "in quote remove the delivery and put in expected prder date").
--
-- "Delivery: 8-12 weeks" was a promise about how long we would take. What a
-- salesperson actually needs on the quote is when the ORDER is expected to
-- land — it is the number the forecast is built on, and until now the only
-- place it lived was the opportunity.
--
-- The delivery column is NOT dropped: two years of quotes carry a value in it
-- and the ERP's own imports set it. It simply comes off the form. Nothing is
-- lost, and a column can always be dropped later once nobody misses it.
--
-- Safe to run twice.

alter table if exists public.quotation
  add column if not exists expected_order_on date;

comment on column public.quotation.expected_order_on is
  'When the order is expected to land. Replaces Delivery on the form; the forecast reads this.';
comment on column public.quotation.delivery_weeks is
  'RETIRED from the form 8 Sep 2026 — kept because two years of quotes and the ERP imports carry it.';

create index if not exists quotation_expected_order_idx on public.quotation (expected_order_on);

notify pgrst, 'reload schema';

select count(*) as quotes, count(expected_order_on) as with_a_date from public.quotation;
