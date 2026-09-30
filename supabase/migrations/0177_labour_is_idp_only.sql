-- 0177_labour_is_idp_only.sql
--
-- THE FLOOR SEES HIS OWN PERFORMANCE, AND NOTHING ELSE.
--
-- Dr Raghu, 30 Sep 2026: "make IDP only which means that the guy can only
-- see his performance. NO DETAILS of planning to be given to labour
-- employees."
--
-- HOW THEY CAME TO HAVE IT. Nobody granted Planning to sixty-seven workmen.
-- Migration 0161 seeded planning_access from everyone who could already open
-- the board on the day Planning became a door -- which, before there was a
-- door, was everyone with a Genie login. The grant is an accident of the
-- order things were built in.
--
-- WHAT THEY KEEP: /idp, the personal login HR issued -- his attendance, his
-- payslip, his appraisal. That is his performance and it is his to see. What
-- goes is the delivery board: other men's jobs, customers, values, dates.
--
-- WHO IS "LABOUR" is the HRMS master's answer, not a guess from initials or
-- from a department: extra->>'Type' is 'Labour' or 'Labour - Contract'. At
-- the time of writing that is 79 people with a Genie e-mail, 67 of whom hold
-- Planning. Contractors and Staff are NOT touched -- he said labour.
--
-- Planning is the only door any of them holds; CRM, HRMS, Kuber, Seva, IMS,
-- Saamaan, Marketing, Vishwakarma and Goals were checked and carry none.
--
-- REVERSIBLE. It deletes grants, not people: a name put back through
-- Admin -> Users takes effect immediately. Re-running it revokes anyone who
-- has since been given Planning and is still on the master as Labour, which
-- is the intent rather than a side effect.
--
-- ASCII only, safe to re-run.

delete from planning_access
where lower(email) in (
  select lower(e.email)
  from hrms_employees e
  where e.email is not null
    and e.extra->>'Type' ilike 'Labour%'
);

-- What it did, for the record.
do $$
declare n int;
begin
  select count(*) into n
  from planning_access p
  join hrms_employees e on lower(e.email) = lower(p.email)
  where e.extra->>'Type' ilike 'Labour%';
  raise notice 'planning_access: % labour employee(s) still hold Planning (expected 0)', n;
end $$;
