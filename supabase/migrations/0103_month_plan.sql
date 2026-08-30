-- 0103: THE BELIEVABLE PLAN (Dr Raghu, 30 Aug 2026): each planner's own
-- read of every job in the month/quarter window — a comment, a belief from
-- 0 to 100, and "my best estimate" of the delivery date (born as the TDD,
-- changed freely). Signing freezes a plan: the totals, the realistic
-- (belief-weighted, estimate-dated) totals, and the mail that went out.
--
-- Line comments only. Safe to re-run.

create table if not exists public.plan_belief (
  id            uuid primary key default gen_random_uuid(),
  job_id        text not null,
  by_email      text not null,
  comment       text,
  belief_pct    int not null default 100,
  best_estimate date,
  updated_at    timestamptz not null default now(),
  unique (job_id, by_email)
);
create index if not exists plan_belief_by on public.plan_belief (by_email);

create table if not exists public.plan_signoff (
  id                   uuid primary key default gen_random_uuid(),
  by_email             text not null,
  period_kind          text not null,
  period_key           text not null,
  jobs                 int not null default 0,
  value                numeric not null default 0,
  throughput           numeric not null default 0,
  realistic_jobs       int,
  realistic_value      numeric,
  realistic_throughput numeric,
  snapshot             jsonb,
  emailed              text,
  signed_at            timestamptz not null default now()
);
create index if not exists plan_signoff_by on public.plan_signoff (by_email, period_kind, period_key);
