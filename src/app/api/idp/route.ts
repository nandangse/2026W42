import { NextResponse } from "next/server";
import { requireUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { hrmsTables } from "@/lib/hrms";
import { CONSENT_TEXT, isComplete } from "@/lib/idp";

export const dynamic = "force-dynamic";

const CYCLE = "2026-27";

/**
 * The IDP is the ONE HRIS-adjacent thing everybody can reach, and the gate is
 * therefore different: requireUser, not requireHrms. Every query below is
 * scoped to the caller's own email — there is no parameter that could name
 * somebody else, so no request can be made that returns another person's IDP.
 */
async function mine(email: string) {
  const admin = adminClient();
  const { data } = await admin
    .from("hrms_idp")
    .select("*")
    .eq("person_email", email)
    .eq("cycle", CYCLE)
    .order("started_at", { ascending: false })
    .limit(5);
  return data || [];
}

/** Their row on the employee master, and what their role expects of them. */
async function whoAreThey(email: string) {
  const admin = adminClient();
  const T = await hrmsTables(admin);
  try {
    const { data: emps } = await admin
      .from(T.employees).select("id, name, designation, department").ilike("email", email).limit(1);
    let emp: { id: string; name: string; designation: string | null; department: string | null } | null =
      ((emps || [])[0] as { id: string; name: string; designation: string | null; department: string | null } | undefined) ?? null;
    if (!emp) {
      // they may be linked by the Genie user field on the record instead
      const { data: link } = await admin
        .from(T.edits).select("employee_id").eq("field", "user_email").ilike("value", email).limit(1);
      if (link?.length) {
        const { data: e2 } = await admin
          .from(T.employees).select("id, name, designation, department").eq("id", link[0].employee_id).maybeSingle();
        emp = (e2 as typeof emp) ?? null;
      }
    }
    if (!emp) return { employee: null, role: null, roleSummary: null };

    const { data: roleEdit } = await admin
      .from(T.edits).select("value").eq("employee_id", emp.id).eq("field", "role").maybeSingle();
    const roleName = (roleEdit?.value as string | null) || emp.designation || null;
    let roleSummary: string | null = null;
    if (roleName) {
      const { data: r } = await admin.from("hrms_role").select("summary").eq("role", roleName).maybeSingle();
      roleSummary = (r?.summary as string | null) ?? null;
    }
    return { employee: emp, role: roleName, roleSummary };
  } catch {
    return { employee: null, role: null, roleSummary: null };
  }
}

// GET /api/idp — am I part-way through one, and have I finished one?
export async function GET() {
  try {
    const u = await requireUser();
    const who = await whoAreThey(u.email);
    let rows: Record<string, unknown>[] = [];
    try { rows = await mine(u.email) as Record<string, unknown>[]; }
    catch { return NextResponse.json({ needsMigration: true, ...who, open: null, done: [] }); }

    const open = rows.find((r) => !r.submitted_at) ?? null;
    const done = rows.filter((r) => r.submitted_at);
    return NextResponse.json({
      name: u.displayName || u.email,
      email: u.email,
      cycle: CYCLE,
      ...who,
      open,
      done: done.map((d) => ({ id: d.id, submitted_at: d.submitted_at })),
    });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST /api/idp
 *   { action: "start", consent: true }
 *   { action: "save",  id, answers, ratings }   — as they type, so a closed
 *                                                 laptop costs nothing
 *   { action: "submit", id, answers, ratings }
 */
export async function POST(req: Request) {
  try {
    const u = await requireUser();
    const admin = adminClient();
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "start") {
      if (body.consent !== true)
        throw new HttpError(400, "The IDP cannot be started without consent.");
      const who = await whoAreThey(u.email);
      /**
       * NO EMPLOYEE RECORD, NO IDP (Dr Raghu, 23 Aug 2026). A development
       * plan belongs ON somebody's file; one filled in by a login that
       * matches no employee has nowhere to be filed and nobody to review it.
       * The login is the key — the email address and password they already
       * use — and HRIS holds the join.
       */
      if (!who.employee)
        throw new HttpError(
          403,
          "This login is not linked to an employee record yet, so there is nowhere to file an IDP. " +
            "Ask HR to set the Genie user on your record in HRIS.",
        );
      // an abandoned attempt is not resumed — starting over is the rule
      await admin.from("hrms_idp").delete().eq("person_email", u.email).eq("cycle", CYCLE).is("submitted_at", null);
      const { data, error } = await admin.from("hrms_idp").insert({
        employee_id: who.employee?.id ?? null,
        person_email: u.email,
        person_name: u.displayName || null,
        cycle: CYCLE,
        consent_at: new Date().toISOString(),
        consent_text: CONSENT_TEXT,
        role_at_time: who.role,
        role_summary: who.roleSummary,
      }).select("id").maybeSingle();
      if (error) {
        if (/hrms_idp|does not exist|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0053 first — the IDP has nowhere to save yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true, id: data?.id });
    }

    if (action === "save" || action === "submit") {
      const id = String(body.id || "");
      if (!id) throw new HttpError(400, "id required");
      // scoped to the caller: somebody else's id simply matches nothing
      const { data: row } = await admin
        .from("hrms_idp").select("id, submitted_at").eq("id", id).eq("person_email", u.email).maybeSingle();
      if (!row) throw new HttpError(404, "That is not your IDP.");
      if (row.submitted_at) throw new HttpError(409, "This IDP has already been submitted.");

      const answers = (body.answers || {}) as Record<string, string>;
      const ratings = (body.ratings || {}) as Record<string, number>;
      const patch: Record<string, unknown> = { answers, ratings, updated_at: new Date().toISOString() };

      if (action === "submit") {
        const check = isComplete(answers, ratings);
        if (!check.ok)
          throw new HttpError(400,
            `Not finished yet — ${check.missing.length} question${check.missing.length === 1 ? "" : "s"} and ` +
            `${check.unrated.length} rating${check.unrated.length === 1 ? "" : "s"} still to do.`);
        patch.submitted_at = new Date().toISOString();
      }

      const { error } = await admin.from("hrms_idp").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, submitted: action === "submit" });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}
