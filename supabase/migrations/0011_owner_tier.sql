-- 0011_owner_tier.sql
-- One owner above the admin tier.
--
-- Until now every admin was equal: all admins had implicit goals access that
-- could not be revoked, and any admin could demote any other. This puts
-- raghu@nandan.co.in at the top — the only account that can govern the other
-- admins, and the only one no admin can remove.
--
-- Additive and reversible: existing admins already hold explicit goal_access
-- rows (the goals seed wrote them), so nobody loses access when the implicit
-- admin shortcut below is removed.

-- The owner. Kept as a function so there is one definition, matching the
-- existing raghu_email() used by the Management-Target-Date guard.
create or replace function public.is_owner()
returns boolean language sql stable as $$
  select lower(coalesce(auth.email(), '')) = lower(public.raghu_email());
$$;

-- Goals access: implicit for the OWNER only. Every other account — admins
-- included — needs an explicit grant, which is what makes the owner able to
-- govern admin access at all.
create or replace function public.has_goals_access()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_owner(), false)
      or exists (select 1 from public.goal_access g where g.person_id = auth.uid());
$$;

create or replace function public.can_edit_goals()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_owner(), false)
      or exists (select 1 from public.goal_access g where g.person_id = auth.uid() and g.can_edit);
$$;

-- Safety net: the owner's own row cannot be disabled, demoted or deleted, by
-- anyone, through any path. The API enforces this too; this is the backstop
-- that survives a mistake in application code.
create or replace function public.protect_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if lower(coalesce(old.email, '')) = lower(public.raghu_email()) then
      raise exception 'The owner account cannot be removed' using errcode = '42501';
    end if;
    return old;
  end if;

  if lower(coalesce(old.email, '')) = lower(public.raghu_email()) then
    if new.role is distinct from old.role then
      raise exception 'The owner account cannot change role' using errcode = '42501';
    end if;
    if coalesce(new.disabled, false) is distinct from coalesce(old.disabled, false)
       and coalesce(new.disabled, false) then
      raise exception 'The owner account cannot be disabled' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_owner on public.profiles;
create trigger profiles_protect_owner
  before update or delete on public.profiles
  for each row execute function public.protect_owner();

-- goal_access rows are managed by the owner. Admins may still read the table.
drop policy if exists goal_access_write on public.goal_access;
create policy goal_access_write on public.goal_access
  for all using (public.is_owner()) with check (public.is_owner());
