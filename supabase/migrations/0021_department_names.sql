-- 0021_department_names.sql
-- The department names are Nandan's, not mine.
--
-- 0019 seeded a plausible-looking list. Two of them were invented rather than
-- observed, and a goal filed under a department that does not exist is worse
-- than no goal at all — nobody owns it and nobody argues with it.
--
--   Supply Chain -> Purchase
--   Finance      -> Accounts
--
-- Renames rather than delete-and-recreate, so the uuid survives and anything
-- already filed under them keeps its link.

update public.departments set name = 'Purchase', code = 'PUR' where name = 'Supply Chain';
update public.departments set name = 'Accounts', code = 'ACC' where name = 'Finance';

-- Idempotent: if a fresh 0019 seed ran after this, fix it the same way.
insert into public.departments (name, code, color, sort_order)
values ('Purchase', 'PUR', '#D97706', 4), ('Accounts', 'ACC', '#B3261E', 8)
on conflict (name) do nothing;
