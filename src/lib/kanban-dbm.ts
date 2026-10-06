/**
 * THE KANBAN ON DYNAMIC BUFFER MANAGEMENT (Dr Raghu, 6 Oct 2026: "the DBM
 * has a fourth colour, too, that is blue, which is generally overstocked.
 * Go with the best practises of the DBM that are used in manufacturing and
 * project organisations like Nandan … so that Rameez and Mukesh can use it
 * properly to decide … always maintain an MOQ and a reorder-level stock …
 * an intelligence layer, which will auto-populate the reorder level and the
 * MOQs").
 *
 * The practice, as Theory-of-Constraints replenishment runs it:
 *
 *   TARGET     the most that should ever be needed between ordering and
 *              receiving: average daily usage × (replenishment lead time +
 *              the review gap) × a safety factor (1.5). This is the
 *              reorder level the shelf is held to.
 *   ZONES      read on the stock IN HAND against the target —
 *                BLACK   nothing on hand: a job may be waiting now
 *                RED     under a third: expedite, order if not on order
 *                YELLOW  a third to two-thirds: the normal place to order
 *                GREEN   two-thirds to full: leave it
 *                BLUE    over the target: overstocked — stop buying
 *              An item with no usage has no target and is shown apart.
 *   ORDERING   on the stock in hand PLUS on order (the "virtual" stock):
 *              when that is under two-thirds of the target, order back up
 *              to the target, rounded UP to whole MOQs. Never below one MOQ.
 *   DBM        once a day the zone is recorded. Too much red — red or black
 *              for one whole lead time since the target last moved — and
 *              the target grows by a third. Too much green — green or blue
 *              for three lead times running — and it shrinks by a third,
 *              never below half a lead time of usage. After any move the
 *              target is left alone for one lead time (the safe period).
 *              A target someone TYPED is never moved; the rule says beside
 *              it what it would have done.
 *
 * Genie's proposals (the intelligence layer) are read off the ERP:
 *   usage      the stock ledger, six months, out of the Stock warehouses
 *   lead time  the item's own PO-to-GRN days over twelve months (median),
 *              else its group's, else the item master's, else everyone's
 *   MOQ        the quantity purchase usually orders it in — the median of
 *              its PO lines over twelve months
 * They are proposals: Rameez or Mukesh accept them, one or all, and every
 * change is logged.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { erpAuth, consumption } from "@/lib/saamaan-stock";

type Doc = Record<string, unknown>;
const S = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const N = (v: unknown) => Number(v) || 0;
const J = (x: unknown) => encodeURIComponent(JSON.stringify(x));

export type Zone = "black" | "red" | "yellow" | "green" | "blue" | "none";
export const ZONES: Zone[] = ["black", "red", "yellow", "green", "blue", "none"];

/** Where the stock in hand sits against the target. */
export function zoneOf(onHand: number | null, target: number): Zone {
  if (onHand === null) return "none";
  if (target <= 0) return "none";
  if (onHand <= 0) return "black";
  if (onHand < target / 3) return "red";
  if (onHand < (2 * target) / 3) return "yellow";
  if (onHand <= target) return "green";
  return "blue";
}
/** How far the target has been eaten into, 0–100% (over 100 is a stock-out; under 0 is over the target). */
export const penetration = (onHand: number | null, target: number) => (onHand === null || target <= 0 ? null : Math.round(((target - onHand) / target) * 1000) / 10);

/** What to order: back up to the target from the virtual stock, in whole MOQs — only once the virtual stock is under two-thirds. */
export function toOrder(target: number, onHand: number | null, onOrder: number, moq: number): number {
  if (onHand === null || target <= 0) return 0;
  const virtual = onHand + onOrder;
  if (virtual >= (2 * target) / 3) return 0;
  const gap = target - virtual;
  if (gap <= 0) return 0;
  if (moq > 0) return Math.max(moq, Math.ceil(gap / moq) * moq);
  return Math.ceil(gap);
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

async function list(base: string, H: Record<string, string>, doctype: string, fields: string[], filters: unknown[]): Promise<Doc[]> {
  const out: Doc[] = [];
  for (let start = 0; start < 400000; start += 5000) {
    const r = await fetch(`${base}/api/resource/${encodeURIComponent(doctype)}?fields=${J(fields)}&filters=${J(filters)}&limit_start=${start}&limit_page_length=5000`, { headers: H, signal: AbortSignal.timeout(90000) });
    if (!r.ok) throw new Error(`The ERP answered ${r.status} reading ${doctype}.`);
    const page = ((await r.json()) as { data?: Doc[] }).data ?? [];
    out.push(...page);
    if (page.length < 5000) break;
  }
  return out;
}

/**
 * Twelve months of buying, per item: the PO-to-GRN days of every receipt
 * against a PO, and the quantity of every PO line.
 */
export async function buyingHistory(): Promise<{ leadDays: Map<string, number[]>; poQty: Map<string, number[]>; all: number[] }> {
  const auth = await erpAuth();
  if (!auth) throw new Error("The ERP is not connected.");
  const since = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const [po, pr] = await Promise.all([
    list(auth.base, auth.H, "Purchase Order", ["name", "transaction_date", "`tabPurchase Order Item`.item_code", "`tabPurchase Order Item`.stock_qty"], [["docstatus", "=", 1], ["transaction_date", ">=", since]]),
    list(auth.base, auth.H, "Purchase Receipt", ["posting_date", "`tabPurchase Receipt Item`.item_code", "`tabPurchase Receipt Item`.purchase_order"], [["docstatus", "=", 1], ["is_return", "=", 0], ["posting_date", ">=", since]]),
  ]);
  const poDate = new Map(po.map((r) => [S(r.name), S(r.transaction_date)]));
  const poQty = new Map<string, number[]>();
  for (const r of po) { const k = S(r.item_code); if (k && N(r.stock_qty) > 0) (poQty.get(k) ?? poQty.set(k, []).get(k)!).push(N(r.stock_qty)); }
  const leadDays = new Map<string, number[]>();
  const all: number[] = [];
  for (const r of pr) {
    const d0 = poDate.get(S(r.purchase_order)); if (!d0) continue;
    const days = Math.round((new Date(S(r.posting_date)).getTime() - new Date(d0).getTime()) / 86400000);
    if (days < 0 || days > 365) continue;
    const k = S(r.item_code);
    (leadDays.get(k) ?? leadDays.set(k, []).get(k)!).push(days); all.push(days);
  }
  return { leadDays, poQty, all };
}

export interface Proposal { item_code: string; adu: number; rlt: number; rlt_basis: string; target: number; moq: number; note: string }

/** Genie's proposal for each item: usage, lead time, target and MOQ, with the reasons. */
export async function proposeAll(admin: SupabaseClient, codes: string[], settings: { paranoia: number; review: number }): Promise<Proposal[]> {
  const [used, hist] = await Promise.all([consumption(admin, codes, 6), buyingHistory()]);
  if (!used) throw new Error("The ERP's stock ledger could not be read — nothing was proposed.");
  const meta = new Map<string, Doc>();
  for (let i = 0; i < codes.length; i += 500) {
    const { data } = await admin.from("material_item").select("item_code, item_group, lead_time_days").in("item_code", codes.slice(i, i + 500));
    for (const d of (data ?? []) as Doc[]) meta.set(S(d.item_code), d);
  }
  /* each group's median lead time, from every item in it that has one */
  const groupDays = new Map<string, number[]>();
  for (const c of codes) {
    const g = S(meta.get(c)?.item_group); const d = hist.leadDays.get(c);
    if (g && d?.length) (groupDays.get(g) ?? groupDays.set(g, []).get(g)!).push(...d);
  }
  const everyone = median(hist.all) ?? 17;
  const out: Proposal[] = [];
  for (const c of codes) {
    const u = used.get(c);
    let days = 182;
    if (u && u.first !== "9999-99-99") days = Math.max(30, Math.min(182, Math.ceil((Date.now() - new Date(u.first).getTime()) / 86400000)));
    const adu = u ? u.qty / days : 0;
    const own = hist.leadDays.get(c) ?? [];
    const grp = groupDays.get(S(meta.get(c)?.item_group)) ?? [];
    const master = N(meta.get(c)?.lead_time_days);
    let rlt: number, basis: string;
    if (own.length >= 2) { rlt = median(own)!; basis = `its own ${own.length} receipts`; }
    else if (grp.length >= 3) { rlt = median(grp)!; basis = `its group's ${grp.length} receipts`; }
    else if (master > 0) { rlt = master; basis = "the item master"; }
    else { rlt = everyone; basis = "every item's median"; }
    rlt = Math.max(1, Math.round(rlt));
    const target = adu > 0 ? Math.max(1, Math.ceil(adu * (rlt + settings.review) * settings.paranoia)) : 0;
    const q = hist.poQty.get(c) ?? [];
    const moq = q.length ? Math.max(1, Math.round(median(q)!)) : 0;
    const note = adu > 0
      ? `${(adu * 30.4).toFixed(1)}/month used · lead ${rlt} days (${basis}) + ${settings.review} review · ×${settings.paranoia} → target ${target}${moq ? ` · usually bought ${q.length} time${q.length === 1 ? "" : "s"}, median ${moq}` : " · never bought in a year"}`
      : `nothing used in six months — no target${moq ? `; bought ${q.length} time${q.length === 1 ? "" : "s"} in a year` : ""}`;
    out.push({ item_code: c, adu: Math.round(adu * 10000) / 10000, rlt, rlt_basis: basis, target, moq, note });
  }
  return out;
}

/**
 * The daily DBM step for one item — the zone recorded once per IST day,
 * the counters moved, and the target grown or shrunk when the rule says.
 * Returns the patch to write and, if the target moved, why.
 */
export function dbmStep(r: Doc, onHand: number | null, onOrder: number, today: string): { patch: Doc; moved: { from: number; to: number; why: string } | null; zone: Zone } {
  const target = N(r.buffer_qty);
  const zone = zoneOf(onHand, target);
  const typed = S(r.basis) === "typed";
  const rlt = Math.max(1, N(r.rlt_days) || 17);
  const adu = N(r.adu);
  const sameDay = S(r.zone_day) === today;
  let red = N(r.red_days), green = N(r.green_days);
  if (!sameDay) {
    if (zone === "black" || zone === "red") { red += 1; green = 0; }
    else if (zone === "green" || zone === "blue") { green += 1; red = 0; }
    else if (zone === "yellow") { green = 0; }
  }
  const sinceChange = r.last_change_at ? (Date.now() - new Date(S(r.last_change_at)).getTime()) / 86400000 : Infinity;
  const safe = sinceChange < rlt;
  let moved: { from: number; to: number; why: string } | null = null;
  let note = "";
  if (target > 0 && !safe) {
    if (red >= rlt) {
      const to = Math.ceil(target * 4 / 3);
      note = `too much red — ${red} days red or black, one lead time is ${rlt}: target up a third (${target} → ${to})`;
      if (!typed) moved = { from: target, to, why: note };
    } else if (green >= 3 * rlt) {
      const floor = Math.max(1, Math.ceil(adu * rlt * 0.5));
      const to = Math.max(floor, Math.floor(target * 2 / 3));
      if (to < target) {
        note = `too much green — ${green} days green or blue, three lead times are ${3 * rlt}: target down a third (${target} → ${to})`;
        if (!typed) moved = { from: target, to, why: note };
      }
    }
  }
  if (typed && note) note = `typed target kept; the rule would say: ${note}`;
  if (!note) note = target <= 0 ? "no target — nothing used, or not yet proposed" : safe ? `safe period — the target moved ${Math.floor(sinceChange)} day${Math.floor(sinceChange) === 1 ? "" : "s"} ago, held for one lead time (${rlt} days)` : `${red} red day${red === 1 ? "" : "s"} · ${green} green day${green === 1 ? "" : "s"} since it last moved`;
  const patch: Doc = {
    zone, stock: onHand, ordered: onOrder, penetration: penetration(onHand, moved ? moved.to : target), zone_day: today,
    red_days: moved ? 0 : red, green_days: moved ? 0 : green, dbm_note: note,
    ...(moved ? { buffer_qty: moved.to, last_change_at: new Date().toISOString() } : {}),
  };
  return { patch, moved, zone };
}
