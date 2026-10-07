import { NextResponse } from "next/server";
import { requireHrms, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { people, renderFor, type Sheet } from "@/lib/hrms-wa";
import { monthSlipPdfs } from "@/lib/slip-pack";
import { MONTHS } from "@/lib/hrms-template";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * PAYSLIPS ON WHATSAPP, FROM VINAY'S OWN NUMBER, THROUGH WHATSAPP WEB (Dr
 * Raghu, 7 Oct 2026): "Each one will be a message and open a new tab, just
 * attach the payslip to their WhatsApp number in that tab. Vinay then only
 * has to click on send on each. This will give it the human touch also. If
 * it's possible to also send, then send at the rate of 10 per minute … then
 * randomly increasing the send time."
 *
 * Genie opens WhatsApp Web's own click-to-chat for each person with the
 * message filled in; a small Chrome extension on Vinay's machine (the
 * "Genie WhatsApp helper", public/wa-genie) fetches that person's slip PDF
 * from here with a one-hour token, attaches it in the chat, and either waits
 * for his Send or presses it for him. Every send is written to the ledger so
 * nobody gets a slip twice.
 *
 * GET  ?sheet=<id>            who, their number, the message, token, status
 * GET  ?slip=<token>          that person's slip PDF (token-checked, no login — the extension fetches it)
 * POST { action: "opened"|"sent", token }      the extension or the screen reports
 */
import { makeToken, readToken as readTok } from "@/lib/wa-slip-token";
function readToken(t: string): { sheet: string; emp: string } {
  const r = readTok(t);
  if ("error" in r) throw new HttpError(401, r.error);
  return r;
}
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" };
export async function OPTIONS() { return new Response(null, { headers: CORS }); }

const DEFAULT_TEXT = "Dear {{first_name}},\n\nPlease find attached your salary slip for {{month}}.\n\nEMP. NO. {{employee_id}} · Net paid: Rs {{net}}\n\nIf anything in it needs a correction, reply here on WhatsApp or register a query at https://genie.nandan.co.in/hrms/query\n\nThank you!\nVinay · HR · Nandan GSE";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const slipTok = u.searchParams.get("slip");
    if (slipTok) {
      const { sheet, emp } = readToken(slipTok);
      const admin = adminClient();
      const { data: sh } = await admin.from("hrms_salary_sheet").select("month, year").eq("id", sheet).maybeSingle();
      if (!sh) throw new HttpError(404, "No such month.");
      const pack = await monthSlipPdfs(admin, [emp], Number(sh.month), Number(sh.year));
      const s = pack.slips.get(emp);
      if (!s || !s.base64) throw new HttpError(404, "No slip for this person this month.");
      return new Response(Buffer.from(s.base64, "base64"), { headers: { ...CORS, "content-type": "application/pdf", "content-disposition": `inline; filename="${s.fileName.replace(/[^\x20-\x7E]/g, "_")}"`, "x-genie-slip-name": encodeURIComponent(s.fileName) } });
    }
    await requireHrms();
    const sheetId = String(u.searchParams.get("sheet") || "");
    if (!sheetId) throw new HttpError(400, "Which month?");
    const admin = adminClient();
    const { data: sheet } = await admin.from("hrms_salary_sheet").select("id, month, year, status, rows, muster").eq("id", sheetId).maybeSingle();
    if (!sheet) throw new HttpError(404, "No such month.");
    const rows = (sheet.rows || []) as { employee_id: string; name: string; hold?: boolean; net?: number; to_pay?: number }[];
    const ppl = await people(admin, rows.map((r) => String(r.employee_id)));
    const by = new Map(ppl.map((p) => [p.id, p]));
    const { data: t } = await admin.from("hrms_text_master").select("body").eq("key", "salary_slip_whatsapp").maybeSingle();
    const template = String(t?.body || DEFAULT_TEXT);
    const period = `${MONTHS[Number(sheet.month) - 1]} ${sheet.year}`;
    // what already went this month over WhatsApp
    const { data: done } = await admin.from("hrms_communication").select("employee_id, status, sent_at, meta").eq("channel", "whatsapp").eq("direction", "out");
    const sentAt = new Map<string, string>(), openedAt = new Map<string, string>();
    for (const r of (done || []) as { employee_id: string; status: string; sent_at: string; meta: Record<string, unknown> | null }[]) {
      const m = r.meta || {};
      if (m.wa_slip && Number(m.month) === Number(sheet.month) && Number(m.year) === Number(sheet.year)) {
        if (r.status === "sent") sentAt.set(String(r.employee_id), r.sent_at);
        else if (r.status === "opened") openedAt.set(String(r.employee_id), r.sent_at);
      }
    }
    const list = rows.map((r) => {
      const p = by.get(String(r.employee_id));
      const extra = { net: Math.round(Number(r.to_pay ?? r.net) || 0).toLocaleString("en-IN"), month: period };
      const rendered = p ? renderFor(p, template, sheet as unknown as Sheet, extra) : null;
      const phone = rendered?.phone || "";
      return {
        id: String(r.employee_id), name: r.name, hold: !!r.hold, phone, text: rendered?.text || "",
        why: r.hold ? "on hold — no slip" : !phone || phone.length < 10 ? "no personal mobile on the record" : "",
        sent_at: sentAt.get(String(r.employee_id)) || null, opened_at: openedAt.get(String(r.employee_id)) || null,
        token: makeToken(sheetId, String(r.employee_id)),
      };
    });
    return NextResponse.json({ ok: true, period, month: sheet.month, year: sheet.year, status: sheet.status, template, list, api: u.origin });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { throw new HttpError(400, "Not JSON."); }
    const action = String(body.action || "");
    const { sheet, emp } = readToken(String(body.token || ""));
    const admin = adminClient();
    const { data: sh } = await admin.from("hrms_salary_sheet").select("month, year").eq("id", sheet).maybeSingle();
    if (!sh) throw new HttpError(404, "No such month.");
    const now = new Date().toISOString();
    if (action === "opened" || action === "sent") {
      const [p] = await people(admin, [emp]);
      await admin.from("hrms_communication").insert({
        employee_id: emp, channel: "whatsapp", direction: "out", to_address: p?.phone || null,
        subject: `Salary slip — ${MONTHS[Number(sh.month) - 1]} ${sh.year}`, body: String(body.text || "").slice(0, 2000) || null,
        status: action, sent_by: String(body.by || "Vinay · WhatsApp Web (Genie helper)"), sent_at: now,
        meta: { wa_slip: true, month: sh.month, year: sh.year, via: "whatsapp-web", auto: !!body.auto },
      });
      return NextResponse.json({ ok: true }, { headers: CORS });
    }
    throw new HttpError(400, "Which action?");
  } catch (e) { const r = errJson(e); return new Response(r.body, { status: r.status, headers: { ...Object.fromEntries(r.headers), ...CORS } }); }
}
