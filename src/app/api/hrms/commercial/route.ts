import { NextResponse } from "next/server";
import { requireHrms, errJson, HttpError, RAGHU_EMAIL } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { hrmsTables } from "@/lib/hrms";

export const dynamic = "force-dynamic";

const CYCLE = "2026-27";

/**
 * RJ Approval - Commercial — the money desk.
 *
 * Two kinds of thing carry money and need the owner's word before they are
 * real: what a person will be PAID (an appraisal decision) and what the
 * company LENDS them (a loan or salary advance). Both live here rather than
 * in two screens, for the same reason the Records queue merges people and
 * roles: a second queue is a queue that goes unread.
 *
 * Waiting and settled are both returned. An empty waiting list says nothing
 * about what was decided, and "when did we agree that, and when was it
 * asked" is the question this screen gets put a month later.
 */
export async function GET() {
  try {
    await requireHrms();
    const admin = adminClient();
    const T = await hrmsTables(admin);

    const nameOf = new Map<string, string>();
    const deptOf = new Map<string, string>();
    const learn = async (ids: string[]) => {
      const want = [...new Set(ids.filter((i) => i && !nameOf.has(i)))];
      if (!want.length) return;
      const { data } = await admin.from(T.employees).select("id, name, department").in("id", want);
      for (const e of data || []) { nameOf.set(String(e.id), String(e.name || e.id)); deptOf.set(String(e.id), String(e.department || "")); }
    };

    // ---- salary decisions ----
    let salaryWaiting: Record<string, unknown>[] = [];
    let salaryDone: Record<string, unknown>[] = [];
    let needsMigration = false;
    try {
      const { data, error } = await admin
        .from("hrms_appraisal")
        .select("employee_id, new_gross, prev_gross, note, pending_since, pending_by, approved_at, approved_by, decided_by, updated_at")
        .eq("cycle", CYCLE)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      await learn((data || []).map((r) => String(r.employee_id)));
      const shape = (r: Record<string, unknown>) => ({
        id: String(r.employee_id),
        name: nameOf.get(String(r.employee_id)) || String(r.employee_id),
        department: deptOf.get(String(r.employee_id)) || null,
        prev: r.prev_gross == null ? null : Number(r.prev_gross),
        next: r.new_gross == null ? null : Number(r.new_gross),
        asked: (r.pending_since as string) ?? (r.updated_at as string) ?? null,
        approved: (r.approved_at as string) ?? null,
        by: (r.pending_by as string) ?? (r.decided_by as string) ?? null,
        approvedBy: (r.approved_by as string) ?? null,
        note: (r.note as string) ?? null,
      });
      salaryWaiting = (data || []).filter((r) => r.pending_since && !r.approved_at).map(shape);
      salaryDone = (data || []).filter((r) => r.approved_at).map(shape);
    } catch (e) {
      if (/hrms_appraisal|pending_since|schema cache|does not exist/i.test(e instanceof Error ? e.message : "")) needsMigration = true;
      else throw e;
    }

    // ---- loans ----
    let loansWaiting: Record<string, unknown>[] = [];
    let loansDone: Record<string, unknown>[] = [];
    let needsLoanMigration = false;
    try {
      const { data, error } = await admin
        .from("hrms_loan").select("*").order("requested_at", { ascending: false }).limit(500);
      if (error) throw new Error(error.message);
      await learn((data || []).map((r) => String(r.employee_id)));
      const shape = (r: Record<string, unknown>) => ({
        id: String(r.id),
        employee_id: String(r.employee_id),
        name: nameOf.get(String(r.employee_id)) || String(r.employee_id),
        department: deptOf.get(String(r.employee_id)) || null,
        amount: r.amount == null ? null : Number(r.amount),
        kind: String(r.kind || "Loan"),
        reason: (r.reason as string) ?? null,
        months: r.months == null ? null : Number(r.months),
        from_month: (r.from_month as string) ?? null,
        status: String(r.status || "Requested"),
        asked: (r.requested_at as string) ?? null,
        by: (r.requested_by as string) ?? null,
        approved: (r.decided_at as string) ?? null,
        approvedBy: (r.decided_by as string) ?? null,
        note: (r.decision_note as string) ?? null,
      });
      loansWaiting = (data || []).filter((r) => String(r.status) === "Requested").map(shape);
      loansDone = (data || []).filter((r) => String(r.status) !== "Requested").map(shape);
    } catch (e) {
      if (/hrms_loan|schema cache|does not exist/i.test(e instanceof Error ? e.message : "")) needsLoanMigration = true;
      else throw e;
    }

    return NextResponse.json({ salaryWaiting, salaryDone, loansWaiting, loansDone, needsMigration, needsLoanMigration });
  } catch (e) {
    return errJson(e);
  }
}

/** Raising a loan request is HR's; deciding anything on this desk is the owner's. */
export async function POST(req: Request) {
  try {
    const me = await requireHrms();
    const admin = adminClient();
    const body = await req.json();
    const action = String(body.action || "");
    const stamp = me.initials ? `${me.initials} · ${me.email}` : me.email;
    const owner = me.email.toLowerCase() === RAGHU_EMAIL;
    const now = new Date().toISOString();

    if (action === "loan-raise") {
      const employee_id = String(body.employee_id || "").trim();
      const amount = Number(String(body.amount ?? "").replace(/[^0-9.]/g, ""));
      if (!employee_id) throw new HttpError(400, "Which person?");
      if (!amount || amount <= 0) throw new HttpError(400, "How much?");
      const { error } = await admin.from("hrms_loan").insert({
        employee_id, amount,
        kind: String(body.kind || "Loan"),
        reason: String(body.reason || "").trim() || null,
        months: Number(body.months) || null,
        from_month: String(body.from_month || "").trim() || null,
        requested_by: stamp, status: "Requested", updated_at: now,
      });
      if (error) {
        if (/hrms_loan|schema cache|does not exist/i.test(error.message))
          throw new HttpError(503, "Run migration 0064 first — a loan request has nowhere to live yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    if (!owner) throw new HttpError(403, `Only ${RAGHU_EMAIL} may decide anything on this desk.`);

    if (action === "salary-approve") {
      let q = admin.from("hrms_appraisal")
        .update({ pending_since: null, pending_by: null, approved_at: now, approved_by: stamp })
        .eq("cycle", CYCLE).not("pending_since", "is", null);
      if (!body.all) {
        const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter(Boolean);
        if (!ids.length) throw new HttpError(400, "Nothing was ticked.");
        q = q.in("employee_id", ids);
      }
      const { data, error } = await q.select("employee_id");
      if (error) {
        if (/pending_since|schema cache/i.test(error.message)) throw new HttpError(503, "Run migration 0063 first.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true, n: (data || []).length });
    }

    if (action === "loan-decide") {
      const decision = String(body.decision) === "Declined" ? "Declined" : "Approved";
      let q = admin.from("hrms_loan")
        .update({ status: decision, decided_by: stamp, decided_at: now, decision_note: String(body.note || "").trim() || null, updated_at: now })
        .eq("status", "Requested");
      if (!body.all) {
        const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter(Boolean);
        if (!ids.length) throw new HttpError(400, "Nothing was ticked.");
        q = q.in("id", ids);
      }
      const { data, error } = await q.select("id");
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, n: (data || []).length, decision });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}
