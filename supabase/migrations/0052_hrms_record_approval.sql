-- 0052_hrms_record_approval.sql
--
-- EVERY CHANGE TO A PERSONNEL RECORD WAITS FOR DR RAGHU (23 Aug 2026).
--
-- HR writes; the owner agrees. Vinay may change anything on a record, and
-- until it is approved it is a proposed change rather than the record. This
-- is the same rule the role register already follows, applied to people.
--
-- MARKED ON THE EDIT, NOT ON THE PERSON. Two columns on hrms_employee_edits
-- rather than a flag on hrms_employees, because approval is per FIELD: HR may
-- change three things on one record, the owner may want to see all three
-- listed, and a single flag on the person could not say which of them had
-- been read. It also means the approvals screen can say "Designation, Mobile
-- and 2 more" without a second table to join.
--
-- THE QUEUE STARTS EMPTY, and that is deliberate. Everything in this table
-- today was put there by setup rather than by a person editing a record --
-- 380 role assignments, 760 Drive folder names and links, the master import.
-- Presenting nineteen hundred of those as "awaiting approval" on the first
-- morning would train everyone to press Approve without reading, which is
-- worse than having no approval at all. They are stamped as the baseline.
--
-- ASCII only, additive, safe to re-run.

alter table public.hrms_employee_edits add column if not exists approved_at timestamptz;
alter table public.hrms_employee_edits add column if not exists approved_by text;

comment on column public.hrms_employee_edits.approved_at is
  'Null means the change is waiting for the owner. Set when approved. Drives '
  'Approvals -> RJ Approval - Records.';

create index if not exists hrms_employee_edits_pending_idx
  on public.hrms_employee_edits (approved_at) where approved_at is null;

-- The baseline: everything already here predates the rule.
update public.hrms_employee_edits
   set approved_at = now(),
       approved_by = 'migration 0052 (the state of the record when approval began)'
 where approved_at is null;
