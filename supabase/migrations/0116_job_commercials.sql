-- 0116_job_commercials.sql
--
-- JOB COMMERCIALS (Dr Raghu, 2 Sep 2026): the cash a job will actually throw
-- off, and when — "this will help me to get a little evaluation of the cash
-- flows that can be expected from order execution. This is what we'll use for
-- our 13-week cash flow plan."
--
-- Most of the row already exists: value, throughput and its percentage,
-- kitting, production, TDD, the project manager and the pending payment on
-- delivery are all on the board. Seven things are new, and they are the ones
-- that turn a job list into a cash forecast.
--
-- EVERY ONE OF THEM IS NULLABLE AND STAYS NULL UNTIL SOMEBODY SAYS.
-- Number(null) is 0 in JavaScript, and a defaulted zero here is the whole
-- danger of this screen: "no advance recorded" and "no advance received" are
-- different facts, and a forecast that silently reads the first as the second
-- promises money that was already collected, or never was.
alter table public.jobs add column if not exists advance      numeric;   -- already received
alter table public.jobs add column if not exists invested     numeric;   -- material/bought-out money already in
alter table public.jobs add column if not exists wip_labour   numeric;   -- labour money already in

-- The collection terms, as percentages OF THE PENDING AMOUNT. Four buckets:
-- what lands with the delivery itself, then at 30, 60 and 90 days.
alter table public.jobs add column if not exists pay_pct_on   numeric;
alter table public.jobs add column if not exists pay_pct_30   numeric;
alter table public.jobs add column if not exists pay_pct_60   numeric;
alter table public.jobs add column if not exists pay_pct_90   numeric;
