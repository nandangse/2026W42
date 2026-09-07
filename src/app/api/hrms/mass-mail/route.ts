import { NextResponse } from "next/server";
import { requireHrms, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { people, type Person } from "@/lib/hrms-wa";
import { employeeVars, renderTemplate } from "@/lib/hrms-template";
import { ALL_FIELDS } from "@/lib/hrms";
import { crmDb } from "@/crm/db";
import { myMailbox, accessTokenFor, gmailSend, gmailSendMixed } from "@/crm/gmail";
import { swallow } from "@/lib/swallow";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * MASS EMAIL FROM HRMS (Dr Raghu, 7 Sep 2026): "here make a button — Send
 * mass email, template choice, from mail id hr@nandan.co.in /
 * raghu@nandan.co.in, choose the OAuth of that for sending, variables to add
 * on right side, attachment, send."
 *
 * The mail goes from the chosen address's own connected Gmail, so it lands
 * in that mailbox's Sent and answers come back to it. Every one is written
 * into the communications ledger, so the same lines appear on the person's
 * record and on this page.
 */
const FROM_ALLOWED = ["hr@nandan.co.in", "raghu@nandan.co.in"];
const MAX_PER_CALL = 40;
const MAX_ATTACH = 8 * 1024 * 1024;

const addressOf = (p: Person) => {
  const v = p.value || {};
  const pick = [v.user_email, v.email, v.personal_email].map((x) => String(x || "").trim()).find((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
  return pick ? pick.toLowerCase() : "";
};

async function senderFor(email: string) {
  const e = email.toLowerCase();
  if (!FROM_ALLOWED.includes(e)) throw new HttpError(400, `Mail can go from ${FROM_ALLOWED.join(" or ")} — not ${e}.`);
  const { data: rp } = await crmDb().from("profile").select("id").eq("email", e).maybeSingle();
  const box = rp?.id ? await myMailbox(String(rp.id)) : null;
  if (!box) throw new HttpError(503, `${e} has no Gmail connected in Genie yet — open that account and use Connect Gmail.`);
  return { token: await accessTokenFor(String(box.id)), fromEmail: String(box.email_address) };
}

/** GET — who it can go from, what templates exist, which variables fill, and the audience. */
export async function GET() {
  try {
    await requireHrms();
    const admin = adminClient();
    const all = await people(admin);
    const froms: { email: string; connected: boolean }[] = [];
    for (const e of FROM_ALLOWED) {
      let connected = false;
      try { const { data: rp } = await crmDb().from("profile").select("id").eq("email", e).maybeSingle(); connected = !!(rp?.id && (await myMailbox(String(rp.id)))); }
      catch (err) { swallow("hrms/mass-mail", err); }
      froms.push({ email: e, connected });
    }
    let templates: { key: string; title: string; body: string }[] = [];
    try {
      const { data } = await admin.from("hrms_text_master").select("key, title, body").order("title");
      templates = (data || []) as typeof templates;
    } catch (e) { swallow("hrms/mass-mail", e); }
    const variables = [
      { key: "first_name", label: "First name" }, { key: "name", label: "Full name" },
      { key: "employee_id", label: "Employee ID" }, { key: "today", label: "Today's date" }, { key: "cycle", label: "Appraisal cycle" },
      ...ALL_FIELDS.filter((f) => !f.derived).map((f) => ({ key: f.key, label: f.label })),
    ];
    const seen = new Set<string>();
    const vars = variables.filter((v) => (seen.has(v.key) ? false : (seen.add(v.key), true)));
    return NextResponse.json({
      froms, templates, variables: vars,
      types: [...new Set(all.map((p) => p.type).filter(Boolean))].sort(),
      departments: [...new Set(all.map((p) => p.department).filter(Boolean))].sort(),
      total: all.length, withEmail: all.filter((p) => addressOf(p)).length,
    });
  } catch (e) {
    return errJson(e);
  }
}

const pick = (all: Person[], b: { types?: string[]; departments?: string[]; ids?: string[] }) => {
  let out = all;
  if (b.ids?.length) return all.filter((p) => b.ids!.includes(p.id));
  if (b.types?.length) out = out.filter((p) => b.types!.includes(p.type));
  if (b.departments?.length) out = out.filter((p) => p.department && b.departments!.includes(p.department));
  return out;
};

/**
 * POST { action: "preview" | "send", from, subject, body, types?, departments?, ids?,
 *        attachments?: [{ name, mime, base64 }], offset? }
 */
export async function POST(req: Request) {
  try {
    const u = await requireHrms();
    const b = await readBody(req, { action: "string", from: "string?", subject: "string?", body: "string?" });
    const admin = adminClient();
    const all = await people(admin);
    const chosen = pick(all, b as { types?: string[]; departments?: string[]; ids?: string[] });
    const subject = String(b.subject || "").trim();
    const body = String(b.body || "");

    const rendered = chosen.map((p) => {
      const vars = employeeVars(p.value, { employee_id: p.id });
      const to = addressOf(p);
      const s = renderTemplate(subject, vars);
      const h = renderTemplate(body, vars);
      const missing = [...new Set([...`${subject} ${body}`.matchAll(/\{\{\s*([a-zA-Z_]\w*)\s*\}\}/g)].map((m) => m[1])
        .filter((k) => { const lk = k.toLowerCase().replace(/[^a-z0-9]/g, ""); const hit = Object.entries(vars).find(([vk]) => vk.toLowerCase().replace(/[^a-z0-9]/g, "") === lk); return !hit || !hit[1]; }))];
      return { id: p.id, name: p.name, type: p.type, department: p.department, to, subject: s, html: h, missing };
    });
    const sendable = rendered.filter((r) => r.to);
    const noEmail = rendered.filter((r) => !r.to).map((r) => ({ id: r.id, name: r.name }));

    if (b.action === "preview") {
      return NextResponse.json({
        ok: true, count: sendable.length, noEmail,
        missing: [...new Set(sendable.flatMap((r) => r.missing))],
        sample: sendable.slice(0, 3).map((r) => ({ name: r.name, to: r.to, subject: r.subject, html: r.html })),
        list: sendable.map((r) => ({ id: r.id, name: r.name, to: r.to, missing: r.missing.length })),
      });
    }

    if (b.action === "send") {
      if (!u.isOwner && u.email.toLowerCase() !== "vinaym@nandan.co.in" && u.email.toLowerCase() !== "hr@nandan.co.in")
        throw new HttpError(403, "Mass mail goes out from Dr Raghu or HR.");
      if (!subject) throw new HttpError(400, "The mail needs a subject.");
      if (!body.trim()) throw new HttpError(400, "The mail is empty.");
      const { token, fromEmail } = await senderFor(String(b.from || ""));
      const atts = (Array.isArray(b.attachments) ? b.attachments : []) as { name: string; mime: string; base64: string }[];
      if (atts.reduce((a, x) => a + (x.base64 || "").length * 0.75, 0) > MAX_ATTACH) throw new HttpError(400, "The attachments come to more than 8 MB together.");

      const offset = Math.max(0, Number(b.offset) || 0);
      const slice = sendable.slice(offset, offset + MAX_PER_CALL);
      let sent = 0; const failed: { id: string; name: string; why: string }[] = [];
      for (const r of slice) {
        try {
          const id = atts.length
            ? await gmailSendMixed(token, fromEmail, r.to, r.subject, r.html, atts, undefined, undefined, "Nandan GSE HR")
            : await gmailSend(token, fromEmail, r.to, r.subject, r.html, undefined, undefined, "Nandan GSE HR");
          sent++;
          await admin.from("hrms_communication").insert({
            employee_id: r.id, channel: "email", direction: "out", to_address: r.to,
            subject: r.subject, body: r.html, template_key: b.template_key || null,
            status: "sent", sent_by: `${u.email} · from ${fromEmail}`, sent_at: new Date().toISOString(),
            external_id: id, meta: { mass: true, attachments: atts.map((a) => a.name) },
          }).then(() => null, (e2) => swallow("hrms/mass-mail ledger", e2));
        } catch (e) {
          const why = e instanceof Error ? e.message : String(e);
          failed.push({ id: r.id, name: r.name, why: why.slice(0, 200) });
          await admin.from("hrms_communication").insert({
            employee_id: r.id, channel: "email", direction: "out", to_address: r.to,
            subject: r.subject, body: r.html, status: "failed", error: why.slice(0, 400),
            sent_by: `${u.email} · from ${fromEmail}`, sent_at: new Date().toISOString(), meta: { mass: true },
          }).then(() => null, (e2) => swallow("hrms/mass-mail ledger", e2));
        }
      }
      const done = offset + slice.length;
      return NextResponse.json({ ok: true, sent, failed, done, of: sendable.length, more: done < sendable.length });
    }

    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}
