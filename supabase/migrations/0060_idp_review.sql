-- 0060_idp_review.sql
--
-- THE MANAGER'S SIDE OF THE IDP (Dr Raghu, 23 Aug 2026).
--
-- A manager sees their own IDP and everyone cascaded below them — the same
-- reports_to walk Team Goals uses — and reviews each submitted one. The order
-- of the review is the design:
--
--   1. They read the person's answers and recordings.
--      They are NEVER shown the person's self-ratings or the salary the
--      person asked for — a manager who has seen the self-score anchors on
--      it, and the whole value of two independent ratings is that they are
--      independent.
--   2. They give their own ratings on the same eleven dimensions.
--   3. ONLY THEN the person's current gross is revealed, and the manager
--      writes what it should be now — prefilled with the current figure, so
--      "no change" is a decision rather than a blank.
--   4. A voice note on how this person becomes more useful to the company.
--   5. On submit, a CHRO-style analysis is written and kept.
--
-- THE GATE: nobody reviews others before finishing their own. Enforced in the
-- API; the owner is exempt and sees everyone at any time.
--
-- ASCII only, additive, safe to re-run.

create table if not exists public.hrms_idp_review (
  id             uuid primary key default gen_random_uuid(),
  idp_id         uuid not null references public.hrms_idp (id) on delete cascade,
  reviewer_email text not null,
  reviewer_name  text,
  /** The manager's ratings on the same eleven dimensions, 1-10. */
  ratings        jsonb not null default '{}'::jsonb,
  /** What the record said the person's gross was when it was revealed. */
  gross_current  numeric,
  /** What the manager says it should be now. */
  gross_proposed numeric,
  /** The voice note: [ {path, seconds, at, transcript} ], bucket paths only. */
  audio          jsonb not null default '[]'::jsonb,
  /** Anything typed after the voice note. */
  notes          text,
  /** The CHRO-style growth analysis, written on submit and kept. */
  analysis       text,
  started_at     timestamptz not null default now(),
  submitted_at   timestamptz,
  updated_at     timestamptz not null default now(),
  unique (idp_id, reviewer_email)
);

comment on table public.hrms_idp_review is
  'A manager''s review of one submitted IDP. One row per reviewer per IDP. '
  'The reviewer never sees the person''s self-ratings or asked-for salary; '
  'the analysis is written by the model on submit and kept.';

create index if not exists hrms_idp_review_idp_idx on public.hrms_idp_review (idp_id);
create index if not exists hrms_idp_review_who_idx on public.hrms_idp_review (lower(reviewer_email));

alter table public.hrms_idp_review enable row level security;
revoke all on public.hrms_idp_review from anon, authenticated;
