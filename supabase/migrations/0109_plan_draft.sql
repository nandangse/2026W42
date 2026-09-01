-- 0109_plan_draft.sql
--
-- SAVE AS DRAFT (Dr Raghu, 1 Sep 2026):
--
--   "In this, also keep a button for 'Save as draft', and then the final one
--    will only be once they are all ready for it."
--
-- The beliefs themselves have always saved as they are typed — plan_belief
-- upserts on every keystroke that lands, so nobody's work was ever at risk.
-- What was missing is the DIFFERENCE BETWEEN WORKING AND FINISHED: a planner
-- part-way through their fifty jobs looked exactly like one who had thought
-- about none of them, and the only way to say "I am done" was to sign.
--
-- So a signoff row now knows which it is. A draft is a person saying "this is
-- my read so far"; the signature is them saying "this is my Plan", and only
-- the signature mails. That lets the room see who is ready before anybody
-- freezes anything — which is the whole point of the ask.
--
-- One column, defaulted false so every signature already on record stays a
-- signature. Additive and safe to re-run.

alter table public.plan_signoff
  add column if not exists is_draft boolean not null default false;

-- Reading "who is ready for this period" is the query the desk runs on every
-- load, so it gets an index rather than a sequential scan of the ledger.
create index if not exists plan_signoff_period_idx
  on public.plan_signoff (period_kind, period_key, is_draft, signed_at desc);

comment on column public.plan_signoff.is_draft is
  'true = "my read so far", saved and visible to the room but not final and '
  'never mailed. false = the signature: "this is my Plan".';
