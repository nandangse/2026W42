-- 0214 — PLANNING IS ITS OWN WORLD (Genie 6.4.0.0)
--
-- Dr Raghu, 10 Oct 2026: "The planning module also is an own-world module.
-- It is only applicable to those people who are applied to the planning.
-- There are a lot of people within the workers, CMO, and everybody who can
-- have access to the planning. Please stop that. Make a plain vanilla front
-- page for them."
--
-- Migration 0161 seeded planning_access with EVERY login that existed, so
-- the tick meant nothing. This narrows it to the people whose work is the
-- planning: the planning roles (admin, planner, project_owner) and the
-- rooms (LC, Stratcom, Management). Everyone else — user, sales, viewer,
-- uploader, labour — loses the tick and lands on the plain front page from
-- the next load. The tick on Admin → Users puts anyone back; the owner
-- never needs it. What was removed is kept in planning_access_removed_0214
-- so a name taken out by mistake can be found and restored in one line.

create table if not exists public.planning_access_removed_0214 as
select pa.email, p.role, now() as removed_at
from public.planning_access pa
left join public.profiles p on lower(p.email) = lower(pa.email)
where p.id is null
   or (coalesce(p.role, '') not in ('admin', 'planner', 'project_owner')
       and not coalesce(p.lc, false) and not coalesce(p.stratcom, false) and not coalesce(p.management, false));

delete from public.planning_access pa
using public.planning_access_removed_0214 r
where lower(pa.email) = lower(r.email);

-- the planning roles and the rooms always hold it, whether or not 0161 saw them
insert into public.planning_access (email)
select lower(p.email) from public.profiles p
where p.email is not null and not coalesce(p.disabled, false)
  and (p.role in ('admin', 'planner', 'project_owner') or coalesce(p.lc, false) or coalesce(p.stratcom, false) or coalesce(p.management, false))
on conflict do nothing;

insert into public.feature_request (title, body, want, status, note, by)
select 'Planning is its own world — a plain front page for everyone else', '<p>"The planning module also is an own-world module. It is only applicable to those people who are applied to the planning … Please stop that. Make a plain vanilla front page for them where, when they log in, they only see the message regarding the birthdays, the thought for the day, but not regarding the deliveries." (Dr Raghu, 10 Oct 2026.)</p>', 'must', 'done', 'Shipped as Genie 6.4.0.0.', 'raghu@nandan.co.in'
where not exists (select 1 from public.feature_request where title like 'Planning is its own world%');

insert into public.genie_migration (name) values ('0214_planning_access_narrowed') on conflict (name) do nothing;
