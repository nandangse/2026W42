-- 0066 — a send may be tried again, and the count says how often.
--
-- Dr Raghu, 14 Sep 2026, before a thousand go out: "am asking so that
-- tomorrow while sending thousand this should not have a problem."
--
-- Today a failed send is final. That is right for a dead address and wrong
-- for everything else: Resend answering 429 TOO MANY REQUESTS, a five-second
-- timeout, a 502 from a load balancer. In a batch of thirty-four such a
-- wobble is invisible. In a batch of a thousand it buries eighty good
-- addresses as "failed", and nothing ever picks them up again.
--
-- So a temporary failure goes back to the queue instead of dying — and
-- `tries` is what stops that becoming an infinite loop. Three attempts, then
-- it is a real failure and stays one.
--
-- WHY A COLUMN AND NOT A GUESS. Without a counter the only way to avoid a
-- loop is to never retry, or to retry forever. The number has to be written
-- down somewhere, and the row that failed is the honest place.
--
-- Additive and re-runnable.

alter table if exists public.mk_send
  add column if not exists tries       int not null default 0,
  add column if not exists last_try_at timestamptz;

comment on column public.mk_send.tries is
  'How many times sending this row has been attempted. A temporary failure '
  '(429, 5xx, timeout) returns the row to queued and adds one; at three it '
  'is left as failed. A permanent refusal fails on the first attempt.';

-- Finding the next batch now also skips rows that are cooling off, so the
-- index carries the column the query filters on.
create index if not exists mk_send_retry_idx
  on public.mk_send (campaign_id, status, last_try_at);
