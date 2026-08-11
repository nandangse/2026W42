import { NextResponse } from "next/server";
import { requireUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveSalesAccess } from "@/lib/sales-access";
import { resolvePersonByHandle, notify } from "@/lib/notify";

export const dynamic = "force-dynamic";

// POST /api/sales/plan/notify — the bridge that puts a Genie bell notification
// on the assignee when work is assigned inside My Sales Plan (to-dos, support
// requests, deals). The MSP app writes its data straight to Supabase, so it
// can't insert notifications itself (service-role only) — it calls this
// instead. The assignee arrives as an owner display name ("Raghu", "Nitu
// Sharan") and is resolved against profiles the same way task assignment is.
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const admin = adminClient();
    if (!(await resolveSalesAccess(admin, user.id, user.isOwner, user.role)))
      throw new HttpError(403, "Sales Genie has not been shared with this account");

    const body = await req.json().catch(() => ({}));
    const assignee = String(body.assignee || "").trim();
    const text = String(body.text || "").trim();
    if (!assignee || !text) return NextResponse.json({ ok: true, skipped: "empty" });

    // display-name match first (MSP owners are display names), then the
    // shared handle resolver (initials / erp owner / email prefix)
    let person = null;
    try {
      const { data } = await admin
        .from("profiles")
        .select("id, email, display_name")
        .ilike("display_name", assignee)
        .maybeSingle();
      person = data;
    } catch { /* fall through */ }
    if (!person) person = await resolvePersonByHandle(admin, assignee);
    if (!person || person.id === user.id) return NextResponse.json({ ok: true, skipped: "self-or-unknown" });

    const kindLabel = body.kind === "deal" ? "deal" : body.kind === "support" ? "support request" : "to-do";
    const company = String(body.company || "").trim();
    await notify(admin, {
      person_id: person.id,
      kind: "task_assigned",
      title: `Sales Genie: ${kindLabel} assigned to you`,
      body: text.slice(0, 300) + (company ? ` · ${company}` : ""),
      ref_kind: "sales_plan",
      created_by: user.email,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
