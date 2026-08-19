import { NextResponse } from "next/server";
import { requireReader, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/closeouts — every "what stops this happening again" note.
 *
 * The whole reason these are stored rather than left in a comment is that they
 * can be READ BACK together: one escalation's answer is a note, and forty of
 * them is a list of what keeps going wrong. The Escalations table is where
 * that happens, so this hands over the lot rather than one at a time.
 */
export async function GET() {
  try {
    await requireReader();
    const { data, error } = await adminClient()
      .from("task_closeout")
      .select("task_id, task_kind, esc, body, by, at")
      .order("at", { ascending: false })
      .limit(2000);

    if (error) {
      // Before 0036 there is no table. The column shows empty rather than
      // taking down the page it sits on.
      if (/task_closeout|schema cache|does not exist/i.test(error.message))
        return NextResponse.json({ installed: false, notes: [] });
      throw new Error(error.message);
    }
    return NextResponse.json({ installed: true, notes: data || [] });
  } catch (e) {
    return errJson(e);
  }
}
