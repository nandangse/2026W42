-- 0196 — the resolution date comes from the ERP's own clock, or not at all
-- (3 Oct 2026). The first pull gave every closed ticket its `modified` as a
-- resolved date when the ERP had none, and the analytics then said the
-- median ticket took 145 days — it did not; most were closed in bulk long
-- after the visit. Only 78 closed tickets carry a final_resolution_date on
-- the ERP and 1,641 a resolution time; the rest carry nothing, and now say
-- so. The pull writes it this way from here on; this does the same once
-- over what is already in.

update public.seva_issue
   set resolved_at = case
         when coalesce(erp->>'final_resolution_date', '') ~ '^\d{4}-\d{2}-\d{2}' then (erp->>'final_resolution_date')::date
         when coalesce(erp->>'resolution_date', '')       ~ '^\d{4}-\d{2}-\d{2}' then (erp->>'resolution_date')::date
         else null
       end
 where erp is not null;
