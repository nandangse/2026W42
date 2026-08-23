-- 0057_competency_shopfloor.sql
--
-- THE COMPETENCIES A SHOP FLOOR ACTUALLY RUNS ON (Dr Raghu, 23 Aug 2026).
--
-- 0056 seeded a competency master that would suit any engineering company.
-- More than half of the people here are Labour and Helper grades, several
-- read a job card in Hindi, and the abilities that decide whether their work
-- goes right are not on a standard framework: reading a job card, moving a
-- fabricated part without damaging it, slinging a load, handing over a shift,
-- putting the tool back.
--
-- Leaving those out would have meant every Helper and Fitter measured against
-- competencies written for an office. These are the ones that describe the
-- work as it is done here.
--
-- Written to be READ BY THE PERSON BEING RATED. Short sentences, ordinary
-- words, no framework vocabulary. Somebody who cannot read their own
-- competency cannot argue with their rating, and a rating nobody can argue
-- with is not an assessment, it is a verdict.
--
-- ASCII only, additive, safe to re-run.

insert into public.hrms_competency (name, category, sort_order, definition, created_by) values
 ('Reading a Job Card','Basics',1,'Reading the job card and knowing what to make, how many, and by when.','migration 0057'),
 ('Basic Reading and Writing','Basics',2,'Reading a notice, a job card or a safety sign, and writing down a reading or a number.','migration 0057'),
 ('Basic Numeracy','Basics',3,'Reading a tape in mm, adding and subtracting sizes, and counting stock correctly.','migration 0057'),
 ('Following Instructions','Basics',4,'Doing what was asked, the way it was asked -- and asking when it is not clear.','migration 0057'),
 ('Learning on the Job','Basics',5,'Picking up the work by watching a senior and trying it, without needing a classroom.','migration 0057'),
 ('Tool Care','Basics',6,'Using the right tool, keeping it in condition, and putting it back where it belongs.','migration 0057'),
 ('Material Handling','Basics',7,'Moving material and finished parts without damaging them and without hurting yourself.','migration 0057'),
 ('Shift Handover','Basics',8,'Telling the next shift what is finished, what is pending and what went wrong.','migration 0057'),
 ('Time on the Job','Basics',9,'Staying on the work through the shift rather than drifting off it.','migration 0057'),
 ('Respect and Conduct','Basics',10,'Behaving properly with colleagues, visitors and women at work. Knowing what is not acceptable.','migration 0057'),

 ('Gas Cutting and Grinding','Technical',31,'Cutting and grinding to the line, safely, without spoiling the material.','migration 0057'),
 ('Assembly and Fitment','Technical',32,'Putting parts together so they fit, move and sit as the drawing intends.','migration 0057'),
 ('Torque and Fastening','Technical',33,'Tightening fasteners to the torque specified, in the right order.','migration 0057'),
 ('Hydraulic Hose and Fitting','Technical',34,'Making up hoses and fittings so the joint holds pressure and does not leak.','migration 0057'),
 ('Turning and Lathe Work','Technical',35,'Setting and running the lathe to turn a part to size and finish.','migration 0057'),
 ('Crane and Slinging','Quality & Safety',231,'Slinging a load correctly, signalling the crane, and keeping everybody clear.','migration 0057'),
 ('Working at Height','Quality & Safety',232,'Working above ground safely, with the harness and the platform the job needs.','migration 0057'),
 ('Waste and Scrap Control','Quality & Safety',241,'Cutting and using material so that little is wasted, and returning what is left.','migration 0057'),
 ('Quality Consciousness','Quality & Safety',242,'Not passing on work you know is not right, even when nobody is watching.','migration 0057'),

 ('Site Installation','Delivery',341,'Installing and commissioning equipment at a customer site and leaving it working.','migration 0057'),
 ('Customer Site Conduct','Delivery',342,'Behaving at a customer plant so the company is welcome back.','migration 0057'),
 ('Travel Readiness','Delivery',343,'Going at short notice, managing yourself away from home, and getting the job done there.','migration 0057'),
 ('Fault Finding','Delivery',344,'Finding what is actually wrong with a machine rather than replacing parts until it works.','migration 0057'),
 ('Loading and Dispatch','Delivery',345,'Loading, securing and dispatching a job with the right papers.','migration 0057'),
 ('Store Receipt and Issue','Delivery',346,'Receiving, checking, storing and issuing material with the entry made at the time.','migration 0057'),
 ('Driving and Road Safety','Delivery',347,'Driving safely and lawfully, and looking after the vehicle.','migration 0057'),
 ('Forklift Operation','Delivery',348,'Operating a forklift safely and keeping the load and the people around it safe.','migration 0057'),

 ('Data Entry Accuracy','Commercial',421,'Entering figures so that what is in the system matches what is on the paper.','migration 0057'),
 ('Cash Handling','Commercial',422,'Handling cash and vouchers so the balance ties every day.','migration 0057'),
 ('Phone and Mail Handling','People',501,'Answering the phone and mail promptly, and leaving the other person clear on what happens next.','migration 0057')
on conflict (name) do nothing;
