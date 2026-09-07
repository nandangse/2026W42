import { NextResponse } from "next/server";
import { requireHrms, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { people } from "@/lib/hrms-wa";
import { slipsFromRegister, type Slip } from "@/lib/salary-slip";
import { slipHtml } from "@/lib/slip-html";
import { pressPdf } from "@/lib/pdf-press";
import { MONTHS } from "@/lib/salary-sheet";
import { crmDb } from "@/crm/db";
import { myMailbox, mailboxByAddress, accessTokenFor, gmailSendMixed } from "@/crm/gmail";
import { swallow } from "@/lib/swallow";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * EACH PERSON THEIR OWN SLIP (Dr Raghu, 7 Sep 2026: "we need to now have a
 * separate mail to send to attach individual salary slips to the mail to
 * their personal mail id").
 *
 * Different in kind from the mass mail, where one attachment goes to
 * everybody: here every mail carries a different PDF, and it must be the
 * right one. So the address is the PERSONAL one and nothing else — never the
 * work mailbox, which five or six people share — and a person with no
 * personal address is named rather than sent to a shared box.
 *
 * The PDF is the same A5 slip the screen prints, pressed through the same
 * serverless Chromium the quotes use, so the paper and the attachment cannot
 * drift apart.
 */
const PER_CALL = 8;                      // a slip is a browser page; eight is a comfortable minute
const ok = (x: unknown) => { const s = String(x || "").trim(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s.toLowerCase() : ""; };

async function sender(from: string) {
  const e = from.toLowerCase();
  const box = (await mailboxByAddress(e)) || (await (async () => {
    const { data: rp } = await crmDb().from("profile").select("id").eq("email", e).maybeSingle();
    return rp?.id ? await myMailbox(String(rp.id)) : null;
  })());
  if (!box) throw new HttpError(503, `${e} has no Gmail connected in Genie yet.`);
  return { token: await accessTokenFor(String(box.id)), fromEmail: String(box.email_address) };
}

/** The month's slips, and who can actually be sent one. */
async function load(sheetId: string) {
  const admin = adminClient();
  const { data: sheet } = await admin.from("hrms_salary_sheet")
    .select("id, month, year, status, rows").eq("id", sheetId).maybeSingle();
  if (!sheet) throw new HttpError(404, "No such month.");
  const rows = (sheet.rows || []) as Record<string, unknown>[];
  if (!rows.length) throw new HttpError(400, "That month has no register yet.");
  const ppl = await people(admin, rows.map((r) => String(r.employee_id)));
  const by = new Map(ppl.map((p) => [p.id, p]));
  const days = new Date(Date.UTC(Number(sheet.year), Number(sheet.month), 0)).getUTCDate();
  const slips = slipsFromRegister(rows as never[], (id) => (by.get(id)?.value || {}) as Record<string, string | null>, days);

  /**
   * AN ADDRESS TWO PEOPLE SHARE IS NOT A PERSONAL ADDRESS (found 7 Sep 2026,
   * checking the August register before the first send).
   *
   * Three men — 6608 Tushar Giri, 6864 Pappu Lal, 6993 Sunil Gayakwad — carry
   * hr@nandan.co.in in the Personal Mail ID column. Sending to it would put
   * three payslips in the shared HR mailbox, which is the precise thing the
   * personal-only rule exists to stop; the field being called "personal" does
   * not make it so.
   *
   * The test is SHARED, not company-domain: raghu@nandan.co.in is on the
   * company domain and belongs to one man, and there is no reason to refuse
   * him his own slip.
   */
  const times = new Map<string, number>();
  for (const s of slips) {
    const e = ok(by.get(s.id)?.value?.personal_email);
    if (e) times.set(e, (times.get(e) || 0) + 1);
  }
  const shared = new Set([...times.entries()].filter(([, n]) => n > 1).map(([e]) => e));
  const addressOf = (id: string) => {
    const e = ok(by.get(id)?.value?.personal_email);
    return e && !shared.has(e) ? e : "";
  };
  return { sheet, slips, by, addressOf, shared };
}

export async function GET(req: Request) {
  try {
    await requireHrms();
    const id = new URL(req.url).searchParams.get("sheet");
    if (!id) throw new HttpError(400, "which month?");
    const { sheet, slips, by, addressOf, shared } = await load(id);
    const rows = slips.map((s: Slip) => {
      const p = by.get(s.id);
      const raw = ok(p?.value?.personal_email);
      return { id: s.id, name: s.name, net: s.net, personal: addressOf(s.id), type: p?.type || null,
        why: addressOf(s.id) ? "" : raw ? `${raw} is shared by more than one person` : "no personal e-mail on record" };
    });
    void shared;
    return NextResponse.json({
      month: sheet.month, year: sheet.year, status: sheet.status,
      total: rows.length, withPersonal: rows.filter((r) => r.personal).length,
      rows,
    });
  } catch (e) { return errJson(e); }
}

/** POST { sheet, from, subject, body, offset?, ids? } — one mail, one slip, each. */
export async function POST(req: Request) {
  try {
    const u = await requireHrms();
    const b = await readBody(req, { sheet: "string", from: "string?", subject: "string?", body: "string?" });
    const { sheet, slips, by, addressOf } = await load(String(b.sheet));
    const period = `${MONTHS[Number(sheet.month) - 1]} ${sheet.year}`;
    const wanted = Array.isArray(b.ids) ? b.ids.map(String) : null;

    const sendable = slips
      .filter((s: Slip) => !wanted || wanted.includes(s.id))
      .map((s: Slip) => ({ s, to: addressOf(s.id) }))
      .filter((x) => x.to);
    const noPersonal = slips
      .filter((s: Slip) => !addressOf(s.id))
      .map((s: Slip) => {
        const raw = ok(by.get(s.id)?.value?.personal_email);
        return { id: s.id, name: s.name, why: raw ? `${raw} is shared` : "no personal e-mail" };
      });

    if (b.action === "preview")
      return NextResponse.json({ ok: true, count: sendable.length, noPersonal, period, sample: sendable.slice(0, 3).map((x) => ({ name: x.s.name, to: x.to })) });

    if (!u.isOwner && !/^(vinaym|hr)@nandan\.co\.in$/.test(u.email.toLowerCase()))
      throw new HttpError(403, "Slips go out from Dr Raghu or HR.");
    const { token, fromEmail } = await sender(String(b.from || "hr@nandan.co.in"));
    const offset = Math.max(0, Number(b.offset) || 0);
    const slice = sendable.slice(offset, offset + PER_CALL);

    let sent = 0; const failed: { id: string; name: string; why: string }[] = [];
    for (const { s, to } of slice) {
      try {
        const pdf = await pressPdf(slipHtml(s, Number(sheet.month), Number(sheet.year), { draft: sheet.status !== "Frozen" }));
        const subject = String(b.subject || `Your salary slip for ${period}`).replace(/\{\{\s*month\s*\}\}/gi, period);
        const html = String(b.body || "")
          .replace(/\{\{\s*first_name\s*\}\}/gi, String(s.name || "").split(/\s+/)[0])
          .replace(/\{\{\s*name\s*\}\}/gi, String(s.name || ""))
          .replace(/\{\{\s*month\s*\}\}/gi, period);
        const id = await gmailSendMixed(token, fromEmail, to, subject, html,
          [{ name: `${period} - ${s.id} - ${s.name}.pdf`, mime: "application/pdf", base64: pdf.toString("base64") }],
          undefined, undefined, "Nandan GSE HR", "hr@nandan.co.in");
        sent++;
        await adminClient().from("hrms_communication").insert({
          employee_id: s.id, channel: "email", direction: "out", to_address: to,
          subject, body: html, status: "sent", sent_by: `${u.email} · from ${fromEmail}`,
          sent_at: new Date().toISOString(), external_id: id,
          meta: { slip: true, month: sheet.month, year: sheet.year },
        }).then(() => null, (e) => swallow("slip-mail ledger", e));
      } catch (e) {
        failed.push({ id: s.id, name: s.name, why: (e instanceof Error ? e.message : String(e)).slice(0, 200) });
      }
    }
    const done = offset + slice.length;
    return NextResponse.json({ ok: true, sent, failed, done, of: sendable.length, more: done < sendable.length, noPersonal });
  } catch (e) { return errJson(e); }
}
