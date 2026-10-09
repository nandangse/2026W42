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
    /* SEND or CANCEL a saved release (Dr Raghu, 8 Oct 2026: "a button on the right side that will say Send
       or Cancel … so that he can check it out once again"). JSON body { action, id }. */
    if ((req.headers.get("content-type") || "").includes("application/json")) {
      const b = await req.json().catch(() => ({})) as { action?: string; id?: string };
      const id = String(b.id || ""); if (!id) throw new HttpError(400, "Which release?");
      const { data: rel, error } = await admin.from("material_payment_release").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!rel) throw new HttpError(404, "No such release.");
      if (b.action === "cancel") {
        if (rel.status === "cancelled") return NextResponse.json({ ok: true, status: "cancelled" });
        /* out of Kuber's plan too, while accounts have not taken it — never once they have */
        let planNote = "";
        if (rel.plan_id) {
          const { data: pl } = await admin.from("kuber_payment_plan").select("status").eq("id", rel.plan_id).maybeSingle();
          if (pl?.status === "planned") { await admin.from("kuber_payment_plan").update({ status: "dropped", note: `Cancelled in Saamaan by ${me.email.split("@")[0]}` }).eq("id", rel.plan_id); planNote = " · dropped from Kuber's plan"; }
          else if (pl) planNote = ` · Kuber row left as ${pl.status} — accounts had already taken it`;
        }
        await admin.from("material_payment_release").update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: me.email }).eq("id", id);
        return NextResponse.json({ ok: true, status: "cancelled", note: planNote });
      }
      if (b.action === "send") {
        if (rel.status === "cancelled") throw new HttpError(409, "This release was cancelled — raise it again.");
        if (rel.status === "sent" && rel.plan_id) throw new HttpError(409, "Already sent.");
        return NextResponse.json({ ok: true, ...(await sendRelease(admin, me, rel as ReleaseRow)) });
      }
      throw new HttpError(400, "action: send or cancel");
    }
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

    /* 1 — the release and its files, SAVED (draft): nothing in Kuber yet, nobody mailed — Send does that */
    const { data: rel, error } = await admin.from("material_payment_release").insert({
      supplier, kind, amount, bill_refs, remarks, wanted_on: wanted, by_email: me.email, status: "draft",
    }).select("id, no").single();
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) throw new HttpError(503, "Run migration 0205 first — releases have nowhere to live yet.");
      if (/status|column/i.test(error.message)) throw new HttpError(503, "Run migration 0208 first — releases need their number and state.");
      throw new Error(error.message);
    }
    const stored: { name: string; path: string; size: number }[] = [];
    for (const f of files) {
      const buf = Buffer.from(await f.arrayBuffer());
      const name = f.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
      const path = `release/${rel!.id}/${name}`;
      const { error: up } = await admin.storage.from("portal").upload(path, buf, { contentType: f.type || "application/octet-stream", upsert: true });
      if (up) throw new Error(`Could not keep ${name}: ${up.message}`);
      stored.push({ name, path, size: f.size });
    }
    await admin.from("material_payment_release").update({ files: stored }).eq("id", rel!.id);
    return NextResponse.json({ ok: true, id: rel!.id, no: rel!.no, status: "draft" });
  } catch (e) {
    return errJson(e);
  }
}

type ReleaseRow = { id: string; no: string | null; supplier: string; kind: string; amount: number; bill_refs: string; remarks: string; wanted_on: string | null; files: { name: string; path: string; size: number }[]; by_email: string; status: string; plan_id: string | null };

/** SEND: into Kuber's payment plan as a request, and the intimation to accounts@ from the raiser's own address. */
async function sendRelease(admin: ReturnType<typeof adminClient>, me: { email: string; displayName?: string | null }, rel: ReleaseRow) {
  const { supplier, kind, amount, bill_refs, remarks } = rel;
  const wanted = rel.wanted_on || istDay();
  const no = rel.no || rel.id.slice(0, 8).toUpperCase();
  /* 2 — into Kuber's payment plan, as a request awaiting approval */
  let planId = rel.plan_id;
  if (!planId) {
    const { data: plan, error: pErr } = await admin.from("kuber_payment_plan").insert({
      plan_date: wanted, party: supplier, amount, purpose: kind === "advance" ? "Advance" : "Supplier bill",
      bill_ref: bill_refs, status: "planned", note: `${no} — payment release from Saamaan by ${me.email.split("@")[0]}${remarks ? ` — ${remarks}` : ""}${rel.files.length ? ` · ${rel.files.length} file${rel.files.length === 1 ? "" : "s"} attached in Saamaan` : ""}`,
    }).select("id").single();
    if (pErr) throw new Error(`Kuber's payment plan would not take it: ${pErr.message}`);
    planId = String(plan!.id);
  }
  /* the files, read back for the mail */
  const stored: { name: string; mime: string; base64: string }[] = [];
  for (const f of rel.files || []) {
    const { data } = await admin.storage.from("portal").download(f.path);
    if (data) stored.push({ name: f.name, mime: data.type || "application/octet-stream", base64: Buffer.from(await data.arrayBuffer()).toString("base64") });
  }
  /* 3 — the intimation to accounts, from the person who raised it */
  const title = `${no} · ${kind === "advance" ? "Advance Payment to" : "Payment to"} ${supplier} — ${inr(amount)}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#22303c;max-width:720px">
<p>Dear Accounts,</p>
<p>Supplier payment release <b>${esc(no)}</b> has been raised in Genie. This mail is for intimation — the request is in <b>Kuber → Payment Planning → Payment Request</b>, where it is approved and paid.</p>
<table cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:14px;width:100%">
<thead><tr style="background:#1F2A37;color:#fff;text-align:left"><th>No.</th><th>Date</th><th>Supplier name</th><th>Payment against bill number</th><th style="text-align:right">Amount</th><th>Any remarks</th></tr></thead>
<tbody><tr style="border-bottom:1px solid #ddd"><td><b>${esc(no)}</b></td><td>${dmy(istDay())}</td><td><b>${esc(supplier)}</b></td><td>${esc(bill_refs || (kind === "advance" ? "Advance" : "—"))}</td><td style="text-align:right"><b>${esc(inr(amount))}</b></td><td>${esc(remarks || "—")}</td></tr></tbody>
</table>
<p style="font-size:13px;color:#555">Wanted by ${dmy(wanted)}. Raised by ${esc(me.email)}.${stored.length ? ` ${stored.length} document${stored.length === 1 ? "" : "s"} attached.` : ""}</p>
<p style="font-size:12px;color:#888">Sent by Genie on behalf of Purchase.</p></div>`;
  let mail = "";
  try {
    const { mailboxByAddress, accessTokenFor, gmailSendMixed, gmailSend } = await import("@/crm/gmail");
    let box = await mailboxByAddress(me.email);
    let fromName = me.displayName || me.email.split("@")[0];
    let cc: string | undefined = PURCHASE;
    if (!box) { box = await mailboxByAddress(PURCHASE); fromName = "Nandan Purchase"; cc = undefined; }
    if (!box) throw new Error(`neither ${me.email} nor ${PURCHASE} has a Gmail connected in Genie — Profile → ✉ Connect Gmail`);
    const token = await accessTokenFor(String(box.id));
    if (stored.length) await gmailSendMixed(token, String(box.email_address), ACCOUNTS, title, html, stored, cc, undefined, fromName, PURCHASE);
    else await gmailSend(token, String(box.email_address), ACCOUNTS, title, html, cc, undefined, fromName, undefined, null, PURCHASE);
    mail = `sent from ${box.email_address}${cc ? `, cc ${PURCHASE}` : " (the raiser has no Gmail connected)"}, answers to ${PURCHASE}`;
  } catch (e) {
    mail = `not sent — ${e instanceof Error ? e.message : String(e)}`;
  }
  const now = new Date().toISOString();
  await admin.from("material_payment_release").update({ plan_id: planId, mail, status: "sent", sent_at: now }).eq("id", rel.id);
  return { id: rel.id, no, plan_id: planId, mail, status: "sent" };
}
