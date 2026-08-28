import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/goal-tasks — the salesperson's tasks FROM MAIN GENIE TASKING.
 *
 * The CRM does not grow a second task list; the dashboard shows the same
 * manual tasks Nandan Tasking assigns, matched to the person by their
 * profile's initials, ERP owner name and display name — the three spellings
 * a `who` field is written in. Read-only here: the task is done where it
 * lives, in Genie.
 */
export async function GET() {
  try {
    const me = await requireCrm();
    const main = adminClient();

    const { data: prof } = await main
      .from("profiles").select("initials, display_name, erp_owner").eq("email", me.email).maybeSingle();
    const handles = [prof?.initials, prof?.display_name, prof?.erp_owner, me.email.split("@")[0]]
      .map((h) => String(h || "").trim().toLowerCase()).filter(Boolean);
    if (!handles.length) return NextResponse.json({ tasks: [] });

    const { data, error } = await main
      .from("manual_tasks")
      .select("id, title, detail, who, due, esc, job_id, done")
      .eq("done", false)
      .order("due", { ascending: true, nullsFirst: false })
      .limit(400);
    if (error) throw new HttpError(500, error.message);

    const tasks = (data || [])
      .filter((t) => handles.includes(String(t.who || "").trim().toLowerCase()))
      .slice(0, 60)
      .map((t) => ({
        id: String(t.id), title: String(t.title || ""), detail: t.detail ? String(t.detail).slice(0, 140) : null,
        due: t.due ?? null, esc: String(t.esc || "None"), job: t.job_id ? String(t.job_id).slice(-4) : null,
      }));
    return NextResponse.json({ tasks });
  } catch (e) {
    return errJson(e);
  }
}
