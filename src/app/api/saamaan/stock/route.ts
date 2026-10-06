import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireSaamaan } from "@/lib/saamaan";
import { wipKittedTotals } from "@/lib/wip-kitting";
import { crmDb, crmConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/saamaan/stock?code=N000454 — an item's stock, read LIVE off the
 * ERP (Dr Raghu, 3 Sep 2026: "Stock Register in the ERP can you know where
 * it is?" — pointing at the Stock module).
 *
 * WHERE IT IS: a Stock Entry is the document a person makes; when it is
 * submitted the ERP writes one line per item per warehouse into the Stock
 * Ledger Entry — as do Purchase Receipts and Delivery Notes. THAT table is
 * the register: every movement, the quantity in or out, the balance after
 * it, the warehouse, the date, and the voucher that caused it. Bin holds
 * the balance now, per item per warehouse.
 *
 * CLOSING STOCK IS THE STOCK WAREHOUSES ONLY: "For the purpose of the
 * stock it's ONLY the closing stock in the 'Stock' warehouses!" Which
 * warehouses those are is Genie's word, kept in material_warehouse
 * (Masters). A warehouse nobody has typed yet does not count, and the
 * answer says how many such there are, so a small number is never
 * mistaken for a complete one.
 *
 * NOT MIRRORED. The ledger was 412,158 lines on the day and grows by
 * thousands a day; an item's slice of it is read when the tab opens, in
 * about a second, and is exactly as current as the ERP. Reads only.
 */

type Doc = Record<string, unknown>;

async function erpConfig() {
  if (!crmConfigured())
    throw new HttpError(503, "The ERP token lives in the CRM's Integrations, and that database is not connected here.");
  const { data } = await crmDb().from("integration_setting").select("config").eq("key", "erpnext").maybeSingle();
  const cfg = (data?.config || {}) as Record<string, string>;
  if (!cfg.url || !cfg.api_key || !cfg.api_secret)
    throw new HttpError(400, "Save the ERPNext URL, key and secret in CRM → Integrations first.");
  return { base: cfg.url.replace(/\/+$/, ""), H: { authorization: `token ${cfg.api_key}:${cfg.api_secret}` } as Record<string, string> };
}

const BIN_FIELDS = ["warehouse", "actual_qty", "reserved_qty", "ordered_qty", "projected_qty", "valuation_rate", "stock_value"];
const SLE_FIELDS = [
  "name", "posting_date", "posting_time", "warehouse", "actual_qty", "qty_after_transaction", "incoming_rate", "valuation_rate",
  "stock_value", "stock_value_difference", "voucher_type", "voucher_no", "project", "batch_no", "serial_no", "modified_by",
];

/**
 * THE VALUE OF STOCK, NOW (Dr Raghu, 3 Sep 2026: "show current value of
 * stock" — on the dashboard).
 *
 * Read LIVE off Bin, every warehouse, and sorted by Genie's word on what
 * each warehouse is. The ERP's own total is Rs 109.59 Cr across nineteen
 * warehouses; only Rs 27.63 Cr of it sits in the ones typed "Stock", because
 * Finished Goods (Rs 37.71 Cr), Khopoli Finished Goods (Rs 22.98 Cr) and ten
 * others have never been typed. So the answer is given in FOUR PARTS, not
 * one number: Stock, WIP, Finished goods, Vendor — and what is untyped,
 * named and counted, because a total that quietly folds Rs 69 Cr of
 * unclassified warehouses into "stock" is a number the balance sheet will
 * later disagree with.
 *
 * 25,551 bins hold something today; five thousand a page, six pages, about
 * two seconds. Not mirrored: it is read when the card is drawn and is as
 * current as the ERP.
 */
async function readStockValue(base: string, H: Record<string, string>) {
  const J = (x: unknown) => encodeURIComponent(JSON.stringify(x));
  const byWh = new Map<string, { warehouse: string; value: number; qty: number; bins: number }>();
  for (let start = 0; start < 200000; start += 5000) {
    const u = `${base}/api/resource/Bin?fields=${J(["warehouse", "stock_value", "actual_qty"])}`
      + `&filters=${J([["actual_qty", "!=", 0]])}&limit_start=${start}&limit_page_length=5000`;
    const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(25000) });
    if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status} reading Bin.`);
    const page = ((await r.json()) as { data?: Doc[] }).data ?? [];
    for (const b of page) {
      const w = String(b.warehouse || "");
      const cur = byWh.get(w) ?? { warehouse: w, value: 0, qty: 0, bins: 0 };
      cur.value += Number(b.stock_value) || 0;
      cur.qty += Number(b.actual_qty) || 0;
      cur.bins += 1;
      byWh.set(w, cur);
    }
    if (page.length < 5000) break;
  }
  const kinds = await adminClient().from("material_warehouse").select("warehouse, kind").limit(500)
    .then((r) => (r.error ? null : r.data ?? []));
  const kindOf = new Map((kinds ?? []).map((k) => [String(k.warehouse), String(k.kind || "")]));
  const rows = [...byWh.values()]
    .map((w) => ({ ...w, kind: kindOf.get(w.warehouse) ?? "" }))
    .sort((a, b) => b.value - a.value);
  const sumKind = (k: string) => rows.filter((r) => r.kind === k).reduce((a, r) => a + r.value, 0);
  const untyped = rows.filter((r) => !r.kind);
  /* IGNORE (Dr Raghu, 6 Oct 2026): a warehouse typed Ignore is in none of
     the parts and out of Genie's total — named, so nothing vanishes silently */
  const ignored = rows.filter((r) => r.kind === "Ignore");
  const erpTotal = rows.reduce((a, r) => a + r.value, 0);
  const ignoredValue = ignored.reduce((a, r) => a + r.value, 0);
  return {
    readAt: new Date().toISOString(),
    mastersReady: kinds !== null,
    erpTotal,
    genieTotal: erpTotal - ignoredValue,
    ignored: ignoredValue,
    ignoredWarehouses: ignored.map((r) => r.warehouse),
    stock: sumKind("Stock"),
    wip: sumKind("WIP"),
    finished: sumKind("Finished goods"),
    vendor: sumKind("Vendor"),
    stores: sumKind("Stores"),
    untyped: untyped.reduce((a, r) => a + r.value, 0),
    untypedWarehouses: untyped.map((r) => r.warehouse),
    warehouses: rows,
  };
}

export async function GET(req: Request) {
  try {
    await requireSaamaan();
    const p = new URL(req.url).searchParams;
    if (p.get("mode") === "value") {
      const { base, H } = await erpConfig();
      /* "show WIP real only, which is already there in the inventory screen" (Dr Raghu, 6 Oct 2026) —
         what the store has physically transferred to the live jobs, not the ERP's WIP warehouses */
      const [value, kitted] = await Promise.all([readStockValue(base, H), wipKittedTotals(adminClient()).catch(() => null)]);
      return NextResponse.json({ ok: true, erpBase: base, ...value, wipReal: kitted && kitted.erpRead !== false ? kitted.actual : null, wipJobs: kitted?.withIssue ?? null });
    }
    const code = String(p.get("code") || "").trim();
    if (!code) throw new HttpError(400, "code required");
    const limit = Math.min(1000, Math.max(50, Number(p.get("limit") || 300) || 300));
    const { base, H } = await erpConfig();
    const admin = adminClient();

    const get = async (u: string): Promise<Doc[]> => {
      const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status}.`);
      return ((await r.json()) as { data?: Doc[] }).data ?? [];
    };
    const J = (x: unknown) => encodeURIComponent(JSON.stringify(x));

    const [bins, ledger, countRes, kinds] = await Promise.all([
      get(`${base}/api/resource/Bin?filters=${J([["item_code", "=", code]])}&fields=${J(BIN_FIELDS)}&order_by=warehouse%20asc&limit_page_length=100`),
      get(`${base}/api/resource/${encodeURIComponent("Stock Ledger Entry")}?filters=${J([["item_code", "=", code], ["is_cancelled", "=", 0]])}`
        + `&fields=${J(SLE_FIELDS)}&order_by=${encodeURIComponent("posting_date desc, posting_time desc, creation desc")}&limit_page_length=${limit}`),
      fetch(`${base}/api/method/frappe.client.get_count?doctype=${encodeURIComponent("Stock Ledger Entry")}&filters=${J([["item_code", "=", code], ["is_cancelled", "=", 0]])}`, { headers: H, signal: AbortSignal.timeout(20000) })
        .then(async (r) => (r.ok ? Number(((await r.json()) as { message?: number }).message ?? 0) : null)).catch(() => null),
      // Genie's word on each warehouse. No table yet → nobody has said.
      admin.from("material_warehouse").select("warehouse, kind").limit(500).then((r) => (r.error ? null : r.data ?? [])),
    ]);

    const kindOf = new Map((kinds ?? []).map((k) => [String(k.warehouse), String(k.kind || "")]));
    const typed: Doc[] = bins.map((b) => ({ ...b, kind: kindOf.get(String(b.warehouse)) ?? "" } as Doc));
    const held = typed.filter((b) => Number(b.actual_qty) !== 0);
    const stock = held.filter((b) => b.kind === "Stock");
    const sum = (rows: Doc[], k: string) => rows.reduce((a, b) => a + (Number(b[k]) || 0), 0);
    const stockQty = sum(stock, "actual_qty");
    const stockValue = sum(stock, "stock_value");

    return NextResponse.json({
      ok: true,
      erpBase: base,
      code,
      readAt: new Date().toISOString(),
      mastersReady: kinds !== null,
      bins: typed,
      closing: {
        // The ERP's own closing stock — every warehouse, as it counts it.
        erpQty: sum(held, "actual_qty"),
        erpValue: sum(held, "stock_value"),
        qty: stockQty,
        value: stockValue,
        // The ERP's average valuation across the Stock warehouses, weighted by quantity.
        rate: stockQty ? stockValue / stockQty : null,
        stockWarehouses: stock.length,
        // Held elsewhere — WIP, at a vendor, or in a warehouse nobody has typed.
        elsewhereQty: sum(held.filter((b) => b.kind !== "Stock"), "actual_qty"),
        untypedQty: sum(held.filter((b) => !b.kind), "actual_qty"),
        untypedWarehouses: held.filter((b) => !b.kind).length,
      },
      ledger,
      ledgerTotal: countRes,
      ledgerShown: ledger.length,
    });
  } catch (e) {
    return errJson(e);
  }
}
