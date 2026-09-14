import { NextResponse } from "next/server";
import { swallow } from "@/lib/swallow";
import { crmDb, crmConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

/**
 * LEAVING, AND THE TWO WAYS PEOPLE DO IT (Dr Raghu, 15 Sep 2026).
 *
 * POST is ONE-CLICK — RFC 8058. The mail client draws its own Unsubscribe
 * button next to the sender's name and POSTs here; the reader never opens the
 * message. Google has required it of anybody sending more than 5,000 a day to
 * Gmail since 2024. It always unsubscribes outright and for good: a header is
 * not a place to offer choices, and a client that asks gets a plain answer.
 *
 * GET is the FOOTER LINK, and it now opens a choice rather than a trapdoor.
 * Three months' quiet keeps a relationship that "unsubscribe" ends for ever —
 * and someone handed an easy way out does not press "report spam" instead.
 * That matters more than it sounds: an opt-out costs a name, a complaint is
 * counted against the sending domain by every mailbox provider watching, and
 * at 5–10,000 a day the allowance is about ten complaints, not thirty.
 *
 * NOTHING HERE IS BEHIND A LOGIN, so the token is all the authority there is:
 * it names one send to one address, and it can do nothing but quieten that
 * address. It is narrowed to hex before it is used.
 */

const PAGE = (title: string, body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>` +
  `<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#F1EFE9;color:#22303C;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px">` +
  `<div style="background:#fff;border-radius:10px;padding:28px 32px;max-width:460px;width:100%;border-top:4px solid #E8600A;box-sizing:border-box">${body}</div></body></html>`;

const EXPIRED = PAGE("Link expired",
  `<div style="font-size:21px;font-weight:700">That link has expired.</div>` +
  `<p style="color:#5A6672;line-height:1.6">Write to <a href="mailto:sales@nandan.co.in" style="color:#E8600A">sales@nandan.co.in</a> and we will take you off by hand.</p>`);

const html = (s: string, status = 200) =>
  new NextResponse(s, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

const clean = (t: unknown) => String(t || "").replace(/[^a-f0-9]/gi, "").slice(0, 40);

/** Find the send this token names. */
async function findSend(token: string) {
  if (!token || !crmConfigured()) return null;
  const db = crmDb();
  const { data } = await db.from("mk_send").select("id, email, campaign_id").eq("token", token).maybeSingle();
  return data ? { db, send: data as { id: string; email: string; campaign_id: string } } : null;
}

/**
 * Quieten an address. `until` null means for good; a date means until then.
 * The column arrives with migration 0068 — without it the write still has to
 * succeed, because a pending migration must never make somebody's opt-out
 * fail silently. Falling back means a pause is recorded as permanent, which
 * is the safe direction to be wrong in.
 */
async function suppress(db: ReturnType<typeof crmDb>, send: { id: string; email: string; campaign_id: string }, until: Date | null, note: string) {
  const email = String(send.email).toLowerCase();
  const row: Record<string, unknown> = { email, reason: "request", campaign_id: send.campaign_id, note };
  if (until) row.until = until.toISOString();
  let { error } = await db.from("mk_unsubscribe").upsert(row, { onConflict: "email" });
  if (error && /until/i.test(error.message)) {
    delete row.until;
    ({ error } = await db.from("mk_unsubscribe").upsert({ ...row, note: note + " (pause not stored — migration 0068 pending)" }, { onConflict: "email" }));
  }
  if (error) throw new Error(error.message);
  await db.from("mk_send").update({ status: "unsubscribed" }).eq("id", send.id);
}

/** The footer link: offer the choice. */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const token = clean(params.token);
  try {
    const found = await findSend(token);
    if (!found) return html(EXPIRED, 410);
    const btn = (bg: string, fg: string, label: string, sub: string, value: string) =>
      `<form method="post" style="margin:0 0 10px"><input type="hidden" name="choice" value="${value}">` +
      `<button type="submit" style="width:100%;text-align:left;background:${bg};color:${fg};border:1px solid #E2E0DA;border-radius:8px;padding:12px 14px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit">` +
      `${label}<div style="font-weight:400;font-size:12.5px;opacity:.85;margin-top:2px">${sub}</div></button></form>`;
    return html(PAGE("Your choice",
      `<div style="font-size:21px;font-weight:700;margin-bottom:4px">Too much mail?</div>` +
      `<p style="color:#5A6672;line-height:1.6;margin-top:6px">You are reading this as <b>${String(found.send.email).toLowerCase()}</b>. Choose whichever suits you — both take effect at once.</p>` +
      btn("#FFFFFF", "#22303C", "Pause for three months", "We stop now and write again after that. Nothing to remember.", "pause3") +
      btn("#FFF6F2", "#B23B12", "Stop all marketing email", "For good. Quotes and order updates you have asked for still reach you.", "all") +
      `<p style="color:#8A94A0;font-size:12px;line-height:1.5;margin-bottom:0">Nandan GSE · if this was a mistake, write to sales@nandan.co.in and we will put it back.</p>`));
  } catch (e) { swallow("marketing/u GET", e); return html(EXPIRED, 410); }
}

/**
 * Both the mail client's one-click and the reader's chosen answer arrive here.
 * They are told apart by what they send: a client posts
 * "List-Unsubscribe=One-Click" and nothing else, and means it.
 */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const token = clean(params.token);
  let choice = "all";
  let oneClick = false;
  try {
    const body = await req.text();
    const form = new URLSearchParams(body);
    oneClick = (form.get("List-Unsubscribe") || "").toLowerCase() === "one-click";
    if (!oneClick && form.get("choice")) choice = String(form.get("choice"));
  } catch { /* an empty body is still a one-click in some clients */ }

  try {
    const found = await findSend(token);
    if (!found) {
      /* A client that gets an error will try again and then show the reader a
         failure. Better to answer 200 and say nothing. */
      return oneClick ? new NextResponse(null, { status: 200 }) : html(EXPIRED, 410);
    }
    const pause = !oneClick && choice === "pause3";
    const until = pause ? new Date(Date.now() + 92 * 24 * 3600 * 1000) : null;
    await suppress(found.db, found.send, until,
      oneClick ? "one-click, from the mail client" : pause ? "chose three months' quiet" : "chose to stop all marketing e-mail");

    if (oneClick) return new NextResponse(null, { status: 200 });
    return html(PAGE(pause ? "Paused" : "Unsubscribed",
      `<div style="font-size:21px;font-weight:700">${pause ? "Paused for three months." : "You are unsubscribed."}</div>` +
      `<p style="color:#5A6672;line-height:1.6">${pause
        ? `We will not write again until ${until!.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. Nothing for you to remember.`
        : "Nandan GSE will not send this address marketing e-mail again. Sorry for the trouble."}</p>` +
      `<p style="color:#8A94A0;font-size:12px;margin-bottom:0">Changed your mind? Write to sales@nandan.co.in.</p>`));
  } catch (e) {
    swallow("marketing/u POST", e);
    return oneClick ? new NextResponse(null, { status: 200 }) : html(EXPIRED, 410);
  }
}
