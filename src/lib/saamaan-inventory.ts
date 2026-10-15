/**
 * SAAMAAN → INVENTORY (Dr Raghu, 6 Oct 2026). Internal to Saamaan.
 *
 * The stock is the ERP's, read live off Bin — never mirrored, never typed.
 * What Genie keeps is only what the ERP cannot know: count sheets, what the
 * shelf said, and the suspense that makes the books match the shelf until
 * the difference is explained (migration 0201).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "@/lib/auth";
import { erpAuth } from "@/lib/saamaan-stock";
import { ITEM_EDITORS, STORE_HANDS } from "@/lib/saamaan-hands";

type Doc = Record<string, unknown>;
const S = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const N = (v: unknown) => Number(v) || 0;
const J = (x: unknown) => encodeURIComponent(JSON.stringify(x));

/**
 * WHO RUNS INVENTORY — named, not roled (the Saamaan pattern). They make
 * count sheets, release suspense and work Genie's suggestions. Anybody with
 * the Saamaan tick may be GIVEN a sheet to count; the sheet is theirs to fill.
 */
export const INVENTORY_LEADS = new Set([...ITEM_EDITORS]);
export const mayLeadInventory = (email: string, isOwner: boolean) => isOwner || INVENTORY_LEADS.has(S(email).toLowerCase());

/**
 * ASK GENIE (Dr Raghu, 6 Oct 2026: "for Rameez's account, make a scenario
 * where he can consult Genie and start talking to it in real time"). Named.
 */
export const CONSULT_HANDS = new Set(["rameez@nandan.co.in"]);
export const mayConsultInventory = (email: string, isOwner: boolean) => isOwner || CONSULT_HANDS.has(S(email).toLowerCase());

export const COUNTERS_DEFAULT = STORE_HANDS;

export async function erpOrThrow() {
  const auth = await erpAuth();
  if (!auth) throw new HttpError(503, "The ERP is not connected — CRM → Integrations holds its URL and key.");
  return auth;
}

async function getAll(base: string, H: Record<string, string>, doctype: string, fields: string[], filters: unknown[], cap = 200000): Promise<Doc[]> {
  const out: Doc[] = [];
  for (let start = 0; start < cap; start += 5000) {
    const r = await fetch(`${base}/api/resource/${encodeURIComponent(doctype)}?fields=${J(fields)}&filters=${J(filters)}&limit_start=${start}&limit_page_length=5000`, { headers: H, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status} reading ${doctype}.`);
    const page = ((await r.json()) as { data?: Doc[] }).data ?? [];
    out.push(...page);
    if (page.length < 5000) break;
  }
  return out;
}

/** Genie's word on each warehouse (Masters), and its remark. */
export async function warehouseKinds(admin: SupabaseClient): Promise<Map<string, { kind: string; remarks: string }>> {
  const { data } = await admin.from("material_warehouse").select("warehouse, kind, remarks").limit(1000);
  return new Map((data ?? []).map((w) => [S(w.warehouse), { kind: S(w.kind), remarks: S(w.remarks) }]));
}

/** Every item's class and group from the mirror, paged past the 1,000-row cap. */
async function mirrorClasses(admin: SupabaseClient): Promise<Map<string, { cls: string; group: string; name: string; uom: string }>> {
  const out = new Map<string, { cls: string; group: string; name: string; uom: string }>();
  for (let a = 0; ; a += 1000) {
    const { data, error } = await admin.from("material_item").select("item_code, custom_item_class, item_group, item_name, stock_uom, disabled")
      .order("item_code").range(a, a + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) if (!r.disabled) out.set(S(r.item_code), { cls: S(r.custom_item_class).toUpperCase(), group: S(r.item_group), name: S(r.item_name), uom: S(r.stock_uom) });
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

/**
 * THE INVENTORY DASHBOARD (Dr Raghu, 6 Oct 2026: "the RM stock as of today,
 * the WIP stock as of today, the total inventory up to now ... also show
 * stock class A, class B, and class C. What is the total number of items,
 * the total number of quantities, and the total value").
 *
 * RM stock is the warehouses Masters types "Stock" (his rule: "for the
 * purpose of the stock it's ONLY the closing stock in the 'Stock'
 * warehouses"). WIP is those typed "WIP". Total is every warehouse the ERP
 * has. The classes are read off the item mirror (custom_item_class) against
 * the RM stock; an item with no class is shown as its own row, never folded
 * into C.
 */
/**
 * RM IS THREE PARTS (Dr Raghu, 6 Oct 2026: "how much the RM cost is, how
 * much the vendor stock is, how much the stores service stores cost. These
 * three together come to the RM stock"). Stock + Vendor + Stores; WIP,
 * finished goods and Ignore are never in it.
 */
export const RM_KINDS = new Set(["Stock", "Vendor", "Stores"]);

/**
 * DISABLED IN THE ERP, SEEN NOWHERE (Dr Raghu, 15 Oct 2026: "whatever is put
 * as disabled in the ERP should not be used in the total or even seen
 * anywhere"). Read live from the ERP's Item list — the mirror's own flag was
 * found carrying 1 of the ERP's 14,656 — so a bin on a disabled item adds to
 * nothing and is listed nowhere.
 */
export async function disabledItems(base: string, H: Record<string, string>): Promise<Set<string>> {
  try {
    const rows = await getAll(base, H, "Item", ["name"], [["disabled", "=", 1]], 50000);
    return new Set(rows.map((r) => S(r.name)));
  } catch { return new Set(); }
}

export async function inventoryDashboard(admin: SupabaseClient) {
  const { base, H } = await erpOrThrow();
  const [binsAll, kinds, mirror, disabled] = await Promise.all([
    getAll(base, H, "Bin", ["item_code", "warehouse", "actual_qty", "stock_value"], [["actual_qty", "!=", 0]]),
    warehouseKinds(admin),
    mirrorClasses(admin),
    disabledItems(base, H),
  ]);
  const bins = binsAll.filter((b) => !disabled.has(S(b.item_code)));
  type Acc = { value: number; qty: number; items: Set<string> };
  const acc = (): Acc => ({ value: 0, qty: 0, items: new Set<string>() });
  const add = (a: Acc, code: string, v: number, q: number) => { a.value += v; a.qty += q; a.items.add(code); };
  const byWh = new Map<string, { warehouse: string; kind: string; remarks: string; value: number; qty: number; items: number }>();
  const sum = { rm: acc(), stock: acc(), vendor: acc(), stores: acc(), wip: acc(), total: acc() };
  const cls = new Map<string, { cls: string; inClass: number; holding: Set<string>; qty: number; value: number }>();
  for (const k of ["A", "B", "C", "—"]) cls.set(k, { cls: k, inClass: 0, holding: new Set(), qty: 0, value: 0 });
  for (const m of mirror.values()) cls.get(["A", "B", "C"].includes(m.cls) ? m.cls : "—")!.inClass++;
  for (const b of bins) {
    const w = S(b.warehouse), code = S(b.item_code), v = N(b.stock_value), q = N(b.actual_qty);
    const k = kinds.get(w) ?? { kind: "", remarks: "" };
    const row = byWh.get(w) ?? byWh.set(w, { warehouse: w, kind: k.kind, remarks: k.remarks, value: 0, qty: 0, items: 0 }).get(w)!;
    row.value += v; row.qty += q; row.items++;
    /* IGNORE (Dr Raghu, 6 Oct 2026): "should not be considered in valuation,
       in either raw material stock, WIP, or finished goods, at least in the
       Genie" — the warehouse keeps its row, named, and adds to nothing */
    if (k.kind === "Ignore") continue;
    if (q > 0) add(sum.total, code, v, q); else { sum.total.value += v; sum.total.qty += q; }
    if (RM_KINDS.has(k.kind)) {
      add(sum.rm, code, v, q);
      add(k.kind === "Stock" ? sum.stock : k.kind === "Vendor" ? sum.vendor : sum.stores, code, v, q);
      const m = mirror.get(code);
      const c = cls.get(m && ["A", "B", "C"].includes(m.cls) ? m.cls : "—")!;
      c.holding.add(code); c.qty += q; c.value += v;
    }
    if (k.kind === "WIP") add(sum.wip, code, v, q);
  }
  const pack = (x: Acc) => ({ value: x.value, qty: x.qty, items: x.items.size });
  const untyped = [...byWh.values()].filter((w) => !w.kind);
  const ignored = [...byWh.values()].filter((w) => w.kind === "Ignore");
  return {
    readAt: new Date().toISOString(),
    erpBase: base,
    rm: pack(sum.rm), stock: pack(sum.stock), vendorRm: pack(sum.vendor), stores: pack(sum.stores),
    wip: pack(sum.wip), total: pack(sum.total),
    /* "on the top, show the number of items with non-zero stock … kitne unique items" */
    uniqueItems: sum.total.items.size,
    finished: [...byWh.values()].filter((w) => w.kind === "Finished goods").reduce((a, w) => a + w.value, 0),
    vendor: sum.vendor.value,
    untyped: { value: untyped.reduce((a, w) => a + w.value, 0), warehouses: untyped.map((w) => w.warehouse) },
    ignored: { value: ignored.reduce((a, w) => a + w.value, 0), warehouses: ignored.map((w) => w.warehouse) },
    classes: [...cls.values()].map((c) => ({ cls: c.cls, inClass: c.inClass, holding: c.holding.size, qty: c.qty, value: c.value })),
    warehouses: [...byWh.values()].sort((a, b) => b.value - a.value),
  };
}

/** One warehouse's bins, live, joined to the mirror's names and classes. */
export async function warehouseBins(admin: SupabaseClient, warehouse: string, limit = 2000) {
  const { base, H } = await erpOrThrow();
  const [binsAll, disabled] = await Promise.all([
    getAll(base, H, "Bin", ["item_code", "actual_qty", "valuation_rate", "stock_value", "stock_uom", "reserved_qty", "ordered_qty"], [["warehouse", "=", warehouse], ["actual_qty", "!=", 0]], 20000),
    disabledItems(base, H),
  ]);
  const bins = binsAll.filter((b) => !disabled.has(S(b.item_code)));
  const codes = bins.map((b) => S(b.item_code));
  const meta = new Map<string, Doc>();
  for (let i = 0; i < codes.length; i += 500) {
    const { data } = await admin.from("material_item").select("item_code, item_name, item_group, custom_item_class, stock_uom").in("item_code", codes.slice(i, i + 500));
    for (const d of data ?? []) meta.set(S(d.item_code), d);
  }
  return bins.map((b) => {
    const m = meta.get(S(b.item_code)) ?? {};
    return {
      item_code: S(b.item_code), item_name: S(m.item_name), item_group: S(m.item_group), cls: S(m.custom_item_class),
      uom: S(b.stock_uom) || S(m.stock_uom), qty: N(b.actual_qty), rate: N(b.valuation_rate), value: N(b.stock_value),
      reserved: N(b.reserved_qty), ordered: N(b.ordered_qty), inMirror: meta.has(S(b.item_code)),
    };
  }).sort((a, b) => b.value - a.value).slice(0, limit);
}

/** The ERP's quantity and rate for these items in one warehouse, now. */
export async function binsNow(warehouse: string, codes: string[]): Promise<Map<string, { qty: number; rate: number }>> {
  const { base, H } = await erpOrThrow();
  const out = new Map<string, { qty: number; rate: number }>();
  for (const c of codes) out.set(c, { qty: 0, rate: 0 });
  for (let i = 0; i < codes.length; i += 200) {
    const rows = await getAll(base, H, "Bin", ["item_code", "actual_qty", "valuation_rate"], [["warehouse", "=", warehouse], ["item_code", "in", codes.slice(i, i + 200)]], 5000);
    for (const r of rows) out.set(S(r.item_code), { qty: N(r.actual_qty), rate: N(r.valuation_rate) });
  }
  return out;
}

/**
 * THE MOVEMENT METHOD — how the suspense is released by the ERP itself
 * (Dr Raghu: "in the movement, we need to find a method where we can start
 * synchronising the real stock and start releasing the balance").
 *
 * After the count, two kinds of entry land on the item in that warehouse:
 *   · REAL MOVEMENT — posted for a date after the count. It moves the shelf
 *     and the books together, so it says nothing about the difference.
 *   · A CORRECTION — anything posted FOR a date on or before the count but
 *     made after it (a back-dated issue to WIP, a late GRN, a consumption
 *     somebody forgot), or any Stock Reconciliation. That is the books
 *     catching up with the shelf: it releases the suspense, up to what is
 *     open and only in the direction that closes it.
 *
 * Every correction that releases anything is recorded with its voucher, so
 * the release can be traced to the ERP document that explained it.
 */
export async function correctionsSince(item: string, warehouse: string, countedAt: string): Promise<{ voucher_type: string; voucher_no: string; qty: number; posting_date: string }[]> {
  const { base, H } = await erpOrThrow();
  /* the ERP keeps its clock in IST; Genie stamps in UTC — compare like with like */
  const at = istStamp(countedAt);
  const countDay = at.date;
  const rows = await getAll(base, H, "Stock Ledger Entry",
    ["voucher_type", "voucher_no", "actual_qty", "posting_date", "creation", "is_cancelled"],
    [["item_code", "=", item], ["warehouse", "=", warehouse], ["creation", ">", `${at.date} ${at.time}`], ["is_cancelled", "=", 0]], 5000);
  return rows
    .filter((r) => S(r.voucher_type) === "Stock Reconciliation" || S(r.posting_date) <= countDay)
    .map((r) => ({ voucher_type: S(r.voucher_type), voucher_no: S(r.voucher_no), qty: N(r.actual_qty), posting_date: S(r.posting_date) }));
}

/** Pick n at random — Fisher-Yates on a copy, so the sheet is not the top of a list. */
export function sample<T>(list: T[], n: number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

export async function itemGroupsInMirror(admin: SupabaseClient): Promise<{ group: string; items: number }[]> {
  const m = await mirrorClasses(admin);
  const c = new Map<string, number>();
  for (const v of m.values()) c.set(v.group, (c.get(v.group) || 0) + 1);
  return [...c.entries()].map(([group, items]) => ({ group, items })).sort((a, b) => a.group.localeCompare(b.group));
}

export async function mirrorMeta(admin: SupabaseClient, codes: string[]): Promise<Map<string, { name: string; group: string; uom: string; cls: string }>> {
  const out = new Map<string, { name: string; group: string; uom: string; cls: string }>();
  for (let i = 0; i < codes.length; i += 500) {
    const { data } = await admin.from("material_item").select("item_code, item_name, item_group, stock_uom, custom_item_class").in("item_code", codes.slice(i, i + 500));
    for (const d of data ?? []) out.set(S(d.item_code), { name: S(d.item_name), group: S(d.item_group), uom: S(d.stock_uom), cls: S(d.custom_item_class) });
  }
  return out;
}

export async function groupCodes(admin: SupabaseClient, group: string): Promise<string[]> {
  const out: string[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await admin.from("material_item").select("item_code").eq("item_group", group).eq("disabled", false).order("item_code").range(a, a + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []).map((d) => S(d.item_code)));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

/** A UTC instant as the ERP writes it: IST date and HH:MM:SS. */
export function istStamp(iso: string): { date: string; time: string } {
  const d = new Date(new Date(iso).getTime() + 330 * 60000).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 19) };
}
/** "9:05:03.000000" → "09:05:03" — Frappe hands times back unpadded. */
const hms = (t: unknown) => {
  const [h = "0", m = "0", sec = "0"] = S(t).split(".")[0].split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:${sec.padStart(2, "0")}`;
};

/**
 * THE ERP'S STOCK AT THE MOMENT OF COUNTING — not at the moment somebody
 * pressed Submit. A count made at 10 and submitted at 5 would otherwise
 * call the afternoon's issues a variance. For each (item, instant): the
 * quantity after the last ledger entry posted at or before that instant.
 *
 * One read of the ledger from the earliest counting day on, the Bin for
 * items that have not moved since, and a single look further back only
 * for an item that moved that day but not before the instant asked.
 */
export async function erpQtyAtMany(warehouse: string, asks: { code: string; at: string }[]): Promise<Map<string, { qty: number; rate: number }>> {
  const { base, H } = await erpOrThrow();
  const out = new Map<string, { qty: number; rate: number }>();
  if (!asks.length) return out;
  const codes = [...new Set(asks.map((a) => a.code))];
  const day0 = asks.map((a) => istStamp(a.at).date).sort()[0];
  const bins = await binsNow(warehouse, codes);
  const led = new Map<string, Doc[]>();
  for (let i = 0; i < codes.length; i += 200) {
    const rows = await getAll(base, H, "Stock Ledger Entry",
      ["item_code", "posting_date", "posting_time", "creation", "qty_after_transaction", "valuation_rate"],
      [["warehouse", "=", warehouse], ["item_code", "in", codes.slice(i, i + 200)], ["posting_date", ">=", day0], ["is_cancelled", "=", 0]], 50000);
    for (const r of rows) (led.get(S(r.item_code)) ?? led.set(S(r.item_code), []).get(S(r.item_code))!).push(r);
  }
  const key = (r: Doc) => `${S(r.posting_date)} ${hms(r.posting_time)} ${S(r.creation)}`;
  for (const l of led.values()) l.sort((a, b) => key(a).localeCompare(key(b)));
  const before = new Map<string, { qty: number; rate: number }>();
  for (const a of asks) {
    const t = istStamp(a.at), stamp = `${t.date} ${t.time}`;
    const list = led.get(a.code) ?? [];
    let hit: Doc | null = null;
    for (const r of list) { if (`${S(r.posting_date)} ${hms(r.posting_time)}` <= stamp) hit = r; else break; }
    let v: { qty: number; rate: number };
    if (hit) v = { qty: N(hit.qty_after_transaction), rate: N(hit.valuation_rate) };
    else if (!list.length) v = bins.get(a.code) ?? { qty: 0, rate: 0 };
    else {
      if (!before.has(a.code)) {
        const r = await fetch(`${base}/api/resource/${encodeURIComponent("Stock Ledger Entry")}?fields=${J(["qty_after_transaction", "valuation_rate"])}&filters=${J([["warehouse", "=", warehouse], ["item_code", "=", a.code], ["posting_date", "<", day0], ["is_cancelled", "=", 0]])}&order_by=${encodeURIComponent("posting_date desc, posting_time desc, creation desc")}&limit_page_length=1`, { headers: H, signal: AbortSignal.timeout(30000) });
        if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status} reading the ledger.`);
        const x = (((await r.json()) as { data?: Doc[] }).data ?? [])[0];
        before.set(a.code, x ? { qty: N(x.qty_after_transaction), rate: N(x.valuation_rate) } : { qty: 0, rate: bins.get(a.code)?.rate ?? 0 });
      }
      v = before.get(a.code)!;
    }
    if (!v.rate) v = { ...v, rate: bins.get(a.code)?.rate ?? 0 };
    out.set(`${a.code}|${a.at}`, v);
  }
  return out;
}

/**
 * ITEM GROUPS (Dr Raghu, 6 Oct 2026: "If you have 3 items and they're
 * costing 4 lakhs versus having 23,000 items worth 4 lakhs, I would
 * concentrate on going for the larger-value ones"). Every group in the
 * mirror against the stock the ERP holds in the RM warehouses (Stock,
 * Vendor, Stores; never Ignore): items in it, holding stock, at nought,
 * quantity, value, and the average cost = value ÷ quantity.
 */
export async function itemGroupStock(admin: SupabaseClient) {
  const { base, H } = await erpOrThrow();
  const [binsAll, kinds, mirror, disabled] = await Promise.all([
    getAll(base, H, "Bin", ["item_code", "warehouse", "actual_qty", "stock_value"], [["actual_qty", "!=", 0]]),
    warehouseKinds(admin), mirrorClasses(admin), disabledItems(base, H),
  ]);
  const bins = binsAll.filter((b) => !disabled.has(S(b.item_code)));
  const g = new Map<string, { group: string; items: number; holding: Set<string>; qty: number; value: number }>();
  const row = (k: string) => g.get(k) ?? g.set(k, { group: k, items: 0, holding: new Set(), qty: 0, value: 0 }).get(k)!;
  for (const m of mirror.values()) row(m.group || "(no group)").items++;
  for (const b of bins) {
    const kind = kinds.get(S(b.warehouse))?.kind ?? "";
    if (!RM_KINDS.has(kind)) continue;
    const m = mirror.get(S(b.item_code));
    const r = row(m?.group || "(not in the mirror)");
    r.holding.add(S(b.item_code)); r.qty += N(b.actual_qty); r.value += N(b.stock_value);
  }
  return [...g.values()].map((r) => ({
    group: r.group, items: r.items, holding: r.holding.size, zero: Math.max(0, r.items - r.holding.size), qty: r.qty, value: r.value,
    avgCost: r.qty > 0 ? r.value / r.qty : null, valuePerItem: r.holding.size ? r.value / r.holding.size : null,
  })).sort((a, b) => b.value - a.value);
}
