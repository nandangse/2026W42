-- ============================================================================
-- NANDAN CRM — 0003 — THE DEAL PIPELINE
-- Dr Raghu, 24 Aug 2026:
--
--   Lead → Opportunity → Quotation → Sales Order.
--
--   Leads are the dump — accumulate everything. An OPPORTUNITY moves through
--   New → Waiting for Data → Consultative Presentation, and then the deal
--   lives on its QUOTATION, whose stage is the HOTNESS of the quote:
--   Sent · Lost · Not Target · Budgetory · Long Term · After Two Months ·
--   Next Month · This Month · Bucket B · Bucket A · Bucket 0 · Order
--   Received. Then the SALES ORDER.
--
--   And the pipeline must be checkable: what came in, what went out of each
--   stage, and what moved below — v_pipeline_flow at the bottom.
--
-- Additive throughout. Run AFTER 0002. Idempotent — safe to re-run.
-- ============================================================================

-- ===================================================== A. STAGES SPLIT IN TWO
-- One stage table, two ladders: entity says whose rung a row is.
alter table stage add column if not exists entity text not null default 'opportunity'
  check (entity in ('opportunity','quotation'));

-- The opportunity's three working rungs.
insert into stage (code, name, sort_order, colour, is_terminal, is_won, weight_pct, entity) values
  ('new',                       'New',                       1, '#8A94A0', false, false,  5, 'opportunity'),
  ('waiting_for_data',          'Waiting for Data',          2, '#7C90A4', false, false, 10, 'opportunity'),
  ('consultative_presentation', 'Consultative Presentation', 3, '#5E86A8', false, false, 20, 'opportunity')
on conflict (code) do nothing;

-- The opportunity's dead ends: the old quote_lost row becomes plain 'Lost'
-- (pre- or post-quote, a dead opportunity is a dead opportunity) and
-- not_target stays. Both keep their 327 + 1,385 imported rows untouched.
update stage set name = 'Lost', sort_order = 98, entity = 'opportunity' where code = 'quote_lost';
update stage set sort_order = 99, entity = 'opportunity' where code = 'not_target';

-- The quotation's hotness ladder, in Dr Raghu's order.
insert into stage (code, name, sort_order, colour, is_terminal, is_won, weight_pct, entity) values
  ('sent',           'Sent',        1, '#3E7BA6', false, false, 40, 'quotation'),
  ('q_lost',         'Lost',        2, '#C0392B', true,  false,  0, 'quotation'),
  ('q_not_target',   'Not Target',  3, '#8A94A0', true,  false,  0, 'quotation'),
  ('budgetory',      'Budgetory',   4, '#7C90A4', false, false, 25, 'quotation'),
  ('long_term',      'Long Term',   5, '#6E8FA0', false, false, 15, 'quotation')
on conflict (code) do nothing;

update stage set entity = 'quotation', sort_order = 6  where code = 'after_two_months';
update stage set entity = 'quotation', sort_order = 7  where code = 'next_month';
update stage set entity = 'quotation', sort_order = 8  where code = 'this_month';
update stage set entity = 'quotation', sort_order = 9  where code = 'bucket_b';
update stage set entity = 'quotation', sort_order = 10 where code = 'bucket_a';
update stage set entity = 'quotation', sort_order = 11 where code = 'bucket_0';
update stage set entity = 'quotation', sort_order = 12 where code = 'order_received';

-- ============================================= B. THE QUOTATION GETS A STAGE
alter table quotation add column if not exists stage_id smallint references stage(id);
alter table quotation add column if not exists lost_reason text;
alter table quotation add column if not exists lost_to_competitor text;
alter table quotation add column if not exists lost_at timestamptz;
alter table quotation add column if not exists won_at timestamptz;
alter table quotation add column if not exists stage_entered_at timestamptz not null default now();
create index if not exists quote_stage_idx on quotation (stage_id);

create table if not exists quotation_stage_history (
  id            bigserial primary key,
  quotation_id  uuid not null references quotation(id) on delete cascade,
  stage_id      smallint not null references stage(id),
  entered_at    timestamptz not null default now(),
  exited_at     timestamptz,
  days_in_stage numeric generated always as
    (case when exited_at is null then null
          else extract(epoch from (exited_at - entered_at)) / 86400.0 end) stored,
  moved_by      uuid,
  note          text
);
create index if not exists qsh_quote_idx on quotation_stage_history(quotation_id);
alter table quotation_stage_history enable row level security;
alter table quotation_stage_history force row level security;

-- Same guards as the opportunity: every move timed by trigger; a lost or
-- not-target move refuses to save without a reason; Order Received stamps
-- won_at and makes the company a customer.
create or replace function quotation_stage_log()
returns trigger language plpgsql as $$
declare s stage%rowtype;
begin
  if tg_op = 'INSERT' then
    if new.stage_id is not null then
      insert into quotation_stage_history (quotation_id, stage_id, moved_by)
      values (new.id, new.stage_id, new.created_by);
    end if;
    return new;
  end if;

  if new.stage_id is distinct from old.stage_id then
    update quotation_stage_history set exited_at = now()
     where quotation_id = new.id and exited_at is null;
    insert into quotation_stage_history (quotation_id, stage_id)
    values (new.id, new.stage_id);
    new.stage_entered_at = now();

    select * into s from stage where id = new.stage_id;
    if s.is_terminal and s.is_won then
      new.won_at  = coalesce(new.won_at, now());
      new.lost_at = null;
      if new.company_id is not null then
        update company
           set is_customer = true,
               first_order_at = coalesce(first_order_at, current_date)
         where id = new.company_id;
      end if;
    elsif s.is_terminal then
      if new.lost_reason is null or length(trim(new.lost_reason)) <= 3 then
        raise exception 'A % move needs a reason — set lost_reason first.', s.name;
      end if;
      new.lost_at = coalesce(new.lost_at, now());
    end if;
  end if;
  return new;
end $$;

drop trigger if exists quotation_stage_log_ins on quotation;
create trigger quotation_stage_log_ins after insert on quotation
  for each row execute function quotation_stage_log();
drop trigger if exists quotation_stage_log_upd on quotation;
create trigger quotation_stage_log_upd before update on quotation
  for each row execute function quotation_stage_log();

-- ==================================== C. HISTORY: THE ERP'S QUOTES SURFACE
-- 538 opportunities stood at Quote Given and 42 at After Two Months — in the
-- ERP the opportunity carried the quote's life. Here the quote does. Each
-- gets a shell quotation (numbered Q-<ENQ>, never from the NGSE/QTN series)
-- at the hotness the opportunity was parked on, and the opportunity itself
-- completes its own ladder at Consultative Presentation.
-- Lost and Not Target opportunities stay exactly where they died.
insert into quotation
  (quote_no, opportunity_id, company_id, owner_id, status, stage_id, created_at, created_by)
select
  'Q-' || o.opportunity_no, o.id, o.company_id, o.owner_id,
  'sent',
  (select id from stage where code = case st.code when 'quote_given' then 'sent'
                                                  else 'after_two_months' end),
  o.created_at, o.created_by
from opportunity o
join stage st on st.id = o.stage_id
where st.code in ('quote_given', 'after_two_months')
  and not exists (select 1 from quotation q where q.quote_no = 'Q-' || o.opportunity_no);

update opportunity
   set stage_id = (select id from stage where code = 'consultative_presentation')
 where stage_id in (select id from stage where code in ('quote_given', 'after_two_months'));

-- The pre-split rungs retire once nothing stands on them.
update stage set active = false
 where code in ('suspect', 'prospect', 'opportunity', 'handled_opportunity', 'quote_given')
   and not exists (select 1 from opportunity o where o.stage_id = stage.id);

-- Remap the two rungs the old ladder used that the new one names differently.
update opportunity set stage_id = (select id from stage where code = 'new')
 where stage_id = (select id from stage where code = 'opportunity');
update opportunity set stage_id = (select id from stage where code = 'waiting_for_data')
 where stage_id = (select id from stage where code = 'handled_opportunity');
update stage set active = false
 where code in ('opportunity', 'handled_opportunity')
   and not exists (select 1 from opportunity o where o.stage_id = stage.id);

-- ================================================== D. SALES ORDER
-- The pipeline's destination. ERPNext remains the system of record for the
-- order's life — this row is the CRM's handle on it, nothing more.
create table if not exists sales_order (
  id                 uuid primary key default gen_random_uuid(),
  so_no              text unique not null,          -- NGSE/SO/202627/00951
  company_id         uuid references company(id),
  quotation_id       uuid references quotation(id),
  opportunity_id     uuid references opportunity(id),
  owner_id           uuid references profile(id),
  sector_id          smallint references sector(id),
  amount             numeric(16,2),
  currency           char(3) not null default 'INR',
  ordered_on         date,
  delivery_on        date,
  erp_status         text,                          -- as ERPNext says it
  acquisition_source text,
  notes              text,
  erpnext_so_no      text,
  created_at         timestamptz not null default now(),
  created_by         uuid references profile(id),
  updated_at         timestamptz not null default now()
);
create index if not exists so_company_idx on sales_order (company_id);
create index if not exists so_owner_idx   on sales_order (owner_id, ordered_on desc);
drop trigger if exists sales_order_touch on sales_order;
create trigger sales_order_touch before update on sales_order
  for each row execute function crm_touch();
alter table sales_order enable row level security;
alter table sales_order force row level security;

-- ================================================== E. INTERACTION
-- Phone calls and visits, logged by the salesperson against ANYTHING —
-- lead, person, company, opportunity, quotation, sales order. The ERP holds
-- 74k of these; they carry the Warmer/Colder read that trains everything.
create table if not exists interaction (
  id               uuid primary key default gen_random_uuid(),
  erp_name         text unique,                     -- NGSE-IM-26-08-00208
  kind             text,                            -- Follow Up Call · Cold Visit · SMS or Whatsapp · …
  call_type        text,
  result           text,                            -- Warmer · Colder · Status Quo · Closed Lost · Closed Won
  happened_at      timestamptz not null default now(),
  by_id            uuid references profile(id),
  person_name      text,                            -- who was spoken to, as written
  remark           text,
  next_action      text,
  next_action_on   date,
  next_action_by   uuid references profile(id),

  company_id       uuid references company(id),
  person_id        uuid references person(id),
  lead_id          uuid references lead(id),
  opportunity_id   uuid references opportunity(id),
  quotation_id     uuid references quotation(id),
  sales_order_id   uuid references sales_order(id),

  erp_ref_doctype  text,                            -- what the ERP pointed it at
  erp_ref_name     text,

  created_at       timestamptz not null default now(),
  created_by       uuid references profile(id),
  updated_at       timestamptz not null default now()
);
create index if not exists interaction_company_idx on interaction (company_id, happened_at desc);
create index if not exists interaction_opp_idx     on interaction (opportunity_id, happened_at desc);
create index if not exists interaction_by_idx      on interaction (by_id, happened_at desc);
drop trigger if exists interaction_touch on interaction;
create trigger interaction_touch before update on interaction
  for each row execute function crm_touch();
alter table interaction enable row level security;
alter table interaction force row level security;

-- Emails will arrive automated as well as inbound and outbound.
alter type direction add value if not exists 'automated';

-- ================================================== F. THE PIPELINE, CHECKED
-- Per rung: what came in, what went out, and what is sitting there now.
-- History accumulates from today — the import wrote each row's first rung.
create or replace view v_pipeline_flow as
select
  s.entity,
  s.id   as stage_id,
  s.code,
  s.name,
  s.sort_order,
  count(h.stage_id)                                as came_in,
  count(h.exited_at)                               as went_out,
  count(h.stage_id) filter (where h.exited_at is null) as sitting
from stage s
left join (
  select stage_id, exited_at from opportunity_stage_history
  union all
  select stage_id, exited_at from quotation_stage_history
) h on h.stage_id = s.id
where s.active
group by s.entity, s.id, s.code, s.name, s.sort_order
order by s.entity, s.sort_order;
