-- 0035_group_rules_fix.sql
--
-- Fixes the Stratcom/LC trigger shipped in 0034. Half of it did not work.
--
-- WHAT WAS WRONG
--
-- 0034 wrote the rule as a test on the NEW row only:
--
--     if new.stratcom then new.lc := true;
--     elsif not new.lc then new.stratcom := false;
--     end if;
--
-- On a write that changes only `lc`, Postgres carries every other column into
-- `new` unchanged -- so `new.stratcom` is still true, the first branch fires,
-- and `lc` is forced straight back to true. The second branch is unreachable
-- for the exact case it was written for.
--
-- The visible effect: un-ticking LC on somebody who is in Stratcom did
-- nothing at all. Not an error, not a partial write -- the tick simply came
-- back. Silently ignoring an instruction is the worst of the three.
--
-- It went unnoticed because the app always sends all three flags together and
-- normaliseGroups() has already dropped Stratcom client-side by then, so
-- through the screen the answer was right. Only a direct write -- the SQL
-- editor, the API, a script -- took the broken path.
--
-- WHAT IT DOES NOW
--
-- Compare NEW against OLD and act on what actually changed, rather than on
-- what the row happens to say afterwards:
--
--   joined Stratcom          -> join the LC
--   left the LC              -> leave Stratcom
--   anything else            -> hold the invariant (stratcom implies lc)
--
-- The third branch is what keeps an unrelated write -- someone's department,
-- their reporting line -- from quietly breaking the pair.
--
-- Additive and safe to re-run.

create or replace function public.profiles_group_rules()
returns trigger
language plpgsql
as $$
begin
  -- On insert there is no OLD to compare against; only the invariant applies.
  if tg_op = 'INSERT' then
    if new.stratcom then
      new.lc := true;
    end if;
    return new;
  end if;

  if new.stratcom and not old.stratcom then
    new.lc := true;            -- joining Stratcom joins the LC
  elsif old.lc and not new.lc then
    new.stratcom := false;     -- leaving the LC leaves Stratcom with it
  elsif new.stratcom then
    new.lc := true;            -- any other write: the pair still has to hold
  end if;

  return new;
end;
$$;

-- The trigger fires on lc/stratcom only. A write that changes just `lc` must
-- reach it, and it does -- but state it explicitly rather than relying on the
-- 0034 definition still being there.
drop trigger if exists profiles_group_rules_trg on public.profiles;
create trigger profiles_group_rules_trg
  before insert or update of lc, stratcom on public.profiles
  for each row execute function public.profiles_group_rules();

-- Repair anything the broken rule left behind: a row that was meant to leave
-- the LC and was pulled back in. There is no way to tell those apart from
-- deliberate members now, so this only re-asserts the invariant rather than
-- guessing at intent.
update public.profiles set lc = true where stratcom and not lc;
