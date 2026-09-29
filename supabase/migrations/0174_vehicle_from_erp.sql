-- 0174_vehicle_from_erp.sql
--
-- THE VEHICLE, AS THE ERP HOLDS IT.
--
-- Dr Raghu, 29 Sep 2026: "its in ERP. Please let that sync." The ERP's
-- Project carries Vehicle Model, Engine No and Chassis No; 0173 had added
-- Genie-only columns on the assumption it did not.
--
-- SO THE COLUMNS FROM 0173 STAY, AND CHANGE MEANING. They are no longer the
-- record -- the ERP is -- they are where the sync PUTS it, and where a
-- planner can write it when the ERP has not been filled in yet. The rule
-- Dr Raghu set on 16 Sep 2026 applies: the later one wins, except that a
-- BLANK from the ERP never overwrites something a person has typed. An empty
-- field is not new information.
--
-- vehicle_model joins them because "URAL" is the thing anybody actually says
-- out loud, and a chassis number on its own identifies nothing to a person.
--
-- ASCII only, additive, safe to re-run.

alter table jobs add column if not exists vehicle_model text;

comment on column jobs.chassis_no is
  'Chassis number. Synced from the ERP Project; editable in Genie when the ERP is blank.';
comment on column jobs.engine_no is
  'Engine number. Same rule.';
comment on column jobs.vehicle_model is
  'The vehicle the equipment is built on -- URAL, Tata, Ashok Leyland. From the ERP Project.';
