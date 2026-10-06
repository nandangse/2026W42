-- 0204_kanban_dbm.sql
--
-- THE KANBAN, REBUILT ON DYNAMIC BUFFER MANAGEMENT (Dr Raghu, 6 Oct 2026:
-- “the DBM has a fourth colour, too, that is blue, which is generally
-- overstocked. Go with the best practises of the DBM … rebuild this from
-- scratch so that Rameez and Mukesh can use it properly to decide.
-- Purchase can then start working on Kanban so that they always maintain
-- an MOQ and a reorder-level stock … an intelligence layer, which will
-- auto-populate the reorder level and the MOQs”).
--
-- material_kanban keeps its rows and gains:
--   zones          black (nothing on hand), red, yellow, green, blue (over
--                  the target), and none (no demand, so no target)
--   rlt_days       replenishment lead time, PO to GRN, from the ERP
--   adu            average daily usage, from the ERP stock ledger
--   penetration    how far on-hand stock has eaten into the target, in %
--   red_days,      days in red or black, and days in green or blue, since
--   green_days     the target last moved — the DBM counters
--   last_change_at the safe period starts here
--   proposed_*     Genie’s proposal: target, MOQ, lead time, and why
--   moq_basis      typed or proposed
-- reorder_qty is the MOQ from here on.
--
-- material_kanban_run gains black, blue, no_demand and a kind (dbm, daily,
-- propose).
--
-- Additive, safe to re-run. No straight apostrophes in these comments: the
-- Supabase SQL editor misreads them.

alter table public.material_kanban add column if not exists rlt_days        numeric;
alter table public.material_kanban add column if not exists rlt_basis       text not null default '';
alter table public.material_kanban add column if not exists adu             numeric;
alter table public.material_kanban add column if not exists penetration     numeric;
alter table public.material_kanban add column if not exists red_days        integer not null default 0;
alter table public.material_kanban add column if not exists green_days      integer not null default 0;
alter table public.material_kanban add column if not exists zone_day        date;
alter table public.material_kanban add column if not exists last_change_at  timestamptz;
alter table public.material_kanban add column if not exists moq_basis       text not null default '';
alter table public.material_kanban add column if not exists proposed_target numeric;
alter table public.material_kanban add column if not exists proposed_moq    numeric;
alter table public.material_kanban add column if not exists proposed_rlt    numeric;
alter table public.material_kanban add column if not exists proposed_adu    numeric;
alter table public.material_kanban add column if not exists proposed_at     timestamptz;
alter table public.material_kanban add column if not exists proposal_note   text not null default '';
alter table public.material_kanban add column if not exists proposal_state  text not null default '';

alter table public.material_kanban drop constraint if exists material_kanban_basis_check;
alter table public.material_kanban add constraint material_kanban_basis_check
  check (basis in ('seed', 'erp', 'consumption', 'typed', 'proposed'));

alter table public.material_kanban_run add column if not exists black integer not null default 0;
alter table public.material_kanban_run add column if not exists blue  integer not null default 0;
alter table public.material_kanban_run add column if not exists no_demand integer not null default 0;
alter table public.material_kanban_run add column if not exists kind  text not null default 'dbm';

insert into public.material_setting (key, value, updated_by, updated_at)
values ('kanban_paranoia', '1.5', 'migration 0204', now()), ('kanban_review_days', '7', 'migration 0204', now())
on conflict (key) do nothing;
