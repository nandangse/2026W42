-- CRM 0043 — birthdays on contacts; the IF report linked (30 Aug 2026)
alter table person  add column if not exists birthday date;
alter table company add column if not exists ifs_pdf  text;
