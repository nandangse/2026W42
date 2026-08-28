-- 0083: each voucher carries its VALUE (Dr Raghu, 28 Aug 2026) — the parser
-- sums the voucher's own credit side as it reads, so the dashboard can say
-- Billing / Collections / Purchases / Payments for any period without
-- touching the 27,000 lines every time.
-- Line comments only. Additive and safe to re-run.

alter table public.kuber_voucher add column if not exists amount numeric not null default 0;
create index if not exists kuber_voucher_type_date_idx on public.kuber_voucher (vtype, date);
