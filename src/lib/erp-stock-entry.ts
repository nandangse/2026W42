import type { SupabaseClient } from "@supabase/supabase-js";
import { erpAuth } from "@/lib/saamaan-stock";

/**
 * THE PHYSICAL MOVE (Dr Raghu, 15 Oct 2026: "when the release is done … the
 * stock should be physically moved by reducing it from stock … to the WIP
 * warehouse for that particular job. That is not happening").
 *
 * Stock lives in the ERP, so the move is an ERP Stock Entry — a Material
 * Transfer carrying the job number (custom_job_no), out of a warehouse
 * Masters calls Stock and into the WIP warehouse — exactly the document the
 * store makes by hand today (STE-29296 for 2601, Khopoli Main Store → Khopoli
 * Work In Progress). Genie's WIP real already counts those, so a release made
 * here shows on the WIP screen the same way.
 *
 * The source is the Stock warehouse holding the most of the item; if none
 * holds enough, nothing moves and the reason comes back word for word. The
 * target is the setting wip_warehouse, else the ERP's own "Work In Progress"
 * under the company. Drafted, then submitted; the ERP's number comes back.
 */
const S = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const J = (v: unknown) => encodeURIComponent(JSON.stringify(v));
const DEFAULT_WIP = "Khopoli Work In Progress - NGSE";

export async function wipWarehouse(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.from("material_setting").select("value").eq("key", "wip_warehouse").maybeSingle();
  return S(data?.value) || DEFAULT_WIP;
}

export async function transferToWip(admin: SupabaseClient, line: { item_code: string; item_name?: string; qty: number; uom?: string; job_no: string; slip_no: string }, by: string): Promise<{ name: string; from: string; to: string }> {
  const auth = await erpAuth();
  if (!auth) throw new Error("The ERP is not connected — set it under CRM → Integrations.");
  const { base, H } = auth;
  const [{ data: kinds }, to] = await Promise.all([admin.from("material_warehouse").select("warehouse, kind").eq("kind", "Stock"), wipWarehouse(admin)]);
  const stockWh = (kinds || []).map((k) => S(k.warehouse));
  if (!stockWh.length) throw new Error("No warehouse is typed Stock in Masters — nothing to issue from.");
  const r = await fetch(`${base}/api/resource/Bin?filters=${J([["item_code", "=", line.item_code], ["warehouse", "in", stockWh]])}&fields=${J(["warehouse", "actual_qty", "reserved_qty"])}&limit_page_length=100`, { headers: H, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`The ERP answered ${r.status} reading the stock of ${line.item_code}.`);
  const bins = (((await r.json()) as { data?: { warehouse: string; actual_qty: number; reserved_qty: number }[] }).data || []).map((b) => ({ warehouse: S(b.warehouse), free: (Number(b.actual_qty) || 0) - (Number(b.reserved_qty) || 0), actual: Number(b.actual_qty) || 0 })).sort((a, b) => b.free - a.free);
  const src = bins.find((b) => b.free >= line.qty);
  if (!src) {
    const have = bins.filter((b) => b.actual > 0).map((b) => `${b.actual}${b.free !== b.actual ? ` (${b.free} free)` : ""} in ${b.warehouse}`).join(", ");
    throw new Error(`Not enough ${line.item_code} in stock to issue ${line.qty}${line.uom ? ` ${line.uom}` : ""}: ${have || "none in any Stock warehouse"}.`);
  }
  const doc = {
    doctype: "Stock Entry", stock_entry_type: "Material Transfer", purpose: "Material Transfer",
    custom_job_no: line.job_no, from_warehouse: src.warehouse, to_warehouse: to,
    remarks: `Genie issue slip ${line.slip_no} · released by ${by}`,
    items: [{ item_code: line.item_code, qty: line.qty, s_warehouse: src.warehouse, t_warehouse: to, ...(line.uom ? { uom: line.uom } : {}) }],
  };
  const ins = await fetch(`${base}/api/resource/Stock%20Entry`, { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify(doc), signal: AbortSignal.timeout(30000) });
  const made = (await ins.json().catch(() => ({}))) as { data?: Record<string, unknown>; exception?: string; _server_messages?: string };
  if (!ins.ok || !made.data?.name) throw new Error(erpWords(made) || `The ERP refused the stock entry (${ins.status}).`);
  const sub = await fetch(`${base}/api/method/frappe.client.submit`, { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ doc: made.data }), signal: AbortSignal.timeout(30000) });
  if (!sub.ok) {
    const j = (await sub.json().catch(() => ({}))) as { exception?: string; _server_messages?: string };
    /* the draft stays in the ERP for a person to finish; say so */
    throw new Error(`${erpWords(j) || `The ERP would not submit ${S(made.data.name)} (${sub.status})`} — the draft ${S(made.data.name)} is in the ERP, unsubmitted.`);
  }
  return { name: S(made.data.name), from: src.warehouse, to };
}

/** The ERP's own words out of its error JSON, without the HTML. */
function erpWords(j: { exception?: string; _server_messages?: string }): string {
  try {
    if (j._server_messages) { const arr = JSON.parse(j._server_messages) as string[]; const m = arr.map((x) => { try { return String((JSON.parse(x) as { message?: string }).message || x); } catch { return x; } }).join(" "); return m.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300); }
    if (j.exception) return String(j.exception).split(":").slice(-1)[0].trim().slice(0, 300);
  } catch { /* fall through */ }
  return "";
}
