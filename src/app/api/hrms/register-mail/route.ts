import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { requireHrms, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { MONTHS } from "@/lib/hrms-template";
import { pressPdf } from "@/lib/pdf-press";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * FINALISE FROZEN SHEET TO MANAGEMENT (Dr Raghu, 7 Oct 2026): "Vinay gets an
 * email to send to jc.kumar@, raghu@, tushar@, cc HR … mailed from the system
 * as before, with the PDF of this document attached … the covering letter
 * should say: this is to confirm that the following MIS is generated from
 * the payroll of the month … number of employees, total payment made … given
 * to accounts and confirmed dispatched … salary slips e-mailed, WhatsApp in
 * due course … same day … any more report, any suggestion, execute through
 * Raghu sir in Genie."
 *
 * GET  ?id=<run>            the drafted mail and the figures
 * POST { id, to, cc, subject, body }   presses the register page to PDF,
 *                           sends it from HR's mailbox, notes it on the run
 */
const TO = "jc.kumar@nandan.co.in; raghu@nandan.co.in; tushar@nandan.co.in";
const CC = "hr@nandan.co.in";
const inr = (n: number) => Math.round(n).toLocaleString("en-IN");

async function draftFor(admin: ReturnType<typeof adminClient>, id: string) {
  const { data: r } = await admin.from("hrms_salary_sheet").select("id, month, year, status, approved_at, rows, mapping").eq("id", id).maybeSingle();
  if (!r) throw new HttpError(404, "No such payroll run.");
  const rows = (r.rows ?? []) as { to_pay?: number; hold?: boolean }[];
  const month = Number(r.month), year = Number(r.year), label = `${MONTHS[month - 1]} ${year}`;
  const paid = rows.filter((x) => Number(x.to_pay) > 0).length, held = rows.filter((x) => x.hold).length;
  const total = rows.reduce((a, x) => a + (Number(x.to_pay) || 0), 0);
  const body = [
    "Dear Sir,",
    "",
    `This is to confirm that the following MIS is generated from the payroll of ${label}, and the details are as below:`,
    "",
    `Number of employees: ${rows.length}${held ? ` (${paid} paid, ${held} on hold)` : ""}`,
    `Total payment made: Rs ${inr(total)}`,
    "",
    "This payment has been given to Accounts, and Accounts have confirmed that the same has been dispatched. The salary slips have been e-mailed to all the employees; we will also WhatsApp them in due course.",
    "",
    "This process shall follow such that on the same day we send this across to you. If there is any more report that needs to be added, please let us know. If there is anything you can suggest, do let us know so that I can execute it through Raghu Sir in Genie.",
    "",
    "The salary register, with the three-month Salary MIS and the rules it was computed under, is attached.",
    "",
    "Thanks",
    "Vinay",
  ].join("\n");
  return { r, label, rows: rows.length, paid, held, total, to: TO, cc: CC, subject: `Salary MIS — ${label} — finalised`, body, pdfName: `Salary Register ${label}.pdf` };
}

export async function GET(req: Request) {
  try {
    await requireHrms();
    const id = String(new URL(req.url).searchParams.get("id") || "");
    if (!id) throw new HttpError(400, "Which run?");
    const d = await draftFor(adminClient(), id);
    return NextResponse.json({ ok: true, to: d.to, cc: d.cc, subject: d.subject, body: d.body, employees: d.rows, paid: d.paid, held: d.held, total: d.total, pdfName: d.pdfName, approved: !!d.r.approved_at });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await requireHrms();
    const admin = adminClient();
    const body = await readBody(req, {});
    const id = String(body.id || "");
    if (!id) throw new HttpError(400, "Which run?");
    const d = await draftFor(admin, id);
    if (!d.r.approved_at) throw new HttpError(409, "Approve the run first — the sheet goes to management once it is frozen and approved.");
    const stamp = me.initials ? `${me.initials} · ${me.email}` : me.email;
    const now = new Date().toISOString();
    // the register page itself, as the signed-in user sees it, pressed to PDF (A4 landscape by its own @page rule)
    const pageUrl = new URL(`/hrms/salary-register/${encodeURIComponent(id)}/print`, req.url);
    const htmlRes = await fetch(pageUrl, { headers: { cookie: req.headers.get("cookie") || "" } });
    if (!htmlRes.ok) throw new HttpError(502, "Could not render the salary register page.");
    const html = await htmlRes.text();
    const pdf = await pressPdf(html, { landscape: true });
    const to = String(body.to || d.to).split(/[;,]/).map((s) => s.trim()).filter(Boolean).join(", ");
    const cc = String(body.cc ?? d.cc).split(/[;,]/).map((s) => s.trim()).filter(Boolean).join(", ");
    const subject = String(body.subject || d.subject);
    const text = String(body.body || d.body);
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
    const htmlBody = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1F2328;line-height:1.5;white-space:pre-wrap">${esc(text)}</div>`;
    const { hrmsSender } = await import("@/lib/hrms-mail-from");
    const { gmailSendMixed } = await import("@/crm/gmail");
    const snd = await hrmsSender({ email: me.email });
    await gmailSendMixed(snd.token, snd.fromEmail, to, subject, htmlBody, [{ name: d.pdfName, mime: "application/pdf", base64: Buffer.from(pdf).toString("base64") }], cc || undefined, undefined, snd.fromName);
    const mapping = { ...((d.r.mapping as Record<string, unknown> | null) ?? {}), management_mail: { at: now, by: stamp, to, cc } };
    await admin.from("hrms_salary_sheet").update({ mapping, updated_at: now }).eq("id", id);
    return NextResponse.json({ ok: true, to, cc, from: snd.fromEmail, note: snd.note, pages: pdf.byteLength });
  } catch (e) { return errJson(e); }
}
