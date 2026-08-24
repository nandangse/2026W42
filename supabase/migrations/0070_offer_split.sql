-- 0070_offer_split.sql
--
-- THE EDITABLE SALARY SPLIT ON AN OFFER.
--
-- These two columns were appended to 0067 after that file had already been
-- run, so the ALTER never executed -- the table exists without them, and the
-- offer's salary page cannot save its split. They get their own migration so
-- there is no question of which version of 0067 anybody ran.
--
--   components : { basic_da, hra, fixed_allowance, conveyance, medical_allowance }
--   basic_pct  : the percentage typed, kept so the letter reprints identically
--
-- ASCII only, additive, safe to re-run.

alter table public.hrms_offer
  add column if not exists components jsonb,
  add column if not exists basic_pct  numeric;

comment on column public.hrms_offer.components is
  'The five pay components behind the agreed gross, as tuned for this offer.';
