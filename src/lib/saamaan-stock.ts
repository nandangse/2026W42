import type { SupabaseClient } from "@supabase/supabase-js";
import { crmDb, crmConfigured } from "@/crm/db";

type Doc = Record<string, unknown>;
const S = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();

/** The ERP's base URL and token, borrowed from the CRM's Integrations; null when not set. */
export async function erpAuth(): Promise<{ base: string; H: Record<string, string> } | null> {
  if (!crmConfigured()) return null;
  const { data } = await crmDb().from("integration_setting").select("config").eq("key", "erpnext").maybeSingle();
  const cfg = (data?.config || {}) as Record<string, string>;
  if (!cfg.url || !cfg.api_key || !cfg.api_secret) return null;
  return { base: cfg.url.replace(/\/+$/, ""), H: { authorization: `token ${cfg.api_key}:${cfg.api_secret}` } };
}

/**
 * Current stock per item, LIVE from the ERP's Bin — the Stock warehouses
 * only, per Masters — and what is on order everywhere. Null map when the
 * ERP is not reachable, which every screen shows as dots, never as zero.
 * (Lifted out of the MRP route on 3 Oct 2026 so the Kanban reads the same
 * figure the MRP run does.)
 */
export async function liveStock(admin: SupabaseClient, codes: string[]): Promise<Map<string, { stock: number; ordered: number; blocked: number }> | null> {
  if (!codes.length) return new Map();
  try {
    const auth = await erpAuth();
    if (!auth) return null;
    const { base, H } = auth;
    const { data: kinds } = await admin.from("material_warehouse").select("warehouse, kind").limit(500);
    const kindOf = new Map((kinds ?? []).map((k) => [S(k.warehouse), S(k.kind)]));
    const out = new Map<string, { stock: number; ordered: number; blocked: number }>();
    for (const c of codes) out.set(c, { stock: 0, ordered: 0, blocked: 0 });
    for (let i = 0; i < codes.length; i += 200) {
      const slice = codes.slice(i, i + 200);
      const r = await fetch(`${base}/api/resource/Bin?filters=${encodeURIComponent(JSON.stringify([["item_code", "in", slice]]))}`
        + `&fields=${encodeURIComponent(JSON.stringify(["item_code", "warehouse", "actual_qty", "ordered_qty", "reserved_qty"]))}&limit_page_length=5000`, { headers: H, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return null;
      for (const b of ((await r.json()) as { data?: Doc[] }).data ?? []) {
        const o = out.get(S(b.item_code)); if (!o) continue;
        if (kindOf.get(S(b.warehouse)) === "Stock") { o.stock += Number(b.actual_qty) || 0; o.blocked += Number(b.reserved_qty) || 0; }
        o.ordered += Number(b.ordered_qty) || 0;
      }
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * WHAT WENT OUT of the Stock warehouses per item over the last `months`
 * months — the ERP's Stock Ledger Entries with a negative quantity, not
 * cancelled, in the warehouses Masters calls Stock. Transfers into a WIP,
 * material issues, deliveries: all consumption from the Kanban's point of
 * view. Null when the ERP cannot be read.
 */
export async function consumption(admin: SupabaseClient, codes: string[], months = 6): Promise<Map<string, { qty: number; entries: number; first: string }> | null> {
  if (!codes.length) return new Map();
  try {
    const auth = await erpAuth();
    if (!auth) return null;
    const { base, H } = auth;
    const { data: kinds } = await admin.from("material_warehouse").select("warehouse, kind").limit(500);
    const stockWh = (kinds ?? []).filter((k) => S(k.kind) === "Stock").map((k) => S(k.warehouse));
    if (!stockWh.length) return new Map();
    const since = new Date(); since.setMonth(since.getMonth() - months);
    const sinceStr = since.toISOString().slice(0, 10);
    const out = new Map<string, { qty: number; entries: number; first: string }>();
    for (let i = 0; i < codes.length; i += 100) {
      const slice = codes.slice(i, i + 100);
      const filters = [["item_code", "in", slice], ["warehouse", "in", stockWh], ["posting_date", ">=", sinceStr], ["is_cancelled", "=", 0], ["actual_qty", "<", 0]];
      for (let start = 0; start < 100000; start += 500) {
        const r = await fetch(`${base}/api/resource/${encodeURIComponent("Stock Ledger Entry")}?filters=${encodeURIComponent(JSON.stringify(filters))}`
          + `&fields=${encodeURIComponent(JSON.stringify(["item_code", "actual_qty", "posting_date"]))}&limit_start=${start}&limit_page_length=500`, { headers: H, signal: AbortSignal.timeout(30000) });
        if (!r.ok) return null;
        const page = ((await r.json()) as { data?: Doc[] }).data ?? [];
        for (const e of page) {
          const k = S(e.item_code);
          const o = out.get(k) ?? { qty: 0, entries: 0, first: "9999-99-99" };
          o.qty += Math.abs(Number(e.actual_qty) || 0); o.entries++;
          const d = S(e.posting_date); if (d && d < o.first) o.first = d;
          out.set(k, o);
        }
        if (page.length < 500) break;
      }
    }
    return out;
  } catch {
    return null;
  }
}
