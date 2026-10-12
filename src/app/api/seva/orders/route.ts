import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireSeva } from "@/lib/seva";
import { adminClient } from "@/lib/supabase/admin";
import { AI, anthropicClient } from "@/lib/ai";
import { assertAiOn } from "@/lib/ai-gate";
import { serviceTeam } from "@/lib/seva-team";
import { allJobs } from "@/lib/seva-jobs";
import { quotePdf } from "@/lib/seva-quotes";
import { BILLING_TO, log, quoteLines, sevaMail, totals, type Line } from "@/lib/seva-orders";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * /api/seva/orders — SEVA → SERVICE ORDER (Dr Raghu, 12 Oct 2026).
 *
 *   GET                     the orders, the managers
 *   GET ?id=                one: lines, files (signed), the log
 *   GET ?options=1          what can be tagged: quotations, AMCs, jobs, customers
 *   POST (multipart)        a file on an order — the PO, the WhatsApp, the mail
 *   POST create | create_from_quote | save | lines | status | read_po | send_accounts | invoice | remove_file | delete
 */
const S = (v: unknown) => String(v ?? "").trim();
const BUCKET = "seva-orders";
const MODES = ["Purchase order", "Verbal", "WhatsApp", "E-mail", "PO to follow"];
const STATUSES = ["New", "Executing", "Work done", "Sent to accounts", "Invoiced", "Closed", "Cancelled"];
const isD = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(S(v));
const mails = (v: unknown) => (Array.isArray(v) ? v : S(v).split(/[,;\s]+/)).map((x) => S(x).toLowerCase()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function cleanLines(v: unknown): Line[] {
  return (Array.isArray(v) ? v : []).map((l: Record<string, unknown>) => {
    const qty = Number(l.qty) || 0, rate = Number(l.rate) || 0;
    /* qty × rate where both are given; a lump sum stands on its own */
    const amount = qty && rate ? Math.round(qty * rate * 100) / 100 : Number(l.amount) || 0;
    return { kind: (S(l.kind) === "service" ? "service" : "spares") as Line["kind"], item_code: S(l.item_code) || null, description: S(l.description), qty, uom: S(l.uom) || null, rate, amount };
  }).filter((l) => l.description || l.amount);
}

async function writeLines(admin: ReturnType<typeof adminClient>, so_id: string, lines: Line[]) {
  await admin.from("seva_so_line").delete().eq("so_id", so_id);
  if (lines.length) {
    const { error } = await admin.from("seva_so_line").insert(lines.map((l, i) => ({ ...l, so_id, sort: i })));
    if (error) throw error;
  }
  await admin.from("seva_service_order").update({ ...totals(lines), updated_at: new Date().toISOString() }).eq("id", so_id);
}

export async function GET(req: Request) {
  try {
    const me = await requireSeva();
    const admin = adminClient();
    const sp = new URL(req.url).searchParams;
    if (sp.get("options")) {
      const [{ data: q }, { data: a }, jobs] = await Promise.all([
        admin.from("seva_quotation").select("erp_name, customer, subject, quoted_on, base_grand_total").order("quoted_on", { ascending: false }).limit(3000),
        admin.from("seva_amc").select("erp_name, customer, status, end_date").not("erp_name", "is", null).order("end_date", { ascending: false }).limit(2000),
        allJobs(admin),
      ]);
      const js = [...jobs.values()].sort((x, y) => y.id.localeCompare(x.id)).slice(0, 4000).map((j) => ({ id: j.id, cust: j.cust, tag: j.tag }));
      const customers = [...new Set([...(q || []).map((x) => S(x.customer)), ...(a || []).map((x) => S(x.customer)), ...js.map((j) => j.cust)].filter(Boolean))].sort((x, y) => x.localeCompare(y));
      return NextResponse.json({ quotations: q || [], amcs: a || [], jobs: js, customers });
    }
    const id = sp.get("id");
    if (id) {
      const { data: so, error } = await admin.from("seva_service_order").select("*").eq("id", id).maybeSingle();
      if (error) throw error; if (!so) throw new HttpError(404, "No such service order.");
      const [{ data: lines }, { data: files }, { data: logs }] = await Promise.all([
        admin.from("seva_so_line").select("*").eq("so_id", id).order("sort"),
        admin.from("seva_so_file").select("*").eq("so_id", id).order("uploaded_at"),
        admin.from("seva_so_log").select("*").eq("so_id", id).order("at", { ascending: false }),
      ]);
      const signed = await Promise.all((files || []).map(async (f) => { const { data: s } = await admin.storage.from(BUCKET).createSignedUrl(String(f.path), 3600); return { ...f, url: s?.signedUrl ?? null }; }));
      return NextResponse.json({ so, lines: lines || [], files: signed, log: logs || [], modes: MODES, statuses: STATUSES, billing: BILLING_TO, me: me.email });
    }
    const [{ data, error }, team] = await Promise.all([
      admin.from("seva_service_order").select("*").order("created_at", { ascending: false }).limit(3000),
      serviceTeam(admin),
    ]);
    if (error) { if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ installed: false, rows: [], team, modes: MODES, statuses: STATUSES }); throw error; }
    return NextResponse.json({ installed: true, rows: data || [], team, modes: MODES, statuses: STATUSES });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await requireSeva();
    const admin = adminClient();
    /* A FILE — the PO, the WhatsApp screenshot, the mail */
    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
      const fd = await req.formData();
      const so_id = S(fd.get("so_id")); const f = fd.get("file");
      if (!so_id || !(f instanceof File)) throw new HttpError(400, "Which order, which file?");
      if (f.size > 20 * 1024 * 1024) throw new HttpError(400, "Over 20 MB.");
      const path = `${so_id}/${Date.now()}-${f.name.replace(/[^\w.\- ]+/g, "_")}`;
      const { error: up } = await admin.storage.from(BUCKET).upload(path, Buffer.from(await f.arrayBuffer()), { contentType: f.type || "application/octet-stream" });
      if (up) throw new Error(up.message);
      const { data, error } = await admin.from("seva_so_file").insert({ so_id, kind: S(fd.get("kind")) || "Purchase order", name: f.name, mime: f.type || null, bytes: f.size, path, uploaded_by: me.email }).select("id").single();
      if (error) throw error;
      await log(admin, so_id, `Attached ${f.name}.`, me.email);
      return NextResponse.json({ ok: true, id: data.id });
    }
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = S(b.action);
    const team = await serviceTeam(admin);
    const managerName = (id: string) => team.find((t) => t.id === id)?.name || null;
    const fields = (x: Record<string, unknown>) => ({
      customer: S(x.customer), po_mode: MODES.includes(S(x.po_mode)) ? S(x.po_mode) : "Purchase order",
      customer_po_no: S(x.customer_po_no) || null, customer_po_date: isD(x.customer_po_date) ? S(x.customer_po_date) : null,
      quotation: S(x.quotation) || null, amc: S(x.amc) || null, job_id: S(x.job_id) || null, issue: S(x.issue) || null,
      manager_id: S(x.manager_id) || null, manager_name: S(x.manager_id) ? managerName(S(x.manager_id)) : null,
      so_date: isD(x.so_date) ? S(x.so_date) : undefined, notes: S(x.notes),
    });

    if (action === "create") {
      const f = fields(b);
      if (!f.customer && !f.quotation && !f.amc && !f.job_id) throw new HttpError(400, "Tag it to something — a customer, a quotation, an AMC or a job.");
      const { data, error } = await admin.from("seva_service_order").insert({ ...f, so_date: f.so_date, created_by: me.email }).select("id, so_no").single();
      if (error) throw error;
      const lines = cleanLines(b.lines); if (lines.length) await writeLines(admin, data.id, lines);
      await log(admin, data.id, `${data.so_no} made${f.po_mode !== "Purchase order" ? ` — on the word (${f.po_mode})` : ""}.`, me.email);
      return NextResponse.json({ ok: true, id: data.id, so_no: data.so_no });
    }
    /* "In the quotation, there has to be a button saying Create a service order" */
    if (action === "create_from_quote") {
      const name = S(b.name); if (!name) throw new HttpError(400, "Which quotation?");
      const { data: had } = await admin.from("seva_service_order").select("id, so_no").eq("quotation", name).neq("status", "Cancelled").limit(1);
      if (had?.length && !b.again) return NextResponse.json({ ok: true, id: had[0].id, so_no: had[0].so_no, existing: true });
      const q = await quoteLines(name);
      const { data: sq } = await admin.from("seva_quotation").select("customer").eq("erp_name", name).maybeSingle();
      const { data, error } = await admin.from("seva_service_order").insert({ customer: q.customer || S(sq?.customer), quotation: name, po_mode: MODES.includes(S(b.po_mode)) ? S(b.po_mode) : "PO to follow", created_by: me.email }).select("id, so_no").single();
      if (error) throw error;
      await writeLines(admin, data.id, q.lines);
      await log(admin, data.id, `${data.so_no} made from quotation ${name} — ${q.lines.length} line${q.lines.length === 1 ? "" : "s"}, spares and service split by the ERP's item group.`, me.email);
      return NextResponse.json({ ok: true, id: data.id, so_no: data.so_no });
    }
    const id = S(b.id);
    const { data: so } = id ? await admin.from("seva_service_order").select("*").eq("id", id).maybeSingle() : { data: null };
    if (!so && action !== "remove_file") throw new HttpError(404, "No such service order.");
    if (action === "save") {
      const f = fields(b);
      const { error } = await admin.from("seva_service_order").update({ ...f, so_date: f.so_date ?? so!.so_date, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      if (f.manager_id && f.manager_id !== so!.manager_id) await log(admin, id, `Assigned to ${f.manager_name}.`, me.email);
      return NextResponse.json({ ok: true });
    }
    if (action === "lines") {
      const lines = cleanLines(b.lines);
      await writeLines(admin, id, lines);
      const t = totals(lines);
      await log(admin, id, `Lines saved — spares ${inr(t.spares_amount)}, service ${inr(t.service_amount)}.`, me.email);
      return NextResponse.json({ ok: true, ...t });
    }
    if (action === "status") {
      const status = S(b.status); if (!STATUSES.includes(status)) throw new HttpError(400, "Not a status.");
      await admin.from("seva_service_order").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
      await log(admin, id, `Status: ${status}.`, me.email);
      return NextResponse.json({ ok: true });
    }
    if (action === "invoice") {
      await admin.from("seva_service_order").update({ invoice_no: S(b.invoice_no) || null, invoice_date: isD(b.invoice_date) ? S(b.invoice_date) : null, status: S(b.invoice_no) ? "Invoiced" : so!.status, updated_at: new Date().toISOString() }).eq("id", id);
      await log(admin, id, S(b.invoice_no) ? `Invoiced — ${S(b.invoice_no)}${isD(b.invoice_date) ? ` of ${S(b.invoice_date)}` : ""}.` : "Invoice details cleared.", me.email);
      return NextResponse.json({ ok: true });
    }
    /* GENIE READS THE PO: the PDF or the picture → lines, split spares and service. Proposed, not saved. */
    if (action === "read_po") {
      await assertAiOn();
      const { data: f } = await admin.from("seva_so_file").select("*").eq("id", S(b.file_id)).eq("so_id", id).maybeSingle();
      if (!f) throw new HttpError(404, "No such file on this order.");
      const { data: blob, error } = await admin.storage.from(BUCKET).download(String(f.path));
      if (error || !blob) throw new HttpError(502, "Could not read the file back.");
      const data = Buffer.from(await blob.arrayBuffer()).toString("base64");
      const mime = String(f.mime || "");
      const doc = /pdf/i.test(mime) || /\.pdf$/i.test(String(f.name))
        ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } }
        : /^image\/(png|jpeg|gif|webp)$/i.test(mime) ? { type: "image" as const, source: { type: "base64" as const, media_type: mime.toLowerCase() as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data } } : null;
      if (!doc) throw new HttpError(400, "Genie reads a PDF or a picture.");
      const r = await anthropicClient().messages.create({
        model: AI.FRONT, max_tokens: 4000,
        system: "You read a customer's purchase order (or a WhatsApp / mail asking for work) sent to Nandan GSE Pvt Ltd, an Indian maker and servicer of ground support equipment, lifts and material handling machines. Return every line item ordered, exactly as written — description, quantity, unit, rate and amount in rupees before tax — and mark each SPARES (a part, a component, a material supplied) or SERVICE (a visit, labour, repair work, AMC, installation, commissioning, transport, travel, audit, training). Also the customer's name, PO number and PO date if shown. Do not invent a line, a rate or a number; leave what is not written as null.",
        tools: [{ name: "po_lines", description: "The PO's lines", input_schema: { type: "object", properties: {
          customer: { type: ["string", "null"] }, po_no: { type: ["string", "null"] }, po_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
          lines: { type: "array", items: { type: "object", properties: { kind: { type: "string", enum: ["spares", "service"] }, item_code: { type: ["string", "null"] }, description: { type: "string" }, qty: { type: ["number", "null"] }, uom: { type: ["string", "null"] }, rate: { type: ["number", "null"] }, amount: { type: ["number", "null"] } }, required: ["kind", "description"] } },
        }, required: ["lines"] } }],
        tool_choice: { type: "tool", name: "po_lines" },
        messages: [{ role: "user", content: [doc, { type: "text", text: "Read this order and return its lines." }] }],
      });
      const use = r.content.find((c) => c.type === "tool_use");
      const out = (use && use.type === "tool_use" ? use.input : {}) as { customer?: string | null; po_no?: string | null; po_date?: string | null; lines?: Record<string, unknown>[] };
      const lines = (out.lines || []).map((l) => { const qty = Number(l.qty) || 1; const amount = Number(l.amount) || (Number(l.rate) || 0) * qty; return { kind: l.kind === "service" ? "service" : "spares", item_code: S(l.item_code) || null, description: S(l.description), qty, uom: S(l.uom) || null, rate: Number(l.rate) || (qty ? Math.round((amount / qty) * 100) / 100 : 0), amount }; });
      await log(admin, id, `Genie read ${f.name} — ${lines.length} line${lines.length === 1 ? "" : "s"} proposed.`, me.email);
      return NextResponse.json({ ok: true, lines, customer: out.customer || null, po_no: out.po_no || null, po_date: out.po_date || null });
    }
    /* "Send to accounts for billing" — a mail with the order, its lines, the PO and the quotation attached */
    if (action === "send_accounts") {
      const to = mails(b.to).length ? mails(b.to) : BILLING_TO; const cc = mails(b.cc);
      const [{ data: lines }, { data: files }] = await Promise.all([
        admin.from("seva_so_line").select("*").eq("so_id", id).order("sort"),
        admin.from("seva_so_file").select("*").eq("so_id", id).order("uploaded_at"),
      ]);
      if (!lines?.length) throw new HttpError(400, "Put the lines in before it goes for billing.");
      const att: { name: string; mime: string; base64: string }[] = []; let size = 0;
      for (const f of files || []) {
        if (size + Number(f.bytes || 0) > 18 * 1024 * 1024) break;
        const { data: blob } = await admin.storage.from(BUCKET).download(String(f.path));
        if (blob) { const buf = Buffer.from(await blob.arrayBuffer()); size += buf.length; att.push({ name: String(f.name), mime: String(f.mime || "application/octet-stream"), base64: buf.toString("base64") }); }
      }
      if (so!.quotation) { try { const p = await quotePdf(String(so!.quotation)); att.push({ name: p.file, mime: "application/pdf", base64: p.bytes.toString("base64") }); } catch { /* the quotation PDF is a help, not a condition */ } }
      const part = (k: string) => (lines || []).filter((l) => l.kind === k);
      const table = (k: string, title: string) => part(k).length ? `<h3 style="margin:14px 0 6px">${title}</h3><table cellpadding="6" style="border-collapse:collapse;font-size:13px"><tr style="background:#1B2A41;color:#fff"><th align="left">#</th><th align="left">Item</th><th align="left">Description</th><th align="right">Qty</th><th align="right">Rate</th><th align="right">Amount</th></tr>${part(k).map((l, i) => `<tr style="border-bottom:1px solid #ddd"><td>${i + 1}</td><td>${esc(S(l.item_code))}</td><td>${esc(S(l.description))}</td><td align="right">${l.qty} ${esc(S(l.uom))}</td><td align="right">${inr(Number(l.rate))}</td><td align="right">${inr(Number(l.amount))}</td></tr>`).join("")}<tr><td colspan="5" align="right"><b>${title} total</b></td><td align="right"><b>${inr(part(k).reduce((s, l) => s + Number(l.amount), 0))}</b></td></tr></table>` : "";
      const t = totals((lines || []).map((l) => ({ kind: String(l.kind), amount: Number(l.amount) })));
      const html = `<p>Dear Accounts,</p><p>Please raise the invoice for service order <b>${esc(so!.so_no)}</b>.</p>
<table cellpadding="4" style="font-size:13px"><tr><td>Customer</td><td><b>${esc(S(so!.customer))}</b></td></tr><tr><td>Customer PO</td><td>${esc(S(so!.customer_po_no) || "—")}${so!.customer_po_date ? ` of ${so!.customer_po_date}` : ""} <i>(${esc(S(so!.po_mode))})</i></td></tr>${so!.quotation ? `<tr><td>Quotation</td><td>${esc(String(so!.quotation))}</td></tr>` : ""}${so!.amc ? `<tr><td>AMC</td><td>${esc(String(so!.amc))}</td></tr>` : ""}${so!.job_id ? `<tr><td>Job</td><td>${esc(String(so!.job_id))}</td></tr>` : ""}${so!.manager_name ? `<tr><td>Executed by</td><td>${esc(String(so!.manager_name))}</td></tr>` : ""}</table>
${table("spares", "Spares")}${table("service", "Service")}
<p style="font-size:14px"><b>Spares ${inr(t.spares_amount)} · Service ${inr(t.service_amount)} · Total ${inr(t.spares_amount + t.service_amount)}</b> (before tax)</p>${S(b.note) ? `<p>${esc(S(b.note))}</p>` : ""}<p>${att.length ? `Attached: ${att.map((a) => esc(a.name)).join(", ")}.` : ""}</p><p>— sent from Genie, Seva → Service Order</p>`;
      const { data: who } = await admin.from("profiles").select("display_name").ilike("email", me.email).maybeSingle();
      const sent = await sevaMail(me.email, (who?.display_name as string) || null, to, cc, `For billing — ${so!.so_no} · ${S(so!.customer)}${so!.customer_po_no ? ` · PO ${so!.customer_po_no}` : ""}`, html, att);
      await admin.from("seva_service_order").update({ status: "Sent to accounts", sent_to_accounts_at: new Date().toISOString(), sent_to_accounts_by: me.email, updated_at: new Date().toISOString() }).eq("id", id);
      await log(admin, id, `Sent to accounts for billing — ${to.join(", ")}${cc.length ? `, cc ${cc.join(", ")}` : ""} — from ${sent.from}, ${att.length} attachment${att.length === 1 ? "" : "s"}.`, me.email);
      return NextResponse.json({ ok: true, from: sent.from });
    }
    if (action === "remove_file") {
      const { data: f } = await admin.from("seva_so_file").select("*").eq("id", S(b.file_id)).maybeSingle();
      if (!f) throw new HttpError(404, "No such file.");
      await admin.storage.from(BUCKET).remove([String(f.path)]);
      await admin.from("seva_so_file").delete().eq("id", f.id);
      await log(admin, String(f.so_id), `Removed ${f.name}.`, me.email);
      return NextResponse.json({ ok: true });
    }
    if (action === "delete") {
      if (!me.isOwner && so!.created_by !== me.email) throw new HttpError(403, "The one who made it, or Dr Raghu.");
      if (so!.status !== "New" && so!.status !== "Cancelled") throw new HttpError(409, "Only a New or Cancelled order can be removed — cancel it instead.");
      const { data: fs } = await admin.from("seva_so_file").select("path").eq("so_id", id);
      if (fs?.length) await admin.storage.from(BUCKET).remove(fs.map((f) => String(f.path)));
      await admin.from("seva_service_order").delete().eq("id", id);
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
