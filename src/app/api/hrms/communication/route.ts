import { NextResponse } from "next/server";
import { requireHrms, errJson, HttpError, RAGHU_EMAIL } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { ALL_FIELDS, fieldSpec, hrmsTables, type FieldSpec } from "@/lib/hrms";
import { employeeVars, renderTemplate } from "@/lib/hrms-template";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * The record's Communication tab (Dr Raghu, 4 Sep 2026).
 *
 * GET  ?id=<employee>                      one person's messages, newest first
 * POST { employee_ids, subject, body, to: "personal"|"work", template_key?,
 *        preview?: true, log_only?: true }
 *
 * The body is a template: {{name}}, {{designation}} and the rest are filled
 * from each person's record before the mail goes. preview renders without
 * sending. Sending goes out from Raghu's own Gmail (the CRM's connected
 * mailbox) with his name on it -- so the sender is Raghu alone; anyone with
 * HRMS may preview, or log a message that went by another route.
 *
 * Every send, good or bad, lands in hrms_communication: the tab shows what
 * was said and what the mail server answered, never a cheerful "sent".
 */
interface EmpRow {
  id: string; name: string; email: string | null; dob: string | null; doj: string | null;
  department: string | null; designation: string | null; location: string | null; active: boolean;
  extra: Record<string, string> | null;
}
function baseValue(row: EmpRow, f: FieldSpec): string | null {
  if (f.column) {
    if (f.column === "active") return row.active ? "yes" : "no";
    const v = (row as unknown as Record<string, unknown>)[f.column];
    return v == null || v === "" ? null : String(v);
  }
  if (f.sheetHeader) {
    const v = (row.extra || {})[f.sheetHeader];
    return v == null || String(v).trim() === "" ? null : String(v);
  }
  return null;
}

const textToHtml = (t: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#22303C">${
    String(t).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("")}</div>`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET(req: Request) {
  try {
    await requireHrms();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "id required");
    const { data, error } = await adminClient().from("hrms_communication")
      .select("id, channel, to_address, subject, body, template_key, status, error, sent_by, sent_at")
      .eq("employee_id", id).order("sent_at", { ascending: false }).limit(200);
    if (error) {
      if (/hrms_communication|schema cache|does not exist/i.test(error.message))
        return NextResponse.json({ rows: [], needsMigration: true });
      throw new Error(error.message);
    }
    return NextResponse.json({ rows: data || [] });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await requireHrms();
    const admin = adminClient();
    const body = await req.json();
    const ids: string[] = Array.isArray(body.employee_ids) ? body.employee_ids.map(String) : body.employee_id ? [String(body.employee_id)] : [];
    if (!ids.length) throw new HttpError(400, "Who is this for?");
    const subjectT = String(body.subject || "").slice(0, 300);
    const bodyT = String(body.body || "").slice(0, 20000);
    const toKind = body.to === "work" ? "work" : "personal";
    const preview = !!body.preview;
    const logOnly = !!body.log_only;
    const isHtml = /<\/?(p|br|b|strong|i|em|ul|ol|li|div)\b/i.test(bodyT);
    if (!bodyT.trim()) throw new HttpError(400, "Nothing to say.");

    // the records, overrides applied — the same merge the directory does
    const T = await hrmsTables(admin);
    const { data: rows, error } = await admin.from(T.employees)
      .select("id, name, email, dob, doj, department, designation, location, active, extra").in("id", ids);
    if (error) throw new Error(error.message);
    const overrides = new Map<string, Map<string, string | null>>();
    try {
      const { data: eds } = await admin.from(T.edits).select("employee_id, field, value").in("employee_id", ids);
      for (const e of eds || []) {
        const k = String(e.employee_id);
        if (!overrides.has(k)) overrides.set(k, new Map());
        overrides.get(k)!.set(String(e.field), e.value == null ? null : String(e.value));
      }
    } catch { /* pre-0047 */ }

    const people = ((rows || []) as EmpRow[]).map((r) => {
      const value: Record<string, string | null> = {};
      for (const f of ALL_FIELDS) value[f.key] = baseValue(r, f);
      for (const [k, v] of overrides.get(r.id) || []) if (fieldSpec(k)) value[k] = v;
      const vars = employeeVars(value);
      const to = toKind === "work" ? (value.email || "") : (value.personal_email || "");
      return {
        id: r.id, name: r.name, to: String(to || "").trim(),
        subject: renderTemplate(subjectT, vars),
        body: renderTemplate(bodyT, vars),
      };
    });

    if (preview) return NextResponse.json({ people });

    // who may actually send: the owner, from his own Gmail
    let token = "", fromEmail = "";
    if (!logOnly) {
      if (me.email.toLowerCase() !== RAGHU_EMAIL) throw new HttpError(403, "Mail from HRMS goes out from Raghu's own Gmail — the owner sends. You can preview, or log a message sent another way.");
      const { crmDb } = await import("@/crm/db");
      const { data: rp } = await crmDb().from("profile").select("id").eq("email", RAGHU_EMAIL).maybeSingle();
      if (!rp?.id) throw new HttpError(503, "Raghu has no profile in the CRM to hang a mailbox on.");
      const { myMailbox, accessTokenFor } = await import("@/crm/gmail");
      const box = await myMailbox(String(rp.id));
      if (!box) throw new HttpError(503, "Raghu's Gmail is not connected in the CRM.");
      token = await accessTokenFor(String(box.id));
      fromEmail = String(box.email_address);
    }
    const { gmailSend } = await import("@/crm/gmail");
    const stamp = me.initials ? `${me.initials} · ${me.email}` : me.email;

    const results: { id: string; name: string; to: string; ok: boolean; error?: string }[] = [];
    for (const p of people) {
      let ok = false, err = "";
      if (logOnly) ok = true;
      else if (!p.to) err = `no ${toKind} email on the record`;
      else {
        try {
          await gmailSend(token, fromEmail, p.to, p.subject || "(no subject)", isHtml ? p.body : textToHtml(esc(p.body)), undefined, undefined, "Raghunandan Jagdish");
          ok = true;
        } catch (e) { err = e instanceof Error ? e.message : String(e); }
      }
      try {
        await admin.from("hrms_communication").insert({
          employee_id: p.id, channel: logOnly ? String(body.channel || "note") : "email", to_address: p.to || null,
          subject: p.subject || null, body: p.body, template_key: body.template_key ? String(body.template_key) : null,
          status: ok ? (logOnly ? "logged" : "sent") : "failed", error: err || null, sent_by: stamp,
        });
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        if (/hrms_communication|schema cache|does not exist/i.test(m)) err = err || "sent, but not logged — run migration 0129";
      }
      results.push({ id: p.id, name: p.name, to: p.to, ok, error: err || undefined });
    }
    return NextResponse.json({ ok: results.every((r) => r.ok), sent: results.filter((r) => r.ok).length, results });
  } catch (e) { return errJson(e); }
}
