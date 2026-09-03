import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireSaamaan } from "@/lib/saamaan";
import { crmDb, crmConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/saamaan/stock?code=N000454 — an item's stock register, read LIVE
 * off the ERP (Dr Raghu, 3 Sep 2026: "Stock Register in the ERP can you
 * know where it is?" — pointing at the Stock module).
 *
 * WHERE IT IS: a Stock Entry is the document a person makes; when it is
 * submitted the ERP writes one line per item per warehouse into the Stock
 * Ledger Entry — as do Purchase Receipts and Delivery Notes. THAT table is
 * the register: every movement, the quantity in or out, the balance after
 * it, the warehouse, the date, and the voucher that caused it. Only that
 * — "dont give me balance, i want to see the first report with every
 * transaction — in and out."
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

const SLE_FIELDS = [
  "name", "posting_date", "posting_time", "warehouse", "actual_qty", "qty_after_transaction", "incoming_rate", "valuation_rate",
  "stock_value", "stock_value_difference", "voucher_type", "voucher_no", "project", "batch_no", "serial_no", "modified_by",
];

export async function GET(req: Request) {
  try {
    await requireSaamaan();
    const p = new URL(req.url).searchParams;
    const code = String(p.get("code") || "").trim();
    if (!code) throw new HttpError(400, "code required");
    const limit = Math.min(1000, Math.max(50, Number(p.get("limit") || 300) || 300));
    const { base, H } = await erpConfig();

    const get = async (u: string): Promise<Doc[]> => {
      const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status}.`);
      return ((await r.json()) as { data?: Doc[] }).data ?? [];
    };
    const J = (x: unknown) => encodeURIComponent(JSON.stringify(x));

    const [ledger, countRes] = await Promise.all([
      get(`${base}/api/resource/${encodeURIComponent("Stock Ledger Entry")}?filters=${J([["item_code", "=", code], ["is_cancelled", "=", 0]])}`
        + `&fields=${J(SLE_FIELDS)}&order_by=${encodeURIComponent("posting_date desc, posting_time desc, creation desc")}&limit_page_length=${limit}`),
      fetch(`${base}/api/method/frappe.client.get_count?doctype=${encodeURIComponent("Stock Ledger Entry")}&filters=${J([["item_code", "=", code], ["is_cancelled", "=", 0]])}`, { headers: H, signal: AbortSignal.timeout(20000) })
        .then(async (r) => (r.ok ? Number(((await r.json()) as { message?: number }).message ?? 0) : null)).catch(() => null),
    ]);

    return NextResponse.json({
      ok: true,
      erpBase: base,
      code,
      readAt: new Date().toISOString(),
      ledger,
      ledgerTotal: countRes,
      ledgerShown: ledger.length,
    });
  } catch (e) {
    return errJson(e);
  }
}
