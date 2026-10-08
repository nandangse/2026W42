import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireSaamaan } from "@/lib/saamaan";
import { SUPPLIER_HANDS } from "@/lib/accounts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * SUPPLIER PAYMENT RELEASE (Dr Raghu, 6 Oct 2026): "get the supplier's name
 * and the amount, and let them attach the bills, the P.I., or whatever is
 * required. The moment he clicks Submit, an email has to go to
 * accounts@nandan.co.in. Make the email from purchase@nandan.co.in, and in
 * the subject, write 'Advance Payment to' and the supplier's name, along
 * with the amount. In the body … Date, Supplier name, Payment against bill
 * number, Any remarks … one per supplier … accounts … will then look at
 * the accounts in the Kubers module only in one place … The email is only
 * for intimation, not for action."
 *
 * One submit does three things, in this order:
 *   1. records the release and its files (portal bucket, release/<id>/)
 *   2. puts it into Kuber's payment plan as a request awaiting approval —
 *      the one place accounts act
 *   3. mails accounts@ from purchase@ — intimation only. If purchase@ has
 *      no Gmail connected in Genie yet, it goes from the sender's own with
 *      purchase@ to answer to; if neither is connected, the release still
 *      stands in Kuber and the screen says the mail did not go.
 *
 * Mukesh and the owner only — the supplier hand.
 */
const S = (v: unknown, n = 400) => String(v ?? "").trim().slice(0, n);
const ACCOUNTS = "accounts@nandan.co.in";
const PURCHASE = "purchase@nandan.co.in";
const MAX_FILES = 8, MAX_BYTES = 12 * 1024 * 1024;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const istDay = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const dmy = (d: string) => `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;

async function guard() {
  const me = await requireSaamaan();
  if (!me.isOwner && !SUPPLIER_HANDS.has(me.email.toLowerCase())) throw new HttpError(403, "Supplier payment release is the purchase team's.");
  return me;
}

export async function GET(req: Request) {
  try {
    await guard();
    const admin = adminClient();
    const file = new URL(req.url).searchParams.get("file");
    if (file) {
      if (!/^release\/[0-9a-f-]{36}\/[^/]+$/.test(file)) throw new HttpError(400, "Not a release file.");
      const { data, error } = await admin.storage.from("portal").createSignedUrl(file, 600);
      if (error || !data) throw new HttpError(404, "That file is not there.");
      return NextResponse.redirect(data.signedUrl);
    }
    if (new URL(req.url).searchParams.get("view") === "suppliers") {
      const names: string[] = [];
      for (let a = 0; ; a += 1000) {
        const { data, error } = await admin.from("material_supplier").select("name, disabled").order("name").range(a, a + 999);
        if (error) throw new Error(error.message);
        names.push(...(data ?? []).filter((d) => !d.disabled).map((d) => String(d.name)));
        if (!data || data.length < 1000) break;
      }
      return NextResponse.json({ ok: true, suppliers: names });
    }
    const { data, error } = await admin.from("material_payment_release").select("*").order("at", { ascending: false }).limit(300);
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ ok: true, installed: false, rows: [] });
      throw new Error(error.message);
    }
    const planIds = (data ?? []).map((r) => r.plan_id).filter(Boolean);
    const { data: plans } = planIds.length ? await admin.from("kuber_payment_plan").select("id, status, paid_on").in("id", planIds) : { data: [] };
    const st = new Map((plans ?? []).map((p) => [String(p.id), p]));
    return NextResponse.json({ ok: true, installed: true, rows: (data ?? []).map((r) => ({ ...r, kuber: r.plan_id ? st.get(String(r.plan_id)) ?? null : null })) });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await guard();
    const admin = adminClient();
    const form = await req.formData();
    const supplier = S(form.get("supplier"), 200);
    const kind = S(form.get("kind")) === "bill" ? "bill" : "advance";
    const amount = Number(S(form.get("amount")).replace(/,/g, ""));
    const bill_refs = S(form.get("bill_refs"), 600);
    const remarks = S(form.get("remarks"), 2000);
    const wanted = /^\d{4}-\d{2}-\d{2}$/.test(S(form.get("wanted_on"))) ? S(form.get("wanted_on")) : istDay();
    if (!supplier) throw new HttpError(400, "Which supplier?");
    if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, "How much — a number more than nought.");
    if (kind === "bill" && !bill_refs) throw new HttpError(400, "Against which bill? Put the bill number.");
    const files = form.getAll("files").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f && (f as File).size > 0);
    if (files.length > MAX_FILES) throw new HttpError(400, `At most ${MAX_FILES} files.`);
    const total = files.reduce((a, f) => a + f.size, 0);
    if (total > MAX_BYTES) throw new HttpError(400, "The files come to more than 12 MB — attach fewer, or smaller.");

    /* 1 — the release and its files */
    const { data: rel, error } = await admin.from("material_payment_release").insert({
      supplier, kind, amount, bill_refs, remarks, wanted_on: wanted, by_email: me.email,
    }).select("id").single();
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) throw new HttpError(503, "Run migration 0205 first — releases have nowhere to live yet.");
      throw new Error(error.message);
    }
    const stored: { name: string; path: string; size: number; mime: string; base64: string }[] = [];
    for (const f of files) {
      const buf = Buffer.from(await f.arrayBuffer());
      const name = f.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
      const path = `release/${rel!.id}/${name}`;
      const { error: up } = await admin.storage.from("portal").upload(path, buf, { contentType: f.type || "application/octet-stream", upsert: true });
      if (up) throw new Error(`Could not keep ${name}: ${up.message}`);
      stored.push({ name, path, size: f.size, mime: f.type || "application/octet-stream", base64: buf.toString("base64") });
    }

    /* 2 — into Kuber's payment plan, as a request awaiting approval */
    const { data: plan, error: pErr } = await admin.from("kuber_payment_plan").insert({
      plan_date: wanted, party: supplier, amount, purpose: kind === "advance" ? "Advance" : "Supplier bill",
      bill_ref: bill_refs, status: "planned", note: `Payment release from Saamaan by ${me.email.split("@")[0]}${remarks ? ` — ${remarks}` : ""}${stored.length ? ` · ${stored.length} file${stored.length === 1 ? "" : "s"} attached in Saamaan` : ""}`.slice(0, 1000), by: me.email,
    }).select("id").single();
    if (pErr) throw new Error(`Recorded, but Kuber's payment plan would not take it: ${pErr.message}`);

    /* 3 — the intimation to accounts */
    const title = `${kind === "advance" ? "Advance Payment to" : "Payment to"} ${supplier} — ${inr(amount)}`;
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#22303c;max-width:720px">
<p>Dear Accounts,</p>
<p>A supplier payment release has been raised in Genie. This mail is for intimation — the request is in <b>Kuber → Payment Planning → Payment Request</b>, where it is approved and paid.</p>
<table cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:14px;width:100%">
<thead><tr style="background:#1F2A37;color:#fff;text-align:left"><th>Date</th><th>Supplier name</th><th>Payment against bill number</th><th style="text-align:right">Amount</th><th>Any remarks</th></tr></thead>
<tbody><tr style="border-bottom:1px solid #ddd"><td>${dmy(istDay())}</td><td><b>${esc(supplier)}</b></td><td>${esc(bill_refs || (kind === "advance" ? "Advance" : "—"))}</td><td style="text-align:right"><b>${esc(inr(amount))}</b></td><td>${esc(remarks || "—")}</td></tr></tbody>
</table>
<p style="font-size:13px;color:#555">Wanted by ${dmy(wanted)}. Raised by ${esc(me.email)}.${stored.length ? ` ${stored.length} document${stored.length === 1 ? "" : "s"} attached.` : ""}</p>
<p style="font-size:12px;color:#888">Sent by Genie on behalf of Purchase.</p></div>`;
    let mail = "";
    try {
      const { mailboxByAddress, accessTokenFor, gmailSendMixed, gmailSend } = await import("@/crm/gmail");
      let box = await mailboxByAddress(PURCHASE);
      let replyTo: string | null = null;
      if (!box) { box = await mailboxByAddress(me.email); replyTo = PURCHASE; }
      if (!box) throw new Error(`neither ${PURCHASE} nor ${me.email} has a Gmail connected in Genie`);
      const token = await accessTokenFor(String(box.id));
      if (stored.length) await gmailSendMixed(token, String(box.email_address), ACCOUNTS, title, html, stored.map((f) => ({ name: f.name, mime: f.mime, base64: f.base64 })), undefined, undefined, "Nandan Purchase", replyTo);
      else await gmailSend(token, String(box.email_address), ACCOUNTS, title, html, undefined, undefined, "Nandan Purchase", undefined, null, replyTo);
      mail = replyTo ? `sent from ${box.email_address} (purchase@ is not connected yet), answers to purchase@` : `sent from ${PURCHASE}`;
    } catch (e) {
      mail = `not sent — ${e instanceof Error ? e.message : String(e)}`;
    }
    await admin.from("material_payment_release").update({ plan_id: plan!.id, mail, files: stored.map(({ name, path, size }) => ({ name, path, size })) }).eq("id", rel!.id);
    return NextResponse.json({ ok: true, id: rel!.id, plan_id: plan!.id, mail });
  } catch (e) {
    return errJson(e);
  }
}
