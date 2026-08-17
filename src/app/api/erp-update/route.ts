import { NextResponse } from "next/server";
import { requireReader, requirePlanner, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/erp-update[?all=1] — what is still waiting to go into the ERP.
 *
 * Pending by default. The whole history is available but is not the point:
 * the question this page answers is "what do I have to type into the ERP
 * today", and yesterday's applied changes are noise against it.
 */
export async function GET(req: Request) {
  try {
    await requireReader();
    const all = new URL(req.url).searchParams.get("all") === "1";
    let q = adminClient()
      .from("erp_update")
      .select("*")
      .order("job_id")
      .order("changed_at", { ascending: false });
    if (!all) q = q.is("exported_at", null);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return NextResponse.json({ installed: true, rows: data || [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/erp_update|does not exist|schema cache/i.test(msg))
      return NextResponse.json({ installed: false, rows: [] });
    return errJson(e);
  }
}

/**
 * POST /api/erp-update — { action: "exported", ids? }
 *
 * Marks lines as applied. Ids are optional: with none, everything pending is
 * cleared, which is what happens after a whole file has been uploaded.
 *
 * Nothing is ever deleted. A record of what was corrected, by whom and when,
 * is worth keeping — it is the only trace that the ERP and Genie disagreed.
 */
export async function POST(req: Request) {
  try {
    const user = await requirePlanner();
    const body = await req.json();
    if (String(body.action || "") !== "exported")
      return NextResponse.json({ error: "unknown action" }, { status: 400 });

    const admin = adminClient();
    const stamp = {
      exported_at: new Date().toISOString(),
      exported_by: user.initials || user.displayName || user.email.split("@")[0],
    };
    let q = admin.from("erp_update").update(stamp).is("exported_at", null);
    if (Array.isArray(body.ids) && body.ids.length) q = q.in("id", body.ids.map(String));
    const { error } = await q;
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
