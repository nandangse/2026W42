-- 0231 — CEO: A DAILY SNAPSHOT OF EVERY BOX, FOR THE WEEK-ON-WEEK TRIANGLES (Genie 6.10.0.2)
--
-- Dr Raghu, 14 Oct 2026: "show triangles in each box with respect to last
-- week — is there improvement or has it got worse?" What is owed, the jobs on
-- the floor and the people on notice cannot be worked out backwards for a
-- past day, so each figure on the CEO dashboard (financial year to date) is
-- kept once a day — by the hourly ERP pull, and whenever one of the three
-- opens the page — and the triangle compares today with the day a week back.

create table if not exists public.ceo_snapshot (
  day    date not null,
  key    text not null,
  value  numeric not null,
  at     timestamptz not null default now(),
  primary key (day, key)
);
alter table public.ceo_snapshot enable row level security;
revoke all on public.ceo_snapshot from anon, authenticated;

insert into public.feature_request (title, body, want, status, note, by)
select x.title, x.body, 'must', 'done', 'Shipped as Genie 6.10.0.2.', 'raghu@nandan.co.in'
from (values
  ('CEO — Sales, TVC, Throughput, OE, PBT on top; receivables 0–90/90+, payables 0–180/180+, supplier bills not received, advances, payment on order execution', '<p>"I want the top box to be Sales, TVC, Throughput, OE, PBT as total and % … Receivables (total, then 0–90 and 90+), Payables (total, then 0–180 and 180+), Supplier bills not received, Advance received | Advance paid, Payment on Order Execution (0–30, 31–60, 61–90, 90+ days)." (Dr Raghu, 14 Oct 2026.)</p>'),
  ('CEO — triangles week on week, people figures, frozen header, the floor in more depth, a TailAdmin look', '<p>"show triangles in each box with respect to last week" · "Added in 90 days, left in 90 days, in notice period, FnF pending" · "the header also keep it frozen as well as the title and periods" · "show more data here, use your senses" · "improve the look and feel of this" (TailAdmin). (Dr Raghu, 14 Oct 2026.)</p>')
) as x(title, body)
where not exists (select 1 from public.feature_request f where f.title = x.title);

insert into public.genie_migration (name) values ('0231_ceo_snapshot') on conflict (name) do nothing;
