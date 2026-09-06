import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { swallow } from "@/lib/swallow";
import { currentUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { hrmsTables, resolveHrmsAccess } from "@/lib/hrms";
import { formToText, type HrQueryForm } from "@/lib/hr-query-form";

export const dynamic = "force-dynamic";

/**
 * HR Queries — the "How can we help you?" form, and what came of it.
 *
 * ANY signed-in person may raise a query for THEMSELVES and read their own;
 * that is the whole point of the form. Anyone with HRMS may raise one for
 * someone else, see them all, reply and answer. Answering is HR's here —
 * these are HR's questions to close, unlike the salary queries put to RJ.
 *
 * GET            mine (everyone) · all (HRMS) · me: the record prefilled
 * GET ?people=1  the roll, for "HR query for others" (HRMS)
 * POST { action: "raise", for_self, employee_id?, form }
 * POST { action: "reply", id, text }
 * POST { action: "answer", id, answer }         HRMS
 * POST { action: "reopen", id }                 HRMS
 */
interface Emp { id: string; name: string; email: string | null; department: string | null; designation: string | null; active: boolean; extra: Record<string, string> | null }

/** The record behind this login — by work e-mail, or a "Genie user" edit. */
async function myRecord(email: string): Promise<Emp | null> {
  const admin = adminClient();
  const T = await hrmsTables(admin);
  const e = email.toLowerCase();
  const { data: byMail } = await admin.from(T.employees).select("id, name, email, department, designation, active, extra").ilike("email", e).limit(1);
  if (byMail && byMail[0]) return byMail[0] as Emp;
  try {
    const { data: ed } = await admin.from(T.edits).select("employee_id").eq("field", "user_email").ilike("value", e).limit(1);
    if (ed && ed[0]) {
      const { data: r } = await admin.from(T.employees).select("id, name, email, department, designation, active, extra").eq("id", String(ed[0].employee_id)).maybeSingle();
      return (r as Emp) || null;
    }
  } catch (e) { swallow("hrms/hr-query", e); /* pre-0047 */ }
  return null;
}
const contactOf = (r: Emp | null, email: string) => ({
  employee_id: r?.id || "", name: r?.name || "",
  mobile: (r?.extra || {})["PERSONAL Mobile No"] || "",
  personal_email: (r?.extra || {})["Personal Mail ID"] || "",
  stay_location: (r?.extra || {})["Stay Location"] || (r?.extra || {})["Current Address"] || "",
  work_email: r?.email || email,
});

export async function GET(req: Request) {
  try {
    const me = await currentUser();
    const admin = adminClient();
    const url = new URL(req.url);
    // "will this be visible open?" (Dr Raghu, 4 Sep 2026) — yes: without a
    // login the form is there to fill; the list of one's own queries needs one.
    if (!me || me.disabled) return NextResponse.json({ anon: true, hr: false, rows: [], me: contactOf(null, "") });
    const hr = await resolveHrmsAccess(admin, me.email, me.isOwner);

    if (url.searchParams.get("people")) {
      if (!hr) throw new HttpError(403, "HRMS only.");
      const T = await hrmsTables(admin);
      const { data } = await admin.from(T.employees).select("id, name, department, designation, active, email, extra").eq("active", true).order("name");
      return NextResponse.json({ people: (data || []).map((e) => ({ ...contactOf(e as Emp, ""), department: e.department, designation: e.designation })) });
    }

    const rec = await myRecord(me.email);
    // applications from the employee's own sheet (0142) sit beside the queries
    let q = admin.from("hrms_query").select("*").in("topic", ["HR Query", "Application"]).order("raised_at", { ascending: false }).limit(500);
    if (!hr) q = q.or(`raised_email.eq.${me.email.toLowerCase()}${rec ? `,employee_id.eq.${rec.id}` : ""}`);
    const { data, error } = await q;
    if (error) {
      if (/hrms_query|schema cache|does not exist/i.test(error.message)) return NextResponse.json({ rows: [], needsMigration: true, hr, me: contactOf(rec, me.email) });
      if (/raised_email|for_self|form/i.test(error.message)) return NextResponse.json({ rows: [], needsMigration: true, hr, me: contactOf(rec, me.email) });
      throw new Error(error.message);
    }
    const T = await hrmsTables(admin);
    const ids = [...new Set((data || []).map((r) => String(r.employee_id || "")).filter(Boolean))];
    const nameOf = new Map<string, string>();
    if (ids.length) {
      const { data: emps } = await admin.from(T.employees).select("id, name").in("id", ids);
      for (const e of emps || []) nameOf.set(String(e.id), String(e.name || e.id));
    }
    return NextResponse.json({
      hr, me: contactOf(rec, me.email),
      rows: (data || []).map((r) => ({
        id: String(r.id), employee_id: r.employee_id ? String(r.employee_id) : null,
        person: r.employee_id ? nameOf.get(String(r.employee_id)) || String(r.employee_id) : null,
        subject: String(r.subject), question: String(r.question), status: String(r.status || "Open"),
        thread: (r.thread || []) as { by: string; at: string; text: string }[],
        answer: (r.answer as string) ?? null, form: r.form ?? null, for_self: r.for_self !== false,
        raised_by: (r.raised_by as string) ?? null, raised_email: (r.raised_email as string) ?? null, raised_at: r.raised_at,
        answered_by: (r.answered_by as string) ?? null, answered_at: r.answered_at,
      })),
    });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await currentUser();
    const admin = adminClient();
    const hr = me ? await resolveHrmsAccess(admin, me.email, me.isOwner) : false;
    const body = await readBody(req, {});
    const action = String(body.action || "");
    const now = new Date().toISOString();

    if (action === "raise") {
      const forSelf = body.for_self !== false;
      if (!forSelf && !hr) throw new HttpError(403, "Only HRMS may raise a query for someone else.");
      // the open form: no login, the person is who the contact block says
      const anonEmail = String((body.form?.contact?.personal_email) || "").trim().toLowerCase();
      const stamp = me ? (me.initials ? `${me.initials} · ${me.email}` : me.email) : `open form · ${anonEmail || String(body.form?.contact?.mobile || "").trim() || "no contact"}`;
      const raisedEmail = me ? me.email.toLowerCase() : anonEmail || null;
      const form = (body.form || {}) as HrQueryForm;
      form.ticks = form.ticks || {}; form.other = form.other || {}; form.text = form.text || {};
      const given = (form.contact || {}) as Partial<HrQueryForm["contact"]>;
      form.contact = { employee_id: given.employee_id || "", name: given.name || "", mobile: given.mobile || "", personal_email: given.personal_email || "", stay_location: given.stay_location || "" };
      const rec = forSelf && me ? await myRecord(me.email) : null;
      const employeeId = String(body.employee_id || form.contact.employee_id || rec?.id || "").trim() || null;
      if (!form.contact.name.trim()) throw new HttpError(400, "Name is needed.");
      if (!form.contact.mobile.trim()) throw new HttpError(400, "Personal mobile is needed.");
      const { subject, question, count } = formToText(form);
      if (!count) throw new HttpError(400, "Tick at least one line, or write what the issue is.");
      const { error } = await admin.from("hrms_query").insert({
        employee_id: employeeId, subject, question, topic: "HR Query", status: "Open",
        raised_by: stamp, raised_email: raisedEmail, for_self: forSelf, form, updated_at: now,
      });
      if (error) {
        if (/hrms_query|schema cache|does not exist/i.test(error.message)) throw new HttpError(503, "Run migration 0065 first — a query has nowhere to live yet.");
        if (/raised_email|for_self|form/i.test(error.message)) throw new HttpError(503, "Run migration 0131 first — the form has nowhere to be kept yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true, subject });
    }

    if (!me) throw new HttpError(401, "Sign in for that.");
    const stamp = me.initials ? `${me.initials} · ${me.email}` : me.email;
    const id = String(body.id || "");
    if (!id) throw new HttpError(400, "id required");
    const { data: row } = await admin.from("hrms_query").select("id, thread, raised_email, employee_id").eq("id", id).maybeSingle();
    if (!row) throw new HttpError(404, "No such query.");
    if (!hr && String(row.raised_email || "").toLowerCase() !== me.email.toLowerCase()) throw new HttpError(403, "Not your query.");

    if (action === "reply") {
      const text = String(body.text || "").trim();
      if (!text) throw new HttpError(400, "The reply is empty.");
      const thread = [...((row.thread || []) as unknown[]), { by: stamp, at: now, text }];
      const { error } = await admin.from("hrms_query").update({ thread, updated_at: now }).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    if (action === "answer") {
      if (!hr) throw new HttpError(403, "HR answers and closes a query.");
      const answer = String(body.answer || "").trim();
      if (!answer) throw new HttpError(400, "The answer is empty.");
      const { error } = await admin.from("hrms_query").update({ answer, status: "Answered", answered_by: stamp, answered_at: now, updated_at: now }).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    if (action === "reopen") {
      if (!hr) throw new HttpError(403, "HR reopens a query.");
      const { error } = await admin.from("hrms_query").update({ status: "Open", answered_at: null, answered_by: null, updated_at: now }).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "unknown action");
  } catch (e) { return errJson(e); }
}
