-- 0056_hrms_competency.sql
--
-- COMPETENCIES (Dr Raghu, 23 Aug 2026).
--
-- A role says what must be DELIVERED. A competency says what somebody must be
-- ABLE TO DO to deliver it. They are different questions and both are needed:
-- a Production Supervisor and a Quality Engineer can share the deliverable
-- "the job leaves correct" and need entirely different abilities to get there.
--
-- TWO TABLES, and the split is the point:
--
--   hrms_competency      the master. One definition of each competency, for
--                        the whole company. "Drawing Reading" means the same
--                        thing in Design as it does on the shop floor, or the
--                        word is worth nothing.
--
--   hrms_role_competency which competencies a role needs, and TO WHAT LEVEL,
--                        out of 5. A role may need many. A Sr Design Manager
--                        and a Draughtsman both need Drawing Reading — at 5
--                        and at 3 — and that difference IS the job.
--
-- THE LEVEL IS ON THE JOIN, NOT ON THE COMPETENCY, because the same ability
-- is required to a different depth by different roles. Putting the level on
-- the master would have made "Drawing Reading" a single fixed height that
-- either everybody clears or nobody does.
--
-- ASCII only, additive, safe to re-run.

create table if not exists public.hrms_competency (
  name       text primary key,
  definition text not null,
  /** Which family it belongs to, for reading a long list. */
  category   text,
  sort_order integer not null default 0,
  created_by text,
  created_at timestamptz not null default now()
);

comment on table public.hrms_competency is
  'The competency master: one definition of each ability, for the whole '
  'company. Roles point at these and set the level they need.';

create table if not exists public.hrms_role_competency (
  role_id    uuid not null references public.hrms_role (id) on delete cascade,
  competency text not null references public.hrms_competency (name) on update cascade on delete cascade,
  /** What this ROLE needs, 1 to 5. */
  level      integer not null default 3,
  note       text,
  added_by   text,
  added_at   timestamptz not null default now(),
  primary key (role_id, competency)
);

alter table public.hrms_role_competency drop constraint if exists hrms_role_competency_level_check;
alter table public.hrms_role_competency add constraint hrms_role_competency_level_check
  check (level between 1 and 5);

comment on table public.hrms_role_competency is
  'Which competencies a role needs and to what level out of 5. The level '
  'lives here rather than on the master because the same ability is needed to '
  'a different depth by different roles.';

create index if not exists hrms_role_competency_comp_idx on public.hrms_role_competency (competency);

alter table public.hrms_competency      enable row level security;
alter table public.hrms_role_competency enable row level security;
revoke all on public.hrms_competency      from anon, authenticated;
revoke all on public.hrms_role_competency from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The master, seeded. Plain definitions -- a competency nobody can read is a
-- competency nobody can rate.
-- ---------------------------------------------------------------------------
insert into public.hrms_competency (name, category, sort_order, definition, created_by) values
 ('Drawing Reading','Technical',10,'Reading an engineering drawing correctly -- views, sizes, tolerances, welding symbols, and the revision number.','migration 0056'),
 ('Measurement and Inspection','Technical',20,'Using tape, vernier, micrometer and gauges correctly, and knowing what reading is acceptable.','migration 0056'),
 ('Fabrication and Fitting','Technical',30,'Marking, cutting, drilling, grinding and fitting parts to the drawing.','migration 0056'),
 ('Welding','Technical',40,'Welding to the process and quality the job needs, and knowing which weld suits which joint.','migration 0056'),
 ('Machining','Technical',50,'Setting and running machines to produce a part to size.','migration 0056'),
 ('Hydraulics and Pneumatics','Technical',60,'Understanding hydraulic and pneumatic circuits, fitting them, and finding a leak or a fault.','migration 0056'),
 ('Electrical and Wiring','Technical',70,'Reading a wiring drawing, laying and terminating cable, testing a circuit and checking earthing.','migration 0056'),
 ('Painting and Surface Finish','Technical',80,'Preparing a surface, mixing and applying paint, and checking the finish and thickness.','migration 0056'),
 ('CAD and Design Software','Technical',90,'Producing and changing drawings and models in the design software the company uses.','migration 0056'),
 ('Design Calculation','Technical',100,'Working out loads, strengths and sizes, and being able to show the working.','migration 0056'),
 ('BOM and Costing','Technical',110,'Building a bill of material and working out what a job costs.','migration 0056'),
 ('ERP Use','Technical',120,'Doing your own work in the ERP correctly -- entering, updating and finding what you need.','migration 0056'),
 ('Spreadsheet and Reporting','Technical',130,'Using a spreadsheet to work something out and to present it so others can read it.','migration 0056'),

 ('Quality Standards','Quality & Safety',200,'Knowing the standard a job must meet and refusing to pass work that does not meet it.','migration 0056'),
 ('Inspection and Testing','Quality & Safety',210,'Carrying out the checks a job requires and recording the result honestly.','migration 0056'),
 ('Root Cause Analysis','Quality & Safety',220,'Finding why something went wrong rather than who, and fixing the cause so it does not return.','migration 0056'),
 ('Safety and PPE','Quality & Safety',230,'Working safely, wearing the protection required, and stopping unsafe work when you see it.','migration 0056'),
 ('5S and Housekeeping','Quality & Safety',240,'Keeping the work area ordered so anybody can find anything and nothing is damaged or lost.','migration 0056'),
 ('Documentation','Quality & Safety',250,'Filling in cards, registers and records correctly and at the time -- not afterwards from memory.','migration 0056'),

 ('Planning and Scheduling','Delivery',300,'Working out what must happen when, and making a plan that holds.','migration 0056'),
 ('Priority Setting','Delivery',310,'Deciding what matters most today when everything is urgent.','migration 0056'),
 ('Follow-through','Delivery',320,'Finishing what you started without being chased.','migration 0056'),
 ('Problem Solving','Delivery',330,'Working out what to do when the plan does not survive contact with the day.','migration 0056'),
 ('Vendor and Purchase Handling','Delivery',340,'Getting the right material at the right price on the right day, and holding a vendor to it.','migration 0056'),
 ('Inventory Control','Delivery',350,'Knowing what is in stock, what is short, and what is about to be.','migration 0056'),

 ('Customer Handling','Commercial',400,'Dealing with a customer so that the truth is told and the relationship survives it.','migration 0056'),
 ('Negotiation','Commercial',410,'Reaching an agreement both sides will keep.','migration 0056'),
 ('Commercial Awareness','Commercial',420,'Understanding what a decision costs the company and what it earns.','migration 0056'),
 ('Statutory and Compliance','Commercial',430,'Knowing the rules that apply to your work and keeping the company on the right side of them.','migration 0056'),

 ('Communication','People',500,'Saying and writing things so that the other person actually understands.','migration 0056'),
 ('Listening','People',510,'Taking in what somebody said, including the part you did not want to hear.','migration 0056'),
 ('Teamwork','People',520,'Working with the people around you and not leaving a problem for the next person.','migration 0056'),
 ('Training Others','People',530,'Teaching somebody else to do what you can do.','migration 0056'),
 ('Leading a Team','People',540,'Getting work done through other people, and being answerable for what they produce.','migration 0056'),
 ('Decision Making','People',550,'Deciding with the information you have, and standing behind it.','migration 0056'),
 ('Ownership','People',560,'Treating a problem in your area as yours until it is solved, even when it was not your mistake.','migration 0056'),
 ('Learning and Adapting','People',570,'Picking up something new when the work demands it, without being pushed.','migration 0056'),
 ('Discipline and Attendance','People',580,'Being where you said you would be, when you said you would be there.','migration 0056')
on conflict (name) do nothing;
