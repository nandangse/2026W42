import { HttpError } from "@/lib/auth";
import { erpAuth } from "@/lib/saamaan-stock";

/**
 * THE ERP'S OWN SERVICE DASHBOARD, LIVE (Dr Raghu, 12 Oct 2026, with the PDF of
 * nandanerp's "Nandan Service" dashboard: "these minimum things need to come
 * from live data on the main dashboard in Genie also. Genie Seva should have
 * them").
 *
 * Not re-derived: every Number Card on that dashboard is asked of the ERP
 * itself (number_card.get_result) with its own filters, so Seva shows exactly
 * the figure the ERP shows — Open Service Issues read 20 on both the day it
 * was built. Read in parallel, kept five minutes.
 */
export type ErpCard = { name: string; label: string; value: number | null; money: boolean; pct: number | null; doctype: string; func: string; color: string | null; error?: string };
let cache: { at: number; cards: ErpCard[] } | null = null;

async function pool<T, R>(items: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await f(items[k]); } }));
  return out;
}

export async function erpServiceCards(fresh = false): Promise<{ cards: ErpCard[]; at: string; dashboard_url: string }> {
  const a = await erpAuth();
  if (!a) throw new HttpError(503, "The ERP's URL and token are not saved — CRM → Integrations.");
  const dashboard_url = `${a.base}/app/dashboard-view/${encodeURIComponent("Nandan Service")}`;
  if (!fresh && cache && Date.now() - cache.at < 5 * 60_000) return { cards: cache.cards, at: new Date(cache.at).toISOString(), dashboard_url };
  const dr = await fetch(`${a.base}/api/resource/Dashboard/${encodeURIComponent("Nandan Service")}`, { headers: a.H, signal: AbortSignal.timeout(30000) });
  if (!dr.ok) throw new HttpError(502, `The ERP answered ${dr.status} for its service dashboard.`);
  const names = ((((await dr.json()) as { data?: { cards?: { card: string }[] } }).data?.cards) || []).map((c) => c.card);
  const cards = await pool(names, 8, async (name): Promise<ErpCard> => {
    try {
      const nr = await fetch(`${a.base}/api/resource/${encodeURIComponent("Number Card")}/${encodeURIComponent(name)}`, { headers: a.H, signal: AbortSignal.timeout(30000) });
      const doc = ((await nr.json()) as { data?: Record<string, unknown> }).data;
      if (!doc) throw new Error(`card ${nr.status}`);
      const body = JSON.stringify({ doc, filters: doc.filters_json || "[]" });
      const rr = await fetch(`${a.base}/api/method/frappe.desk.doctype.number_card.number_card.get_result`, { method: "POST", headers: { ...a.H, "content-type": "application/json" }, body, signal: AbortSignal.timeout(45000) });
      const value = rr.ok ? Number(((await rr.json()) as { message?: unknown }).message) : null;
      let pct: number | null = null;
      if (doc.show_percentage_stats && value !== null) {
        const pr = await fetch(`${a.base}/api/method/frappe.desk.doctype.number_card.number_card.get_percentage_difference`, { method: "POST", headers: { ...a.H, "content-type": "application/json" }, body: JSON.stringify({ doc, filters: doc.filters_json || "[]", result: value }), signal: AbortSignal.timeout(45000) }).catch(() => null);
        if (pr?.ok) { const m = ((await pr.json()) as { message?: unknown }).message; pct = m === null || m === undefined || m === "" ? null : Number(m); }
      }
      const func = String(doc.function || "Count");
      const field = String(doc.aggregate_function_based_on || "");
      return { name, label: String(doc.label || name), value: Number.isFinite(value as number) ? (value as number) : null, money: func !== "Count" && /cost|amount|total|value|price|spent|billed/i.test(field), pct: Number.isFinite(pct as number) ? pct : null, doctype: String(doc.document_type || ""), func, color: (doc.color as string) || null };
    } catch (e) { return { name, label: name, value: null, money: false, pct: null, doctype: "", func: "", color: null, error: String((e as Error).message).slice(0, 100) }; }
  });
  cache = { at: Date.now(), cards };
  return { cards, at: new Date().toISOString(), dashboard_url };
}
