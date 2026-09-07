-- 0153_appraisal_to_master.sql — Genie 5.0.12.1 (7 Sep 2026)
--
-- Dr Raghu, 7 Sep 2026: "Now we will update all of these rates, which have
-- been the final rates going into the employee master, where the latest
-- salary will come from. In future also, whenever any salary changes are
-- made, they will be maintained as such. For each individual, make a sheet
-- saying that every change that has to be done has to be logged, made by
-- whom, and by what date and time."
--
-- So the finalised appraisal becomes the master, and NOTHING moves silently:
-- every field that changes is written to hrms_employee_edit_log with its old
-- value, its new value, who did it and when, and each person gains a
-- salary-history row for 2026-27. Run it once; running it twice changes
-- nothing further, because the second pass finds no differences to log.
--
-- Ankeet Trivedi (6829) is deliberately untouched: he has no IDP and no
-- appraisal, so he stays on his old rate ("even Ankit should be as per the
-- old rate, as he doesn't have an IDP").

begin;

-- What the appraisal says each person should be on, parts and all.
create temporary table _target on commit drop as
with a as (
  select employee_id,
         new_gross::numeric                                              as gross,
         coalesce((structure->'components'->>'basic_da')::numeric, 0)    as basic_da,
         coalesce((structure->'components'->>'hra')::numeric, 0)         as hra,
         coalesce((structure->'components'->>'fixed')::numeric, 0)       as fixed_allowance,
         coalesce((structure->'components'->>'conveyance')::numeric, 0)  as conveyance,
         coalesce((structure->'components'->>'medical')::numeric, 0)     as medical_allowance
  from public.hrms_appraisal
  where cycle = '2026-27' and approved_at is not null and new_gross is not null
)
select employee_id, gross,
       -- where no split was agreed, the whole gross is Basic & DA
       case when abs(basic_da + hra + fixed_allowance + conveyance + medical_allowance - gross) > 2 then gross else basic_da end as basic_da,
       case when abs(basic_da + hra + fixed_allowance + conveyance + medical_allowance - gross) > 2 then 0 else hra end          as hra,
       case when abs(basic_da + hra + fixed_allowance + conveyance + medical_allowance - gross) > 2 then 0 else fixed_allowance end as fixed_allowance,
       case when abs(basic_da + hra + fixed_allowance + conveyance + medical_allowance - gross) > 2 then 0 else conveyance end  as conveyance,
       case when abs(basic_da + hra + fixed_allowance + conveyance + medical_allowance - gross) > 2 then 0 else medical_allowance end as medical_allowance
from a;

-- one row per field per person, with the per-day worked out the way the rate
-- list has always worked it out: (gross − conveyance) over 26
create temporary table _want on commit drop as
select employee_id, 'basic_da'          as field, round(basic_da)::text          as value from _target
union all select employee_id, 'hra',                round(hra)::text                       from _target
union all select employee_id, 'fixed_allowance',    round(fixed_allowance)::text           from _target
union all select employee_id, 'conveyance',         round(conveyance)::text                from _target
union all select employee_id, 'medical_allowance',  round(medical_allowance)::text         from _target
union all select employee_id, 'gross',              round(gross)::text                     from _target
union all select employee_id, 'per_day_rate',       round((gross - conveyance) / 26)::text from _target;

-- THE LOG FIRST, so nothing changes without a record of what it was.
insert into public.hrms_employee_edit_log (employee_id, field, old_value, new_value, edited_by, edited_at)
select w.employee_id, w.field, e.value, w.value,
       'RJ · raghu@nandan.co.in — appraisal 2026-27 pushed to the employee master',
       now()
from _want w
left join public.hrms_employee_edits e
       on e.employee_id = w.employee_id and e.field = w.field
where e.value is distinct from w.value;

-- then the master itself
insert into public.hrms_employee_edits (employee_id, field, value, edited_by, edited_at, approved_at, approved_by)
select w.employee_id, w.field, w.value,
       'RJ · raghu@nandan.co.in', now(), now(), 'RJ · raghu@nandan.co.in'
from _want w
on conflict (employee_id, field) do update
  set value = excluded.value, edited_by = excluded.edited_by, edited_at = excluded.edited_at,
      approved_at = excluded.approved_at, approved_by = excluded.approved_by;

-- One salary-history line per person per year, so the climb is kept.
--
-- hrms_salary_history is UNIQUE on (employee_id, fy) — one row per person per
-- year, by design. A plain insert therefore fails the moment somebody already
-- has a 2026-27 row at a different figure, which is exactly what happened on
-- the first run: 6143 already had one. So it UPDATES that row to the agreed
-- number rather than trying to add a second.
insert into public.hrms_salary_history (employee_id, fy, gross, "by", at)
select t.employee_id, '2026-27', round(t.gross), 'RJ · raghu@nandan.co.in', now()
from _target t
on conflict (employee_id, fy) do update
  set gross = excluded.gross, "by" = excluded."by", at = excluded.at;

commit;

create table if not exists public.genie_migration (name text primary key, applied_at timestamptz not null default now());
insert into public.genie_migration (name) values ('0153_appraisal_to_master') on conflict (name) do nothing;
