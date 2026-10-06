/**
 * The Kanban shelf — read and the daily DBM step, shared by the Kanban
 * route and the daily cron. The rules themselves are in kanban-dbm.ts.
 */
import { HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { liveStock } from "@/lib/saamaan-stock";
import { dbmStep, penetration, toOrder, zoneOf, ZONES, type Zone } from "@/lib/kanban-dbm";

export type Doc = Record<string, unknown>;
export const S = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
export const N = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
export const istDay = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
export const missing = (m: string) => /does not exist|schema cache|column/i.test(m);

export async function allKanban(admin: ReturnType<typeof adminClient>): Promise<Doc[]> {
  const rows: Doc[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await admin.from("material_kanban").select("*").eq("active", true).order("item_code").range(a, a + 999);
    if (error) {
      if (missing(error.message)) throw new HttpError(503, "Run migrations 0193 and 0204 first — the Kanban tables are not ready.");
      throw new Error(error.message);
    }
    rows.push(...((data ?? []) as Doc[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export async function itemsOf(admin: ReturnType<typeof adminClient>, codes: string[]): Promise<Map<string, Doc>> {
  const m = new Map<string, Doc>();
  for (let i = 0; i < codes.length; i += 500) {
    const { data } = await admin.from("material_item").select("item_code, item_name, item_group, custom_item_class, stock_uom, last_purchase_rate, valuation_rate").in("item_code", codes.slice(i, i + 500));
    for (const it of (data ?? []) as Doc[]) m.set(S(it.item_code), it);
  }
  return m;
}
export const rateOf = (it: Doc | undefined) => (it ? (N(it.valuation_rate) || N(it.last_purchase_rate) || null) : null);

export async function settings(admin: ReturnType<typeof adminClient>) {
  const { data } = await admin.from("material_setting").select("key, value").in("key", ["kanban_cap", "kanban_paranoia", "kanban_review_days"]);
  const v = new Map((data ?? []).map((d) => [S(d.key), Number(d.value)]));
  return { cap: v.get("kanban_cap") || 10000000, paranoia: v.get("kanban_paranoia") || 1.5, review: v.get("kanban_review_days") ?? 7 };
}

/** The whole shelf, read live. */
export async function picture(admin: ReturnType<typeof adminClient>, live: boolean) {
  const rows = await allKanban(admin);
  const codes = rows.map((r) => S(r.item_code));
  const [items, stock, set] = await Promise.all([itemsOf(admin, codes), live ? liveStock(admin, codes) : Promise.resolve(null), settings(admin)]);
  const out = rows.map((r) => {
    const code = S(r.item_code);
    const it = items.get(code);
    const st = stock?.get(code);
    const onHand = st ? st.stock - st.blocked : N(r.stock);
    const onOrder = st ? st.ordered : N(r.ordered) ?? 0;
    const target = Number(r.buffer_qty) || 0;
    const moq = Number(r.reorder_qty) || 0;
    const rate = rateOf(it) ?? N(r.rate);
    const zone = zoneOf(onHand, target);
    const order = toOrder(target, onHand, onOrder, moq);
    const virtual = onHand === null ? null : onHand + onOrder;
    return {
      item_code: code, item_name: S(it?.item_name), item_group: S(it?.item_group), item_class: S(it?.custom_item_class), uom: S(it?.stock_uom),
      target, moq, basis: S(r.basis), moq_basis: S(r.moq_basis), rlt: N(r.rlt_days), rlt_basis: S(r.rlt_basis), adu: N(r.adu),
      on_hand: onHand, on_order: onOrder, virtual, rate, zone, penetration: penetration(onHand, target), virtual_zone: zoneOf(virtual, target),
      to_order: order, to_order_value: rate === null ? null : order * rate,
      target_value: rate === null ? null : target * rate, stock_value: rate === null || onHand === null ? null : Math.max(0, onHand) * rate,
      excess_value: rate === null || onHand === null || zone !== "blue" ? null : (onHand - target) * rate,
      red_days: Number(r.red_days) || 0, green_days: Number(r.green_days) || 0, last_change_at: r.last_change_at ?? null, dbm_note: S(r.dbm_note), note: S(r.note),
      proposed: r.proposed_at ? { target: N(r.proposed_target), moq: N(r.proposed_moq), rlt: N(r.proposed_rlt), adu: N(r.proposed_adu), at: r.proposed_at, note: S(r.proposal_note), state: S(r.proposal_state) } : null,
    };
  });
  const by = (z: Zone) => out.filter((r) => r.zone === z);
  const sum = (xs: typeof out, k: "to_order_value" | "stock_value" | "excess_value" | "target_value") => xs.reduce((a, r) => a + (r[k] ?? 0), 0);
  const zones = Object.fromEntries(ZONES.map((z) => {
    const xs = by(z);
    return [z, { n: xs.length, stock_value: sum(xs, "stock_value"), to_order_value: sum(xs, "to_order_value"), excess_value: sum(xs, "excess_value") }];
  }));
  const { data: runs } = await admin.from("material_kanban_run").select("*").order("at", { ascending: false }).limit(12);
  return {
    rows: out, stockLive: stock !== null, settings: set, zones,
    totals: {
      items: out.length, target_value: sum(out, "target_value"), stock_value: sum(out, "stock_value"), to_order_value: sum(out, "to_order_value"),
      on_order_value: out.reduce((a, r) => a + (r.rate === null ? 0 : (r.on_order ?? 0) * r.rate), 0), excess_value: sum(out, "excess_value"),
      pending_proposals: out.filter((r) => r.proposed && r.proposed.state === "pending").length,
    },
    runs: runs ?? [],
  };
}

/** Today's DBM step for every item — shared with the daily cron. */
export async function runDbm(admin: ReturnType<typeof adminClient>, by: string, kind: "dbm" | "daily", note = "") {
  const rows = await allKanban(admin);
  const codes = rows.map((r) => S(r.item_code));
  if (!codes.length) return { items: 0, moved: 0 };
  const stock = await liveStock(admin, codes);
  if (!stock) throw new HttpError(502, "The ERP could not be read — nothing was changed.");
  const today = istDay();
  const count: Record<Zone, number> = { black: 0, red: 0, yellow: 0, green: 0, blue: 0, none: 0 };
  const ups: Doc[] = [], logs: Doc[] = [];
  for (const r of rows) {
    const st = stock.get(S(r.item_code));
    const onHand = st ? st.stock - st.blocked : null;
    const { patch, moved, zone } = dbmStep(r, onHand, st ? st.ordered : 0, today);
    count[zone]++;
    ups.push({ item_code: r.item_code, ...patch, dbm_at: new Date().toISOString() });
    if (moved) logs.push({ item_code: r.item_code, by, from_qty: moved.from, to_qty: moved.to, why: `DBM: ${moved.why}` });
  }
  for (let i = 0; i < ups.length; i += 500) {
    const { error } = await admin.from("material_kanban").upsert(ups.slice(i, i + 500), { onConflict: "item_code" });
    if (error) throw new Error(error.message);
  }
  for (let i = 0; i < logs.length; i += 500) await admin.from("material_kanban_log").insert(logs.slice(i, i + 500));
  const pic = await picture(admin, false);
  await admin.from("material_kanban_run").insert({
    by, kind, items: rows.length, black: count.black, red: count.red, yellow: count.yellow, green: count.green, blue: count.blue, no_demand: count.none,
    buffer_value: pic.totals.target_value, stock_value: pic.totals.stock_value, to_order_value: pic.totals.to_order_value,
    note: `${logs.length} target${logs.length === 1 ? "" : "s"} moved by the rule${note ? ` · ${note}` : ""}`,
  });
  return { items: rows.length, moved: logs.length, ...count };
}

