-- 0037_on_floor.sql
--
-- "On Floor" — is this job physically being worked on right now?
--
-- Nothing already on a job answers that. Kitting % is what has been bought,
-- Production % is what has been built, and a job can sit at 40% built for six
-- weeks with nobody touching it. Somebody has to say so, and only Stratcom
-- may: it is a claim about capacity, and a board where anyone can mark
-- anything as being worked on stops meaning anything by the second week.
--
-- SURVIVES UPLOADS. apply_jobs() names its columns explicitly rather than
-- replacing the row, so a morning Jobmaster load leaves this untouched -- which
-- it must, because the ERP has no idea and never will.
--
-- Additive and safe to re-run.

alter table public.jobs add column if not exists on_floor    boolean not null default false;
alter table public.jobs add column if not exists on_floor_at timestamptz;
alter table public.jobs add column if not exists on_floor_by text;

comment on column public.jobs.on_floor is
  'Physically being worked on now. Set by Stratcom only; not from the ERP, which cannot know.';
comment on column public.jobs.on_floor_at is
  'When the flag was last changed -- a job "on the floor" since March is the thing worth noticing.';

create index if not exists jobs_on_floor_idx on public.jobs (on_floor) where on_floor;

-- Only Stratcom (or the owner) may set it.
--
-- Same shape as the group guard in 0034, and the auth.uid() test is
-- load-bearing for the same reason: /api routes write with the service key,
-- where auth.uid() is null and no is_owner()/profile lookup can succeed. A
-- write carrying a JWT is a browser and must be Stratcom; a write without one
-- is the server, which has already checked who is asking.
create or replace function public.jobs_on_floor_stratcom_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.on_floor is distinct from old.on_floor
     and auth.uid() is not null
     and not coalesce(public.is_owner(), false)
     and not exists (
       select 1 from public.profiles p
        where p.id = auth.uid() and coalesce(p.stratcom, false)
     ) then
    raise exception 'Only Stratcom may mark a job on the floor';
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_on_floor_stratcom_only_trg on public.jobs;
create trigger jobs_on_floor_stratcom_only_trg
  before update on public.jobs
  for each row execute function public.jobs_on_floor_stratcom_only();
