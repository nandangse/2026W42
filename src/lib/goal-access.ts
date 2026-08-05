// Shared goals-access resolution — used by every route that needs to know
// whether a person may see or edit the goal tree.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface GoalAccess {
  see: boolean;
  edit: boolean;
}

/**
 * Goals access is granted, not implied by planning role (spec §9). Only the
 * OWNER (raghu@nandan.co.in) has it automatically — every other account,
 * admins included, needs an explicit row in goal_access. Mirrors the SQL
 * has_goals_access()/can_edit_goals() functions from migration 0011; keeping
 * both in sync matters because RLS enforces the real rule regardless of what
 * this function says, so drift here just produces a confusing 200-with-no-rows
 * instead of a clean 403.
 */
export async function resolveGoalAccess(
  admin: SupabaseClient,
  personId: string,
  isOwner: boolean,
): Promise<GoalAccess> {
  if (isOwner) return { see: true, edit: true };
  const { data } = await admin
    .from("goal_access")
    .select("can_edit")
    .eq("person_id", personId)
    .maybeSingle();
  return { see: !!data, edit: !!data?.can_edit };
}
