-- 0063_appraisal_approval.sql
--
-- THE APPRAISAL IS PROPOSED BY HR AND FINALISED BY RAGHU (Dr Raghu, 23 Aug
-- 2026): "HR may update but finalised by me - approval. same ... commercial".
--
-- The same standing rule the record edits and the role definitions already
-- follow: the number is in the row from the moment it is saved, but it is a
-- PROPOSAL until the owner has seen it. Approving alters no value -- it
-- changes the standing of one, from proposed to agreed. The queue is
-- Approvals -> RJ Approval - Commercial, because this is money.
--
-- ASCII only, additive, safe to re-run. Run AFTER 0062.

alter table public.hrms_appraisal
  add column if not exists pending_since timestamptz,
  add column if not exists pending_by    text,
  add column if not exists approved_at   timestamptz,
  add column if not exists approved_by   text;

comment on column public.hrms_appraisal.pending_since is
  'Set when HR saves a decision the owner has not yet approved. Null once approved.';
comment on column public.hrms_appraisal.approved_at is
  'When the owner finalised this number. Until then the decision is a proposal.';
