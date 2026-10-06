-- 0201_material_inventory_rfq.sql — Saamaan’s Inventory, RFQs and the Material Playbook, one file.
--
-- SAAMAAN → INVENTORY (Dr Raghu, 6 Oct 2026): "I need to create a module
-- called Inventory, with the following sub-modules: Items, Warehouses, Stock
-- Reconciliation. In Stock Reconciliation, include multiple tabs: one for By
-- Item Group and one for Random PI ... If there is a variance, calculate and
-- show it, and write a remark ... put a suspense entry where the suspense
-- entry will make it match ... in the movement, we need to find a method
-- where we can start synchronising the real stock and start releasing the
-- balance ... put a Genie suggestion in the Inventory module ... for
-- Rameez’s account, make a scenario where he can consult Genie."
-- Internal to Saamaan; every table wears material_.
--
-- THE ERP IS NOT WRITTEN. The suspense is Genie’s own ledger beside the
-- ERP’s stock: what the shelf says minus what the ERP says, item by
-- warehouse, open until it is explained (released). Posting it into the
-- ERP is a separate ask.
--
-- Additive, safe to re-run. Apostrophes in these comments are typographic: the Supabase SQL editor misreads a straight one in a comment.

-- ===================================================== INVENTORY
-- a count sheet: one person, one location, a set of items
create table if not exists public.material_count (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('group', 'random')),
  title          text not null default '',
  warehouse      text not null,
  item_group     text,
  assigned_email text not null,
  assigned_name  text not null default '',
  status         text not null default 'open' check (status in ('open', 'submitted', 'cancelled')),
  due_on         date,
  created_by     text,
  created_at     timestamptz not null default now(),
  submitted_at   timestamptz,
  submitted_by   text,
  note           text not null default ''
);
create index if not exists material_count_who on public.material_count (assigned_email, status);
create index if not exists material_count_when on public.material_count (created_at desc);

create table if not exists public.material_count_line (
  id            uuid primary key default gen_random_uuid(),
  count_id      uuid not null references public.material_count(id) on delete cascade,
  item_code     text not null,
  item_name     text not null default '',
  item_group    text not null default '',
  uom           text not null default '',
  warehouse     text not null,
  erp_qty       numeric,          -- the ERP’s Bin when the sheet was made
  erp_rate      numeric,          -- valuation rate, for the variance’s value
  erp_qty_at_count numeric,       -- the ERP’s Bin again when the sheet was submitted
  physical_qty  numeric,          -- what was on the shelf
  remark        text not null default '',
  counted_by    text,
  counted_at    timestamptz,
  unique (count_id, item_code)
);
create index if not exists material_count_line_count on public.material_count_line (count_id);
create index if not exists material_count_line_item on public.material_count_line (item_code, warehouse);

-- the suspense: physical minus ERP, open until explained
create table if not exists public.material_suspense (
  id            uuid primary key default gen_random_uuid(),
  item_code     text not null,
  item_name     text not null default '',
  uom           text not null default '',
  warehouse     text not null,
  qty           numeric not null,     -- physical - ERP at the count; + means more on the shelf than the ERP knows
  rate          numeric,
  released_qty  numeric not null default 0,
  status        text not null default 'open' check (status in ('open', 'released')),
  counted_at    timestamptz not null, -- the moment the shelf was counted; movements are read from here
  count_line_id uuid references public.material_count_line(id) on delete set null,
  remark        text not null default '',
  opened_by     text,
  opened_at     timestamptz not null default now(),
  synced_at     timestamptz
);
create index if not exists material_suspense_open on public.material_suspense (status, item_code);

create table if not exists public.material_suspense_release (
  id           uuid primary key default gen_random_uuid(),
  suspense_id  uuid not null references public.material_suspense(id) on delete cascade,
  qty          numeric not null,      -- same sign as the suspense it reduces
  reason       text not null,         -- WIP · Consumption · Unrecorded receipt · Scrap · UOM · ERP corrected · Other
  voucher_type text,
  voucher_no   text,
  note         text not null default '',
  by_email     text,
  at           timestamptz not null default now(),
  unique (suspense_id, voucher_no)
);
create index if not exists material_suspense_release_s on public.material_suspense_release (suspense_id);

-- suggestions, Genie’s and people’s, worked to done
create table if not exists public.material_inv_suggestion (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null default '',
  source      text not null default 'person' check (source in ('genie', 'person')),
  priority    text not null default 'normal' check (priority in ('high', 'normal', 'low')),
  status      text not null default 'open' check (status in ('open', 'doing', 'done', 'dismissed')),
  owner_email text,
  note        text not null default '',
  by_email    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists material_inv_suggestion_status on public.material_inv_suggestion (status, created_at desc);

-- Ask Genie: the conversation kept whole, so each turn replays it exactly
create table if not exists public.material_inv_chat (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  title       text not null default '',
  messages    jsonb not null default '[]'::jsonb,
  turns       integer not null default 0,
  in_tokens   bigint not null default 0,
  out_tokens  bigint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists material_inv_chat_who on public.material_inv_chat (email, updated_at desc);


-- =========================================================== RFQs
-- (Dr Raghu, 6 Oct 2026: "add another module in Saamaan called RFQs. We
-- will create an RFQ, add an item ID, give a description, and that will
-- then be sent to the suppliers in their portal ... The basic default
-- description should come from the item, and then there can be an add-on
-- remark ... all the description changes should be done in the master so
-- that it continues on forward.")
--
-- The suppliers are the Portal’s supplier organisations (portal_org, kind
-- ’supplier’, migration 0198) — they log in at /portal/<slug> and quote
-- there. The description on a line is a SNAPSHOT of the master when the
-- RFQ went out, so what a supplier quoted against never changes under them.

create sequence if not exists public.material_rfq_no;

create table if not exists public.material_rfq (
  id          uuid primary key default gen_random_uuid(),
  rfq_no      text not null unique default ('RFQ-' || lpad(nextval('public.material_rfq_no')::text, 4, '0')),
  title       text not null default '',
  status      text not null default 'draft' check (status in ('draft', 'sent', 'closed', 'cancelled')),
  due_on      date,
  note        text not null default '',     -- to the suppliers: delivery place, terms
  created_by  text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  sent_by     text,
  closed_at   timestamptz
);
create index if not exists material_rfq_status on public.material_rfq (status, created_at desc);

create table if not exists public.material_rfq_item (
  id           uuid primary key default gen_random_uuid(),
  rfq_id       uuid not null references public.material_rfq(id) on delete cascade,
  idx          integer not null default 0,
  item_code    text not null,
  item_name    text not null default '',
  description  text not null default '',   -- from the master; snapshotted when the RFQ is sent
  addon        text not null default '',   -- the add-on remark for this RFQ only
  qty          numeric not null,
  uom          text not null default '',
  specs        text not null default '',   -- any other specification
  required_by  date
);
create index if not exists material_rfq_item_rfq on public.material_rfq_item (rfq_id, idx);

create table if not exists public.material_rfq_supplier (
  id          uuid primary key default gen_random_uuid(),
  rfq_id      uuid not null references public.material_rfq(id) on delete cascade,
  org_slug    text not null,               -- portal_org.slug
  org_name    text not null default '',
  status      text not null default 'invited' check (status in ('invited', 'viewed', 'quoted', 'declined')),
  viewed_at   timestamptz,
  quoted_at   timestamptz,
  remark      text not null default '',    -- the supplier’s word on the whole RFQ
  unique (rfq_id, org_slug)
);

create table if not exists public.material_rfq_quote (
  id            uuid primary key default gen_random_uuid(),
  rfq_id        uuid not null references public.material_rfq(id) on delete cascade,
  rfq_item_id   uuid not null references public.material_rfq_item(id) on delete cascade,
  org_slug      text not null,
  rate          numeric,                   -- per UOM, before tax
  qty_offered   numeric,
  lead_days     integer,
  remark        text not null default '',  -- their specification, make, deviations
  quoted_by     text,
  at            timestamptz not null default now(),
  unique (rfq_item_id, org_slug)
);
create index if not exists material_rfq_quote_rfq on public.material_rfq_quote (rfq_id);

alter table public.material_count enable row level security;
revoke all on public.material_count from anon, authenticated;
alter table public.material_count_line enable row level security;
revoke all on public.material_count_line from anon, authenticated;
alter table public.material_suspense enable row level security;
revoke all on public.material_suspense from anon, authenticated;
alter table public.material_suspense_release enable row level security;
revoke all on public.material_suspense_release from anon, authenticated;
alter table public.material_inv_suggestion enable row level security;
revoke all on public.material_inv_suggestion from anon, authenticated;
alter table public.material_inv_chat enable row level security;
revoke all on public.material_inv_chat from anon, authenticated;
alter table public.material_rfq enable row level security;
revoke all on public.material_rfq from anon, authenticated;
alter table public.material_rfq_item enable row level security;
revoke all on public.material_rfq_item from anon, authenticated;
alter table public.material_rfq_supplier enable row level security;
revoke all on public.material_rfq_supplier from anon, authenticated;
alter table public.material_rfq_quote enable row level security;
revoke all on public.material_rfq_quote from anon, authenticated;

-- ============================================= THE MATERIAL PLAYBOOK
-- (Dr Raghu, 6 Oct 2026: “make a module in Saamaan called Material
-- Playbook ... always the latest version ... Rameez should be able to edit
-- this as well as add on any document ... understood by a guy within 3
-- days of joining”.) The sixth book on the playbook shelf (migration 0086):
-- the same Add Intelligence and compile, plus a hand edit for Rameez and
-- Mukesh. Seeded with a first edition drawn from how Saamaan works today.
insert into public.playbook (kind, title, folder_id, version, content, compiled_at, by)
values ('material', 'Nandan Material Playbook', '', '1.0.0', '> First edition, 6 Oct 2026 — written from how Saamaan works today. Rameez and Mukesh own this book: correct it, extend it, and add documents through Add Intelligence. Where a rule is not yet written down, the line says so.

## 1. How material is bought

**What:** material is bought against a need the system can show — a job on the board, an MRP run, or a reorder signal. **Who:** purchase — Mukesh, Pradip, Akshay, Shailaja. **Where in Saamaan:** MRP, Kanban · reorder, RFQs, Purchase orders.

- **Every purchase starts from the Item master.** The item must exist, with a description complete enough that a supplier can quote without ringing back. Not “ISMC 75” — “ISMC 75, main, 6 m long, with TC”. Fix the description in the master, not in the RFQ: the master carries it to every RFQ, PO and slip after.
- **RFQs go to suppliers in their portal.** Each line carries the master’s description, the quantity and unit, and any add-on remark for that RFQ only. Suppliers quote line by line; the lowest rate shows first.
- **Job material comes from the MRP run.** The run lists what live jobs need against what is in stock and on order; lines go to the store (kitting) or to purchase (requisition).
- **Class C consumables reorder themselves (Kanban).** The buffer is the reorder level. Red for two runs in a row raises the buffer by a third; green for three runs with nothing on order lowers it by a third, never below half a month. A buffer someone typed by hand is never moved. The whole Kanban is capped at ₹1 Cr.
- *Approved vendors, quotes needed per value band, and who signs a PO: to be written.*

## 2. How material is stored

**What:** material sits in a warehouse, and the warehouse decides what it counts as. **Who:** the store — Neeraj Yadav, Ulhas, Rameez. **Where:** Masters (warehouse types), Inventory → Warehouses, Issue slips.

- **Every warehouse has a type in Masters:** Stock, WIP, Vendor, or Finished goods. Only **Stock** warehouses count as closing stock. A warehouse nobody has typed is shown as untyped until someone types it.
- **Material leaves the store on an issue slip.** A slip not done in a day goes to the project manager, after two days to the COO, after three to Dr Raghu.
- *Bin locations, labelling, FIFO, shelf life and how a GRN is inspected and put away: to be written.*

## 3. How material is valued

**What:** stock is worth what the ERP’s valuation says, item by warehouse. **Who:** the ERP keeps it; purchase sets buying prices. **Where:** Inventory → Dashboard, Items.

- **The ERP owns the numbers.** Saamaan reads stock and value live from the ERP and never types them.
- **RM stock** is the value in Stock warehouses; **WIP** is the value in WIP warehouses; **total inventory** is every warehouse.
- **Class A, B and C** rank items by what they tie up. Class A gets counted most often and watched hardest.
- **Count and value are different questions.** A shelf can be right in number and wrong in value, or the other way round; both are checked.
- *How a buying price is set, and when the valuation rate is questioned: to be written.*

## 4. How material is consumed and evaluated

**What:** material is consumed into jobs, and the books are checked against the shelf. **Who:** the store counts; Mukesh and Rameez reconcile. **Where:** Kitting register, WIP, Inventory → Stock reconciliation, Suspense.

- **A job consumes material through kitting.** Kitting % is how much of the job’s material has been drawn.
- **The shelf is counted against the ERP.** Random PI gives one person ten or twenty items in one location; By item group counts a whole group. The counter sees the ERP’s figure, counts, and writes why it differs.
- **Every variance opens a suspense entry** — Genie’s own record that the shelf differs from the books. It stays open until it is explained: Sync with ERP releases what a back-dated entry or stock reconciliation has since corrected; anything else is released by hand with the reason (WIP, consumption, unrecorded receipt, scrap, UOM).
- *How often each class is counted, and who approves writing a variance off in the ERP: to be written.*

## 5. The real value material carries in Nandan

- **Material is money on the shelf.** Every rupee in stock is a rupee not in the bank. Saamaan shows how much sits in Stock, in WIP, and in warehouses nobody has typed.
- **On a job, material is most of the money.** What a job is holding in steel and parts is (1 − throughput %) × kitting % × job value. That is what finishing the job releases.
- **A wrong description costs twice:** once when the wrong thing arrives, and again when the job waits for the right one.
- *Non-moving stock and what to do with it: next, on the Inventory dashboard.*

## Source library

- How Saamaan works today — MRP, Kanban, issue slips, Masters, Inventory and RFQs (Genie changelog, 3–6 Oct 2026).
', now(), 'genie@genie')
on conflict (kind) do nothing;
