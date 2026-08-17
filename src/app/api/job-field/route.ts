import { NextResponse } from "next/server";
import { requirePlanner, errJson, RAGHU_EMAIL } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { assertJobEditable } from "@/lib/job-state";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["tdd", "stat", "mgmt"]);

// POST /api/job-field — app-local edit of tdd | stat | mgmt. planner/admin.
// The Management Target Date (mgmt) is editable ONLY by raghu — enforced here
// (API) AND by the jobs_mgmt_guard trigger via the user-scoped client (RLS).
// These are notes of intent: the actual change is applied in ERP by hand and
// tomorrow's upload is the confirmation (the V1.9 "Update to ERP" workflow).
// Body: { job_id, field: "tdd"|"stat"|"mgmt", value }
export async function POST(req: Request) {
  try {
    const user = await requirePlanner();
    const body = await req.json();
    const field: string = body.field;
    if (!body.job_id || !ALLOWED.has(field))
      return NextResponse.json({ error: "job_id and valid field required" }, { status: 400 });

    if (field === "mgmt" && user.email.toLowerCase() !== RAGHU_EMAIL) {
      return NextResponse.json(
        { error: "Only raghu@nandan.co.in may edit the Management Target Date" },
        { status: 403 },
      );
    }

    const value =
      field === "stat" ? String(body.value ?? "") : body.value || null;

    // user-scoped client → RLS + mgmt trigger both apply (defense in depth)
    const supabase = supabaseServer();
    // a delivered job's dates and status are settled — the ERP owns them now
    await assertJobEditable(supabase, body.job_id);
    const { error } = await supabase
      .from("jobs")
      .update({ [field]: value })
      .eq("id", body.job_id);
    if (error) {
      // trigger raises 42501 for a non-raghu mgmt edit that slipped the API check
      const status = /privilege|Management Target Date/i.test(error.message)
        ? 403
        : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
