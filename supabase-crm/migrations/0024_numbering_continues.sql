-- 0024_numbering_continues.sql  (CRM project)
--
-- Numbers continue from the LAST LARGEST and start at the NEXT HUNDRED
-- (Dr Raghu, 28 Aug 2026: "34567 -> then start from 34600") — for the
-- Enquiry, the Quotation and the Sales Order. The financial-year reset is
-- switched off for these three: a number stream that restarts every April
-- cannot "continue from the largest".
--
-- The seed reads the trailing digits of every existing number (imported ERP
-- rows included), takes the max, and parks the series one before the next
-- hundred — so the next issue lands exactly on it.
--
-- Line comments only. Safe to re-run (greatest() keeps it monotonic).

insert into number_series (code, prefix, width, reset_yearly)
values ('sales_order', 'NGSE/SO/', 5, false)
on conflict (code) do nothing;

update number_series set reset_yearly = false, fy = null
where code in ('opportunity', 'quotation', 'sales_order');

update number_series s set current = greatest(s.current, x.nxt)
from (
  select 'opportunity' as code,
         coalesce(ceil((max((substring(opportunity_no from '(\d+)\s*$'))::bigint) + 1) / 100.0) * 100 - 1, 0) as nxt
  from opportunity where opportunity_no ~ '\d\s*$'
  union all
  select 'quotation',
         coalesce(ceil((max((substring(quote_no from '(\d+)\s*$'))::bigint) + 1) / 100.0) * 100 - 1, 0)
  from quotation where quote_no ~ '\d\s*$'
  union all
  select 'sales_order',
         coalesce(ceil((max((substring(so_no from '(\d+)\s*$'))::bigint) + 1) / 100.0) * 100 - 1, 0)
  from sales_order where so_no ~ '\d\s*$'
) x
where s.code = x.code;

-- ---------------------------------------------------------------------------
-- Deal contacts from ANY organization (same ask, same day): a consultant, a
-- PMC engineer or an airline's buyer can sit on an airport operator's deal.
-- The person keeps their own company; this table records their part in THIS
-- opportunity.

create table if not exists opportunity_contact (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunity(id) on delete cascade,
  person_id      uuid not null references person(id) on delete cascade,
  role           text,
  note           text,
  created_by     uuid references profile(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (opportunity_id, person_id)
);

drop trigger if exists opportunity_contact_touch on opportunity_contact;
create trigger opportunity_contact_touch before update on opportunity_contact
  for each row execute function crm_touch();

create index if not exists opportunity_contact_opp_idx on opportunity_contact (opportunity_id);
