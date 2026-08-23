import { NextResponse } from "next/server";
import { requireHrms, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { fieldSpec, hrmsTables } from "@/lib/hrms";

export const dynamic = "force-dynamic";

/**
 * GET /api/hrms/history?id=<employee>  — one person's change history
 * GET /api/hrms/history                — the last 200 changes, everybody
 *
 * Fetched only when the panel is opened. It is the part of a people record
 * nobody reads daily and everybody wants the day there is an argument.
 */
export async function GET(req: Request) {
  try {
    await requireHrms();
    const id = new URL(req.url).searchParams.get("id");
    const admin = adminClient();
    const T = await hrmsTables(admin);
    let q = admin
      .from(T.log)
      .select("id, employee_id, field, old_value, new_value, edited_by, edited_at")
      .order("edited_at", { ascending: false })
      .limit(id ? 100 : 200);
    if (id) q = q.eq("employee_id", id);
    const { data, error } = await q;
    if (error) {
      // pre-0047 — an empty history reads better than a broken panel
      if (/hrms_employee_edit_log|does not exist|schema cache/i.test(error.message))
        return NextResponse.json({ history: [] });
      throw new Error(error.message);
    }
    return NextResponse.json({
      history: (data || []).map((r) => ({
        ...r,
        label: fieldSpec(String(r.field))?.label || String(r.field),
      })),
    });
  } catch (e) {
    return errJson(e);
  }
}
