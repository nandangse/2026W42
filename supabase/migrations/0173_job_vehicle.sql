-- 0173_job_vehicle.sql
--
-- CHASSIS AND ENGINE NUMBERS, for the jobs that are built on a vehicle.
--
-- Dr Raghu, 29 Sep 2026: "in this if its a vehicle mounted equipment, then
-- also put in the engine no and chassis no."
--
-- GENIE'S OWN FIELDS. The ERP has no column for either -- it carries a
-- "Chassis inspection checklist" document and nothing that holds the numbers
-- themselves. So these are kept here and are NOT pushed back to the ERP,
-- because writing them into a field somebody else is already using for
-- something else is how two systems start disagreeing.
--
-- WHY A FLAG AND NOT A GUESS. Whether a job is vehicle-mounted cannot be read
-- reliably off the product family: "MHE - Truck Mounted Crane" plainly is one
-- and "MHE - Single Scissor Lift" plainly is not, but "AGSE - Hi Lift" is a
-- catering truck and reads like neither. A guess would put an empty chassis
-- box on a hand pallet truck and leave it off a bowser. The flag defaults to
-- unset and the board shows the row when it is ticked OR when either number
-- has been filled in -- so recording a chassis number is itself the answer.
--
-- ASCII only, additive, safe to re-run.

alter table jobs add column if not exists chassis_no text;
alter table jobs add column if not exists engine_no  text;
alter table jobs add column if not exists is_vehicle boolean;

comment on column jobs.chassis_no is
  'Chassis number of the vehicle this equipment is built on. Genie only; not sent to the ERP.';
comment on column jobs.engine_no is
  'Engine number of the same. Genie only.';
comment on column jobs.is_vehicle is
  'Ticked when the job is built on a vehicle. NULL means nobody has said; '
  'the display board also shows the row when a chassis or engine number exists.';
