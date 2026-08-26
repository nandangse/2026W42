-- 0015: the opportunity stages, in Dr Raghu's order (Genie 3.23.1.29)
--
-- The picker reads exactly:
--   Suspect · New · Handled Opportunity · Not Target · Prospect ·
--   Waiting for Data · Consultative Presentation · Quote Given ·
--   Late Handling · Lost
-- LATE HANDLING is new. The old "Opportunity" stage retires: its 188 rows
-- (ERP status "Open" — untouched enquiries) read as NEW, which is what they
-- are, and the stage leaves the picker.

insert into stage (name, code, entity, sort_order)
select 'Late Handling', 'late_handling', 'opportunity', 9
 where not exists (select 1 from stage where code = 'late_handling');

update stage set sort_order = 1  where code = 'suspect';
update stage set sort_order = 2  where code = 'new';
update stage set sort_order = 3  where code = 'handled_opportunity';
update stage set sort_order = 4  where code = 'not_target';
update stage set sort_order = 5  where code = 'prospect';
update stage set sort_order = 6  where code = 'waiting_for_data';
update stage set sort_order = 7  where code = 'consultative_presentation';
update stage set sort_order = 8  where code = 'quote_given';
update stage set sort_order = 9  where code = 'late_handling';
update stage set sort_order = 10 where code = 'quote_lost';

update opportunity
   set stage_id = (select id from stage where code = 'new')
 where stage_id = (select id from stage where code = 'opportunity');

update stage set entity = 'retired' where code = 'opportunity';
