import { NextResponse } from "next/server";
import { currentUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { hrmsTables } from "@/lib/hrms";
import { mayUseCrm } from "@/crm/auth";
import { hasGrant } from "@/lib/grant";
import { resolveGoalAccess } from "@/lib/goal-access";
import { mayUseMarketing } from "@/lib/marketing";

export const dynamic = "force-dynamic";

/**
 * GET /api/home — what the landing page needs to shape itself to the
 * person (Dr Raghu, 6 Sep 2026: "a page that's suitable to the person as
 * per his role, stature and position and what access he has. Then show the
 * apps ... as per the access. Else it won't show at all ... for all labour
 * it will show IDP").
 *
 *   kind     — "labour" when the HRMS record's type says so, else "staff"
 *   employee — name, designation, department, type from the HRMS record
 *   doors    — which of the eight apps open for this login
 *   goals    — whether the goal tree opens
 */
export async function GET() {
  try {
    const u = await currentUser();
    if (!u || u.disabled) throw new HttpError(401, "Not signed in");
    const admin = adminClient();
    const email = u.email.toLowerCase();

    let employee: { name: string; designation: string | null; department: string | null; type: string | null; employee_id: string | null } | null = null;
    try {
      const t = await hrmsTables(admin);
      const { data } = await admin.from(t.employees).select("name, designation, department, type, employee_id, user_email, email")
        .or(`user_email.eq.${email},email.eq.${email}`).eq("active", true).limit(1).maybeSingle();
      if (data) employee = { name: data.name, designation: data.designation, department: data.department, type: data.type, employee_id: data.employee_id };
    } catch { /* no HRMS tables yet: everybody is staff */ }

    const kind: "labour" | "staff" = /labour/i.test(String(employee?.type || "")) && u.role !== "admin" ? "labour" : "staff";

    const [crm, hrms, accounts, vishwakarma, seva, ims, saamaan, goals, marketing] = await Promise.all([
      mayUseCrm(),
      hasGrant(admin, "hrms_access", email, u.isOwner),
      hasGrant(admin, "accounts_access", email, u.isOwner),
      hasGrant(admin, "vishwakarma_access", email, u.isOwner),
      hasGrant(admin, "seva_access", email, u.isOwner),
      hasGrant(admin, "ims_access", email, u.isOwner),
      hasGrant(admin, "material_access", email, u.isOwner),
      resolveGoalAccess(admin, u.id, u.isOwner).catch(() => ({ see: false, edit: false })),
      mayUseMarketing(email, u.isOwner),
    ]);
    return NextResponse.json({
      kind, employee,
      doors: { main: kind === "staff", crm, marketing, hrms, ims, lms: true, accounts, vishwakarma, saamaan },
      goals: goals.see,
      me: { email: u.email, displayName: u.displayName, initials: u.initials, role: u.role, isOwner: u.isOwner },
    });
  } catch (e) {
    return errJson(e);
  }
}
