import { NextResponse } from "next/server";
import { requireHrms, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { people } from "@/lib/hrms-wa";
import { slipsFromRegister, type Slip } from "@/lib/salary-slip";
import { slipHtml } from "@/lib/slip-html";
import { pressPdfMany } from "@/lib/pdf-press";
import { MONTHS } from "@/lib/salary-sheet";
import { crmDb } from "@/crm/db";
import { myMailbox, mailboxByAddress, accessTokenFor, gmailSendMixed } from "@/crm/gmail";
import { swallow } from "@/lib/swallow";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

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
/* Five at a time. Eight was chosen when every slip paid its own Chromium
   cold start and the request was killed before it finished; now the launch
   is paid once for the batch, five leaves comfortable room under the limit. */
const PER_CALL = 5;
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

/**
 * THE SEAL, CARRIED INSIDE THE FILE (Dr Raghu, 7 Sep 2026: the emailed slip
 * had no signature on it while the printed one did).
 *
 * The screen loads /nandan-stamp.png from the site. The PDF is pressed in a
 * headless browser that has no site to load it from — a relative path there
 * resolves to nothing, so the image was silently absent and the emailed slip
 * went out unsigned. Read off disk once and inlined, it travels with the
 * document. If the file is ever missing the slip simply has no seal, which
 * is what it did before, rather than failing to send.
 */
let stampCache: string | null | undefined;
async function stampDataUri(): Promise<string | undefined> {
  if (stampCache !== undefined) return stampCache ?? undefined;
  try {
    const b = await readFile(join(process.cwd(), "public", "nandan-stamp.png"));
    stampCache = `data:image/png;base64,${b.toString("base64")}`;
  } catch (e) { swallow("slip-mail stamp", e); stampCache = null; }
  return stampCache ?? undefined;
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
      /* the slip's own category, not the record's — it is what the send
         filters on, and a tick box that names a different thing from the
         filter behind it is a trap */
      return { id: s.id, name: s.name, net: s.net, personal: addressOf(s.id),
        type: String(s.category || p?.type || "").trim() || null, hold: !!s.hold,
        why: addressOf(s.id) ? "" : raw ? `${raw} is shared by more than one person` : "no personal e-mail on record" };
    });
    void shared;
    const types = [...new Set(rows.map((r) => String(r.type || "").trim()).filter(Boolean))].sort()
      .map((t) => ({ type: t, n: rows.filter((r) => r.type === t).length, hold: rows.filter((r) => r.type === t && r.hold).length }));
    return NextResponse.json({
      month: sheet.month, year: sheet.year, status: sheet.status,
      total: rows.length, withPersonal: rows.filter((r) => r.personal).length,
      types, rows,
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

    /**
     * WHO IT GOES TO (Dr Raghu, 7 Sep 2026: "the categories that we choose.
     * It could be select all, or it could be choosing the categories.
     * Whoever is on hold doesn't need to be sent a salary slip because it
     * doesn't make any sense").
     *
     * `types` empty means everybody. A man on hold is never sent one, whatever
     * is chosen — his slip says he was paid nothing, and sending it would
     * start a conversation HR has not had yet.
     */
    const types = Array.isArray(b.types) ? b.types.map((t) => String(t).trim().toLowerCase()).filter(Boolean) : [];

    /**
     * PICK UP WHERE IT STOPPED (Dr Raghu, 7 Sep 2026: "how can we continue?
     * without restarting").
     *
     * Every slip that goes is written to the ledger as it goes, so the ledger
     * already knows who has one. Anybody already sent this month is left out,
     * which makes pressing Send again a RESUME rather than a fresh start —
     * and means a run killed halfway costs nothing but the press of a button.
     * Nobody is mailed his payslip twice by accident.
     *
     * `resend: true` overrides it, for when a slip went out wrong and has to
     * go again — as the six that went before the format was fixed must.
     */
    const already = new Set<string>();
    if (!b.resend) {
      try {
        const { data: done } = await adminClient().from("hrms_communication")
          .select("employee_id, meta").eq("channel", "email").eq("direction", "out").eq("status", "sent");
        for (const r of (done || []) as { employee_id: string; meta: Record<string, unknown> | null }[]) {
          const m = r.meta || {};
          if (m.slip && Number(m.month) === Number(sheet.month) && Number(m.year) === Number(sheet.year))
            already.add(String(r.employee_id));
        }
      } catch (e) { swallow("slip-mail already-sent", e); }
    }
    const inScope = (s: Slip) =>
      !s.hold
      && !already.has(s.id)
      && (!wanted || wanted.includes(s.id))
      && (!types.length || types.includes(String(s.category || "").trim().toLowerCase()));

    const sendable = slips.filter(inScope).map((s: Slip) => ({ s, to: addressOf(s.id) })).filter((x) => x.to);
    const held = slips.filter((s: Slip) => s.hold && (!types.length || types.includes(String(s.category || "").trim().toLowerCase())))
      .map((s: Slip) => ({ id: s.id, name: s.name }));
    const noPersonal = slips
      .filter((s: Slip) => inScope(s) && !addressOf(s.id))
      .map((s: Slip) => {
        const raw = ok(by.get(s.id)?.value?.personal_email);
        return { id: s.id, name: s.name, why: raw ? `${raw} is shared` : "no personal e-mail" };
      });

    if (b.action === "preview")
      return NextResponse.json({ ok: true, count: sendable.length, noPersonal, held, period,
        already: already.size,
        sample: sendable.slice(0, 3).map((x) => ({ name: x.s.name, to: x.to })) });

    if (!u.isOwner && !/^(vinaym|hr)@nandan\.co\.in$/.test(u.email.toLowerCase()))
      throw new HttpError(403, "Slips go out from Dr Raghu or HR.");
    const { token, fromEmail } = await sender(String(b.from || "hr@nandan.co.in"));
    const stampUrl = await stampDataUri();
    const offset = Math.max(0, Number(b.offset) || 0);
    const slice = sendable.slice(offset, offset + PER_CALL);

    let sent = 0; const failed: { id: string; name: string; why: string }[] = [];
    /* Every slip in this batch pressed on ONE browser — the launch is the
       cost, and paying it per slip is what killed the request. */
    const pdfs = await pressPdfMany(slice.map(({ s }) =>
      slipHtml(s, Number(sheet.month), Number(sheet.year), { draft: sheet.status !== "Frozen", stampUrl, fill: true })));
    for (let i = 0; i < slice.length; i++) {
      const { s, to } = slice[i];
      try {
        const pdf = pdfs[i];
        if (!pdf) throw new Error("the slip could not be rendered");
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
    return NextResponse.json({ ok: true, sent, failed, done, of: sendable.length, more: done < sendable.length, noPersonal, held, already: already.size });
  } catch (e) { return errJson(e); }
}
