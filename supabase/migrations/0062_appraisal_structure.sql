-- 0062_appraisal_structure.sql
--
-- THE EDITED STRUCTURE (Dr Raghu, 23 Aug 2026): the new salary need not be
-- a pure proportional scaling -- the five components can be hand-tuned, and
-- the company's investments (LIC, training, leader development at 50,000 a
-- year for leaders and 75,000 for StratCom, leader tools at 10,000 a month)
-- are showcased alongside. What was tuned has to be KEPT, or the printed
-- structure and the decided one drift apart.
--
-- One jsonb column on the decision row:
--   { "components": { "basic_da": n, "hra": n, "fixed": n, "conveyance": n, "medical": n },
--     "extras":     { "lic_yr": n, "training_yr": n, "leader_dev_yr": n, "leader_tools_mo": n } }
--
-- ASCII only, additive, safe to re-run. Run AFTER 0061.

alter table public.hrms_appraisal
  add column if not exists structure jsonb;

comment on column public.hrms_appraisal.structure is
  'The hand-tuned component split and the company investment lines behind the decided gross.';
