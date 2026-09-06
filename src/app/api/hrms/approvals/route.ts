import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { swallow } from "@/lib/swallow";
import { requireHrms, errJson, HttpError, RAGHU_EMAIL } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { hrmsTables, fieldSpec } from "@/lib/hrms";

export const dynamic = "force-dynamic";

/**
 * GET /api/hrms/approvals — everything waiting on the owner, in one payload.
 *
 * Two kinds: changes to a PERSON'S RECORD (per field, so three edits on one
 * record read as one row saying three), and changes to a ROLE DEFINITION.
 * Both are listed here so there is one place to look rather than two.
 */
export async function GET() {
  try {
    await requireHrms();
    const admin = adminClient();
    const T = await hrmsTables(admin);

    // ---- people ----
    let people: {
      id: string; name: string; count: number; last: string | null;
      by: string | null;
      changes: { field: string; label: string; value: string | null; by: string | null; at: string }[];
    }[] = [];
    try {
      const { data: pend } = await admin
        .from(T.edits)
        .select("employee_id, field, value, edited_by, edited_at")
        .is("approved_at", null)
        .order("edited_at", { ascending: false })
        .limit(2000);

      if (pend?.length) {
        const ids = [...new Set(pend.map((p) => String(p.employee_id)))];
        const { data: emps } = await admin.from(T.employees).select("id, name").in("id", ids);
        const nameOf = new Map((emps || []).map((e) => [String(e.id), String(e.name || e.id)]));
        const byId = new Map<string, typeof people[number]>();
        for (const p of pend) {
          const id = String(p.employee_id);
          if (!byId.has(id))
            byId.set(id, { id, name: nameOf.get(id) || id, count: 0, last: null, by: null, changes: [] });
          const row = byId.get(id)!;
          row.count++;
          row.changes.push({
            field: String(p.field),
            label: fieldSpec(String(p.field))?.label || String(p.field),
            value: p.value == null ? null : String(p.value),
            by: p.edited_by ?? null,
            at: String(p.edited_at),
          });
          if (!row.last || String(p.edited_at) > row.last) { row.last = String(p.edited_at); row.by = p.edited_by ?? null; }
        }
        people = [...byId.values()].sort((a, b) => String(b.last).localeCompare(String(a.last)));
      }
    } catch (e) { swallow("hrms/approvals", e); /* pre-0052 — the column does not exist yet, so nothing is pending */ }

    // ---- roles ----
    let roles: { id: string; role: string; department: string | null; by: string | null; since: string | null }[] = [];
    try {
      const { data } = await admin
        .from("hrms_role")
        .select("id, role, department, pending_by, pending_since")
        .not("pending_since", "is", null)
        .order("pending_since", { ascending: false });
      roles = (data || []).map((r) => ({
        id: String(r.id), role: String(r.role), department: r.department ?? null,
        by: r.pending_by ?? null, since: r.pending_since ?? null,
      }));
    } catch (e) { swallow("hrms/approvals", e); /* pre-0051 */ }

    /**
     * ---- what has already been agreed ----
     * The waiting queue empties itself, and an empty queue tells you nothing
     * about what was decided. This is the other half: every change that HAS
     * been approved, with the date it was ASKED and the date it was AGREED,
     * so a month later the record answers "when did we settle that".
     */
    let done: {
      kind: "Record" | "Role"; id: string; name: string; what: string;
      asked: string | null; approved: string | null; by: string | null; approvedBy: string | null;
    }[] = [];
    try {
      const { data: seen } = await admin
        .from(T.edits)
        .select("employee_id, field, value, edited_by, edited_at, approved_at, approved_by")
        .not("approved_at", "is", null)
        .order("approved_at", { ascending: false })
        .limit(400);
      const ids = [...new Set((seen || []).map((p) => String(p.employee_id)))];
      const nameOf = new Map<string, string>();
      if (ids.length) {
        const { data: emps } = await admin.from(T.employees).select("id, name").in("id", ids);
        for (const e of emps || []) nameOf.set(String(e.id), String(e.name || e.id));
      }
      done = (seen || []).map((p) => ({
        kind: "Record" as const,
        id: String(p.employee_id),
        name: nameOf.get(String(p.employee_id)) || String(p.employee_id),
        what: fieldSpec(String(p.field))?.label || String(p.field),
        asked: p.edited_at ? String(p.edited_at) : null,
        approved: p.approved_at ? String(p.approved_at) : null,
        by: p.edited_by ?? null, approvedBy: p.approved_by ?? null,
      }));
    } catch (e) { swallow("hrms/approvals", e); /* pre-0052 */ }
    try {
      const { data: doneRoles } = await admin
        .from("hrms_role")
        .select("id, role, department, updated_by, updated_at, approved_at, approved_by")
        .not("approved_at", "is", null)
        .order("approved_at", { ascending: false })
        .limit(200);
      for (const r of doneRoles || [])
        done.push({
          kind: "Role", id: String(r.id), name: String(r.role), what: r.department ? `Role definition · ${r.department}` : "Role definition",
          asked: r.updated_at ? String(r.updated_at) : null,
          approved: r.approved_at ? String(r.approved_at) : null,
          by: r.updated_by ?? null, approvedBy: r.approved_by ?? null,
        });
    } catch (e) { swallow("hrms/approvals", e); /* pre-0051 */ }
    done.sort((a, b) => String(b.approved).localeCompare(String(a.approved)));

    return NextResponse.json({ people, roles, done });
  } catch (e) {
    return errJson(e);
  }
}

/**
 * POST /api/hrms/approvals — { employeeIds?: [], roleIds?: [], all?: true }
 *
 * THE OWNER'S ALONE. HR may write any part of a record and may not be the one
 * who agrees it; an approval anybody can grant is not an approval.
 *
 * Approving does NOT alter a single value — the change was already in the
 * record from the moment it was saved. What it changes is the standing of
 * that change: proposed becomes agreed. Nothing is rewritten, so nothing can
 * be lost by approving, and the history reads the same either way.
 */
export async function POST(req: Request) {
  try {
    const me = await requireHrms();
    if (me.email.toLowerCase() !== RAGHU_EMAIL)
      throw new HttpError(403, `Only ${RAGHU_EMAIL} may approve a change to a record.`);
    const admin = adminClient();
    const T = await hrmsTables(admin);
    const body = await readBody(req, {});
    const stamp = me.initials ? `${me.initials} · ${me.email}` : me.email;
    const now = new Date().toISOString();

    let people = 0, roles = 0;

    if (body.all || (Array.isArray(body.employeeIds) && body.employeeIds.length)) {
      let q = admin.from(T.edits).update({ approved_at: now, approved_by: stamp }).is("approved_at", null);
      if (!body.all) q = q.in("employee_id", body.employeeIds.map(String));
      const { data, error } = await q.select("employee_id");
      if (error) {
        if (/approved_at|column|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0052 first — a change cannot be marked approved yet.");
        throw new Error(error.message);
      }
      people = (data || []).length;
    }

    if (body.all || (Array.isArray(body.roleIds) && body.roleIds.length)) {
      let q = admin
        .from("hrms_role")
        .update({ pending_since: null, pending_by: null, approved_by: stamp, approved_at: now })
        .not("pending_since", "is", null);
      if (!body.all) q = q.in("id", body.roleIds.map(String));
      const { data, error } = await q.select("id");
      if (error) throw new Error(error.message);
      roles = (data || []).length;
    }

    return NextResponse.json({ ok: true, people, roles });
  } catch (e) {
    return errJson(e);
  }
}
