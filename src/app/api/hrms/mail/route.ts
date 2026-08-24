import { NextResponse } from "next/server";
import { requireHrms, errJson, HttpError, RAGHU_EMAIL } from "@/lib/auth";
import { textToHtml } from "@/lib/offer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/hrms/mail — Genie sends a mail.
 *
 * Deliberately narrow. The owner only, the sender must be a nandan.co.in
 * address, and every send answers with what Resend actually said rather than
 * a cheerful "sent" — because the one failure mode that matters here is a
 * mail that silently never arrives.
 *
 * GET reports whether sending can work at all, and names the reason when it
 * cannot: no key, a wrong key, or a domain that has not finished verifying.
 */
export async function GET() {
  try {
    const me = await requireHrms();
    if (me.email.toLowerCase() !== RAGHU_EMAIL) throw new HttpError(403, "The mail diagnostic is the owner's.");
    const key = process.env.RESEND_API_KEY;
    if (!key) return NextResponse.json({ canSend: false, why: "RESEND_API_KEY is not set on this deploy." });

    const r = await fetch("https://api.resend.com/domains", { headers: { authorization: `Bearer ${key}` } });
    if (!r.ok) return NextResponse.json({ canSend: false, why: `Resend answered ${r.status} — the key may be wrong or revoked.` });
    const j = await r.json();
    const domains = (j?.data || []) as { name: string; status: string }[];
    const nandan = domains.find((d) => d.name === "nandan.co.in") as { name: string; status: string; id?: string } | undefined;
    if (!nandan) return NextResponse.json({ canSend: false, why: "nandan.co.in is not on this Resend account.", domains });
    if (nandan.status !== "verified") {
      // the records themselves, so the fix is a list to hand to whoever holds
      // the DNS rather than a login somebody has to go hunting through
      let records: unknown = null;
      try {
        const one = await fetch(`https://api.resend.com/domains/${(nandan as { id?: string }).id}`, {
          headers: { authorization: `Bearer ${key}` },
        });
        if (one.ok) records = (await one.json())?.records ?? null;
      } catch { /* the reason above still stands without them */ }
      return NextResponse.json({
        canSend: false,
        why: `nandan.co.in is "${nandan.status}", not verified — Resend will refuse to send from it until these DNS records are added and it turns verified.`,
        domains, records,
      });
    }
    return NextResponse.json({ canSend: true, domains });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireHrms();
    if (me.email.toLowerCase() !== RAGHU_EMAIL) throw new HttpError(403, "Only the owner may send mail from Genie.");
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new HttpError(503, "RESEND_API_KEY is not set on this deploy — nothing can be sent.");

    const b = await req.json();

    /**
     * { action: "verify" } — ask Resend to re-read the DNS.
     *
     * Resend's "pending" is the result of its LAST check, not of the DNS as
     * it stands now; records added since then do nothing until it looks
     * again. This is that nudge, so a wait is never for nothing.
     */
    if (String(b.action || "") === "verify") {
      const dom = await fetch("https://api.resend.com/domains", { headers: { authorization: `Bearer ${key}` } });
      if (!dom.ok) throw new HttpError(502, `Resend answered ${dom.status} listing domains.`);
      const found = ((await dom.json())?.data || []).find((d: { name: string }) => d.name === "nandan.co.in");
      if (!found) throw new HttpError(404, "nandan.co.in is not on this Resend account.");
      const v = await fetch(`https://api.resend.com/domains/${found.id}/verify`, {
        method: "POST", headers: { authorization: `Bearer ${key}` },
      });
      const vBody = await v.text();
      // verification is not instant — read the status back after the nudge
      const after = await fetch(`https://api.resend.com/domains/${found.id}`, { headers: { authorization: `Bearer ${key}` } });
      const now = after.ok ? await after.json() : null;
      return NextResponse.json({
        ok: v.ok, asked: vBody.slice(0, 300),
        status: now?.status ?? found.status,
        records: (now?.records || []).map((r: Record<string, unknown>) => ({ record: r.record, type: r.type, name: r.name, status: r.status })),
      });
    }

    const from = String(b.from || "hr@nandan.co.in").trim();
    if (!/^[^@\s]+@nandan\.co\.in$/i.test(from))
      throw new HttpError(400, "The sender must be a nandan.co.in address.");

    const list = (v: unknown) =>
      String(v || "").split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    const to = list(b.to);
    const cc = list(b.cc);
    const subject = String(b.subject || "").trim();
    const text = String(b.text || "");
    if (!to.length) throw new HttpError(400, "There is nobody to send it to.");
    if (!subject) throw new HttpError(400, "The subject is empty.");
    if (!text.trim()) throw new HttpError(400, "The message is empty.");

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from: `${String(b.fromName || "Nandan GSE HR")} <${from}>`,
        to, cc: cc.length ? cc : undefined, reply_to: from,
        subject,
        text,
        html: `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.7;color:#16232F">${textToHtml(text)}</div>`,
      }),
    });
    const body = await r.text();
    if (!r.ok) {
      // the reason travels with the failure — a mail that never arrives is
      // the one thing worse than a mail that visibly refused to go
      throw new HttpError(502,
        r.status === 401 ? "The RESEND_API_KEY is wrong or revoked."
        : r.status === 403 ? `Resend refused ${from}: ${body.slice(0, 300)}`
        : `Resend answered ${r.status}: ${body.slice(0, 300)}`);
    }
    return NextResponse.json({ ok: true, sent: to, cc, resend: JSON.parse(body || "{}") });
  } catch (e) {
    return errJson(e);
  }
}
