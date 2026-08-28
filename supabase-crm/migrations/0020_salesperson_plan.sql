-- 0020_salesperson_plan.sql
--
-- THE SALESPERSON'S PLAN (Dr Raghu, 28 Aug 2026): targets per person per
-- financial year -- the numbers the dashboard measures the week against.
-- Money targets are ANNUAL (booking, billing, collections, quotation value);
-- activity targets are PER WEEK (calls, visits, video calls, opportunities),
-- because that is how each is actually promised.
--
--   targets: { booking, billing, collections, quotation_value,   -- Rs/year
--              quotation_nos,                                    -- nos/year
--              calls_wk, visits_wk, video_calls_wk, opps_wk }    -- per week
--
-- ASCII only, additive, safe to re-run.

create table if not exists salesperson_plan (
  profile_id uuid not null,
  fy         text not null,
  targets    jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (profile_id, fy)
);

comment on table salesperson_plan is
  'Targets per salesperson per financial year. The dashboard reads these to '
  'show target-per-week and the required run rate to year end.';
