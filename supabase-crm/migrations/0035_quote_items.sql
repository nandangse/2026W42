-- CRM 0035 — Quote items (30 Aug 2026)
-- The Lines tab becomes a real quote grid: Sr No with 1.1 indents, per-line
-- say in the discount, a Taxes master (IGST vs CGST+SGST by address), grand
-- total in words, and the MD's signature line. The database still computes
-- every rupee — the front end only displays.

-- the line learns indent, its item group, and whether the discount touches it
alter table quotation_line add column if not exists indent       int not null default 0;
alter table quotation_line add column if not exists item_group   text;
alter table quotation_line add column if not exists discountable boolean not null default true;

-- the Taxes master
create table if not exists tax_master (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  components  jsonb not null default '[]'::jsonb,   -- [{"name":"IGST","pct":18}]
  total_pct   numeric(5,2) not null,
  sort_order  int not null default 0,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
insert into tax_master (name, components, total_pct, sort_order, is_default) values
  ('IGST 18%',           '[{"name":"IGST","pct":18}]',                          18, 1, true),
  ('CGST 9% + SGST 9%',  '[{"name":"CGST","pct":9},{"name":"SGST","pct":9}]',   18, 2, false),
  ('No Tax',             '[]',                                                    0, 3, false)
on conflict (name) do nothing;

-- the quote carries its tax scheme, the signature line, and the decimals switch
alter table quotation add column if not exists tax_id        uuid references tax_master(id);
alter table quotation add column if not exists authorized_by text not null default 'Dr Raghunandan Jagdish, MD and CEO';
alter table quotation add column if not exists show_decimals boolean not null default false;

-- Situational Details (Dr Raghu, 30 Aug 2026): six bold headings, hand-written
-- or Genie-written — and Genie may improve it at most three times per quote
alter table quotation add column if not exists situational_details text;
alter table quotation add column if not exists situational_runs    int not null default 0;

-- ---- the totals law, rewritten -------------------------------------------
-- discount touches only DISCOUNTABLE lines; tax comes from the quote's tax
-- scheme (falling back to 18% when none is picked yet).
create or replace function recalc_quotation()
returns trigger language plpgsql as $$
declare q uuid; sub numeric(16,2); discable numeric(16,2); cost numeric(16,2);
        tax numeric(16,2); disc numeric(16,2); taxable numeric(16,2);
        rec record; taxpct numeric(5,2);
begin
  q := coalesce(new.quotation_id, old.quotation_id);

  select coalesce(sum(line_total),0),
         coalesce(sum(line_total) filter (where discountable), 0),
         coalesce(sum(quantity*unit_cost),0)
    into sub, discable, cost
    from quotation_line where quotation_id = q and is_optional = false;

  select * into rec from quotation where id = q;

  select coalesce((select total_pct from tax_master where id = rec.tax_id), 18)
    into taxpct;

  disc    := round(discable * rec.discount_pct / 100, 2);
  taxable := sub - disc + rec.freight + rec.insurance + rec.packing + rec.installation;
  tax     := round(taxable * taxpct / 100, 2);

  update quotation set
    subtotal        = sub,
    discount_amount = disc,
    taxable_value   = taxable,
    tax_amount      = tax,
    grand_total     = taxable + tax,
    total_cost      = cost,
    updated_at      = now()
  where id = q;

  return null;
end $$;

-- a changed discount % or tax scheme refreshes the totals WITHOUT waiting
-- for a line to move — BEFORE trigger, so no recursion
create or replace function quotation_terms_refresh()
returns trigger language plpgsql as $$
declare sub numeric(16,2); discable numeric(16,2); taxpct numeric(5,2);
begin
  select coalesce(sum(line_total),0),
         coalesce(sum(line_total) filter (where discountable), 0)
    into sub, discable
    from quotation_line where quotation_id = new.id and is_optional = false;

  select coalesce((select total_pct from tax_master where id = new.tax_id), 18)
    into taxpct;

  new.subtotal        := sub;
  new.discount_amount := round(discable * new.discount_pct / 100, 2);
  new.taxable_value   := sub - new.discount_amount + new.freight + new.insurance + new.packing + new.installation;
  new.tax_amount      := round(new.taxable_value * taxpct / 100, 2);
  new.grand_total     := new.taxable_value + new.tax_amount;
  return new;
end $$;

drop trigger if exists quotation_terms_recalc on quotation;
create trigger quotation_terms_recalc
before update of discount_pct, tax_id on quotation
for each row
when (new.discount_pct is distinct from old.discount_pct or new.tax_id is distinct from old.tax_id)
execute function quotation_terms_refresh();
