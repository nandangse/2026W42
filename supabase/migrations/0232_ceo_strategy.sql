-- 0232 — CEO: THE STRATEGY ROOM AS STRATEGIC ACTION (Genie 6.10.0.4)
--
-- Dr Raghu, 14 Oct 2026: "this strategy doesn't need this kind of numbers, it
-- needs the strategic action. As a world class coach what would you put on
-- this page?" The page becomes the one-page strategy: where we are going (the
-- lines of Breakthrough 2027), whether we are on pace, and the twenty
-- conditions — the ten of the Management System, each with one owner and a
-- weekly review, and the ten Critical Success Factors — with an owner, a
-- red / amber / green, the week's note and when it was last looked at.
-- Seeded word for word from the Breakthrough 2027 page of the Leaders Council.

create table if not exists public.ceo_strategy (
  key         text primary key,
  value       text not null default '',
  updated_by  text,
  updated_at  timestamptz not null default now()
);
alter table public.ceo_strategy enable row level security;
revoke all on public.ceo_strategy from anon, authenticated;

create table if not exists public.ceo_condition (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('nms','csf')),
  title        text not null,
  sort         integer not null default 0,
  owner_email  text,
  status       text not null default 'grey' check (status in ('green','amber','red','grey')),
  note         text not null default '',
  reviewed_at  timestamptz,
  reviewed_by  text,
  unique (kind, title)
);
alter table public.ceo_condition enable row level security;
revoke all on public.ceo_condition from anon, authenticated;

insert into public.ceo_strategy (key, value) values
  ('north_star', 'By 2029: ₹350 Cr at 15% PBT'),
  ('year_goal', 'FY 2026-27: ₹100 Cr at 10% PBT, exports ₹50 Cr, on-time delivery 90%+ sustained, founder time on operations under four hours a day'),
  ('themes', 'Safety · On-Time Delivery'),
  ('motto', 'Quality first. On time. Profitable. Accountable. One team.'),
  ('pillars', 'Predictable Delivery · First Time Right Quality · Resource Productivity'),
  ('culture', 'PLAY OFFENSE · PASS THE BALL · DELIVER THE GOAL'),
  ('target_sales', '1000000000'),
  ('target_pbt_pct', '10'),
  ('target_exports', '500000000'),
  ('target_otd_pct', '90'),
  ('target_founder_hours', '4'),
  ('founder_hours', '')
on conflict (key) do nothing;

insert into public.ceo_condition (kind, title, sort) values
  ('nms', 'Safety with zero compromise', 1),
  ('nms', 'On-time delivery at 90%+', 2),
  ('nms', 'A1 customer response', 3),
  ('nms', 'Deep project planning before release', 4),
  ('nms', 'Material cost and supplier strength', 5),
  ('nms', 'Fabrication quality and first-time-right', 6),
  ('nms', 'Right people and capacity build-up', 7),
  ('nms', 'Night shift as a controlled system', 8),
  ('nms', 'Delivery checklist and project handover', 9),
  ('nms', 'NMS Cockpit — AI, process, QMS and review cadence', 10),
  ('csf', 'Customer First — quality first, on time always', 1),
  ('csf', 'Profitable Growth — the right order, not every order', 2),
  ('csf', 'Execution Excellence — remove the 15-day wait', 3),
  ('csf', 'Quality Without Compromise — right the first time', 4),
  ('csf', 'People Who Grow — capability before scale', 5),
  ('csf', 'Innovation & Continuous Improvement — engineer a better way', 6),
  ('csf', 'Ownership & Accountability — one owner, one date, one result', 7),
  ('csf', 'Financial Discipline — cash, margin, working capital', 8),
  ('csf', 'One Team — win across functions', 9),
  ('csf', 'Speed with Discipline — fast, clear and right', 10)
on conflict (kind, title) do nothing;

insert into public.feature_request (title, body, want, status, note, by)
select 'CEO — Strategy as strategic action: the direction, the pace, the twenty conditions with owners, the rocks, the decisions', '<p>"this strategy doesn''t need this kind of numbers, it needs the strategic action. As a world class coach what would you put on this page?" (Dr Raghu, 14 Oct 2026.)</p>', 'must', 'done', 'Shipped as Genie 6.10.0.4.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title like 'CEO — Strategy as strategic action%');

insert into public.genie_migration (name) values ('0232_ceo_strategy') on conflict (name) do nothing;
