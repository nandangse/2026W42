-- 0050_salesperson_plan_text.sql
--
-- THE PLAN IN WORDS (Dr Raghu, 3 Sep 2026: "In the first tab make the Sales
-- persons plan -- eg Nitu's Sales Plan. Next to it keep a consult Dr Raghu
-- button handy and then let them chat. Also make a button of 'Genie
-- garnish' -- this will help them to make a better plan. Dr Raghu will
-- guide them what plan to make.")
--
-- Nine numbers are a target, not a plan. A plan says HOW: which accounts,
-- which families, what is being walked away from, what has to be true by
-- October. That is what Dr Raghu guides, and what Genie garnishes -- so it
-- needs a home beside the numbers, not instead of them.
--
--   plan_text    the salesperson's own words, theirs to write and rewrite
--   garnish      Genie's last polish of it -- kept apart, never written over
--                the person's words without them choosing to take it
--
-- ASCII only, additive, safe to re-run.
alter table salesperson_plan add column if not exists plan_text   text;
alter table salesperson_plan add column if not exists garnish     text;
alter table salesperson_plan add column if not exists garnished_at timestamptz;
