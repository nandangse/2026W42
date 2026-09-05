-- 0139_payroll_working_days.sql
--
-- CONVEYANCE ON THE COMPANY'S WORKING DAYS (Dr Raghu, 5 Sep 2026): "conveyance
-- = rate x present / number of working days. The number of working days can
-- change month on month. It does not involve Saturdays ... the Saturdays that
-- are not working due to the third Saturday. If he has worked extra, he will
-- get paid conveyance also as extra for that. That is the reason why it is
-- taken by the number of working days in the month for the company, not for
-- the individual."
--
-- The run carries the month's working days. Null means the default: the
-- calendar days less the Sundays and the third Saturday. HR can set it on the
-- run when a statutory holiday takes a day out. ASCII only, additive.

alter table public.hrms_salary_sheet add column if not exists working_days integer;
