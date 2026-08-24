-- ============================================================================
-- NANDAN CRM — 0005 — SALES INVOICE
-- Dr Raghu, 24 Aug 2026: "This is the ONE source of truth of what we have
-- accomplished." An order is a promise; the invoice is the fact. ERPNext
-- raises them; this table is the CRM's record of the fact, and the numbers
-- every accomplishment screen will sum.
--
-- Additive. Run AFTER 0004. Idempotent — safe to re-run.
-- ============================================================================

create table if not exists sales_invoice (
  id              uuid primary key default gen_random_uuid(),
  si_no           text unique not null,            -- as ERPNext issued it
  company_id      uuid references company(id),
  sales_order_id  uuid references sales_order(id),
  opportunity_id  uuid references opportunity(id),
  owner_id        uuid references profile(id),
  sector_id       smallint references sector(id),
  amount          numeric(16,2),
  currency        char(3) not null default 'INR',
  invoiced_on     date,
  due_on          date,
  erp_status      text,                            -- Paid · Unpaid · Overdue · Return, as ERPNext says
  notes           text,
  erpnext_si_no   text,
  created_at      timestamptz not null default now(),
  created_by      uuid references profile(id),
  updated_at      timestamptz not null default now()
);
create index if not exists si_company_idx on sales_invoice (company_id);
create index if not exists si_date_idx    on sales_invoice (invoiced_on desc);
drop trigger if exists sales_invoice_touch on sales_invoice;
create trigger sales_invoice_touch before update on sales_invoice
  for each row execute function crm_touch();
alter table sales_invoice enable row level security;
alter table sales_invoice force row level security;
