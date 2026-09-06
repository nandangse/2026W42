import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { requireHrms, errJson, HttpError, RAGHU_EMAIL } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { hrmsTables } from "@/lib/hrms";

export const dynamic = "force-dynamic";

/**
 * RJ Approval - Salary Queries — where HR puts a question to the owner.
 *
 * A question is not a ticket. HR raises it, the two of them talk it through
 * in the thread, and it ends in an ANSWER that is kept. Six months later the
 * question asked of this screen is never "what did we decide" on its own —
 * it is "what did we decide, and why", which is why the discussion is stored
 * rather than just its conclusion.
 *
 * HR may raise and may reply. Only the owner may ANSWER, because answering
 * is what closes it.
 */
export async function GET() {
  try {
    await requireHrms();
    const admin = adminClient();
    const T = await hrmsTables(admin);
    const { data, error } = await admin
      .from("hrms_query").select("*").order("raised_at", { ascending: false }).limit(400);
    if (error) {
      if (/hrms_query|schema cache|does not exist/i.test(error.message))
        return NextResponse.json({ rows: [], needsMigration: true });
      throw new Error(error.message);
    }
    const ids = [...new Set((data || []).map((r) => String(r.employee_id || "")).filter(Boolean))];
    const nameOf = new Map<string, string>();
    if (ids.length) {
      const { data: emps } = await admin.from(T.employees).select("id, name").in("id", ids);
      for (const e of emps || []) nameOf.set(String(e.id), String(e.name || e.id));
    }
    return NextResponse.json({
      rows: (data || []).map((r) => ({
        id: String(r.id),
        employee_id: r.employee_id ? String(r.employee_id) : null,
        person: r.employee_id ? nameOf.get(String(r.employee_id)) || String(r.employee_id) : null,
        subject: String(r.subject), question: String(r.question),
        topic: String(r.topic || "Salary"), status: String(r.status || "Open"),
        thread: (r.thread || []) as { by: string; at: string; text: string }[],
        answer: (r.answer as string) ?? null,
        raised_by: (r.raised_by as string) ?? null, raised_at: r.raised_at,
        answered_by: (r.answered_by as string) ?? null, answered_at: r.answered_at,
      })),
    });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireHrms();
    const admin = adminClient();
    const body = await readBody(req, {});
    const action = String(body.action || "");
    const stamp = me.initials ? `${me.initials} · ${me.email}` : me.email;
    const owner = me.email.toLowerCase() === RAGHU_EMAIL;
    const now = new Date().toISOString();

    /** HR raises the question. */
    if (action === "raise") {
      const subject = String(body.subject || "").trim();
      const question = String(body.question || "").trim();
      if (!subject) throw new HttpError(400, "Give it a subject — it is the line that gets read first.");
      if (!question) throw new HttpError(400, "The question itself is empty.");
      const { error } = await admin.from("hrms_query").insert({
        employee_id: String(body.employee_id || "").trim() || null,
        subject, question,
        topic: String(body.topic || "Salary"),
        raised_by: stamp, status: "Open", updated_at: now,
      });
      if (error) {
        if (/hrms_query|schema cache|does not exist/i.test(error.message))
          throw new HttpError(503, "Run migration 0065 first — a query has nowhere to live yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    /** Either side may add to the discussion. */
    if (action === "reply") {
      const text = String(body.text || "").trim();
      if (!text) throw new HttpError(400, "The reply is empty.");
      const { data: row, error: readErr } = await admin
        .from("hrms_query").select("thread").eq("id", String(body.id)).maybeSingle();
      if (readErr) throw new Error(readErr.message);
      if (!row) throw new HttpError(404, "No such query.");
      const thread = [...((row.thread || []) as unknown[]), { by: stamp, at: now, text }];
      const { error } = await admin.from("hrms_query").update({ thread, updated_at: now }).eq("id", String(body.id));
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    /** Answering is what closes it, so answering is the owner's. */
    if (action === "answer") {
      if (!owner) throw new HttpError(403, `Only ${RAGHU_EMAIL} may answer and close a query.`);
      const answer = String(body.answer || "").trim();
      if (!answer) throw new HttpError(400, "The answer is empty.");
      const { error } = await admin.from("hrms_query")
        .update({ answer, status: "Answered", answered_by: stamp, answered_at: now, updated_at: now })
        .eq("id", String(body.id));
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    /** Reopening, when the answer turned out not to settle it. */
    if (action === "reopen") {
      if (!owner) throw new HttpError(403, `Only ${RAGHU_EMAIL} may reopen a query.`);
      const { error } = await admin.from("hrms_query")
        .update({ status: "Open", answered_at: null, answered_by: null, updated_at: now })
        .eq("id", String(body.id));
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}
