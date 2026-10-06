/**
 * The tools Genie reads the inventory through — for Ask Genie (the chat) and
 * for the suggestions. READ ONLY: nothing here writes the ERP or Genie's own
 * tables; a person acts on what Genie says.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { erpOrThrow, inventoryDashboard, warehouseBins, warehouseKinds } from "@/lib/saamaan-inventory";

const S = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const J = (x: unknown) => encodeURIComponent(JSON.stringify(x));

export const INVENTORY_SYSTEM = `You are Genie, the inventory assistant inside Saamaan, the materials module of Nandan GSE's own software. Nandan GSE builds ground support equipment, material handling equipment and defence vehicles in India.

Who you talk to: the store and purchase team — chiefly Rameez, who keeps the Item master and the stores. Answer like a sharp colleague who has the stock in front of him: the number first, then what it means, then what to do.

How the stock is read here:
- The ERP (ERPNext) owns the stock. Every figure you give comes from a tool call made now — never from memory, never estimated. If a tool fails or returns nothing, say so plainly.
- "RM stock" or "stock" is ONLY the warehouses Genie's Masters types "Stock". "WIP" is the warehouses typed "WIP". "Total inventory" is every warehouse. Warehouses nobody has typed yet are called out as untyped. A warehouse typed "Ignore" is left out of every figure — RM, WIP, finished goods and the total — until its data is cleaned up in the ERP; mention it only as what was left out.
- Items carry a class A, B or C (custom_item_class); an item with no class is unclassed, not C.
- A count sheet is a physical count of a set of items in one location. The variance is physical minus the ERP. A variance opens a SUSPENSE entry in Genie (not in the ERP) so the books can be read as the shelf says; the suspense is released when it is explained — by a back-dated ERP entry or stock reconciliation (released automatically by "Sync with ERP"), or by a person giving a reason (WIP, consumption, unrecorded receipt, scrap, UOM).
- Money in rupees, Indian style: ₹1.23 Cr, ₹4.5 L, ₹12,345. Quantities with their unit.

You can only read. You cannot change the ERP, create counts or release suspense — tell the person which screen does it (Inventory → Stock reconciliation, → Suspense, Masters). Keep answers short; use a small table when it helps.`;

export const TOOLS: Anthropic.Tool[] = [
  { name: "inventory_summary", description: "RM stock, WIP stock and total inventory today (value, quantity, items), the split by class A/B/C, and every warehouse with its type, item count and value. Read live from the ERP.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "search_items", description: "Find items in the Item master mirror by code or words in the name. Returns code, name, group, unit, class.", input_schema: { type: "object", properties: { query: { type: "string", description: "Item code or words from the name" }, limit: { type: "integer", description: "At most this many, default 15" } }, required: ["query"], additionalProperties: false } },
  { name: "item_stock", description: "One item's stock in every warehouse now (quantity, rate, value, warehouse type) and its last stock movements from the ERP's stock ledger.", input_schema: { type: "object", properties: { item_code: { type: "string" } }, required: ["item_code"], additionalProperties: false } },
  { name: "warehouse_items", description: "The items held in one warehouse now, largest value first.", input_schema: { type: "object", properties: { warehouse: { type: "string", description: "The ERP warehouse name, e.g. 'Khopoli Main Store - NGSE'" }, limit: { type: "integer", description: "Default 40" } }, required: ["warehouse"], additionalProperties: false } },
  { name: "count_sheets", description: "Physical count sheets: who counted what where, how many items, how many variances and their value.", input_schema: { type: "object", properties: { status: { type: "string", enum: ["open", "submitted", "all"] } }, additionalProperties: false } },
  { name: "suspense_list", description: "The suspense ledger — variances between the shelf and the ERP not yet explained, with what has been released and why.", input_schema: { type: "object", properties: { status: { type: "string", enum: ["open", "released", "all"] } }, additionalProperties: false } },
].map((t) => ({ ...t, eager_input_streaming: true }) as Anthropic.Tool);

const Inputs = {
  inventory_summary: z.object({}).passthrough(),
  search_items: z.object({ query: z.string().min(1), limit: z.number().int().positive().max(50).optional() }),
  item_stock: z.object({ item_code: z.string().min(1) }),
  warehouse_items: z.object({ warehouse: z.string().min(1), limit: z.number().int().positive().max(200).optional() }),
  count_sheets: z.object({ status: z.enum(["open", "submitted", "all"]).optional() }),
  suspense_list: z.object({ status: z.enum(["open", "released", "all"]).optional() }),
} as const;

const cap = (x: unknown) => { const s = JSON.stringify(x); return s.length > 40000 ? s.slice(0, 40000) + "…(cut)" : s; };

/** Validate the model's input, run the read, return what the model sees. */
export async function runTool(admin: SupabaseClient, name: string, input: unknown): Promise<{ ok: boolean; content: string }> {
  const schema = (Inputs as Record<string, z.ZodTypeAny>)[name];
  if (!schema) return { ok: false, content: `No tool called ${name}.` };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, content: JSON.stringify({ INVALID_INPUT: parsed.error.issues.map((i) => i.message) }) };
  const a = parsed.data as Record<string, unknown>;
  try {
    if (name === "inventory_summary") {
      const d = await inventoryDashboard(admin);
      return { ok: true, content: cap({ rm: d.rm, rm_parts: { stock_warehouses: d.stock, at_vendors: d.vendorRm, service_stores: d.stores }, unique_items_with_stock: d.uniqueItems, wip: d.wip, total: d.total, finished_goods_value: d.finished, vendor_value: d.vendor, untyped: d.untyped, ignored_left_out: d.ignored, classes: d.classes, warehouses: d.warehouses.slice(0, 40) }) };
    }
    if (name === "search_items") {
      const q = S(a.query).replace(/[%,()]/g, " ");
      const { data } = await admin.from("material_item").select("item_code, item_name, item_group, stock_uom, custom_item_class, disabled")
        .or(`item_code.ilike.%${q}%,item_name.ilike.%${q}%`).limit(Number(a.limit) || 15);
      return { ok: true, content: cap(data ?? []) };
    }
    if (name === "item_stock") {
      const code = S(a.item_code);
      const { base, H } = await erpOrThrow();
      const get = async (u: string) => { const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(`ERP ${r.status}`); return ((await r.json()) as { data?: unknown[] }).data ?? []; };
      const [bins, sle, kinds, item] = await Promise.all([
        get(`${base}/api/resource/Bin?filters=${J([["item_code", "=", code]])}&fields=${J(["warehouse", "actual_qty", "valuation_rate", "stock_value", "reserved_qty", "ordered_qty"])}&limit_page_length=100`),
        get(`${base}/api/resource/${encodeURIComponent("Stock Ledger Entry")}?filters=${J([["item_code", "=", code], ["is_cancelled", "=", 0]])}&fields=${J(["posting_date", "warehouse", "actual_qty", "qty_after_transaction", "voucher_type", "voucher_no"])}&order_by=${encodeURIComponent("posting_date desc, creation desc")}&limit_page_length=15`),
        warehouseKinds(admin),
        admin.from("material_item").select("item_code, item_name, item_group, stock_uom, custom_item_class").eq("item_code", code).maybeSingle(),
      ]);
      return { ok: true, content: cap({ item: item.data, bins: (bins as Record<string, unknown>[]).map((b) => ({ ...b, type: kinds.get(S(b.warehouse))?.kind || "untyped" })), last_movements: sle }) };
    }
    if (name === "warehouse_items") {
      const rows = await warehouseBins(admin, S(a.warehouse), Number(a.limit) || 40);
      return { ok: true, content: cap(rows) };
    }
    if (name === "count_sheets") {
      let q = admin.from("material_count").select("id, kind, title, warehouse, item_group, assigned_name, assigned_email, status, created_at, submitted_at").order("created_at", { ascending: false }).limit(60);
      if (a.status && a.status !== "all") q = q.eq("status", String(a.status));
      const { data } = await q;
      const ids = (data ?? []).map((c) => c.id);
      const { data: lines } = ids.length ? await admin.from("material_count_line").select("count_id, item_code, physical_qty, erp_qty, erp_qty_at_count, erp_rate").in("count_id", ids) : { data: [] as Record<string, unknown>[] };
      const st = new Map<string, { items: number; counted: number; variances: number; variance_value: number }>();
      for (const l of lines ?? []) {
        const s = st.get(String(l.count_id)) ?? st.set(String(l.count_id), { items: 0, counted: 0, variances: 0, variance_value: 0 }).get(String(l.count_id))!;
        s.items++;
        if (l.physical_qty !== null) { s.counted++; const v = Number(l.physical_qty) - Number(l.erp_qty_at_count ?? l.erp_qty ?? 0); if (Math.abs(v) > 1e-9) { s.variances++; s.variance_value += v * (Number(l.erp_rate) || 0); } }
      }
      return { ok: true, content: cap((data ?? []).map((c) => ({ ...c, ...st.get(String(c.id)) }))) };
    }
    if (name === "suspense_list") {
      let q = admin.from("material_suspense").select("id, item_code, item_name, uom, warehouse, qty, released_qty, rate, status, counted_at, remark").order("opened_at", { ascending: false }).limit(200);
      if (a.status && a.status !== "all") q = q.eq("status", String(a.status));
      const { data } = await q;
      return { ok: true, content: cap((data ?? []).map((s) => ({ ...s, open_qty: Number(s.qty) - Number(s.released_qty), open_value: (Number(s.qty) - Number(s.released_qty)) * (Number(s.rate) || 0) }))) };
    }
  } catch (e) {
    return { ok: false, content: `The read failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  return { ok: false, content: "Unhandled tool." };
}
