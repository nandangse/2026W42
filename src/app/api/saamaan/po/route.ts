import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireSaamaan } from "@/lib/saamaan";
import { crmDb, crmConfigured } from "@/crm/db";
import { erpConfig } from "@/lib/erp-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Purchase orders and suppliers, pulled from the ERP (Dr Raghu, 5 Sep 2026).
 *
 * GET                      the POs: ?status= ?supplier= ?q= ?from= ?to= ?page=
 * GET ?name=NGSE/PO/…      one PO with its lines
 * GET ?suppliers=1         the suppliers (?q=)
 * GET ?supplier=NAME&one=1 one supplier whole, with addresses and contacts
 * POST { phase: "po", start? }        headers, 500 a page, from the last pull's
 *                                     modified stamp; returns next start
 * POST { phase: "po_items", start? }  the lines of every PO, one row per line,
 *                                     the child table listed in bulk
 * POST { phase: "suppliers" }         every Supplier, with its addresses and
 *                                     contacts through Dynamic Link
 *
 * READS ONLY. Submission stays in the ERP; nothing is written there.
 */
type Doc = Record<string, unknown>;
const S = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const N = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const B = (v: unknown) => v === 1 || v === "1" || v === true;
const D = (v: unknown) => { const s = S(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
const T = (v: unknown) => { const s = S(v); const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/); return m ? `${m[1]}T${m[2]}+05:30` : null; };
const missing = (m: string) => /material_po|material_supplier|material_grn|material_pinv|does not exist|schema cache/i.test(m);
/** material_setting.value is text; the pull's cursor is JSON in it. */
const parseSetting = (v: unknown): Doc => { try { const o = JSON.parse(String(v ?? "")); return o && typeof o === "object" ? (o as Doc) : {}; } catch { return {}; } };

async function erp() {
  if (!crmConfigured()) throw new HttpError(503, "The CRM database is not configured — the ERP keys live there.");
  const cfg = await erpConfig(crmDb());
  if ("error" in cfg) throw new HttpError(400, cfg.error);
  return cfg;
}
async function erpPage(cfg: { base: string; H: Record<string, string> }, doctype: string, fields: string[], filters: unknown[] | null, start: number, size: number, orderBy = "modified asc") {
  const u = `${cfg.base}/api/resource/${encodeURIComponent(doctype)}?fields=${encodeURIComponent(JSON.stringify(fields))}${filters ? `&filters=${encodeURIComponent(JSON.stringify(filters))}` : ""}&order_by=${encodeURIComponent(orderBy)}&limit_start=${start}&limit_page_length=${size}`;
  const r = await fetch(u, { headers: cfg.H });
  if (!r.ok) throw new Error(`The ERP answered ${r.status} on ${doctype} at ${start}: ${(await r.text()).slice(0, 200)}`);
  return (((await r.json()) as { data?: Doc[] }).data ?? []);
}

const PO_FIELDS = ["name", "supplier", "supplier_name", "status", "docstatus", "transaction_date", "schedule_date", "grand_total", "net_total", "total_taxes_and_charges", "currency", "project", "per_received", "per_billed", "advance_paid", "set_warehouse", "owner", "modified", "creation", "total_qty", "base_grand_total", "custom_remarks", "terms"];
/**
 * GRNs — what actually arrived (Dr Raghu, 8 Sep 2026: "from ERP get in
 * Suppliers, Purchase orders, GRNs"). In the ERP this is the Purchase
 * Receipt. A purchase order is a promise; this is the arrival, and it is the
 * only place that says what was REJECTED — which is the figure that tells you
 * which supplier keeps sending bad material.
 */
const GRN_FIELDS = ["name", "supplier", "supplier_name", "status", "docstatus", "posting_date", "posting_time", "grand_total", "net_total", "total_taxes_and_charges", "currency", "project", "set_warehouse", "is_return", "per_billed", "total_qty", "owner", "remarks", "modified"];
const GRN_ITEM_FIELDS = ["name", "modified", "items.name as row_name", "items.idx as row_idx", "items.item_code", "items.item_name", "items.qty", "items.received_qty", "items.rejected_qty", "items.uom", "items.rate", "items.amount", "items.warehouse", "items.rejected_warehouse", "items.purchase_order", "items.purchase_order_item", "items.batch_no", "items.serial_no", "items.project"];
/* The invoice is the third fact after the promise and the arrival, and the
   only one that carries money owed (Dr Raghu, 8 Sep 2026). */
const PINV_FIELDS = ["name", "supplier", "supplier_name", "status", "docstatus", "posting_date", "posting_time",
  "due_date", "bill_no", "bill_date", "grand_total", "net_total", "total_taxes_and_charges", "outstanding_amount",
  "currency", "project", "is_paid", "is_return", "update_stock", "total_qty", "owner", "remarks", "modified"];
const PINV_ITEM_FIELDS = ["name", "modified", "items.name as row_name", "items.idx as row_idx", "items.item_code",
  "items.item_name", "items.qty", "items.received_qty", "items.uom", "items.rate", "items.amount", "items.net_amount",
  "items.taxable_value", "items.warehouse", "items.purchase_order", "items.po_detail", "items.purchase_receipt",
  "items.pr_detail", "items.item_group", "items.project"];
const PO_ITEM_FIELDS = ["name", "modified", "items.name as row_name", "items.idx as row_idx", "items.item_code", "items.item_name", "items.qty", "items.uom", "items.rate", "items.amount", "items.received_qty", "items.billed_amt", "items.warehouse", "items.schedule_date", "items.project"];

export async function GET(req: Request) {
  try {
    await requireSaamaan();
    const admin = adminClient();
    const u = new URL(req.url);
    const q = S(u.searchParams.get("q")).toLowerCase();

    if (u.searchParams.get("suppliers")) {
      let sel = admin.from("material_supplier").select("name, supplier_name, supplier_group, supplier_type, gst_no, country, mobile_no, email_id, primary_address, primary_contact, status_of_supplier, rating_percentage, disabled, on_hold, erp_modified").order("supplier_name").limit(3000);
      if (q) sel = sel.or(`name.ilike.%${q}%,supplier_name.ilike.%${q}%,gst_no.ilike.%${q}%,email_id.ilike.%${q}%,supplier_group.ilike.%${q}%`);
      const { data, error } = await sel;
      if (error) { if (missing(error.message)) return NextResponse.json({ installed: false, rows: [] }); throw new Error(error.message); }
      // how many POs and how much per supplier, from the mirror
      const { data: agg } = await admin.from("material_po").select("supplier, grand_total, status");
      const tally = new Map<string, { n: number; value: number; open: number }>();
      for (const p of agg || []) { const k = S(p.supplier); const t = tally.get(k) ?? { n: 0, value: 0, open: 0 }; t.n++; t.value += Number(p.grand_total) || 0; if (/To Receive|To Bill|Draft/i.test(S(p.status))) t.open++; tally.set(k, t); }
      return NextResponse.json({ installed: true, rows: (data || []).map((s) => ({ ...s, ...(tally.get(S(s.name)) ?? { n: 0, value: 0, open: 0 }) })) });
    }
    /* ── GRNs: what arrived ── */
    /* PURCHASE INVOICES — what was billed, and what is still owed on it */
    if (u.searchParams.get("pinv")) {
      const vname = S(u.searchParams.get("name"));
      if (vname) {
        const [{ data: inv }, { data: lines }] = await Promise.all([
          admin.from("material_pinv").select("*").eq("name", vname).maybeSingle(),
          admin.from("material_pinv_item").select("*").eq("pinv_name", vname).order("idx"),
        ]);
        if (!inv) throw new HttpError(404, "No such purchase invoice in the mirror — pull first.");
        return NextResponse.json({ pinv: inv, items: lines || [] });
      }
      const vsup = S(u.searchParams.get("supplier")), vproj = S(u.searchParams.get("project"));
      const vstat = S(u.searchParams.get("status"));
      const vfrom = D(u.searchParams.get("from")), vto = D(u.searchParams.get("to"));
      const vpage = Math.max(0, Number(u.searchParams.get("page")) || 0), vsize = 200;
      let v = admin.from("material_pinv")
        .select("name, supplier, supplier_name, status, docstatus, posting_date, due_date, bill_no, bill_date, grand_total, outstanding, currency, project, is_paid, is_return, total_qty, erp_modified", { count: "exact" })
        .order("posting_date", { ascending: false }).order("name", { ascending: false })
        .range(vpage * vsize, vpage * vsize + vsize - 1);
      if (vsup) v = v.eq("supplier", vsup);
      if (vproj) v = v.eq("project", vproj);
      if (vstat) v = v.eq("status", vstat);
      if (vfrom) v = v.gte("posting_date", vfrom);
      if (vto) v = v.lte("posting_date", vto);
      if (q) v = v.or(`name.ilike.%${q}%,supplier_name.ilike.%${q}%,bill_no.ilike.%${q}%,project.ilike.%${q}%`);
      const { data: rows, count, error: ve } = await v;
      if (ve) { if (missing(ve.message)) return NextResponse.json({ installed: false, rows: [], total: 0 }); throw new Error(ve.message); }
      /* the statuses actually present, so the filter offers only real ones */
      const { data: st } = await admin.from("material_pinv").select("status").limit(2000);
      const statuses = [...new Set((st || []).map((r) => S(r.status)).filter(Boolean))].sort();
      return NextResponse.json({ installed: true, total: count ?? 0, rows: rows || [], statuses });
    }

    if (u.searchParams.get("grns")) {
      const gname = S(u.searchParams.get("name"));
      if (gname) {
        const [{ data: grn }, { data: lines }] = await Promise.all([
          admin.from("material_grn").select("*").eq("name", gname).maybeSingle(),
          admin.from("material_grn_item").select("*").eq("grn_name", gname).order("idx"),
        ]);
        if (!grn) throw new HttpError(404, "No such GRN in the mirror — pull first.");
        return NextResponse.json({ grn, items: lines || [] });
      }
      const gsup = S(u.searchParams.get("supplier")), gproj = S(u.searchParams.get("project"));
      const gfrom = D(u.searchParams.get("from")), gto = D(u.searchParams.get("to"));
      const gpage = Math.max(0, Number(u.searchParams.get("page")) || 0), gsize = 200;
      let g = admin.from("material_grn")
        .select("name, supplier, supplier_name, status, docstatus, posting_date, grand_total, currency, project, set_warehouse, is_return, per_billed, total_qty, erp_modified", { count: "exact" })
        .order("posting_date", { ascending: false }).order("name", { ascending: false })
        .range(gpage * gsize, gpage * gsize + gsize - 1);
      if (gsup) g = g.eq("supplier", gsup);
      if (gproj) g = g.eq("project", gproj);
      if (gfrom) g = g.gte("posting_date", gfrom);
      if (gto) g = g.lte("posting_date", gto);
      if (q) g = g.or(`name.ilike.%${q}%,supplier_name.ilike.%${q}%,project.ilike.%${q}%,set_warehouse.ilike.%${q}%`);
      const { data: rows, count, error: ge } = await g;
      if (ge) { if (missing(ge.message)) return NextResponse.json({ installed: false, rows: [], total: 0 }); throw new Error(ge.message); }
      /* what was refused, per GRN — the figure a receipt exists to carry */
      const names = (rows || []).map((r) => S(r.name));
      const rej = new Map<string, { rejected: number; lines: number }>();
      if (names.length) {
        const { data: li } = await admin.from("material_grn_item").select("grn_name, rejected_qty").in("grn_name", names);
        for (const l of li || []) {
          const k = S(l.grn_name); const t = rej.get(k) ?? { rejected: 0, lines: 0 };
          t.rejected += Number(l.rejected_qty) || 0; t.lines++; rej.set(k, t);
        }
      }
      return NextResponse.json({ installed: true, total: count ?? 0,
        rows: (rows || []).map((r) => ({ ...r, ...(rej.get(S(r.name)) ?? { rejected: 0, lines: 0 }) })) });
    }

    const one = S(u.searchParams.get("supplier"));
    if (one && u.searchParams.get("one")) {
      const { data } = await admin.from("material_supplier").select("*").eq("name", one).maybeSingle();
      const { data: pos } = await admin.from("material_po").select("name, status, transaction_date, grand_total, project, per_received, per_billed").eq("supplier", one).order("transaction_date", { ascending: false }).limit(200);
      return NextResponse.json({ supplier: data, pos: pos || [] });
    }
    const name = S(u.searchParams.get("name"));
    if (name) {
      const [{ data: po }, { data: items }] = await Promise.all([
        admin.from("material_po").select("*").eq("name", name).maybeSingle(),
        admin.from("material_po_item").select("*").eq("po_name", name).order("idx"),
      ]);
      if (!po) throw new HttpError(404, "No such purchase order in the mirror — pull first.");
      return NextResponse.json({ po, items: items || [] });
    }

    const status = S(u.searchParams.get("status")), supplier = S(u.searchParams.get("supplier"));
    const from = D(u.searchParams.get("from")), to = D(u.searchParams.get("to"));
    const page = Math.max(0, Number(u.searchParams.get("page")) || 0), size = 200;
    let sel = admin.from("material_po").select("name, supplier, supplier_name, status, docstatus, transaction_date, schedule_date, grand_total, net_total, currency, project, per_received, per_billed, advance_paid, set_warehouse, owner, erp_modified", { count: "exact" }).order("transaction_date", { ascending: false }).order("name", { ascending: false }).range(page * size, page * size + size - 1);
    if (status) sel = sel.eq("status", status);
    if (supplier) sel = sel.eq("supplier", supplier);
    if (from) sel = sel.gte("transaction_date", from);
    if (to) sel = sel.lte("transaction_date", to);
    if (q) sel = sel.or(`name.ilike.%${q}%,supplier_name.ilike.%${q}%,project.ilike.%${q}%`);
    const { data, error, count } = await sel;
    if (error) { if (missing(error.message)) return NextResponse.json({ installed: false, rows: [], total: 0, statuses: {} }); throw new Error(error.message); }
    // the status spread and the cursor, for the header
    const { data: st } = await admin.from("material_po").select("status");
    const statuses: Record<string, number> = {};
    for (const r of st || []) statuses[S(r.status) || "?"] = (statuses[S(r.status) || "?"] || 0) + 1;
    const { data: setting } = await admin.from("material_setting").select("value").eq("key", "po_pull").maybeSingle();
    return NextResponse.json({ installed: true, rows: data || [], total: count || 0, page, size, statuses, pull: setting ? parseSetting(setting.value) : null });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await requireSaamaan();
    const admin = adminClient();
    const body = await readBody(req, {});
    const phase = S(body.phase);
    const cfg = await erp();
    const now = new Date().toISOString();
    const by = String((me as { email?: string }).email || "");

    if (phase === "po") {
      // headers — from where the last complete pull stopped (modified), else everything
      const { data: setting } = await admin.from("material_setting").select("value").eq("key", "po_pull").maybeSingle();
      const st = parseSetting(setting?.value);
      const since = body.full ? "" : S(st.modified);
      const start = Math.max(0, Number(body.start) || 0);
      const filters = since ? [["modified", ">=", since]] : null;
      let found = 0, written = 0, lastMod = since, pages = 0;
      for (let s = start; pages < 24; s += 500, pages++) {
        const rows = await erpPage(cfg, "Purchase Order", PO_FIELDS, filters, s, 500);
        found += rows.length;
        if (!rows.length) { return finish(); }
        const up = rows.map((p) => ({
          name: S(p.name), supplier: S(p.supplier), supplier_name: S(p.supplier_name), status: S(p.status), docstatus: Number(p.docstatus) || 0,
          transaction_date: D(p.transaction_date), schedule_date: D(p.schedule_date), grand_total: N(p.grand_total), net_total: N(p.net_total), taxes: N(p.total_taxes_and_charges),
          currency: S(p.currency), project: S(p.project), per_received: N(p.per_received), per_billed: N(p.per_billed), advance_paid: N(p.advance_paid), set_warehouse: S(p.set_warehouse), owner: S(p.owner),
          erp_modified: T(p.modified), erp: p, pulled_at: now,
        }));
        const { error } = await admin.from("material_po").upsert(up, { onConflict: "name" });
        if (error) { if (missing(error.message)) throw new HttpError(503, "Run migration 0136 first — the purchase orders have nowhere to live yet."); throw new Error(error.message); }
        written += up.length;
        for (const p of rows) if (S(p.modified) > lastMod) lastMod = S(p.modified);
        if (rows.length < 500) { return finish(); }
      }
      // more to come — the screen calls again with next_start
      return NextResponse.json({ ok: true, phase, found, written, next_start: start + pages * 500, done: false });
      async function finish() {
        await admin.from("material_setting").upsert({ key: "po_pull", value: JSON.stringify({ ...st, modified: lastMod || st.modified || "", at: now, by }), updated_by: by, updated_at: now }, { onConflict: "key" });
        return NextResponse.json({ ok: true, phase, found, written, done: true, since: since || "the beginning" });
      }
    }

    if (phase === "po_items") {
      // the child table in bulk: one ERP row per PO line, keyed by the line's own name
      const { data: setting } = await admin.from("material_setting").select("value").eq("key", "po_pull").maybeSingle();
      const st = parseSetting(setting?.value);
      const since = body.full ? "" : S(st.items_modified);
      const start = Math.max(0, Number(body.start) || 0);
      const filters = since ? [["modified", ">=", since]] : null;
      let found = 0, written = 0, lastMod = since, pages = 0;
      for (let s = start; pages < 20; s += 500, pages++) {
        const rows = await erpPage(cfg, "Purchase Order", PO_ITEM_FIELDS, filters, s, 500, "modified asc, `tabPurchase Order Item`.idx asc");
        found += rows.length;
        if (!rows.length) return finishItems();
        const up = rows.filter((r) => S(r.row_name)).map((r) => ({
          row_name: S(r.row_name), po_name: S(r.name), idx: Number(r.row_idx) || 0, item_code: S(r.item_code), item_name: S(r.item_name),
          qty: N(r.qty), uom: S(r.uom), rate: N(r.rate), amount: N(r.amount), received_qty: N(r.received_qty), billed_amt: N(r.billed_amt),
          warehouse: S(r.warehouse), schedule_date: D(r.schedule_date), project: S(r.project), pulled_at: now,
        }));
        if (up.length) {
          const { error } = await admin.from("material_po_item").upsert(up, { onConflict: "row_name" });
          if (error) { if (missing(error.message)) throw new HttpError(503, "Run migration 0136 first."); throw new Error(error.message); }
          written += up.length;
        }
        for (const r of rows) if (S(r.modified) > lastMod) lastMod = S(r.modified);
        if (rows.length < 500) return finishItems();
      }
      return NextResponse.json({ ok: true, phase, found, written, next_start: start + pages * 500, done: false });
      async function finishItems() {
        await admin.from("material_setting").upsert({ key: "po_pull", value: JSON.stringify({ ...st, items_modified: lastMod || st.items_modified || "", items_at: now, by }), updated_by: by, updated_at: now }, { onConflict: "key" });
        return NextResponse.json({ ok: true, phase, found, written, done: true });
      }
    }

    if (phase === "grn") {
      const { data: setting } = await admin.from("material_setting").select("value").eq("key", "po_pull").maybeSingle();
      const st = parseSetting(setting?.value);
      const since = body.full ? "" : S(st.grn_modified);
      const start = Math.max(0, Number(body.start) || 0);
      const filters = since ? [["modified", ">=", since]] : null;
      let found = 0, written = 0, lastMod = since, pages = 0;
      for (let s2 = start; pages < 24; s2 += 500, pages++) {
        const rows = await erpPage(cfg, "Purchase Receipt", GRN_FIELDS, filters, s2, 500);
        found += rows.length;
        if (!rows.length) return finishGrn();
        const up = rows.map((g) => ({
          name: S(g.name), supplier: S(g.supplier), supplier_name: S(g.supplier_name), status: S(g.status), docstatus: Number(g.docstatus) || 0,
          posting_date: D(g.posting_date), posting_time: S(g.posting_time), grand_total: N(g.grand_total), net_total: N(g.net_total), taxes: N(g.total_taxes_and_charges),
          currency: S(g.currency), project: S(g.project), set_warehouse: S(g.set_warehouse), is_return: !!Number(g.is_return), per_billed: N(g.per_billed),
          total_qty: N(g.total_qty), owner: S(g.owner), remarks: S(g.remarks), erp_modified: T(g.modified), erp: g, pulled_at: now,
        }));
        const { error } = await admin.from("material_grn").upsert(up, { onConflict: "name" });
        if (error) { if (missing(error.message)) throw new HttpError(503, "Run migration 0157 first — the GRNs have nowhere to live yet."); throw new Error(error.message); }
        written += up.length;
        for (const g of rows) if (S(g.modified) > lastMod) lastMod = S(g.modified);
        if (rows.length < 500) return finishGrn();
      }
      return NextResponse.json({ ok: true, phase, found, written, next_start: start + pages * 500, done: false });
      async function finishGrn() {
        await admin.from("material_setting").upsert({ key: "po_pull", value: JSON.stringify({ ...st, grn_modified: lastMod || st.grn_modified || "", grn_at: now, by }), updated_by: by, updated_at: now }, { onConflict: "key" });
        return NextResponse.json({ ok: true, phase, found, written, done: true, since: since || "the beginning" });
      }
    }

    if (phase === "grn_items") {
      const { data: setting } = await admin.from("material_setting").select("value").eq("key", "po_pull").maybeSingle();
      const st = parseSetting(setting?.value);
      const since = body.full ? "" : S(st.grn_items_modified);
      const start = Math.max(0, Number(body.start) || 0);
      const filters = since ? [["modified", ">=", since]] : null;
      let found = 0, written = 0, lastMod = since, pages = 0;
      for (let s2 = start; pages < 20; s2 += 500, pages++) {
        const rows = await erpPage(cfg, "Purchase Receipt", GRN_ITEM_FIELDS, filters, s2, 500, "modified asc, `tabPurchase Receipt Item`.idx asc");
        found += rows.length;
        if (!rows.length) return finishGrnItems();
        const up = rows.filter((r) => S(r.row_name)).map((r) => ({
          row_name: S(r.row_name), grn_name: S(r.name), idx: Number(r.row_idx) || 0, item_code: S(r.item_code), item_name: S(r.item_name),
          qty: N(r.qty), received_qty: N(r.received_qty), rejected_qty: N(r.rejected_qty), uom: S(r.uom), rate: N(r.rate), amount: N(r.amount),
          warehouse: S(r.warehouse), rejected_warehouse: S(r.rejected_warehouse), purchase_order: S(r.purchase_order), purchase_order_item: S(r.purchase_order_item),
          batch_no: S(r.batch_no), serial_no: S(r.serial_no), project: S(r.project), pulled_at: now,
        }));
        if (up.length) {
          const { error } = await admin.from("material_grn_item").upsert(up, { onConflict: "row_name" });
          if (error) { if (missing(error.message)) throw new HttpError(503, "Run migration 0157 first."); throw new Error(error.message); }
          written += up.length;
        }
        for (const r of rows) if (S(r.modified) > lastMod) lastMod = S(r.modified);
        if (rows.length < 500) return finishGrnItems();
      }
      return NextResponse.json({ ok: true, phase, found, written, next_start: start + pages * 500, done: false });
      async function finishGrnItems() {
        await admin.from("material_setting").upsert({ key: "po_pull", value: JSON.stringify({ ...st, grn_items_modified: lastMod || st.grn_items_modified || "", grn_items_at: now, by }), updated_by: by, updated_at: now }, { onConflict: "key" });
        return NextResponse.json({ ok: true, phase, found, written, done: true });
      }
    }

    if (phase === "pinv") {
      const { data: setting } = await admin.from("material_setting").select("value").eq("key", "po_pull").maybeSingle();
      const st = parseSetting(setting?.value);
      const since = body.full ? "" : S(st.pinv_modified);
      const start = Math.max(0, Number(body.start) || 0);
      const filters = since ? [["modified", ">=", since]] : null;
      let found = 0, written = 0, lastMod = since, pages = 0;
      for (let s2 = start; pages < 24; s2 += 500, pages++) {
        const rows = await erpPage(cfg, "Purchase Invoice", PINV_FIELDS, filters, s2, 500);
        found += rows.length;
        if (!rows.length) return finishPinv();
        const up = rows.map((v) => ({
          name: S(v.name), supplier: S(v.supplier), supplier_name: S(v.supplier_name), status: S(v.status),
          docstatus: Number(v.docstatus) || 0, posting_date: D(v.posting_date), posting_time: S(v.posting_time),
          due_date: D(v.due_date), bill_no: S(v.bill_no), bill_date: D(v.bill_date),
          grand_total: N(v.grand_total), net_total: N(v.net_total), taxes: N(v.total_taxes_and_charges),
          outstanding: N(v.outstanding_amount), currency: S(v.currency), project: S(v.project),
          is_paid: !!Number(v.is_paid), is_return: !!Number(v.is_return), update_stock: !!Number(v.update_stock),
          total_qty: N(v.total_qty), owner: S(v.owner), remarks: S(v.remarks),
          erp_modified: T(v.modified), erp: v, pulled_at: now,
        }));
        const { error } = await admin.from("material_pinv").upsert(up, { onConflict: "name" });
        if (error) { if (missing(error.message)) throw new HttpError(503, "Run migration 0162 first — the purchase invoices have nowhere to live yet."); throw new Error(error.message); }
        written += up.length;
        for (const v of rows) if (S(v.modified) > lastMod) lastMod = S(v.modified);
        if (rows.length < 500) return finishPinv();
      }
      return NextResponse.json({ ok: true, phase, found, written, next_start: start + pages * 500, done: false });
      async function finishPinv() {
        await admin.from("material_setting").upsert({ key: "po_pull", value: JSON.stringify({ ...st, pinv_modified: lastMod || st.pinv_modified || "", pinv_at: now, by }), updated_by: by, updated_at: now }, { onConflict: "key" });
        return NextResponse.json({ ok: true, phase, found, written, done: true, since: since || "the beginning" });
      }
    }

    if (phase === "pinv_items") {
      const { data: setting } = await admin.from("material_setting").select("value").eq("key", "po_pull").maybeSingle();
      const st = parseSetting(setting?.value);
      const since = body.full ? "" : S(st.pinv_items_modified);
      const start = Math.max(0, Number(body.start) || 0);
      const filters = since ? [["modified", ">=", since]] : null;
      let found = 0, written = 0, lastMod = since, pages = 0;
      for (let s2 = start; pages < 20; s2 += 500, pages++) {
        const rows = await erpPage(cfg, "Purchase Invoice", PINV_ITEM_FIELDS, filters, s2, 500, "modified asc, `tabPurchase Invoice Item`.idx asc");
        found += rows.length;
        if (!rows.length) return finishPinvItems();
        const up = rows.filter((r) => S(r.row_name)).map((r) => ({
          row_name: S(r.row_name), pinv_name: S(r.name), idx: Number(r.row_idx) || 0,
          item_code: S(r.item_code), item_name: S(r.item_name), qty: N(r.qty), received_qty: N(r.received_qty),
          uom: S(r.uom), rate: N(r.rate), amount: N(r.amount), net_amount: N(r.net_amount),
          taxable_value: N(r.taxable_value), warehouse: S(r.warehouse),
          purchase_order: S(r.purchase_order), po_detail: S(r.po_detail),
          purchase_receipt: S(r.purchase_receipt), pr_detail: S(r.pr_detail),
          item_group: S(r.item_group), project: S(r.project), pulled_at: now,
        }));
        if (up.length) {
          const { error } = await admin.from("material_pinv_item").upsert(up, { onConflict: "row_name" });
          if (error) { if (missing(error.message)) throw new HttpError(503, "Run migration 0162 first."); throw new Error(error.message); }
          written += up.length;
        }
        for (const r of rows) if (S(r.modified) > lastMod) lastMod = S(r.modified);
        if (rows.length < 500) return finishPinvItems();
      }
      return NextResponse.json({ ok: true, phase, found, written, next_start: start + pages * 500, done: false });
      async function finishPinvItems() {
        await admin.from("material_setting").upsert({ key: "po_pull", value: JSON.stringify({ ...st, pinv_items_modified: lastMod || st.pinv_items_modified || "", pinv_items_at: now, by }), updated_by: by, updated_at: now }, { onConflict: "key" });
        return NextResponse.json({ ok: true, phase, found, written, done: true });
      }
    }

    if (phase === "suppliers") {
      const start = Math.max(0, Number(body.start) || 0);
      const rows = await erpPage(cfg, "Supplier", ["*"], null, start, 500, "modified asc");
      // addresses and contacts for this page, through Dynamic Link
      const names = rows.map((r) => S(r.name)).filter(Boolean);
      const addrs = new Map<string, Doc[]>(), cons = new Map<string, Doc[]>();
      for (let i = 0; i < names.length; i += 100) {
        const chunk = names.slice(i, i + 100);
        const [a, c] = await Promise.all([
          erpPage(cfg, "Address", ["name", "address_title", "address_type", "address_line1", "address_line2", "city", "state", "pincode", "country", "phone", "email_id", "gstin", "links.link_name"], [["Dynamic Link", "link_doctype", "=", "Supplier"], ["Dynamic Link", "link_name", "in", chunk]], 0, 2000, "name asc"),
          erpPage(cfg, "Contact", ["name", "first_name", "last_name", "designation", "phone", "mobile_no", "email_id", "is_primary_contact", "links.link_name"], [["Dynamic Link", "link_doctype", "=", "Supplier"], ["Dynamic Link", "link_name", "in", chunk]], 0, 2000, "name asc"),
        ]);
        for (const x of a) (addrs.get(S(x.link_name)) ?? addrs.set(S(x.link_name), []).get(S(x.link_name))!).push({ name: x.name, title: x.address_title, type: x.address_type, line1: x.address_line1, line2: x.address_line2, city: x.city, state: x.state, pincode: x.pincode, country: x.country, phone: x.phone, email: x.email_id, gstin: x.gstin });
        for (const x of c) (cons.get(S(x.link_name)) ?? cons.set(S(x.link_name), []).get(S(x.link_name))!).push({ name: x.name, first_name: x.first_name, last_name: x.last_name, designation: x.designation, phone: x.phone, mobile: x.mobile_no, email: x.email_id, primary: B(x.is_primary_contact) });
      }
      const up = rows.map((s) => ({
        name: S(s.name), supplier_name: S(s.supplier_name), supplier_group: S(s.supplier_group), supplier_type: S(s.supplier_type), gst_no: S(s.gst_no) || S(s.tax_id), gst_category: S(s.gst_category), country: S(s.country),
        mobile_no: S(s.mobile_no), email_id: S(s.email_id), primary_address: S(s.primary_address), primary_contact: S(s.supplier_primary_contact), payment_terms: S(s.payment_terms), website: S(s.website),
        bank_name: S(s.bank_name), account_no: S(s.account_no), ifsc_code: S(s.ifsc_code), status_of_supplier: S(s.status_of_supplier), rating_percentage: N(s.rating_percentage),
        disabled: B(s.disabled), on_hold: B(s.on_hold), erp_modified: T(s.modified), erp: s, addresses: addrs.get(S(s.name)) ?? [], contacts: cons.get(S(s.name)) ?? [], pulled_at: now,
      }));
      if (up.length) {
        const { error } = await admin.from("material_supplier").upsert(up, { onConflict: "name" });
        if (error) { if (missing(error.message)) throw new HttpError(503, "Run migration 0136 first."); throw new Error(error.message); }
      }
      const done = rows.length < 500;
      if (done) { const cur = parseSetting((await admin.from("material_setting").select("value").eq("key", "po_pull").maybeSingle()).data?.value); await admin.from("material_setting").upsert({ key: "po_pull", value: JSON.stringify({ ...cur, suppliers_at: now, by }), updated_by: by, updated_at: now }, { onConflict: "key" }); }
      return NextResponse.json({ ok: true, phase, found: rows.length, written: up.length, next_start: start + 500, done });
    }

    throw new HttpError(400, "unknown phase");
  } catch (e) { return errJson(e); }
}
