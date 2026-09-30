import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { swallow } from "@/lib/swallow";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireKuber } from "@/lib/accounts";
import { addDays } from "@/lib/fmt";
import { newestByName } from "@/lib/kuber-fy";
import { pageAll } from "@/lib/page-all";
import { crmDb, crmConfigured } from "@/crm/db";
import { OE_HEADS, oeHead, classifyLedger, PNL_RULES, OE_RULES, BOOK_RULES, BUCKET_LABEL, oeRuleOf, type Bucket } from "@/lib/kuber-rules";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Kuber reads the books (Dr Raghu, 28 Aug 2026: "this data should be used for
 * management decisions"). Everything here is COMPUTED from the parsed Tally
 * snapshot plus the CFO registers — nothing is typed twice.
 *
 *   ?view=summary      — the dashboard numbers
 *   ?view=ageing&kind=receivable|payable — party-wise ageing with the bills
 *   ?view=reportcard   — the supplier report card
 *   ?view=cashflow     — the 13-week cash flow
 *   ?view=ledgers&q=   — the parsed ledger list
 *   ?view=vouchers&q=  — the parsed voucher list
 */

const IST_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/** Monday of the week holding `iso`. */
const mondayOf = (iso: string) => {
  const t = new Date(iso + "T00:00:00Z");
  const dow = (t.getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
};
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000);

type Bill = { party: string; party_group: string | null; bill: string; bill_date: string | null; due_date: string | null; kind: string; amount: number };

async function allBills(admin: ReturnType<typeof adminClient>): Promise<Bill[]> {
  const out: Bill[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("kuber_bill")
      .select("party, party_group, bill, bill_date, due_date, kind, amount")
      .range(from, from + 999);
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) return [];
      throw new Error(error.message);
    }
    out.push(...((data || []) as Bill[]));
    if (!data || data.length < 1000) break;
  }
  // A PROFORMA IS NOT AN INVOICE (Dr Raghu, 29 Aug 2026: "don't consider it
  // at all") — PI-numbered bills are intentions, filtered at the source so
  // every screen that rides the bills is clean at once: the dashboard cards,
  // the ageing, the 13-week cash flow, the CFO note.
  return out.filter((b) => !/^PI[-/]/i.test(String(b.bill || "").trim()) && !/proforma/i.test(String(b.bill || "")));
}

/**
 * Ageing buckets exactly as the MANAGEMENT REVIEW sheet cuts them —
 * AGE <30 / 31-90 / 91-180 / >180 days — so Kuber's numbers land on the
 * same lines Dr Raghu already reads.
 */
const bucketOf = (due: string | null, today: string) => {
  if (!due || due >= today) return "not_due";
  const d = daysBetween(due, today);
  return d < 30 ? "d0_30" : d <= 90 ? "d31_90" : d <= 180 ? "d91_180" : "d180p";
};

type RR = Record<string, unknown>;

/** The whole parsed book, paged past the cap — groups, ledgers, vouchers,
 *  lines — with the group tree ready to walk. One load, many statements. */
/**
 * Each party netted within itself, then split by which side it lands on.
 * `owed` is the real receivable/payable; `held` is the pure-advance population.
 */
function partySides(bills: Bill[]) {
  const per = new Map<string, number>();
  for (const b of bills) per.set(b.party, (per.get(b.party) || 0) + b.amount);
  let owed = 0, held = 0, owing = 0, credit = 0;
  for (const v of per.values()) {
    if (v > 0.5) { owed += v; owing += 1; }
    else if (v < -0.5) { held += -v; credit += 1; }
  }
  return {
    owed, held, owingParties: owing, creditParties: credit,
    parties: per.size,
    /* kept so the ageing screens and the cash flow keep working unchanged */
    total: owed - held, gross: owed, unadjusted: -held,
  };
}

async function loadWorld(admin: ReturnType<typeof adminClient>) {
  const pageAllW = async (build: (a: number, b: number) => PromiseLike<{ data: RR[] | null; error: { message: string } | null }>) => {
    const out: RR[] = [];
    for (let a = 0; ; a += 1000) {
      const { data, error } = await build(a, a + 999);
      if (error) {
        if (/does not exist|schema cache/i.test(error.message)) return out;
        throw new Error(error.message);
      }
      out.push(...(data || []));
      if ((data || []).length < 1000) break;
    }
    return out;
  };
  const [groups, ledgersAll, vouchersAll, linesAll] = await Promise.all([
    pageAllW((a, b) => admin.from("kuber_group").select("name, parent").order("name").range(a, b)),
    pageAllW((a, b) => admin.from("kuber_ledger").select("name, parent, opening, fy").order("name").range(a, b)),
    pageAllW((a, b) => admin.from("kuber_voucher").select("id, date, vtype, vno, amount").order("id").range(a, b)),
    pageAllW((a, b) => admin.from("kuber_voucher_line").select("voucher_id, ledger, amount").order("id").range(a, b)),
  ]);
  // one row per ledger — two years' masters describe the same chart of
  // accounts twice (see newestByName; it is why the P&L read double)
  const ledgers = newestByName(ledgersAll as { name?: unknown; fy?: unknown }[]) as RR[];
  // proformas out, everywhere at once — every statement rides this world
  const vouchers = vouchersAll.filter((v) => !isProforma(v.vtype, v.vno));
  const kept = new Set(vouchers.map((v) => String(v.id)));
  const lines = linesAll.filter((l) => kept.has(String(l.voucher_id)));
  const parentOf = new Map(groups.map((g) => [String(g.name).toLowerCase(), String(g.parent || "")]));
  const properOf = new Map(groups.map((g) => [String(g.name).toLowerCase(), String(g.name)]));
  const rootCache = new Map<string, string>();
  const rootOf = (g: string): string => {
    const k = g.toLowerCase();
    if (rootCache.has(k)) return rootCache.get(k)!;
    let cur = k;
    for (let i = 0; i < 25; i++) {
      const pr = (parentOf.get(cur) || "").toLowerCase();
      if (!pr || pr === cur) break;
      cur = pr;
    }
    const r = properOf.get(cur) || g;
    rootCache.set(k, r);
    return r;
  };
  const ledgerByName = new Map(ledgers.map((l) => [String(l.name), l]));
  const dateOf = new Map(vouchers.map((v) => [String(v.id), String(v.date || "")]));
  // does any ancestor group match? — for mid-chain heads like Sundry Debtors
  const chainHas = (parent: string, re: RegExp) => {
    let cur = String(parent || "").toLowerCase();
    for (let i = 0; i < 25; i++) {
      if (re.test(stripNo(cur))) return true;
      const p = (parentOf.get(cur) || "").toLowerCase();
      if (!p || p === cur) return false;
      cur = p;
    }
    return false;
  };
  return { groups, ledgers, vouchers, lines, rootOf, ledgerByName, dateOf, chainHas };
}

/** root → group → ledger tree with amounts; every statement wears it. */
/**
 * THE DRILL CARRIES THE SAME COLUMNS AS THE LINE ABOVE IT.
 *
 * Dr Raghu, 30 Sep 2026: "show the details for each of the inside members on
 * expanding also." A head that reads 5.48 against 5.82 last year is only
 * useful if opening it says WHICH group moved — so every root, group and
 * ledger inside carries its own last-year figure, matched by name. A node
 * present in one period and not the other reads zero on the side it is
 * missing from, which is itself the answer.
 */
function treeOfPair(
  cur: { ledger: string; group: string; root: string; amount: number }[],
  ly: { ledger: string; group: string; root: string; amount: number }[],
) {
  const base = treeOf(cur);
  if (!ly.length) return base;
  const lyTree = treeOf(ly);
  const lyRoot = new Map(lyTree.map((r) => [r.root, r]));
  const seen = new Set(base.map((r) => r.root));
  const merge = (r: ReturnType<typeof treeOf>[number], l?: ReturnType<typeof treeOf>[number]) => {
    const lyGrp = new Map((l?.groups || []).map((g) => [g.name, g]));
    const groups = r.groups.map((g) => {
      const lg = lyGrp.get(g.name);
      const lyLed = new Map((lg?.ledgers || []).map((x) => [x.name, x.amount]));
      const ledgers = g.ledgers.map((x) => ({ ...x, ly: lyLed.get(x.name) ?? 0 }));
      const extra = [...lyLed.entries()].filter(([n]) => !g.ledgers.some((x) => x.name === n))
        .map(([name, amount]) => ({ name, amount: 0, ly: amount }));
      lyGrp.delete(g.name);
      return { ...g, ly: lg?.total ?? 0, ledgers: [...ledgers, ...extra].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 300) };
    });
    // a group that spent last year and nothing this year still has to show
    for (const [name, lg] of lyGrp) groups.push({ name, total: 0, ly: lg.total, ledgers: lg.ledgers.map((x) => ({ ...x, amount: 0, ly: x.amount })) });
    return { ...r, ly: l?.total ?? 0, groups };
  };
  const out = base.map((r) => merge(r, lyRoot.get(r.root)));
  for (const l of lyTree) if (!seen.has(l.root)) out.push(merge({ root: l.root, total: 0, groups: [] }, l));
  return out;
}

function treeOf(entries: { ledger: string; group: string; root: string; amount: number }[]) {
  const roots = new Map<string, { root: string; total: number; groups: Map<string, { total: number; ledgers: Map<string, number> }> }>();
  for (const e of entries) {
    if (!e.amount) continue;
    const r = roots.get(e.root) ?? roots.set(e.root, { root: e.root, total: 0, groups: new Map() }).get(e.root)!;
    r.total += e.amount;
    const g = r.groups.get(e.group) ?? r.groups.set(e.group, { total: 0, ledgers: new Map() }).get(e.group)!;
    g.total += e.amount;
    g.ledgers.set(e.ledger, (g.ledgers.get(e.ledger) || 0) + e.amount);
  }
  return [...roots.values()]
    .map((r) => ({
      root: r.root, total: r.total,
      groups: [...r.groups.entries()]
        .map(([name, g]) => ({
          name, total: g.total,
          ledgers: [...g.ledgers.entries()].map(([ledger, amount]) => ({ name: ledger, amount }))
            .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 300),
        }))
        .filter((g) => g.total !== 0)
        .sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
    }))
    .filter((r) => r.total !== 0)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

/** Tonight's Tally arrived with NUMBERED group names ("07.Sales Accounts",
 *  "05.Investments") — the MIS mapping's prefixes. A number never changes
 *  what a group IS, so every classifier strips it before judging. */
const stripNo = (r: string) => r.replace(/^\s*\d+\s*[.)-]*\s*/, "");

/** A proforma is an intention, not a booking — Tally keeps them optional and
 *  its own statements skip them. They arrive both as their own voucher type
 *  AND as PI-numbered "GST Sales" (June 2026 carried ₹7.5 Cr of those, which
 *  is how the dashboard's Billing drifted ₹9 Cr above the review sheet —
 *  Dr Raghu, 29 Aug 2026: "these numbers are wrong"). No statement counts
 *  them. */
const isProforma = (vtype: unknown, vno: unknown) =>
  String(vtype || "") === "Proforma Invoice" || /^PI[-/]/i.test(String(vno || "").trim());

const isBankChain = (rootOf: (g: string) => string, parent: string) =>
  /^bank accounts$|^bank od|^cash-in-hand$/i.test(stripNo(rootOf(parent))) || /^bank|^cash-in-hand$/i.test(stripNo(parent));

export async function GET(req: Request) {
  try {
    await requireKuber();
    const admin = adminClient();
    const url = new URL(req.url);
    const view = url.searchParams.get("view") || "summary";
    const today = IST_TODAY();

    if (view === "ageing") {
      const kind = url.searchParams.get("kind");
      if (kind !== "receivable" && kind !== "payable") throw new HttpError(400, "kind must be receivable or payable");
      // amounts are SIGNED (0079): positive = owed in the party's direction,
      // negative = an unadjusted opposite entry. The party total is the NET —
      // the sheet's own number — with the unadjusted lump shown, not hidden.
      const bills = (await allBills(admin)).filter((b) => b.kind === kind);
      // each bill's own arithmetic — ORIGINAL billed, RECEIVED against it,
      // PENDING — rebuilt from the opening bills and the settlement records
      // (Dr Raghu, 28 Aug 2026). Tally signs: debit negative; a receivable
      // bill's original is its debit side, its receipts the credit side.
      const hist = new Map<string, { neg: number; pos: number }>();
      const feed = async (table: string, amountCol: string) => {
        for (let f = 0; ; f += 1000) {
          const { data, error } = await admin.from(table).select(`ledger, bill, ${amountCol}`).range(f, f + 999);
          if (error) return;
          for (const r of (data || []) as unknown as Record<string, unknown>[]) {
            const k = String(r.ledger) + "||" + String(r.bill);
            const h = hist.get(k) || { neg: 0, pos: 0 };
            const v = Number(r[amountCol]) || 0;
            if (v < 0) h.neg += v; else h.pos += v;
            hist.set(k, h);
          }
          if (!data || data.length < 1000) break;
        }
      };
      await feed("kuber_opening_bill", "amount");
      await feed("kuber_bill_alloc", "amount");
      type BillOut = Bill & { original: number; received: number };
      const dress = (b: Bill): BillOut => {
        const h = hist.get(b.party + "||" + b.bill) || { neg: 0, pos: 0 };
        const original = kind === "receivable" ? -h.neg : h.pos;
        const received = kind === "receivable" ? h.pos : -h.neg;
        return { ...b, original, received };
      };
      /**
       * AN ADVANCE COMES OFF THAT PARTY'S OWN BILLS, OLDEST FIRST.
       *
       * Dr Raghu, 30 Sep 2026: "this cannot be correct!!! If a customer has
       * an outstanding and an advance in the same name it is wrong!!! It has
       * to internally deduct" — and, a minute later, "same with supplier".
       *
       * The NET column was already right. The AGEING was not: Transweigh's
       * buckets added to its gross ₹8.86 Cr while only ₹7.56 Cr was
       * collectable, because the ₹1.29 Cr advance sat to one side and was
       * never applied. Every ageing figure on the screen was therefore
       * overstated for the forty customers and hundred and eight suppliers
       * who hold both — ₹15.93 Cr and ₹10.36 Cr of advances respectively,
       * sitting beside bills belonging to the same name.
       *
       * OLDEST FIRST, because that is how money is actually applied and how
       * every ageing in the world is read. The oldest bucket is the one that
       * should empty first when a party has paid ahead.
       *
       * WHAT IS NOT DONE: an advance is never applied to a DIFFERENT party's
       * bill. That remains his rule from 28 August, and it is why the totals
       * still carry gross and advance separately as well as the net.
       */
      const parties = new Map<string, { party: string; group: string | null; total: number; gross: number; unadjusted: number; applied: number; credit: number; not_due: number; d0_30: number; d31_90: number; d91_180: number; d180p: number; bills: BillOut[] }>();
      for (const b of bills) {
        const p = parties.get(b.party) || { party: b.party, group: b.party_group, total: 0, gross: 0, unadjusted: 0, applied: 0, credit: 0, not_due: 0, d0_30: 0, d31_90: 0, d91_180: 0, d180p: 0, bills: [] };
        p.total += b.amount;
        if (b.amount > 0) p.gross += b.amount; else p.unadjusted += b.amount;
        p.bills.push(dress(b));
        parties.set(b.party, p);
      }
      /* Now age what is LEFT after the party's own advance has been applied. */
      for (const p of parties.values()) {
        p.bills.sort((a, b2) => String(a.due_date || "9999").localeCompare(String(b2.due_date || "9999")));
        let left = Math.abs(p.unadjusted);                 // the advance, to spend
        for (const b of p.bills) {
          if (b.amount <= 0) continue;
          const take = Math.min(left, b.amount);
          left -= take;
          const net = b.amount - take;
          p.applied += net;
          if (net > 0.5) (p as unknown as Record<string, number>)[bucketOf(b.due_date, today)] += net;
        }
        /* An advance bigger than everything billed leaves a real credit —
           money held against work not yet invoiced. Shown, never buried. */
        p.credit = left;
      }
      const rows = [...parties.values()]
        .filter((p) => Math.abs(p.total) > 0.5)
        .sort((a, b2) => b2.total - a.total);
      // ONE arithmetic with the report card (Dr Raghu caught the two screens
      // disagreeing, 28 Aug 2026): totals over ALL bills, count = the open
      // bills proper (positives) — an untied advance is not a bill.
      const pos = bills.filter((b) => b.amount > 0);
      const gross = pos.reduce((s2, b) => s2 + b.amount, 0);
      const unadjusted = bills.filter((b) => b.amount < 0).reduce((s2, b) => s2 + b.amount, 0);
      /* OVERDUE, AFTER THE ADVANCE. The old figure aged the gross bills and
         so counted money the party had already sent. */
      const overdue = rows.reduce((s2, p) => s2 + p.d0_30 + p.d31_90 + p.d91_180 + p.d180p, 0);
      const applied = rows.reduce((s2, p) => s2 + p.applied, 0);
      const credit = rows.reduce((s2, p) => s2 + p.credit, 0);
      const bothSides = rows.filter((p) => p.gross > 0 && p.unadjusted < 0).length;
      return NextResponse.json({
        rows, total: gross + unadjusted, gross, overdue, unadjusted,
        applied, credit, bothSides, count: pos.length, today,
      });
    }

    if (view === "reportcard") {
      // The supplier's story: what they carry, how late we are with them, and
      // how late THEY leave us to run — the card reads both directions.
      /**
       * AS AT ANY DATE (Dr Raghu, 30 Sep 2026: "put the date impacts please!
       * I may want to see previous years too").
       *
       * Two different things have to be honest about two different limits.
       * The OUTSTANDING at a past date is exact: it is the supplier's ledger
       * walked from the one opening Tally exported (1 April of the newest
       * year) — forward to a later date, BACKWARD out of it to an earlier
       * one. The AGEING at a past date is not: a bill settled since then has
       * left the bill-wise list and cannot be aged, so what is aged is what
       * was open then AND is still open now. The card says which is which.
       */
      const asofRaw = url.searchParams.get("asof") || today;
      const asof = asofRaw > today ? today : asofRaw;
      const dated = asof < today;
      const bills = (await allBills(admin)).filter((b) => b.kind === "payable" && (!dated || !b.bill_date || b.bill_date <= asof));
      /* the exact figure for a past date: each creditor's ledger closing */
      const ledgerClosing = new Map<string, number>();
      if (dated) {
        const w = await loadWorld(admin);
        const anchorFy = (w.ledgers as RR[]).reduce((a, r) => { const f = String(r.fy || ""); return f > a ? f : a; }, "");
        const anchor = anchorFy ? `${anchorFy.slice(0, 4)}-04-01` : asof;
        const creditors = new Set<string>();
        for (const l of w.ledgers) if (w.chainHas(String(l.parent || ""), /^sundry creditors$/)) creditors.add(String(l.name));
        const delta = new Map<string, number>();
        for (const l of w.lines) {
          const n = String(l.ledger);
          if (!creditors.has(n)) continue;
          const d = w.dateOf.get(String(l.voucher_id)) || "";
          if (!d) continue;
          const fwd = d >= anchor && d <= asof, back = d > asof && d < anchor;
          if (!fwd && !back) continue;
          delta.set(n, (delta.get(n) || 0) + (Number(l.amount) || 0) * (fwd ? 1 : -1));
        }
        for (const l of w.ledgers) {
          const n = String(l.name);
          if (!creditors.has(n)) continue;
          ledgerClosing.set(n, (Number(l.opening) || 0) + (delta.get(n) || 0));
        }
      }
      const byParty = new Map<string, { party: string; group: string | null; outstanding: number; gross: number; overdue: number; oldest: string | null; nbills: number; wsum: number }>();
      for (const b of bills) {
        const p = byParty.get(b.party) || { party: b.party, group: b.party_group, outstanding: 0, gross: 0, overdue: 0, oldest: null, nbills: 0, wsum: 0 };
        p.outstanding += b.amount; // net — the sheet's own Tally OS
        if (b.amount > 0) {
          p.gross += b.amount;
          p.nbills += 1;
          if (b.due_date && b.due_date < asof) {
            p.overdue += b.amount;
            p.wsum += daysBetween(b.due_date, asof) * b.amount;
            if (!p.oldest || b.due_date < p.oldest) p.oldest = b.due_date;
          }
        }
        byParty.set(b.party, p);
      }
      // purchase volume from the vouchers, so a big steady supplier outranks
      // a one-bill stranger even at the same outstanding
      const vol = new Map<string, { n: number }>();
      try {
        const fyOf = (d: string) => (d.slice(5, 7) >= "04" ? d.slice(0, 4) + "-04-01" : String(Number(d.slice(0, 4)) - 1) + "-04-01");
        const fyA = fyOf(asof), fyB = addDays(fyA, 365);
        const { data } = await admin.from("kuber_voucher").select("party, vtype").in("vtype", ["Purchase", "Cap-Ex Purchase", "Outside Labour", "Expenses", "Site Exps"]).gte("date", fyA).lt("date", fyB).limit(20000);
        for (const v of data || []) {
          if (!v.party) continue;
          const r = vol.get(v.party) || { n: 0 };
          r.n += 1;
          vol.set(v.party, r);
        }
      } catch (e) { swallow("kuber/books", e); /* vouchers not loaded yet */ }
      // the headline stats Dr Raghu asked for (28 Aug 2026): total O/S in
      // numbers and value, the rupee-weighted average AGE of what is open,
      // and how much stands beyond its credit period (= overdue, since the
      // due date IS bill date + credit period).
      let ageWsum = 0, grossAll = 0, nbillsAll = 0, overdueAll = 0, netAll = 0;
      for (const b of bills) {
        netAll += b.amount;
        if (b.amount > 0) {
          grossAll += b.amount;
          nbillsAll += 1;
          if (b.bill_date) ageWsum += daysBetween(b.bill_date, asof) * b.amount;
          if (b.due_date && b.due_date < asof) overdueAll += b.amount;
        }
      }
      const stats = {
        get net() { return netAll; }, gross: grossAll, nbills: nbillsAll,
        parties: byParty.size,
        avg_age_days: grossAll > 0 ? Math.round(ageWsum / grossAll) : 0,
        overdue: overdueAll,
        overdue_pct: grossAll > 0 ? Math.round((overdueAll / grossAll) * 100) : 0,
      };
      if (dated) {
        for (const [name, closing] of ledgerClosing) {
          const p = byParty.get(name) || { party: name, group: "Sundry Creditors", outstanding: 0, gross: 0, overdue: 0, oldest: null, nbills: 0, wsum: 0 };
          p.outstanding = closing;                       // exact, from the ledger
          byParty.set(name, p);
        }
        netAll = [...ledgerClosing.values()].reduce((a, v) => a + v, 0);
      }
      const rows = [...byParty.values()].filter((p) => Math.abs(p.outstanding) > 0.5).map((p) => {
        const avgDelay = p.overdue > 0 ? Math.round(p.wsum / p.overdue) : 0;
        // % of GROSS open bills, so unadjusted credits can never push it past 100
        const overduePct = p.gross > 0 ? p.overdue / p.gross : 0;
        // Our grade of the RELATIONSHIP's health, not of the supplier's soul:
        // A = current, D = mostly overdue and old.
        const grade = overduePct < 0.1 ? "A" : overduePct < 0.35 ? "B" : avgDelay <= 60 ? "C" : "D";
        return { ...p, vouchers: vol.get(p.party)?.n || 0, avg_delay_days: avgDelay, overdue_pct: Math.round(overduePct * 100), grade };
      }).sort((a, b2) => b2.outstanding - a.outstanding);
      return NextResponse.json({ rows, stats: { ...stats, net: netAll }, today, asof, dated,
        caveat: dated ? "Outstanding is exact — each supplier's ledger walked to that date. The ageing and overdue columns cover only bills that were open then and are still open now; a bill settled since has left the bill-wise list and cannot be aged." : null });
    }

    if (view === "supplier") {
      // one supplier's own report card (the sheet's tab-B3 drilldown):
      // the open bills, the ageing, and what was actually PAID in the last
      // 7 / 30 / 45 / 90 days from the settlement allocations.
      const party = url.searchParams.get("party") || "";
      if (!party) throw new HttpError(400, "party required");
      const bills = (await allBills(admin)).filter((b) => b.kind === "payable" && b.party === party);
      const posB = bills.filter((b) => b.amount > 0);
      const net = bills.reduce((s, b) => s + b.amount, 0);
      const gross = posB.reduce((s, b) => s + b.amount, 0);
      const unadjusted = bills.filter((b) => b.amount < 0).reduce((s, b) => s + b.amount, 0);
      const overdueB = posB.filter((b) => b.due_date && b.due_date < today);
      const overdue = overdueB.reduce((s, b) => s + b.amount, 0);
      const wsum = overdueB.reduce((s, b) => s + daysBetween(b.due_date as string, today) * b.amount, 0);
      // the fine ageing HE specified: 0-15 · 16-30 · 31-60 · 61-90 · 91-120 ·
      // 121-180 · 181-240 · 241-360 · 360+ — days since the BILL date.
      const FINE: [string, number, number][] = [
        ["d0_15", 0, 15], ["d16_30", 16, 30], ["d31_60", 31, 60], ["d61_90", 61, 90],
        ["d91_120", 91, 120], ["d121_180", 121, 180], ["d181_240", 181, 240],
        ["d241_360", 241, 360], ["d360p", 361, 1e9],
      ];
      const buckets: Record<string, number> = Object.fromEntries(FINE.map(([k]) => [k, 0]));
      buckets.undated = 0;
      for (const b of posB) {
        if (!b.bill_date) { buckets.undated += b.amount; continue; }
        const d = daysBetween(b.bill_date, today);
        const f = FINE.find(([, lo, hi]) => d >= lo && d <= hi);
        buckets[f ? f[0] : "d360p"] += b.amount;
      }
      /**
       * THE BANDS AS A TABLE (Dr Raghu, 30 Sep 2026: "show the aging as a
       * proper table, single table with 0-30, 31 to 60 etc, below that
       * amounts, below that % of o/s").
       *
       * Nine chips wrapping over two lines is a shape the eye reads one at a
       * time; a row of eight with the share underneath is a shape it reads
       * across. The fine buckets are kept for the drilldowns that already use
       * them — this is a second view of the same bills, not a replacement.
       */
      const BANDS: [string, number, number][] = [
        ["0–30", 0, 30], ["31–60", 31, 60], ["61–90", 61, 90], ["91–120", 91, 120],
        ["121–180", 121, 180], ["181–240", 181, 240], ["241–360", 241, 360], ["360+", 361, 1e9],
      ];
      const bands = BANDS.map(([label, lo, hi]) => {
        const amount = posB.reduce((a, b) => {
          if (!b.bill_date) return a;
          const d = daysBetween(b.bill_date, today);
          return d >= lo && d <= hi ? a + b.amount : a;
        }, 0);
        return { label, amount, pct: gross ? (amount / gross) * 100 : 0 };
      });

      /**
       * TWELVE MONTHS OF HIM (his instruction): what he invoiced, what we
       * paid, and the balance he was left carrying at each month end.
       *
       * THE BALANCE IS A RUNNING CLOSING, not a month's movement — "so that
       * one of Sept 2025 will show closing balance". It is built forward from
       * the ledger's own opening, so the last row ties to the outstanding on
       * the card above.
       *
       * Months before the books begin are returned with nulls rather than
       * zeros. A zero would say he invoiced nothing; null says Genie does not
       * know, which until the 2025-26 Tally file is loaded is the truth.
       */
      const months: { key: string; label: string; purchases: number | null; payments: number | null;
                      balance: number | null; invoices: number | null; pos: number | null }[] = [];
      /** his purchase orders, one row each (Dr Raghu, 30 Sep 2026) */
      const poList: { po: string; date: string | null; items: string; lines: number; value: number;
                      due: string | null; done: string | null; late: number | null; grade: string; status: string }[] = [];
      try {
        const { data: led } = await admin.from("kuber_ledger").select("opening").eq("name", party).order("fy", { ascending: false }).limit(1).maybeSingle();
        const opening = Number(led?.opening) || 0;
        const { data: vs } = await admin.from("kuber_voucher").select("id, date, vtype").eq("party", party).limit(5000);
        const vlist = (vs || []) as { id: string; date: string; vtype: string }[];
        const vById = new Map(vlist.map((v) => [String(v.id), v]));
        const mv: Record<string, { p: number; y: number; inv: number }> = {};
        let firstBook = "9999-99";
        for (const v of vlist) if (v.date && String(v.date).slice(0, 7) < firstBook) firstBook = String(v.date).slice(0, 7);
        /* The party's own ledger lines: a credit raises what we owe him, a
           debit reduces it. Tally's signs, unchanged. */
        for (let from = 0; ; from += 1000) {
          const { data: ls } = await admin.from("kuber_voucher_line").select("voucher_id, ledger, amount").eq("ledger", party).range(from, from + 999);
          const rows = (ls || []) as { voucher_id: string; amount: number }[];
          for (const l of rows) {
            const v = vById.get(String(l.voucher_id));
            if (!v || !v.date) continue;
            const k = String(v.date).slice(0, 7);
            const m = (mv[k] ||= { p: 0, y: 0, inv: 0 });
            const a = Number(l.amount) || 0;
            if (a > 0) m.p += a; else m.y += -a;
          }
          if (rows.length < 1000) break;
        }
        for (const v of vlist) {
          if (!v.date) continue;
          if (!/purchase|excise/i.test(String(v.vtype))) continue;
          (mv[String(v.date).slice(0, 7)] ||= { p: 0, y: 0, inv: 0 }).inv += 1;
        }
        /**
         * HIS PURCHASE ORDERS, FROM THE ERP'S OWN REGISTER.
         *
         * IT USED TO READ THE FIRST FIVE THOUSAND OF TWENTY-ONE THOUSAND.
         * `.limit(5000)` with no order and a filter applied afterwards in
         * JavaScript: any supplier whose POs happened to sit outside that
         * arbitrary slice showed a column of dots and looked like a supplier
         * we had never ordered from. Swarajya has fifty-odd and showed none.
         * The filter belongs in the query.
         *
         * Two queries rather than one `.or()`, because a party name with a
         * comma in it breaks PostgREST's or-syntax and several of them have.
         */
        const poByMonth: Record<string, number> = {};
        type PoRow = { name: string; status: string; docstatus: number; transaction_date: string | null; schedule_date: string | null; grand_total: number; per_received: number };
        let poRows: PoRow[] = [];
        try {
          const sel = "name, status, docstatus, transaction_date, schedule_date, grand_total, per_received";
          const [a, b] = await Promise.all([
            admin.from("material_po").select(sel).ilike("supplier", party).limit(1000),
            admin.from("material_po").select(sel).ilike("supplier_name", party).limit(1000),
          ]);
          const seen = new Map<string, PoRow>();
          for (const r of [...((a.data || []) as PoRow[]), ...((b.data || []) as PoRow[])]) seen.set(String(r.name), r);
          poRows = [...seen.values()];
          for (const r of poRows) {
            const d = String(r.transaction_date || "").slice(0, 7);
            if (d) poByMonth[d] = (poByMonth[d] || 0) + 1;
          }
        } catch (e) { swallow("kuber/supplier-po", e); }

        /**
         * EACH PO, WITH WHAT IT WAS FOR AND WHETHER IT CAME ON TIME.
         *
         * Dr Raghu, 30 Sep 2026: "in this also show Purchase Orders — PO No,
         * Date, Items, Value, Due Date, Completion Date, Grade."
         *
         * The completion date is not a field anywhere; the ERP keeps only a
         * received PERCENTAGE. So it is taken from the goods themselves: the
         * last receipt note posted against that PO. A PO not fully received
         * has no completion date and is not graded, because grading an order
         * that has not arrived would be inventing the verdict.
         *
         * THE GRADE IS ABOUT THE PROMISE, not about us. Due date is the
         * schedule date on the PO; A means it landed on or before it.
         */
        try {
          const names = poRows.map((r) => String(r.name));
          const itemsOf = new Map<string, { names: string[]; lines: number }>();
          const doneOf = new Map<string, string>();
          for (let i = 0; i < names.length; i += 100) {
            const slice = names.slice(i, i + 100);
            const [{ data: pit }, { data: git }] = await Promise.all([
              admin.from("material_po_item").select("po_name, item_name").in("po_name", slice),
              admin.from("material_grn_item").select("purchase_order, grn_name").in("purchase_order", slice),
            ]);
            for (const x of (pit || []) as { po_name: string; item_name: string }[]) {
              const r = itemsOf.get(String(x.po_name)) || { names: [], lines: 0 };
              r.lines += 1;
              const n = String(x.item_name || "").trim();
              if (n && r.names.length < 3 && !r.names.includes(n)) r.names.push(n);
              itemsOf.set(String(x.po_name), r);
            }
            const grnNames = [...new Set(((git || []) as { grn_name: string }[]).map((x) => String(x.grn_name)))];
            const dateOfGrn = new Map<string, string>();
            for (let k = 0; k < grnNames.length; k += 100) {
              const { data: gr } = await admin.from("material_grn").select("name, posting_date").in("name", grnNames.slice(k, k + 100));
              for (const g of (gr || []) as { name: string; posting_date: string }[]) if (g.posting_date) dateOfGrn.set(String(g.name), String(g.posting_date));
            }
            for (const x of (git || []) as { purchase_order: string; grn_name: string }[]) {
              const d = dateOfGrn.get(String(x.grn_name));
              const po = String(x.purchase_order);
              if (d && (!doneOf.get(po) || d > doneOf.get(po)!)) doneOf.set(po, d);
            }
          }
          for (const r of poRows) {
            const nm = String(r.name);
            const it = itemsOf.get(nm);
            const received = Number(r.per_received) || 0;
            const cancelled = /cancel/i.test(String(r.status)) || Number(r.docstatus) === 2;
            const done = received >= 99.5 ? (doneOf.get(nm) || null) : null;
            const due = r.schedule_date ? String(r.schedule_date) : null;
            const late = done && due ? daysBetween(due, done) : null;
            const grade = cancelled ? "cancelled"
              : late == null ? (received > 0 ? `part ${Math.round(received)}%` : due && due < today ? `overdue ${daysBetween(due, today)}d` : "open")
              : late <= 0 ? "A" : late <= 7 ? "B" : late <= 30 ? "C" : "D";
            poList.push({
              po: nm, date: r.transaction_date ? String(r.transaction_date) : null,
              items: it ? it.names.join(", ") + (it.lines > it.names.length ? ` +${it.lines - it.names.length} more` : "") : "",
              lines: it?.lines || 0, value: Number(r.grand_total) || 0,
              due, done, late, grade, status: String(r.status || ""),
            });
          }
          poList.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
        } catch (e) { swallow("kuber/supplier-po-detail", e); }

        const t0 = new Date(`${today}T00:00:00`);
        const keys: string[] = [];
        for (let i = 11; i >= 0; i--) {
          const d = new Date(t0.getFullYear(), t0.getMonth() - i, 1);
          keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        }
        let run = opening;
        for (const k of keys) {
          const known = k >= firstBook;
          const m = mv[k];
          if (known) run += (m?.p || 0) - (m?.y || 0);
          months.push({
            key: k,
            label: new Date(`${k}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
            purchases: known ? (m?.p || 0) : null,
            payments: known ? (m?.y || 0) : null,
            balance: known ? run : null,
            invoices: known ? (m?.inv || 0) : null,
            pos: poByMonth[k] ?? (known ? 0 : null),
          });
        }
        /**
         * NEWEST FIRST (Dr Raghu, 30 Sep 2026: "show reverse current month
         * first").
         *
         * The running balance has to be built OLDEST first — each month's
         * closing is the one before it plus the movement — so the rows are
         * computed forward and reversed only for the reading. Reversing the
         * loop instead would have carried the balance backwards and produced
         * a column that looked right and was not.
         */
        months.reverse();
      } catch (e) { swallow("kuber/supplier-months", e); }

      // credit period as the bills themselves wear it (due − bill date)
      const periods = posB.filter((b) => b.bill_date && b.due_date).map((b) => daysBetween(b.bill_date as string, b.due_date as string));
      const creditDays = periods.length ? Math.round(periods.reduce((a, b) => a + b, 0) / periods.length) : null;
      // the movement ledgers: negative allocations = payments OUT to the
      // supplier; positive New Refs = invoices booked IN from him.
      const paid = { d7: 0, d30: 0, d45: 0, d90: 0 };
      const invoiced = { d7: 0, d30: 0, d45: 0, d90: 0 };
      const payments: { date: string | null; amount: number; bill: string; vtype: string; vno: string }[] = [];
      const invoices: { date: string | null; amount: number; bill: string; vtype: string; vno: string }[] = [];
      try {
        const { data: al } = await admin.from("kuber_bill_alloc").select("amount, date, bill, billtype, voucher_id").eq("ledger", party).limit(5000);
        const vids = [...new Set((al || []).map((a) => String(a.voucher_id)).filter(Boolean))];
        const vinfo = new Map<string, { vtype: string; vno: string }>();
        for (let i = 0; i < vids.length; i += 200) {
          const { data: vs } = await admin.from("kuber_voucher").select("id, vtype, vno").in("id", vids.slice(i, i + 200));
          for (const vv of vs || []) vinfo.set(String(vv.id), { vtype: String(vv.vtype), vno: String(vv.vno) });
        }
        for (const a of al || []) {
          const amt = Number(a.amount) || 0;
          const vi = vinfo.get(String(a.voucher_id)) || { vtype: "", vno: "" };
          const rec = { date: (a.date as string) ?? null, bill: String(a.bill || ""), vtype: vi.vtype, vno: vi.vno };
          if (amt < 0) {
            payments.push({ ...rec, amount: -amt });
            if (a.date) {
              const d = daysBetween(String(a.date), today);
              if (d <= 7) paid.d7 -= amt;
              if (d <= 30) paid.d30 -= amt;
              if (d <= 45) paid.d45 -= amt;
              if (d <= 90) paid.d90 -= amt;
            }
          } else if (amt > 0 && /new ref/i.test(String(a.billtype))) {
            invoices.push({ ...rec, amount: amt });
            if (a.date) {
              const d = daysBetween(String(a.date), today);
              if (d <= 7) invoiced.d7 += amt;
              if (d <= 30) invoiced.d30 += amt;
              if (d <= 45) invoiced.d45 += amt;
              if (d <= 90) invoiced.d90 += amt;
            }
          }
        }
        payments.sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));
        invoices.sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));
      } catch (e) { swallow("kuber/books", e); /* allocs absent — the card stands without them */ }
      // planned payments for this party — the cash flow's own decisions
      let plans: { plan_date: string; amount: number; status: string; purpose: string; bill_ref: string }[] = [];
      try {
        const { data: pl } = await admin.from("kuber_payment_plan").select("plan_date, amount, status, purpose, bill_ref").eq("party", party).neq("status", "dropped").order("plan_date");
        plans = (pl || []) as typeof plans;
      } catch (e) { swallow("kuber/books", e); /* pre-0076 */ }
      // items supplied — the goods on this party's vouchers (0081)
      let items: { item: string; times: number; total: number; qty: string; last: string | null }[] = [];
      try {
        const { data: pv } = await admin.from("kuber_voucher").select("id, date").eq("party", party).limit(2000);
        const vdate = new Map((pv || []).map((x) => [String(x.id), (x.date as string) ?? null]));
        const ids = [...vdate.keys()];
        const byItem = new Map<string, { times: number; total: number; qtys: string[]; last: string | null }>();
        for (let i = 0; i < ids.length; i += 200) {
          const { data: it } = await admin.from("kuber_voucher_item").select("voucher_id, item, qty, amount").in("voucher_id", ids.slice(i, i + 200));
          for (const x of it || []) {
            const r = byItem.get(String(x.item)) || { times: 0, total: 0, qtys: [], last: null };
            r.times += 1;
            r.total += Math.abs(Number(x.amount) || 0);
            if (x.qty) r.qtys.push(String(x.qty));
            const dte = vdate.get(String(x.voucher_id)) ?? null;
            if (dte && (!r.last || dte > r.last)) r.last = dte;
            byItem.set(String(x.item), r);
          }
        }
        items = [...byItem.entries()]
          .map(([item, r]) => ({ item, times: r.times, total: r.total, qty: r.qtys.slice(-1)[0] || "", last: r.last }))
          .sort((a, b2) => b2.total - a.total);
      } catch (e) { swallow("kuber/books", e); /* pre-0081 or masters-only */ }
      let vouchers = 0;
      try {
        const { count } = await admin.from("kuber_voucher").select("id", { count: "exact", head: true }).eq("party", party);
        vouchers = count ?? 0;
      } catch (e) { swallow("kuber/books", e); /* fine */ }
      const oldest = overdueB.reduce<string | null>((s, b) => (!s || (b.due_date as string) < s ? (b.due_date as string) : s), null);
      return NextResponse.json({
        party, today, net, gross, unadjusted, overdue,
        overdue_pct: gross > 0 ? Math.round((overdue / gross) * 100) : 0,
        weighted_delay: overdue > 0 ? Math.round(wsum / overdue) : 0,
        oldest_due: oldest, credit_days: creditDays, buckets, bands, months, paid, invoiced, vouchers,
        payments: payments.slice(0, 200), invoices: invoices.slice(0, 200), plans, items: items.slice(0, 100),
        pos: poList.slice(0, 400),
        bills: bills.sort((a, b2) => String(a.due_date || "9999").localeCompare(String(b2.due_date || "9999"))),
      });
    }

    /**
     * THE 13-WEEK CASH FLOW PLAN — HIS SHEET'S TWELVE HEADS, FED FROM WHERE
     * EACH ONE ACTUALLY LIVES (Dr Raghu, 30 Sep 2026).
     *
     * WEEKS RUN SUNDAY TO SATURDAY. His W40 is 27/09 to 03/10 and 27 September
     * 2026 is a Sunday; Genie was starting Mondays and every figure sat one
     * day out from the sheet he reads.
     *
     * INFLOW
     *   Advance Payment ............ cash_expected, kind advance
     *   Collection from Order Exec . the Jobmaster's own terms: (value + GST −
     *                                advance) split by the % on delivery / +30
     *                                / +60 / +90, from the TDD. The pcts are of
     *                                the BALANCE after advance — that is how
     *                                every job that has both reads.
     *   Follow Up Payment .......... every open receivable bill, on the date
     *                                somebody has said it will come, else its
     *                                due date; anything already past → week 1
     *   Bank Loan / Other Income ... cash_expected, kinds bank_loan and
     *                                other_income, plus FD maturities in window
     *
     * OUTFLOW — "will all come from the Tally. Suresh will put entries in the
     * Tally where he will book EMI for the next month, salary approx etc."
     *   Every FORWARD-DATED Payment or Journal voucher is read, and its debit
     *   side sorted by ledger into Salaries · EMI · Statutory · Regular · PDC
     *   (a post-dated payment to a Sundry Creditor is a PDC). Nothing is typed
     *   in Genie for these five; when Tally has nothing dated ahead, they read
     *   zero and the screen says why.
     *   Old Vendor Payments ........ Payment Planning, status planned/approved
     *   Other expenses ............. Payment Planning, purpose "Other…"
     *
     * A memo line shows supplier bills falling due that nobody has planned —
     * outside the totals, because an unplanned bill is a question, not a
     * decision.
     */
    if (view === "cashplan") {
      const sundayOf = (iso: string) => addDays(iso, -new Date(iso + "T00:00:00Z").getUTCDay());
      const start = sundayOf(today);
      const isoWeek = (iso: string) => {
        const d = new Date(iso + "T00:00:00Z");
        const day = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - day);
        const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d.getTime() - y0.getTime()) / 86400000) + 1) / 7);
      };
      const weeks = Array.from({ length: 13 }, (_, i) => {
        const from = addDays(start, i * 7);
        return { i: i + 1, from, to: addDays(from, 6), wno: isoWeek(addDays(from, 1)) };
      });
      const end = weeks[12].to;
      const weekIdx = (d: string | null | undefined) => {
        if (!d) return -1;
        if (d < start) return 0;
        const i = Math.floor(daysBetween(start, d) / 7);
        return i >= 0 && i < 13 ? i : -1;
      };
      const zero = () => Array.from({ length: 13 }, () => 0);
      const IN = ["advance", "order_exec", "followup", "bank_loan", "other_income"] as const;
      const OUT = ["salaries", "emi", "statutory", "regular", "pdc", "vendor", "other_out"] as const;
      const rows: Record<string, number[]> = Object.fromEntries([...IN, ...OUT, "memo_unplanned"].map((k) => [k, zero()]));
      const notes: string[] = [];

      const w = await loadWorld(admin);
      const fyStartC = today.slice(5, 7) >= "04" ? today.slice(0, 4) + "-04-01" : String(Number(today.slice(0, 4)) - 1) + "-04-01";

      /* ---- OPENING: bank + cash at the start of the Sunday, unless stated ---- */
      const isCash = (parent: string) => w.chainHas(parent, /^bank accounts$|^cash-in-hand$/);
      const isOd = (parent: string) => w.chainHas(parent, /^bank od/);
      let openingBooks = 0;
      {
        const cashSet = new Set<string>();
        for (const l of w.ledgers) {
          const par = String(l.parent || "");
          if (isCash(par)) { openingBooks += Number(l.opening) || 0; cashSet.add(String(l.name)); }
        }
        for (const l of w.lines) {
          if (!cashSet.has(String(l.ledger))) continue;
          const d = w.dateOf.get(String(l.voucher_id)) || "";
          if (d && d < start) openingBooks += Number(l.amount) || 0;
        }
      }
      let opening = openingBooks, openingFrom: "books" | "stated" = "books", openingNote: string | null = null;
      try {
        const { data: st } = await admin.from("cash_opening").select("amount, note, by_email").eq("on_date", start).maybeSingle();
        if (st) { opening = Number((st as RR).amount) || 0; openingFrom = "stated"; openingNote = String((st as RR).note || "") || null; }
      } catch (e) { swallow("kuber/cashplan-opening", e); }
      const lastUpload = w.vouchers.reduce((a, v) => { const d = String(v.date || ""); return d > a && d <= today ? d : a; }, "");

      /* ---- INFLOW 1 · 4 · 5: what somebody expects, on a date ---- */
      try {
        const exp = await pageAll<RR>(async (a, b) => {
          const r = await admin.from("cash_expected").select("kind, party, amount, expected_on, received").eq("received", false).range(a, b);
          return { data: r.data as RR[] | null, error: r.error };
        }, "expected inflows");
        for (const e of exp) {
          const i = weekIdx(String(e.expected_on || ""));
          if (i < 0) continue;
          const k = String(e.kind) === "bank_loan" ? "bank_loan" : String(e.kind) === "other_income" ? "other_income" : "advance";
          rows[k][i] += Number(e.amount) || 0;
        }
      } catch (e) { swallow("kuber/cashplan-expected", e); notes.push("Advance / loan / other inflows need migration 0183."); }
      try {
        const { data: fds } = await admin.from("kuber_fd").select("maturity_date, maturity_amount, principal, status").eq("status", "live");
        for (const f of (fds || []) as RR[]) {
          const i = weekIdx(String(f.maturity_date || ""));
          if (i >= 0) rows.other_income[i] += Number(f.maturity_amount ?? f.principal) || 0;
        }
      } catch (e) { swallow("kuber/cashplan-fd", e); }

      /* ---- INFLOW 2: the jobs, by their own terms ---- */
      let jobsCounted = 0, jobsNoTerms = 0, jobsBeyond = 0;
      try {
        const jobs = await pageAll<RR>(async (a, b) => {
          const r = await admin.from("jobs").select("tag, val, gst, tdd, advance, pay_pct_on, pay_pct_30, pay_pct_60, pay_pct_90")
            .eq("active", true).eq("delivered", false).range(a, b);
          return { data: r.data as RR[] | null, error: r.error };
        }, "the live jobs");
        for (const j of jobs) {
          const tdd = String(j.tdd || "");
          if (!tdd) continue;
          const gross = (Number(j.val) || 0) * (1 + (Number(j.gst) || 0) / 100);
          const bal = Math.max(0, gross - (Number(j.advance) || 0));
          let on = Number(j.pay_pct_on) || 0, p30 = Number(j.pay_pct_30) || 0, p60 = Number(j.pay_pct_60) || 0, p90 = Number(j.pay_pct_90) || 0;
          if (on + p30 + p60 + p90 === 0) { on = 100; jobsNoTerms++; }
          jobsCounted++;
          let any = false;
          for (const [pct, off] of [[on, 0], [p30, 30], [p60, 60], [p90, 90]] as [number, number][]) {
            if (!pct) continue;
            const i = weekIdx(addDays(tdd, off));
            if (i >= 0) { rows.order_exec[i] += (bal * pct) / 100; any = true; }
          }
          if (!any) jobsBeyond++;
        }
      } catch (e) { swallow("kuber/cashplan-jobs", e); }

      /* ---- INFLOW 3: the open bills, on the day they are believed to come ---- */
      const bills = await allBills(admin);
      let fup = new Map<string, string>();
      try {
        const got = await pageAll<RR>(async (a, b) => {
          const r = await admin.from("collection_followup").select("party, bill, expected_on").not("expected_on", "is", null).range(a, b);
          return { data: r.data as RR[] | null, error: r.error };
        }, "follow-ups");
        fup = new Map(got.map((m) => [`${m.party}|${m.bill}`, String(m.expected_on)]));
      } catch (e) { swallow("kuber/cashplan-fup", e); }
      let fupDated = 0;
      for (const b of bills.filter((x) => x.kind === "receivable" && x.amount > 0)) {
        const said = fup.get(`${b.party}|${b.bill}`);
        if (said) fupDated++;
        const i = weekIdx(said || b.due_date || b.bill_date || today);
        if (i >= 0) rows.followup[i] += b.amount;
      }

      /* ---- OUTFLOW 6–10: Tally, dated ahead ---- */
      const headOf = (ledger: string, parent: string): (typeof OUT)[number] | null => {
        if (isCash(parent) || isOd(parent)) return null;
        if (w.chainHas(parent, /^sundry creditors$/)) return "pdc";
        const hay = (ledger + " " + parent).toLowerCase();
        if (w.chainHas(parent, /^duties & taxes$|^duties and taxes$/) || /\b(pf|esic|esi|tds|tcs|gst|cgst|sgst|igst|profession(al)? tax|pt payable|provident|gratuity payable|mlwf)\b/.test(hay)) return "statutory";
        if (w.chainHas(parent, /loans? \(liability\)|^secured loans$|^unsecured loans$|^bank od/)) return "emi";
        if (/salar|wages|directors? remun|bonus payable/.test(hay)) return "salaries";
        const root = w.rootOf(parent);
        const { bucket } = classifyLedger({ ledger, group: parent, root, rootN: stripNo(root) });
        if (bucket === "finance") return "emi";
        if (bucket === "tax") return "statutory";
        if (bucket === "indirect" || bucket === "manuf") {
          const h = oeHead(parent, ledger);
          return /salar|directors/i.test(h) ? "salaries" : "regular";
        }
        return "regular";
      };
      let fwdVouchers = 0;
      {
        const vById = new Map(w.vouchers.map((v) => [String(v.id), v]));
        const fwdIds = new Set(w.vouchers.filter((v) => String(v.date || "") > today && /^(payment|journal)$/i.test(String(v.vtype))).map((v) => String(v.id)));
        fwdVouchers = fwdIds.size;
        for (const l of w.lines) {
          const id = String(l.voucher_id);
          if (!fwdIds.has(id)) continue;
          const amt = Number(l.amount) || 0;
          if (amt >= 0) continue;                                 // the debit side only
          const parent = String(w.ledgerByName.get(String(l.ledger))?.parent || "");
          const h = headOf(String(l.ledger), parent);
          if (!h) continue;
          const i = weekIdx(String(vById.get(id)?.date || ""));
          if (i >= 0) rows[h][i] += -amt;
        }
      }
      if (!fwdVouchers) notes.push("Tally carries nothing dated ahead of today yet — Salaries, EMI, Statutory, Regular and PDC read zero until Suresh books next month's entries forward.");

      /* ---- OUTFLOW 11 · 12: the plan ---- */
      const plannedParties = new Set<string>();
      try {
        const plans = await pageAll<RR>(async (a, b) => {
          const r = await admin.from("kuber_payment_plan").select("plan_date, party, amount, purpose, status").in("status", ["planned", "approved"]).range(a, b);
          return { data: r.data as RR[] | null, error: r.error };
        }, "the payment plan");
        for (const p of plans) {
          plannedParties.add(String(p.party || ""));
          const i = weekIdx(String(p.plan_date || ""));
          if (i < 0) continue;
          rows[/^other/i.test(String(p.purpose || "")) ? "other_out" : "vendor"][i] += Number(p.amount) || 0;
        }
      } catch (e) { swallow("kuber/cashplan-plan", e); }
      /* the memo: bills due that nobody has planned — a question, not a decision */
      for (const b of bills.filter((x) => x.kind === "payable" && x.amount > 0)) {
        if (plannedParties.has(b.party)) continue;
        const i = weekIdx(b.due_date || b.bill_date || today);
        if (i >= 0) rows.memo_unplanned[i] += b.amount;
      }

      /* ---- the walk ---- */
      const inflow = zero(), outflow = zero(), openings = zero(), closings = zero(), net = zero();
      let run = opening;
      for (let i = 0; i < 13; i++) {
        openings[i] = run;
        inflow[i] = IN.reduce((s2, k) => s2 + rows[k][i], 0);
        outflow[i] = OUT.reduce((s2, k) => s2 + rows[k][i], 0);
        net[i] = inflow[i] - outflow[i];
        run += net[i];
        closings[i] = run;
      }
      const total = (k: string) => rows[k].reduce((s2, v) => s2 + v, 0);

      /* ---- the track record his sheet keeps under the plan ---- */
      let billingYtd = 0, collectionYtd = 0, orderInHand = 0, bookingYtd = 0;
      {
        const vById = new Map(w.vouchers.map((v) => [String(v.id), v]));
        for (const v of w.vouchers) {
          const d = String(v.date || "");
          if (d < fyStartC || d > today) continue;
          if (String(v.vtype) === "GST Sales") billingYtd += Number(v.amount) || 0;
        }
        for (const l of w.lines) {
          const v = vById.get(String(l.voucher_id));
          if (!v || String(v.vtype) !== "Receipt") continue;
          const d = String(v.date || "");
          if (d < fyStartC || d > today) continue;
          const amt = Number(l.amount) || 0;
          if (amt > 0 && w.chainHas(String(w.ledgerByName.get(String(l.ledger))?.parent || ""), /^sundry debtors$/)) collectionYtd += amt;
        }
        try {
          const js = await pageAll<RR>(async (a, b) => {
            const r = await admin.from("jobs").select("val, start_date, active, delivered").eq("active", true).range(a, b);
            return { data: r.data as RR[] | null, error: r.error };
          }, "jobs");
          for (const j of js) {
            if (!j.delivered) orderInHand += Number(j.val) || 0;
            if (String(j.start_date || "") >= fyStartC) bookingYtd += Number(j.val) || 0;
          }
        } catch (e) { swallow("kuber/cashplan-track", e); }
      }

      return NextResponse.json({
        today, start, end, weeks,
        opening: { amount: opening, from: openingFrom, books: openingBooks, note: openingNote, asAt: addDays(start, -1), lastUpload: lastUpload || null },
        heads: {
          in: [
            { key: "advance", label: "Advance Payment", src: "expected inflows — Payment Planning › Advance Payments" },
            { key: "order_exec", label: "Collection from Order Execution", src: `${jobsCounted} live jobs by their own terms · ${jobsNoTerms} with no terms read as 100% on delivery · ${jobsBeyond} fall beyond the 13 weeks` },
            { key: "followup", label: "Follow Up Payment", src: `open bills on the date said (${fupDated} dated on Bills Receivable), else due date; overdue in week 1` },
            { key: "bank_loan", label: "Bank Loan", src: "expected inflows — Payment Planning › Other Incomes" },
            { key: "other_income", label: "Other Income", src: "expected inflows and live FD maturities" },
          ],
          out: [
            { key: "salaries", label: "Salaries & wages", src: "Tally, dated ahead" },
            { key: "emi", label: "EMI", src: "Tally, dated ahead — loan principal and interest" },
            { key: "statutory", label: "Statutory", src: "Tally, dated ahead — duties & taxes, PF, ESIC, TDS, GST" },
            { key: "regular", label: "Monthly Regular Expenses", src: "Tally, dated ahead — everything else" },
            { key: "pdc", label: "PDC", src: "Tally — post-dated payments to suppliers" },
            { key: "vendor", label: "Old Vendor Payments", src: "Payment Planning, planned or approved" },
            { key: "other_out", label: "Other expenses", src: "Payment Planning, purpose Other" },
          ],
        },
        rows, totals: Object.fromEntries(Object.keys(rows).map((k) => [k, total(k)])),
        inflow, outflow, net, openings, closings,
        fwdVouchers, notes,
        track: { billingYtd, collectionYtd, orderInHand, bookingYtd, fyStart: fyStartC },
      });
    }

    if (view === "cashflow") {
      // THIRTEEN WEEKS, Monday to Monday. Inflows: receivable bills by due
      // week, FD maturities, manual "in" items. Outflows: payment plans by
      // plan week, manual "out" items (weekly ones repeat), payable bills by
      // due week SHOWN for reference but only counted when no plan exists —
      // the plan is the decision, the bill is the obligation.
      const start = mondayOf(today);
      const weeks = Array.from({ length: 13 }, (_, i) => addDays(start, i * 7));
      const weekIdx = (d: string | null) => {
        if (!d) return -1;
        if (d < start) return 0; // overdue money lands in the current week
        const i = Math.floor(daysBetween(start, d) / 7);
        return i >= 0 && i < 13 ? i : -1;
      };
      const zero = () => Array.from({ length: 13 }, () => 0);
      const flows = {
        collections: zero(), fd_maturity: zero(), other_in: zero(),
        planned_payments: zero(), unplanned_bills: zero(), other_out: zero(),
      };
      const bills = await allBills(admin);
      for (const b of bills.filter((x) => x.kind === "receivable" && x.amount > 0)) {
        const i = weekIdx(b.due_date);
        if (i >= 0) flows.collections[i] += b.amount;
      }
      let plans: { plan_date: string; party: string; amount: number; status: string }[] = [];
      try {
        const { data } = await admin.from("kuber_payment_plan").select("plan_date, party, amount, status").neq("status", "dropped").neq("status", "paid");
        plans = (data || []) as typeof plans;
      } catch (e) { swallow("kuber/books", e); /* pre-0076 */ }
      const plannedParties = new Set(plans.map((p) => p.party));
      for (const p of plans) {
        const i = weekIdx(p.plan_date);
        if (i >= 0) flows.planned_payments[i] += p.amount;
      }
      for (const b of bills.filter((x) => x.kind === "payable" && x.amount > 0)) {
        if (plannedParties.has(b.party)) continue; // the plan overrides the bill
        const i = weekIdx(b.due_date);
        if (i >= 0) flows.unplanned_bills[i] += b.amount;
      }
      try {
        const { data: fds } = await admin.from("kuber_fd").select("maturity_date, maturity_amount, principal, status").eq("status", "live");
        for (const f of fds || []) {
          const i = weekIdx(f.maturity_date);
          if (i >= 0) flows.fd_maturity[i] += Number(f.maturity_amount ?? f.principal) || 0;
        }
        const { data: items } = await admin.from("kuber_cash_item").select("date, direction, amount, weekly, label");
        for (const it of items || []) {
          if (it.weekly) {
            for (let i = 0; i < 13; i++) (it.direction === "in" ? flows.other_in : flows.other_out)[i] += Number(it.amount) || 0;
          } else {
            const i = weekIdx(it.date);
            if (i >= 0) (it.direction === "in" ? flows.other_in : flows.other_out)[i] += Number(it.amount) || 0;
          }
        }
      } catch (e) { swallow("kuber/books", e); /* pre-0076 */ }
      const net = zero(), cumulative = zero();
      let run = 0;
      for (let i = 0; i < 13; i++) {
        net[i] = flows.collections[i] + flows.fd_maturity[i] + flows.other_in[i]
          - flows.planned_payments[i] - flows.unplanned_bills[i] - flows.other_out[i];
        run += net[i];
        cumulative[i] = run;
      }
      return NextResponse.json({ start, weeks, flows, net, cumulative, today });
    }

    // ---- financials: P&L and Balance Sheet, computed from first principles
    // (Dr Raghu, 28 Aug 2026: "Add above Correspondence P&L and BS").
    // Tally's own arithmetic: each ledger walks its group chain to a PRIMARY
    // group; income/expense roots make the P&L over the period, the rest make
    // the balance sheet as-of (opening + every line to date). Debit is
    // negative throughout — the parser's convention, kept.
    // ---- expenses: the TVC / OE / Expenses registers (Dr Raghu, 28 Aug
    // 2026, the TOC cut): TVC = Truly Variable Cost — RM, process, freight —
    // what rises with every unit; OE = Operating Expenses — every cost that
    // is NOT variable. THROUGHPUT = Sales − TVC; NET ties back to the P&L.
    // Genie seeds the classification; the CFO's flip (kuber_expense_class)
    // always outranks the seed.
    if (view === "expenses") {
      const fyStartE = today.slice(5, 7) >= "04" ? today.slice(0, 4) + "-04-01" : String(Number(today.slice(0, 4)) - 1) + "-04-01";
      const from = url.searchParams.get("from") || fyStartE;
      const to = url.searchParams.get("to") || today;

      const pageAllE = async (build: (a: number, b: number) => PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>) => {
        const out: Record<string, unknown>[] = [];
        for (let a = 0; ; a += 1000) {
          const { data, error } = await build(a, a + 999);
          if (error) {
            if (/does not exist|schema cache/i.test(error.message)) return out;
            throw new Error(error.message);
          }
          out.push(...(data || []));
          if ((data || []).length < 1000) break;
        }
        return out;
      };
      const [groups, ledgersRaw, vouchers, lines, clsRows] = await Promise.all([
        pageAllE((a, b) => admin.from("kuber_group").select("name, parent").order("name").range(a, b)),
        pageAllE((a, b) => admin.from("kuber_ledger").select("name, parent, fy").order("name").range(a, b)),
        pageAllE((a, b) => admin.from("kuber_voucher").select("id, date, vtype, vno").order("id").range(a, b)),
        pageAllE((a, b) => admin.from("kuber_voucher_line").select("voucher_id, ledger, amount").order("id").range(a, b)),
        pageAllE((a, b) => admin.from("kuber_expense_class").select("ledger, cls").order("ledger").range(a, b)),
      ]);
      const ledgers = newestByName(ledgersRaw);
      if (!ledgers.length) return NextResponse.json({ empty: true });

      const parentOf = new Map(groups.map((g) => [String(g.name).toLowerCase(), String(g.parent || "")]));
      const properOf = new Map(groups.map((g) => [String(g.name).toLowerCase(), String(g.name)]));
      const rootOf = (g: string): string => {
        let cur = g.toLowerCase();
        for (let i = 0; i < 25; i++) {
          const p = (parentOf.get(cur) || "").toLowerCase();
          if (!p || p === cur) break;
          cur = p;
        }
        return properOf.get(cur) || g;
      };
      const isExpense = (root: string) => /expense|^purchase|^manufacturing/i.test(stripNo(root)) && !/asset/i.test(root);
      const isIncome = (root: string) => /income|^sales/i.test(stripNo(root));

      // dateOf skips proformas, so their lines fall out via the `&& d` guard
      const dateOf = new Map(vouchers.filter((v) => !isProforma(v.vtype, v.vno)).map((v) => [String(v.id), String(v.date || "")]));
      const period = new Map<string, number>();
      for (const l of lines) {
        const d = dateOf.get(String(l.voucher_id)) || "";
        if (d >= from && d <= to && d) period.set(String(l.ledger), (period.get(String(l.ledger)) || 0) + (Number(l.amount) || 0));
      }

      const flip = new Map(clsRows.map((c) => [String(c.ledger), String(c.cls)]));
      // The TOC seed: purchase heads and the process-like direct expenses
      // rise with the unit — everything else stands whether we build or not.
      const seedCls = (name: string, grp: string, root: string) =>
        /^purchase/i.test(stripNo(root))
          || (/direct expense|manufacturing/i.test(stripNo(root)) && /job ?work|process|freight|carriage|cartage|consum|raw ?material|\brm\b|packing|loading|octroi|customs|import/i.test(name + " " + grp))
          ? "tvc" : "oe";

      let sales = 0;
      const rows: { ledger: string; group: string; root: string; cls: string; seeded: boolean; amount: number }[] = [];
      for (const l of ledgers) {
        const name = String(l.name);
        const grp = String(l.parent || "");
        if (!grp) continue;
        const root = rootOf(grp);
        const amt = period.get(name) || 0;
        if (isIncome(root)) { sales += amt; continue; }
        if (!isExpense(root) || !amt) continue;
        const cls = flip.get(name) || seedCls(name, grp, root);
        rows.push({ ledger: name, group: grp, root, cls, seeded: !flip.has(name), amount: -amt });
      }
      rows.sort((a, b) => b.amount - a.amount);
      const tvc = rows.filter((r) => r.cls === "tvc").reduce((s2, r) => s2 + r.amount, 0);
      const oe = rows.filter((r) => r.cls === "oe").reduce((s2, r) => s2 + r.amount, 0);
      return NextResponse.json({ from, to, rows, totals: { sales, tvc, oe, throughput: sales - tvc, net: sales - tvc - oe } });
    }

    // ---- drill: one ledger's vouchers in the period — every statement's
    // bottom rung (Dr Raghu, 28 Aug 2026: "make it drill downable").
    if (view === "drill") {
      const ledger = String(url.searchParams.get("ledger") || "");
      if (!ledger) throw new HttpError(400, "ledger required");
      const from = url.searchParams.get("from") || "0000-01-01";
      const to = url.searchParams.get("to") || "9999-12-31";
      const lns: RR[] = [];
      for (let a = 0; ; a += 1000) {
        const { data, error } = await admin.from("kuber_voucher_line")
          .select("voucher_id, amount").eq("ledger", ledger).order("id").range(a, a + 999);
        if (error) break;
        lns.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      const ids = [...new Set(lns.map((l) => String(l.voucher_id)))];
      const vmap = new Map<string, RR>();
      for (let i = 0; i < ids.length; i += 150) {
        const { data } = await admin.from("kuber_voucher")
          .select("id, date, vtype, vno, party, narration").in("id", ids.slice(i, i + 150));
        for (const v of data || []) vmap.set(String(v.id), v);
      }
      const rows = lns
        .map((l) => ({ v: vmap.get(String(l.voucher_id)), amount: Number(l.amount) || 0 }))
        .filter((x) => x.v && !isProforma(x.v.vtype, x.v.vno) && String(x.v.date || "") >= from && String(x.v.date || "") <= to)
        .map((x) => ({
          date: String(x.v!.date || ""), vtype: String(x.v!.vtype || ""), vno: String(x.v!.vno || ""),
          party: String(x.v!.party || ""), narration: String(x.v!.narration || "").slice(0, 160), amount: x.amount,
        }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 800);
      return NextResponse.json({ ledger, rows, total: rows.reduce((s2, r) => s2 + r.amount, 0) });
    }

    // ---- Actual Cash Flow (Dr Raghu, 28 Aug 2026): what actually moved
    // through bank and cash, group-wise — Tally's own reading. For every
    // voucher touching a bank/cash ledger, the OTHER side names the flow:
    // a credit there is money COMING FROM it (inflow), a debit is money
    // GOING TO it (outflow). Contra (bank↔bank) stands apart as transfers.
    if (view === "cashflow_actual") {
      const fyStartA = today.slice(5, 7) >= "04" ? today.slice(0, 4) + "-04-01" : String(Number(today.slice(0, 4)) - 1) + "-04-01";
      const from = url.searchParams.get("from") || fyStartA;
      const to = url.searchParams.get("to") || today;
      const w = await loadWorld(admin);
      if (!w.ledgers.length) return NextResponse.json({ empty: true });

      const byVoucher = new Map<string, RR[]>();
      for (const l of w.lines) {
        const k = String(l.voucher_id);
        (byVoucher.get(k) ?? byVoucher.set(k, []).get(k)!).push(l);
      }
      const inflows: { ledger: string; group: string; root: string; amount: number }[] = [];
      const outflows: typeof inflows = [];
      let bankMove = 0, contra = 0;
      for (const [vid, lns] of byVoucher) {
        const d = w.dateOf.get(vid) || "";
        if (d < from || d > to || !d) continue;
        const isBank = (name: string) => {
          const led = w.ledgerByName.get(name);
          return led ? isBankChain(w.rootOf, String(led.parent || "")) : false;
        };
        const bankLines = lns.filter((l) => isBank(String(l.ledger)));
        if (!bankLines.length) continue;
        const others = lns.filter((l) => !isBank(String(l.ledger)));
        bankMove += bankLines.reduce((s2, l) => s2 + (Number(l.amount) || 0), 0);
        if (!others.length) { contra += bankLines.filter((l) => (Number(l.amount) || 0) < 0).reduce((s2, l) => s2 - (Number(l.amount) || 0), 0); continue; }
        for (const l of others) {
          const amt = Number(l.amount) || 0;
          if (!amt) continue;
          const led = w.ledgerByName.get(String(l.ledger));
          const grp = String(led?.parent || "(unknown)");
          const root = grp === "(unknown)" ? grp : w.rootOf(grp);
          const e = { ledger: String(l.ledger), group: grp, root, amount: Math.abs(amt) };
          if (amt > 0) inflows.push(e); else outflows.push(e);
        }
      }
      const inn = treeOf(inflows), out = treeOf(outflows);
      const tin = inn.reduce((s2, r) => s2 + r.total, 0), tout = out.reduce((s2, r) => s2 + r.total, 0);
      /**
       * THE SAME MONEY, IN THE HEADS A MANAGING DIRECTOR READS BY (Dr Raghu,
       * 30 Sep 2026: "show these as % of the inflow — Received from customers,
       * Received from bank, Other income; for spending Suppliers, Salaries,
       * Bank EMI, Utilities, Other OE, Other costs — show also a pie chart").
       *
       * Tally's roots ("06.Current Assets", "03.Current Liabilities") are
       * where the money sat, not where it came from. Each entry is placed by
       * the ledger's chain and, for expenses, by the same ladder the P&L
       * uses; the last head of each side is a catch so the shares add to 100.
       */
      const headIn = (e: { ledger: string; group: string; root: string }) => {
        if (w.chainHas(e.group, /^sundry debtors$/)) return "Received from customers";
        if (w.chainHas(e.group, /loans? \(liability\)|^secured loans?|^unsecured loans?|^bank od/)) return "Received from bank";
        return "Other income";
      };
      const headOut = (e: { ledger: string; group: string; root: string }) => {
        const hay = (e.ledger + " " + e.group).toLowerCase();
        if (w.chainHas(e.group, /^sundry creditors$/)) return "Suppliers";
        if (/salar|wages|employee dues|bonus|gratuity|provident|esic|directors? remun/.test(hay)) return "Salaries";
        if (w.chainHas(e.group, /loans? \(liability\)|^secured loans?|^unsecured loans?/) || /interest|emi\b/.test(hay)) return "Bank EMI";
        if (/electric|water|telephone|mobile|internet|fuel|power|utilit/.test(hay)) return "Utilities";
        const rootN = stripNo(e.root);
        const { bucket } = classifyLedger({ ledger: e.ledger, group: e.group, root: e.root, rootN });
        if (bucket === "indirect" || bucket === "finance") return "Other OE";
        return "Other costs";
      };
      const IN_ORDER = ["Received from customers", "Received from bank", "Other income"];
      const OUT_ORDER = ["Suppliers", "Salaries", "Bank EMI", "Utilities", "Other OE", "Other costs"];
      const fold = (list: typeof inflows, f: (e: typeof inflows[number]) => string, order: string[], total: number) => {
        const m = new Map<string, number>();
        for (const e of list) m.set(f(e), (m.get(f(e)) || 0) + e.amount);
        return order.map((h) => ({ head: h, amount: m.get(h) || 0, pct: total ? ((m.get(h) || 0) / total) * 100 : 0 }));
      };
      return NextResponse.json({ from, to, inflows: inn, outflows: out, totalIn: tin, totalOut: tout, net: tin - tout, bankMove: -bankMove, contra,
        headsIn: fold(inflows, headIn, IN_ORDER, tin), headsOut: fold(outflows, headOut, OUT_ORDER, tout) });
    }

    // ---- Fund Flow (same ask): where the money CAME FROM and WENT between
    // two balance-sheet dates — each head's closing on date B less date A.
    // Liabilities rising and assets falling are SOURCES; the mirror is
    // APPLICATIONS. The P&L heads' own movement is funds from operations.
    if (view === "fundflow") {
      const fyStartF2 = today.slice(5, 7) >= "04" ? today.slice(0, 4) + "-04-01" : String(Number(today.slice(0, 4)) - 1) + "-04-01";
      const from = url.searchParams.get("from") || fyStartF2;
      const to = url.searchParams.get("to") || today;
      const w = await loadWorld(admin);
      if (!w.ledgers.length) return NextResponse.json({ empty: true });

      const isPnlF = (root: string) => /income|expense|^sales|^purchase|^manufacturing/i.test(stripNo(root)) && !/asset/i.test(root);
      const upToA = new Map<string, number>(), upToB = new Map<string, number>();
      for (const l of w.lines) {
        const d = w.dateOf.get(String(l.voucher_id)) || "";
        if (!d) continue;
        const amt = Number(l.amount) || 0;
        const name = String(l.ledger);
        if (d < from) upToA.set(name, (upToA.get(name) || 0) + amt);
        if (d <= to) upToB.set(name, (upToB.get(name) || 0) + amt);
      }
      const sources: { ledger: string; group: string; root: string; amount: number }[] = [];
      const applications: typeof sources = [];
      let operations = 0;
      for (const l of w.ledgers) {
        const name = String(l.name), grp = String(l.parent || "");
        if (!grp) continue;
        const root = w.rootOf(grp);
        const delta = (upToB.get(name) || 0) - (upToA.get(name) || 0);
        if (!delta) continue;
        if (isPnlF(root)) { operations += delta; continue; }
        // credit positive: a rising credit (liability up) or a falling debit
        // (asset released) is money MADE AVAILABLE — a source.
        const e = { ledger: name, group: grp, root, amount: Math.abs(delta) };
        if (delta > 0) sources.push(e); else applications.push(e);
      }
      const src = treeOf(sources), app = treeOf(applications);
      const tsrc = src.reduce((s2, r) => s2 + r.total, 0) + Math.max(0, operations);
      const tapp = app.reduce((s2, r) => s2 + r.total, 0) + Math.max(0, -operations);
      return NextResponse.json({ from, to, sources: src, applications: app, operations, totalSources: tsrc, totalApplications: tapp, gap: tsrc - tapp });
    }

    // ---- the MIS statement (Dr Raghu, 28 Aug 2026, his own sheet's shape):
    // Sales → Revenue → Purchases ± stock → TVC → THROUGHPUT → Manufacturing
    // → GROSS PROFIT → Indirect (operating) → EBITDA → Finance → Depreciation
    // → Net Operating → Other Income → NPBT → Tax → NPAT, each with % of
    // sales and average monthly, every head drillable. Opening/closing stock
    // are TYPED (0092) — the XML carries no stock. The ratio pack rides
    // beside it, every ratio stating its own formula.
    if (view === "mis") {
      const fyStartM = today.slice(5, 7) >= "04" ? today.slice(0, 4) + "-04-01" : String(Number(today.slice(0, 4)) - 1) + "-04-01";
      // his preference: the period ends on LAST MONTH'S LAST DAY
      const lastMonthEnd = (() => {
        const t = new Date(today + "T00:00:00Z");
        t.setUTCDate(0);
        return t.toISOString().slice(0, 10);
      })();
      const from = url.searchParams.get("from") || fyStartM;
      const to = url.searchParams.get("to") || (lastMonthEnd >= fyStartM ? lastMonthEnd : today);
      const w = await loadWorld(admin);
      if (!w.ledgers.length) return NextResponse.json({ empty: true });

      const [inpRes, tgtRes, loanRes] = await Promise.all([
        admin.from("kuber_mis_input").select("key, value"),
        admin.from("kuber_ratio_target").select("key, target"),
        admin.from("kuber_loan").select("outstanding, emi, status").then((r) => ({ data: r.error ? [] : r.data })),
      ]);
      const inputs = new Map(((inpRes.data as RR[]) || []).map((x) => [String(x.key), Number(x.value) || 0]));
      const targets = Object.fromEntries(((tgtRes.data as RR[]) || []).map((x) => [String(x.key), String(x.target)]));

      // closing-to-date per ledger — the balance-sheet side the ratio pack
      // stands on. The P&L period itself is computed by computePnl below,
      // which runs twice: once for this period, once for the same months a
      // year back.
      const toDate = new Map<string, number>();
      for (const l of w.lines) {
        const d = w.dateOf.get(String(l.voucher_id)) || "";
        if (!d || d > to) continue;
        const name = String(l.ledger);
        toDate.set(name, (toDate.get(name) || 0) + (Number(l.amount) || 0));
      }

      type Ent = { ledger: string; group: string; root: string; amount: number };
      const sum = (a: Ent[]) => a.reduce((s2, e) => s2 + e.amount, 0);

      /**
       * STOCK COMES FROM THE DATED REGISTER (0179), NOT FROM TWO BOXES.
       *
       * Opening is the value carried into the period; closing is the LATEST
       * entry on or before the period's end. So a statement drawn to 31 May
       * uses May's stock and one drawn to 30 September uses September's, with
       * nothing re-typed — which the two undated boxes could never do. Read
       * once here, resolved per period inside computePnl, so last year's
       * comparative stands on last year's own stock.
       */
      let stockRows: { as_on: string; amount: number }[] = [];
      try {
        const { data: st } = await admin.from("kuber_stock").select("as_on, amount").order("as_on");
        stockRows = ((st || []) as { as_on: string; amount: number }[]);
      } catch (e) { swallow("kuber/pnl-stock", e); /* 0179 not run yet */ }

      /** the same months, a year back — 29 Feb clamps to 28 Feb */
      const shiftYear = (d: string, n: number) => {
        const y = Number(d.slice(0, 4)) - n, m = Number(d.slice(5, 7)), day = Number(d.slice(8, 10));
        const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
        return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
      };

      /**
       * ONE PERIOD, COMPUTED ONCE — SO IT CAN BE COMPUTED TWICE.
       *
       * Dr Raghu, 30 Sep 2026: "using last years data when we see P&L can we
       * see last years data in the side on the like to like basis? same
       * months?" A comparative is only worth having if it is struck by the
       * SAME rules — the same group tree, the same indirect/manufacturing
       * split, the same stock register. So the whole statement moved into one
       * function of (from, to) and last year is that function called again.
       * Nothing is duplicated, so nothing can drift apart.
       */
      const computePnl = (a: string, b: string) => {
        const per = new Map<string, number>();
        let touched = 0;
        for (const l of w.lines) {
          const d = w.dateOf.get(String(l.voucher_id)) || "";
          if (!d || d < a || d > b) continue;
          touched++;
          const name = String(l.ledger);
          per.set(name, (per.get(name) || 0) + (Number(l.amount) || 0));
        }
        /* EVERY LEDGER GOES THROUGH THE ONE LADDER (kuber-rules.ts).
           There is no second copy of these rules anywhere, and the "How the
           books are read" page renders the same array. */
        const ents: Record<string, Ent[]> = { sales: [], purchases: [], manuf: [], indirect: [], finance: [], depreciation: [], tax: [], otherIncome: [] };
        for (const l of w.ledgers) {
          const name = String(l.name), grp = String(l.parent || "");
          if (!grp) continue;
          const root = w.rootOf(grp);
          const amt = per.get(name) || 0;
          if (!amt) continue;
          const { bucket, rule } = classifyLedger({ ledger: name, group: grp, root, rootN: stripNo(root) });
          if (bucket === "balance") continue;
          ents[bucket].push({ ledger: name, group: grp, root, amount: amt * rule.sign });
        }

        /* IT SAYS WHICH DATES IT USED. Falling back to an earlier month's
           value is reasonable; doing it silently is not, because a gross
           profit struck against a stock figure four months stale is a fiction
           nobody can see. The dates ride back with the statement. */
        let openingStock = 0, closingStock = 0;
        let openingAt: string | null = null, closingAt: string | null = null;
        let stockFrom: "register" | "typed" | "none" = "none";
        if (stockRows.length) {
          stockFrom = "register";
          const open = stockRows.filter((r) => String(r.as_on) < a).pop() ?? null;
          const close = stockRows.filter((r) => String(r.as_on) <= b).pop() ?? null;
          if (open) { openingStock = Number(open.amount) || 0; openingAt = String(open.as_on); }
          if (close) { closingStock = Number(close.amount) || 0; closingAt = String(close.as_on); }
        }
        /* Until the register has a row, the two old typed values still stand,
           so nothing breaks on the day the migration runs. */
        if (stockFrom === "none" && (inputs.has("opening_stock") || inputs.has("closing_stock"))) {
          openingStock = inputs.get("opening_stock") ?? 0;
          closingStock = inputs.get("closing_stock") ?? 0;
          stockFrom = "typed";
        }
        const stocksTyped = stockFrom !== "none";

        const sales = sum(ents.sales);
        const otherIncome = sum(ents.otherIncome);
        const revenue = sales;
        const purchases = sum(ents.purchases);
        const tvc = purchases + openingStock - closingStock;
        const throughput = revenue - tvc;
        const manuf = sum(ents.manuf);
        const grossProfit = throughput - manuf;
        const indirect = sum(ents.indirect);
        const ebitda = grossProfit - indirect;
        const finance = sum(ents.finance);
        const depreciation = sum(ents.depreciation);
        /**
         * OPERATING EXPENSES — EVERY COST OF RUNNING THE PLACE, IN ONE LINE.
         *
         * Dr Raghu, 30 Sep 2026: "show OE here before depreciation which is
         * all costs including wages and bonus, utilities, welfare expenses,
         * all indirect expenses including finance charges, including
         * directors remuneration."
         *
         * Indirect expenses and finance charges are separated above so EBITDA
         * can be struck — that is what EBITDA means. But separating them
         * leaves no line anywhere that answers "what does it cost to run this
         * company for a month", and that is the number a managing director
         * actually carries in his head. So it is added back as its own
         * subtotal, below the pieces it is made of and above depreciation,
         * which is not a cost of running anything.
         */
        const operatingExpenses = indirect + finance;
        const netOperating = ebitda - finance - depreciation;
        const npbt = netOperating + otherIncome;
        const tax = sum(ents.tax);
        const npat = npbt - tax;
        const months = Math.max(1, (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7))) + 1);
        return { from: a, to: b, touched, ents, sales, otherIncome, revenue, purchases, openingStock, closingStock,
          openingAt, closingAt, stockFrom, stocksTyped, tvc, throughput, manuf, grossProfit, indirect, ebitda,
          finance, depreciation, operatingExpenses, netOperating, npbt, tax, npat, months };
      };

      const cur = computePnl(from, to);
      /* last year is shown only when last year is actually in the books */
      const lyRaw = computePnl(shiftYear(from, 1), shiftYear(to, 1));
      const ly = lyRaw.touched ? lyRaw : null;

      /**
       * DEPRECIATION IS A YEAR-END JOURNAL HERE, NOT A MONTHLY CHARGE.
       *
       * Dr Raghu, 30 Sep 2026: "is depreciation not there? I will make them
       * write in depreciation too." The line is not broken and nothing is
       * missing from the ladder — Tally simply carries one posting a year.
       * A zero that means "nobody has written it yet" and a zero that means
       * "there is none" look identical, so the statement says which, and
       * names the last posting it can find.
       */
      let depNote: { at: string; amount: number } | null = null;
      {
        const depLed = new Set<string>();
        for (const l of w.ledgers) {
          const grp = String(l.parent || "");
          if (!grp) continue;
          const root = w.rootOf(grp);
          if (classifyLedger({ ledger: String(l.name), group: grp, root, rootN: stripNo(root) }).bucket === "depreciation") depLed.add(String(l.name));
        }
        const byDate = new Map<string, number>();
        for (const l of w.lines) {
          if (!depLed.has(String(l.ledger))) continue;
          const d = w.dateOf.get(String(l.voucher_id)) || "";
          if (!d) continue;
          byDate.set(d, (byDate.get(d) || 0) - (Number(l.amount) || 0));
        }
        const last = [...byDate.keys()].sort().pop();
        if (last) depNote = { at: last, amount: byDate.get(last) || 0 };
      }

      const { ents, sales, otherIncome, revenue, purchases, openingStock, closingStock, openingAt, closingAt,
        stockFrom, stocksTyped, tvc, throughput, manuf, grossProfit, indirect, ebitda, finance, depreciation,
        operatingExpenses, netOperating, npbt, tax, npat } = cur;

      /**
       * THE RATIO PACK, COMPUTED FOR ANY DATE — SO LAST YEAR GETS ONE TOO.
       *
       * Dr Raghu, 30 Sep 2026: "in this also show the last years like period."
       *
       * The P&L half of a ratio is a period movement and was already computed
       * twice. The balance-sheet half is a CLOSING, and a closing needs an
       * opening to stand on — which is the trap. `kuber_ledger.opening` is the
       * opening of the NEWEST masters year: as at 1 April 2026. Adding it to
       * movements up to 30 September 2025 would be arithmetic on two different
       * anchors, and would look plausible.
       *
       * So the anchor is named, and the walk goes both ways from it: forward
       * to a date after it, BACKWARD out of it for a date before. A closing on
       * 30 September 2025 is the 1 April 2026 opening less everything posted
       * between the two. That is exact, and it is the only honest way to strike
       * a balance sheet for a year whose own opening was never exported.
       */
      const anchor = (() => {
        const fy = (w.ledgers as RR[]).reduce((a, r) => { const f = String(r.fy || ""); return f > a ? f : a; }, "");
        const y = Number(String(fy).slice(0, 4));
        return y ? `${y}-04-01` : from;
      })();
      const closingsAt = (asOf: string) => {
        /* signed movement between the anchor and asOf — forward adds, backward subtracts */
        const delta = new Map<string, number>();
        for (const l of w.lines) {
          const d = w.dateOf.get(String(l.voucher_id)) || "";
          if (!d) continue;
          const fwd = d >= anchor && d <= asOf;
          const back = d > asOf && d < anchor;
          if (!fwd && !back) continue;
          const n = String(l.ledger);
          delta.set(n, (delta.get(n) || 0) + (Number(l.amount) || 0) * (fwd ? 1 : -1));
        }
        let profitToDate = 0;
        const closingOfRoot = new Map<string, number>();
        for (const l of w.ledgers) {
          const name = String(l.name), grp = String(l.parent || "");
          if (!grp) continue;
          const root = w.rootOf(grp);
          /* the same ladder decides this too — a head cannot be a P&L head
             for the statement and a balance-sheet head for the ratios */
          if (classifyLedger({ ledger: name, group: grp, root, rootN: stripNo(root) }).bucket !== "balance") {
            profitToDate += toDateUpto(asOf, name); continue;
          }
          const closing = (Number(l.opening) || 0) + (delta.get(name) || 0);
          closingOfRoot.set(root, (closingOfRoot.get(root) || 0) + closing);
          const chainHas = (want: RegExp) => {
            let cur2 = grp.toLowerCase();
            for (let i = 0; i < 25; i++) {
              if (want.test(cur2)) return true;
              const g2 = w.groups.find((g) => String(g.name).toLowerCase() === cur2);
              const nx = g2 ? String(g2.parent || "").toLowerCase() : "";
              if (!nx || nx === cur2) return false;
              cur2 = nx;
            }
            return false;
          };
          if (chainHas(/sundry debtor/)) closingOfRoot.set("__debtors", (closingOfRoot.get("__debtors") || 0) + closing);
          if (chainHas(/sundry creditor/)) closingOfRoot.set("__creditors", (closingOfRoot.get("__creditors") || 0) + closing);
        }
        return { profitToDate, closingOfRoot };
      };
      /* the P&L carried forward to a date — every P&L line ever posted up to it */
      const pnlToDate = new Map<string, Map<string, number>>();
      function toDateUpto(asOf: string, ledger: string): number {
        let m = pnlToDate.get(asOf);
        if (!m) {
          m = new Map<string, number>();
          for (const l of w.lines) {
            const d = w.dateOf.get(String(l.voucher_id)) || "";
            if (!d || d > asOf) continue;
            const n = String(l.ledger);
            m.set(n, (m.get(n) || 0) + (Number(l.amount) || 0));
          }
          pnlToDate.set(asOf, m);
        }
        return m.get(ledger) || 0;
      }

      const months = Math.max(1, (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + (Number(to.slice(5, 7)) - Number(from.slice(5, 7))) + 1);
      const days = Math.max(1, daysBetween(from, to) + 1);

      // ---- the ratio pack — each states its formula; "—" where an input
      // is honestly absent, never a guess ----
      const loans = ((loanRes.data as RR[]) || []).filter((x) => String(x.status) !== "closed");
      const loanOut = loans.reduce((s2, x) => s2 + (Number(x.outstanding) || 0), 0);
      const emiMonthly = loans.reduce((s2, x) => s2 + (Number(x.emi) || 0), 0);

      type Pnl = ReturnType<typeof computePnl>;
      const ratioPack = (p: Pnl, live: boolean) => {
        const { profitToDate, closingOfRoot } = closingsAt(p.to);
        const rootVal = (re: RegExp) => {
          let t2 = 0;
          for (const [r, v] of closingOfRoot) if (re.test(stripNo(r))) t2 += v;
          return t2;
        };
        const equity = rootVal(/capital/i) + profitToDate;
        const debtBooks = rootVal(/loans? \(liability\)|^loans|bank od/i);
        /* the loan register knows only today, so last year's pack stands on
           the books alone rather than borrowing this year's outstanding */
        const debt = live && loanOut > 0 ? loanOut : Math.max(0, debtBooks);
        const emi = live ? emiMonthly : 0;
        const curLiab = rootVal(/current liabilit/i);
        const curAssets = -rootVal(/current asset/i);
        const debtors = -(closingOfRoot.get("__debtors") || 0);
        const creditors = closingOfRoot.get("__creditors") || 0;
        const pDays = Math.max(1, daysBetween(p.from, p.to) + 1);
        const pMonths = p.months;
        const ann = 365 / pDays;
        const V = (n: number | null) => (n != null && isFinite(n) ? n : null);
        return {
          ebitda_sales: V(p.revenue ? (p.ebitda / p.revenue) * 100 : null),
          pbt_sales: V(p.revenue ? (p.npbt / p.revenue) * 100 : null),
          pat_sales: V(p.revenue ? (p.npat / p.revenue) * 100 : null),
          int_cover: V(p.finance ? p.ebitda / p.finance : null),
          debt_equity: V(equity ? debt / equity : null),
          current_ratio: V(curLiab ? curAssets / curLiab : null),
          quick_ratio: V(curLiab && p.stocksTyped ? (curAssets - p.closingStock) / curLiab : null),
          debt_service: V(emi ? emi * pMonths : null),
          dscr: V(emi ? p.ebitda / (emi * pMonths) : null),
          gp_cr: V(p.grossProfit),
          expenses_cr: V(p.manuf + p.indirect + p.finance),
          productivity: V(p.manuf + p.indirect + p.finance ? p.grossProfit / (p.manuf + p.indirect + p.finance) : null),
          tol_tnw: V(equity ? (debt + curLiab) / equity : null),
          roce: V(equity + debt ? ((p.ebitda - p.depreciation) * ann / (equity + debt)) * 100 : null),
          roi: V(equity ? (p.npat * ann / equity) * 100 : null),
          debtor_days: V(p.revenue ? debtors / (p.revenue / pDays) : null),
          inventory_days: V(p.stocksTyped && p.tvc ? ((p.openingStock + p.closingStock) / 2) / (p.tvc / pDays) : null),
          creditor_days: V(p.purchases ? creditors / (p.purchases / pDays) : null),
        } as Record<string, number | null>;
      };
      const packNow = ratioPack(cur, true);
      const packLy = ly ? ratioPack(ly, false) : null;
      for (const p of [packNow, packLy]) {
        if (!p) continue;
        p.ccc = p.debtor_days != null && p.inventory_days != null && p.creditor_days != null
          ? p.debtor_days + p.inventory_days - p.creditor_days : null;
      }

      const SPEC: [string, string, string, string][] = [
        ["ebitda_sales", "EBITDA to Sales %", "%", "EBITDA ÷ revenue"],
        ["pbt_sales", "PBT to Sales %", "%", "net profit before tax ÷ revenue"],
        ["pat_sales", "PAT to Sales %", "%", "net profit after tax ÷ revenue"],
        ["int_cover", "Interest Coverage (times)", "x", "EBITDA ÷ finance charges"],
        ["debt_equity", "Debt / Equity", "x", loanOut > 0 ? "loan-register outstanding ÷ (capital + P&L to date); last year from the books" : "loan roots in the books ÷ (capital + P&L to date)"],
        ["current_ratio", "Current Ratio", "x", "current assets ÷ current liabilities, at their book closings"],
        ["quick_ratio", "Quick Ratio", "x", stocksTyped ? "(current assets − closing stock) ÷ current liabilities" : "needs the closing stock in the stock register"],
        ["debt_service", "Debt Service (period)", "₹", "loan-register monthly EMI × months in the period; the register knows only today, so last year reads —"],
        ["dscr", "DSCR", "x", "EBITDA ÷ (EMI × months); the loan register is the source"],
        ["gp_cr", "Gross Profit", "₹", "throughput − manufacturing expenses"],
        ["expenses_cr", "Direct + Indirect + Interest", "₹", "manufacturing + indirect + finance charges"],
        ["productivity", "Business Productivity (GP ÷ Expenses)", "x", "gross profit ÷ (manufacturing + indirect + finance)"],
        ["tol_tnw", "TOL / TNW", "x", "(debt + current liabilities) ÷ (capital + P&L to date)"],
        ["roce", "RoCE %", "%", "EBIT annualised ÷ (equity + debt)"],
        ["roi", "ROI %", "%", "PAT annualised ÷ equity"],
        ["debtor_days", "Debtors — days to Sales", "days", "sundry debtors (books) ÷ per-day revenue"],
        ["inventory_days", "Inventory — days to COGS", "days", stocksTyped ? "average stock ÷ per-day TVC" : "needs opening and closing stock in the stock register"],
        ["creditor_days", "Creditors — days to Purchases", "days", "sundry creditors (books) ÷ per-day purchases"],
        ["ccc", "Cash Conversion Cycle (days)", "days", "debtor days + inventory days − creditor days"],
      ];
      const ratios = SPEC.map(([key, label, unit, formula]) => ({
        key, label, unit, formula,
        value: packNow[key] ?? null,
        ly: packLy ? packLy[key] ?? null : null,
        target: targets[key] || "",
      }));

      /**
       * EVERY LINE CARRIES ITS OWN TWIN.
       *
       * `ly` is the same head over the same months a year back, `lyAvg` its
       * own monthly average — last year's months, not this year's, because
       * a five-month period compared against a twelve-month one is not a
       * comparison. Both are null until last year is actually in the books.
       */
      const K = (o: ReturnType<typeof computePnl>, key: string): number => (o as unknown as Record<string, number>)[key];
      type EntsOf = (o: ReturnType<typeof computePnl>) => Ent[];
      const line = (key: string, label: string, pick: string | number, entsOf?: EntsOf) => {
        const amount = typeof pick === "number" ? pick : K(cur, pick);
        const lyAmt = typeof pick === "number" || !ly ? null : K(ly, pick);
        return {
          key, label, amount,
          pct: revenue ? (amount / revenue) * 100 : null,
          avg: amount / months,
          ly: lyAmt,
          lyPct: lyAmt != null && ly && ly.revenue ? (lyAmt / ly.revenue) * 100 : null,
          lyAvg: lyAmt == null || !ly ? null : lyAmt / ly.months,
          tree: entsOf ? treeOfPair(entsOf(cur), ly ? entsOf(ly) : []) : undefined,
        };
      };
      const E = (k: keyof typeof ents): EntsOf => (o) => o.ents[k as string];
      /* the eleven read in HIS order, not in size order */
      const inHisOrder = (t?: { root: string }[]) => t && t.slice().sort((a, b) =>
        OE_HEADS.indexOf(a.root as typeof OE_HEADS[number]) - OE_HEADS.indexOf(b.root as typeof OE_HEADS[number]));
      return NextResponse.json({
        from, to, months, stocksTyped, depNote,
        ly: ly ? { from: ly.from, to: ly.to, months: ly.months, openingAt: ly.openingAt, closingAt: ly.closingAt,
              /* last year's stock stands on last year's own valuations — if the
                 register does not reach back that far the comparative says so
                 rather than borrowing this year's figure */
              stocked: ly.closingAt != null && ly.openingAt != null } : null,
        stock: { from: stockFrom, openingAt, closingAt, stale: !!(closingAt && closingAt < to) },
        lines: [
          line("sales", "Sales", "sales", E("sales")),
          line("revenue", "Revenue", "revenue"),
          line("purchases", "Purchases during the Period", "purchases", E("purchases")),
          /* OPENING IS THE VALUE CARRIED IN (Dr Raghu, 30 Sep 2026: "opening
             stock at 1-04-2026"). The register holds it dated the night
             before — 31 March — which is the same instant read the other way
             round; the statement says the day the period starts. */
          line("opening_stock", `Opening Stock — as at ${from.split("-").reverse().join("-")}`, "openingStock"),
          line("closing_stock", closingAt ? `Closing Stock — as at ${closingAt.split("-").reverse().join("-")}` : "Closing Stock — not valued", "closingStock"),
          line("tvc", "TVC (COGS)", "tvc"),
          line("throughput", "THROUGHPUT", "throughput"),
          line("manuf", "Manufacturing Expenses", "manuf", E("manuf")),
          line("gross_profit", "GROSS PROFIT for the Period", "grossProfit"),
          line("indirect", "Indirect Expenses — except finance charges", "indirect", E("indirect")),
          line("ebitda", "EBITDA — Operating Profit before Interest, Depreciation & Tax", "ebitda"),
          line("finance", "Finance Charges", "finance", E("finance")),
          /* OE opens in HIS eleven heads, not Tally's thirty-six groups
             (see oe-heads.ts). Each head still opens to the Tally group and
             the ledger beneath it, so the drill never loses the trail. */
          (() => {
            const l = line("oe", "OPERATING EXPENSES — all indirect including finance & directors", "operatingExpenses",
              (o) => [...o.ents.indirect, ...o.ents.finance].map((e) => ({ ...e, root: oeHead(e.group, e.ledger) })));
            return { ...l, tree: inHisOrder(l.tree) };
          })(),
          line("depreciation", "Depreciation", "depreciation", E("depreciation")),
          line("net_operating", "Net Operating Profit", "netOperating"),
          line("other_income", "Other Income", "otherIncome", E("otherIncome")),
          line("npbt", "Net Profit Before Tax", "npbt"),
          line("tax", "Tax Expense", "tax", E("tax")),
          line("npat", "NET PROFIT AFTER TAX", "npat"),
        ],
        ratios,
      });
    }

    /**
     * HOW THE BOOKS ARE READ — the rules, with what each one actually caught.
     *
     * Dr Raghu, 30 Sep 2026: "cant u make the rules and keep it properly? if
     * needed make all the rules. in a page."
     *
     * This does not DESCRIBE the rules; it runs them. The ladder it walks is
     * the same array the statement imports, so the page cannot drift from the
     * P&L — if a rung changes, both change together, and if a rung stops
     * catching anything the count says so.
     */
    if (view === "rules") {
      const fyStartR = today.slice(5, 7) >= "04" ? today.slice(0, 4) + "-04-01" : String(Number(today.slice(0, 4)) - 1) + "-04-01";
      const lastMonthEndR = (() => { const t = new Date(today + "T00:00:00Z"); t.setUTCDate(0); return t.toISOString().slice(0, 10); })();
      const from = url.searchParams.get("from") || fyStartR;
      const to = url.searchParams.get("to") || (lastMonthEndR >= fyStartR ? lastMonthEndR : today);
      const w = await loadWorld(admin);
      if (!w.ledgers.length) return NextResponse.json({ empty: true });

      const per = new Map<string, number>();
      for (const l of w.lines) {
        const d = w.dateOf.get(String(l.voucher_id)) || "";
        if (!d || d < from || d > to) continue;
        const n = String(l.ledger);
        per.set(n, (per.get(n) || 0) + (Number(l.amount) || 0));
      }

      type Caught = { ledger: string; group: string; root: string; amount: number };
      const byRule = new Map<string, { ledgers: number; moved: number; amount: number; sample: Caught[] }>();
      const byOe = new Map<string, { ledgers: number; moved: number; amount: number; sample: Caught[] }>();
      const bump = (m: typeof byRule, k: string, c: Caught, moved: boolean) => {
        const r = m.get(k) ?? m.set(k, { ledgers: 0, moved: 0, amount: 0, sample: [] }).get(k)!;
        r.ledgers++;
        if (moved) { r.moved++; r.amount += c.amount; r.sample.push(c); }
      };
      /** every ledger and the rung that took it — the search index */
      const index: { ledger: string; group: string; root: string; lands: string; rule: string; head: string | null; amount: number }[] = [];

      for (const l of w.ledgers) {
        const name = String(l.name), grp = String(l.parent || "");
        if (!grp) continue;
        const root = w.rootOf(grp);
        const amt = per.get(name) || 0;
        const { bucket, rule } = classifyLedger({ ledger: name, group: grp, root, rootN: stripNo(root) });
        const signed = amt * rule.sign;
        const c: Caught = { ledger: name, group: grp, root, amount: signed };
        bump(byRule, rule.id, c, !!amt);
        let head: string | null = null;
        if (bucket === "indirect" || bucket === "finance") {
          const oe = oeRuleOf(grp, name);
          head = oe.head;
          bump(byOe, oe.id, c, !!amt);
        }
        if (amt) index.push({ ledger: name, group: grp, root, lands: BUCKET_LABEL[bucket], rule: rule.id, head, amount: signed });
      }
      const pack = (m: typeof byRule, k: string) => {
        const r = m.get(k) ?? { ledgers: 0, moved: 0, amount: 0, sample: [] as Caught[] };
        return {
          ledgers: r.ledgers, moved: r.moved, amount: r.amount,
          sample: r.sample.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 120),
        };
      };
      index.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
      return NextResponse.json({
        from, to,
        book: BOOK_RULES,
        pnl: PNL_RULES.map((r) => ({ id: r.id, lands: r.lands, says: r.says, why: r.why || null, sign: r.sign, ...pack(byRule, r.id) })),
        oe: OE_RULES.map((r) => ({ id: r.id, lands: r.head, says: r.says, why: r.why || null, sign: -1, ...pack(byOe, r.id) })),
        index: index.slice(0, 2500),
        counts: { ledgers: w.ledgers.length, vouchers: w.dateOf.size, lines: w.lines.length },
      });
    }

    if (view === "financials") {
      const fyStartF = today.slice(5, 7) >= "04" ? today.slice(0, 4) + "-04-01" : String(Number(today.slice(0, 4)) - 1) + "-04-01";
      const from = url.searchParams.get("from") || fyStartF;
      const to = url.searchParams.get("to") || today;
      const asof = url.searchParams.get("asof") || today;

      const pageAllF = async (build: (a: number, b: number) => PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>) => {
        const out: Record<string, unknown>[] = [];
        for (let a = 0; ; a += 1000) {
          const { data, error } = await build(a, a + 999);
          if (error) {
            if (/does not exist|schema cache/i.test(error.message)) return out;
            throw new Error(error.message);
          }
          out.push(...(data || []));
          if ((data || []).length < 1000) break;
        }
        return out;
      };

      const [groups, ledgersRawF, vouchers, lines] = await Promise.all([
        pageAllF((a, b) => admin.from("kuber_group").select("name, parent").order("name").range(a, b)),
        pageAllF((a, b) => admin.from("kuber_ledger").select("name, parent, opening, fy").order("name").range(a, b)),
        pageAllF((a, b) => admin.from("kuber_voucher").select("id, date, vtype, vno").order("id").range(a, b)),
        pageAllF((a, b) => admin.from("kuber_voucher_line").select("voucher_id, ledger, amount").order("id").range(a, b)),
      ]);
      const ledgers = newestByName(ledgersRawF);
      if (!ledgers.length) return NextResponse.json({ empty: true });

      const parentOf = new Map(groups.map((g) => [String(g.name).toLowerCase(), String(g.parent || "")]));
      const properOf = new Map(groups.map((g) => [String(g.name).toLowerCase(), String(g.name)]));
      const rootCache = new Map<string, string>();
      const rootOf = (g: string): string => {
        const k = g.toLowerCase();
        if (rootCache.has(k)) return rootCache.get(k)!;
        let cur = k;
        for (let i = 0; i < 25; i++) {
          const p = (parentOf.get(cur) || "").toLowerCase();
          if (!p || p === cur) break;
          cur = p;
        }
        const r = properOf.get(cur) || g;
        rootCache.set(k, r);
        return r;
      };
      // P&L roots: incomes, expenses, sales, purchases — but Tally's
      // "Misc. Expenses (ASSET)" is a balance-sheet head despite its name.
      const isPnl = (root: string) => /income|expense|^sales|^purchase|^manufacturing/i.test(stripNo(root)) && !/asset/i.test(root);
      const assetSide = (root: string) => /^fixed assets|^investments|^current assets|^misc|^loans & advances \(asset|^deposits \(asset/i.test(stripNo(root)) || /\(asset\)/i.test(root);

      // proformas out here too — dateOf skips them, their lines lose their date
      const dateOf = new Map(vouchers.filter((v) => !isProforma(v.vtype, v.vno)).map((v) => [String(v.id), String(v.date || "")]));
      // Per ledger: activity in [from, to] (the P&L period) and every line
      // up to `asof` (the balance sheet's closing).
      const period = new Map<string, number>();
      const toAsof = new Map<string, number>();
      for (const l of lines) {
        const d = dateOf.get(String(l.voucher_id)) || "";
        if (!d) continue;
        const amt = Number(l.amount) || 0;
        const name = String(l.ledger);
        if (d >= from && d <= to) period.set(name, (period.get(name) || 0) + amt);
        if (d <= asof) toAsof.set(name, (toAsof.get(name) || 0) + amt);
      }

      type Sec = { root: string; total: number; groups: Map<string, { total: number; ledgers: { name: string; amount: number }[] }> };
      const pnlSecs = new Map<string, Sec>();
      const bsSecs = new Map<string, Sec>();
      let profitToAsof = 0;
      const put = (map: Map<string, Sec>, root: string, grp: string, name: string, amount: number) => {
        if (!amount) return;
        const s = map.get(root) ?? map.set(root, { root, total: 0, groups: new Map() }).get(root)!;
        s.total += amount;
        const g = s.groups.get(grp) ?? s.groups.set(grp, { total: 0, ledgers: [] }).get(grp)!;
        g.total += amount;
        g.ledgers.push({ name, amount });
      };
      for (const l of ledgers) {
        const name = String(l.name);
        const parent = String(l.parent || "");
        const root = parent ? rootOf(parent) : "(primary)";
        const grp = parent || "(primary)";
        if (parent && isPnl(root)) {
          put(pnlSecs, root, grp, name, period.get(name) || 0);
          profitToAsof += toAsof.get(name) || 0;
        } else {
          // Closing = opening + everything to date. A primary "Profit & Loss"
          // ledger (Tally's opening-difference carrier) sits here too.
          put(bsSecs, root, grp, name, (Number(l.opening) || 0) + (toAsof.get(name) || 0));
        }
      }

      const dress = (map: Map<string, Sec>) =>
        [...map.values()]
          .map((s) => ({
            root: s.root,
            total: s.total,
            groups: [...s.groups.entries()]
              .map(([g, v]) => ({ name: g, total: v.total, ledgers: v.ledgers.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 300) }))
              .filter((g) => g.total !== 0)
              .sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
          }))
          .filter((s) => s.total !== 0)
          .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

      const pnl = dress(pnlSecs);
      // Tally's two tiers: trading first (sales, purchases, direct), then the
      // indirect heads. Credit positive: income +, expense −.
      const trading = pnl.filter((s) => /^sales|^purchase|direct/i.test(s.root));
      const indirect = pnl.filter((s) => !/^sales|^purchase|direct/i.test(s.root));
      const grossProfit = trading.reduce((a, s) => a + s.total, 0);
      const netProfit = pnl.reduce((a, s) => a + s.total, 0);

      const bs = dress(bsSecs);
      const liabilities = bs.filter((s) => !assetSide(s.root));
      const assets = bs.filter((s) => assetSide(s.root));
      const totalL = liabilities.reduce((a, s) => a + s.total, 0) + profitToAsof;
      const totalA = assets.reduce((a, s) => a + s.total, 0);

      return NextResponse.json({
        from, to, asof,
        pnl: { trading, indirect, grossProfit, netProfit },
        bs: { liabilities, assets, profit: profitToAsof, totalL, totalA, gap: totalL + totalA },
      });
    }

    // ---- the CFO NOTE (Dr Raghu, 28 Aug 2026): "a very compact note that I
    // should review every Saturday about the things I should do to take
    // control of finances" — the trends and the to-do list, computed fresh
    // from the books every time it opens. No model call; the books speak.
    if (view === "cfonote") {
      // six months of the four flows, month by month
      const mkey = (d: string) => d.slice(0, 7);
      const monthsList: string[] = [];
      {
        let y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
        for (let i = 5; i >= 0; i--) {
          let mm = m - i, yy = y;
          while (mm <= 0) { mm += 12; yy -= 1; }
          monthsList.push(`${yy}-${String(mm).padStart(2, "0")}`);
        }
      }
      const FLOWT: Record<string, string> = { "GST Sales": "billing", Receipt: "collections", Purchase: "purchases", "Cap-Ex Purchase": "purchases", "Excise Purchase Import": "purchases", Payment: "payments" };
      const series: Record<string, number[]> = { billing: monthsList.map(() => 0), collections: monthsList.map(() => 0), purchases: monthsList.map(() => 0), payments: monthsList.map(() => 0) };
      const since6 = monthsList[0] + "-01";
      for (let f = 0; ; f += 1000) {
        const { data, error } = await admin.from("kuber_voucher").select("vtype, vno, amount, date").gte("date", since6).order("id").range(f, f + 999);
        if (error) break;
        for (const v of data || []) {
          if (isProforma(v.vtype, v.vno)) continue;
          const k = FLOWT[String(v.vtype)];
          if (!k) continue;
          const idx = monthsList.indexOf(mkey(String(v.date || "")));
          if (idx >= 0) series[k][idx] += Number(v.amount) || 0;
        }
        if (!data || data.length < 1000) break;
      }

      // the bills: who to chase, what hangs untied
      const bills = await allBills(admin);
      const topOver = (kind: string) => {
        const by = new Map<string, number>();
        for (const b of bills) if (b.kind === kind && b.amount > 0 && b.due_date && b.due_date < today)
          by.set(b.party, (by.get(b.party) || 0) + b.amount);
        return [...by.entries()].map(([party, amount]) => ({ party, amount }))
          .sort((a, b) => b.amount - a.amount).slice(0, 5);
      };
      const unadjRec = -bills.filter((b) => b.kind === "receivable" && b.amount < 0).reduce((s2, b) => s2 + b.amount, 0);
      const unadjPay = -bills.filter((b) => b.kind === "payable" && b.amount < 0).reduce((s2, b) => s2 + b.amount, 0);
      const overRec = bills.filter((b) => b.kind === "receivable" && b.amount > 0 && b.due_date && b.due_date < today).reduce((s2, b) => s2 + b.amount, 0);

      // instruments on the clock
      const in60 = addDays(today, 60);
      const { data: bgs } = await admin.from("kuber_bg").select("amount, expiry_date, status").limit(1000);
      const bgSoon = (bgs || []).filter((b) => /^(live|in force|in effect)?$/.test(String(b.status ?? "")) && b.expiry_date && String(b.expiry_date) >= today && String(b.expiry_date) <= in60);
      const { data: fds } = await admin.from("kuber_fd").select("principal, maturity_date, status").limit(1000);
      const fdSoon = (fds || []).filter((b) => String(b.status ?? "live") === "live" && b.maturity_date && String(b.maturity_date) >= today && String(b.maturity_date) <= in60);

      // compliance standing this moment
      let compRed = 0, compAmber = 0;
      try {
        const lastM = mkey(addDays(today.slice(0, 8) + "01", -1));
        const { data: comps } = await admin.from("kuber_compliance").select("id, due_day, frequency").eq("active", true).limit(500);
        const { data: ents } = await admin.from("kuber_compliance_entry").select("compliance_id, month, done_on").eq("month", lastM).limit(1000);
        const eMap = new Map((ents || []).map((e) => [String(e.compliance_id), e]));
        for (const c of (comps || []).filter((c2) => String(c2.frequency) === "Monthly")) {
          const e = eMap.get(String(c.id));
          if (!e?.done_on) { compRed++; continue; }
          if (c.due_day) {
            const [y2, m2] = lastM.split("-").map(Number);
            const ny = m2 === 12 ? y2 + 1 : y2, nm = m2 === 12 ? 1 : m2 + 1;
            const due = `${ny}-${String(nm).padStart(2, "0")}-${String(c.due_day).padStart(2, "0")}`;
            if (String(e.done_on) > due) compAmber++;
          }
        }
      } catch (e) { swallow("kuber/books", e); /* calendar not installed yet */ }

      // the loan clock
      const { data: loans } = await admin.from("kuber_loan").select("outstanding, emi, status").limit(500).then((r) => ({ data: r.error ? [] : r.data }));
      const emiMonthly = (loans || []).filter((x) => String(x.status) !== "closed").reduce((s2, x) => s2 + (Number(x.emi) || 0), 0);

      const last = monthsList.length - 1;
      const collGapThisMonth = series.billing[last] - series.collections[last];
      return NextResponse.json({
        today, months: monthsList, series,
        actions: {
          topOverdueCustomers: topOver("receivable"),
          topOverdueSuppliers: topOver("payable"),
          overdueReceivable: overRec,
          unadjRec, unadjPay,
          collGapThisMonth,
          bgSoon: { count: bgSoon.length, amount: bgSoon.reduce((s2, b) => s2 + (Number(b.amount) || 0), 0) },
          fdSoon: { count: fdSoon.length, amount: fdSoon.reduce((s2, b) => s2 + (Number(b.principal) || 0), 0) },
          compRed, compAmber, emiMonthly,
        },
      });
    }

    // ---- the voucher registers (Dr Raghu, 28 Aug 2026): SALES and PURCHASE,
    // YTD by default with dates / MTD / QTD — every voucher of the family in
    // the period, totals on top.
    /**
     * BILLS RECEIVABLE — every unpaid bill, however old.
     *
     * Dr Raghu, 30 Sep 2026: "add the Bills Receivable. Show all the bills
     * which have the status as 'Unpaid'. this may be as old as 5 years also!
     * See the status in tally."
     *
     * Tally's status IS this list: a bill sits in the bill-wise outstanding
     * until it is knocked off, so what is here is what is unpaid, and the
     * oldest of them run back years. The ageing screen shows this money
     * gathered by party; this shows the bills themselves, one line each, with
     * nothing netted and nothing summarised away.
     *
     * The product family, the salesman and the scan ride along where the
     * Sales Register has been filled in, so a five-year-old bill can be
     * handed to whoever owns it without opening a second screen.
     */
    /**
     * WHO TO CALL AT A CUSTOMER (Dr Raghu, 30 Sep 2026, on Bills Receivable:
     * "Later I will make the collection calls and also emails from here").
     *
     * Kuber knows the party as Tally spells it and nothing else. The CRM
     * knows the company and the people in it. This is the bridge: the party
     * name matched against the CRM's company names, and the live people of
     * that company with an e-mail or a phone, decision-makers first. Read
     * only; nothing is written to the CRM from here.
     */
    if (view === "party_contact") {
      const party = (url.searchParams.get("party") || "").trim();
      if (!party) throw new HttpError(400, "party required");
      if (!crmConfigured()) return NextResponse.json({ party, company: null, people: [], why: "the CRM is not configured on this deploy" });
      const crm = crmDb();
      const stem = party.replace(/\b(pvt|private|ltd|limited|llp)\b\.?/gi, "").replace(/[^A-Za-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 2).join(" ");
      const { data: cos } = await crm.from("company").select("id, name, city, website, domain_name")
        .ilike("name", `%${stem.replace(/[%_]/g, "\\$&")}%`).is("deleted_at", null).is("merged_into_id", null).limit(6);
      const list = (cos || []) as { id: string; name: string; city: string | null; website: string | null; domain_name: string | null }[];
      /* the closest name wins — exact first, then the shortest that contains the stem */
      const norm = (s: string) => s.toLowerCase().replace(/\b(pvt|private|ltd|limited|llp)\b\.?/g, "").replace(/[^a-z0-9]/g, "");
      const best = list.find((c) => norm(c.name) === norm(party)) || list.sort((a, b) => a.name.length - b.name.length)[0] || null;
      if (!best) return NextResponse.json({ party, company: null, people: [], candidates: list.map((c) => c.name) });
      const { data: ppl } = await crm.from("person")
        .select("id, full_name, job_title, primary_email, primary_phone, whatsapp_number, is_decision_maker, is_primary")
        .eq("company_id", best.id).is("deleted_at", null).limit(40);
      const people = ((ppl || []) as Record<string, unknown>[])
        .filter((p) => p.primary_email || p.primary_phone || p.whatsapp_number)
        .sort((a, b) => (b.is_primary ? 2 : 0) + (b.is_decision_maker ? 1 : 0) - ((a.is_primary ? 2 : 0) + (a.is_decision_maker ? 1 : 0)))
        .slice(0, 12)
        .map((p) => ({ name: String(p.full_name || ""), title: String(p.job_title || ""), email: String(p.primary_email || ""), phone: String(p.primary_phone || p.whatsapp_number || ""), dm: !!p.is_decision_maker, primary: !!p.is_primary }));
      return NextResponse.json({ party, company: { id: best.id, name: best.name, city: best.city, web: best.website || best.domain_name }, people, candidates: list.map((c) => c.name) });
    }

    if (view === "billsdue") {
      const kind = url.searchParams.get("kind") === "payable" ? "payable" : "receivable";
      const all = await allBills(admin);
      const open = all.filter((b) => b.kind === kind && b.amount > 0);

      let meta = new Map<string, RR>();
      try {
        const got = await pageAll<RR>(async (a, b) => {
          const r = await admin.from("sales_invoice_meta").select("bill, fam, salesman, note, scan_path, scan_name").range(a, b);
          return { data: r.data as RR[] | null, error: r.error };
        }, "the invoice register");
        meta = new Map(got.map((m) => [String(m.bill), m]));
      } catch (e) { swallow("kuber/billsdue-meta", e); /* pre-0184 */ }

      /**
       * WHEN THE MONEY IS EXPECTED, AND WHAT IS IN THE WAY.
       *
       * Dr Raghu, 30 Sep 2026: "Then Expected Date after amount. this will be
       * used for ticking ... Collection Remarks. Later I will make the
       * collection Calls and also emails from here."
       *
       * Neither belongs in Tally and neither can be derived: they are what a
       * person believes after speaking to the customer. They live in
       * collection_followup (0183), keyed on the bill, so a Tally re-upload
       * cannot wipe them.
       */
      let fup = new Map<string, RR>();
      try {
        const got = await pageAll<RR>(async (a, b) => {
          const r = await admin.from("collection_followup").select("party, bill, expected_on, challenge").range(a, b);
          return { data: r.data as RR[] | null, error: r.error };
        }, "the follow-ups");
        fup = new Map(got.map((m) => [`${String(m.party)}|${String(m.bill)}`, m]));
      } catch (e) { swallow("kuber/billsdue-fup", e); /* pre-0183 */ }

      /* the credit a party holds, kept beside his bills rather than netted
         into them — one customer's advance is not another bill's payment */
      const credit = new Map<string, number>();
      for (const b of all.filter((x) => x.kind === kind && x.amount < 0)) {
        credit.set(b.party, (credit.get(b.party) || 0) + -b.amount);
      }

      const rows = open.map((b) => {
        const m = meta.get(String(b.bill));
        const age = b.bill_date ? daysBetween(String(b.bill_date), today) : null;
        const over = b.due_date ? daysBetween(String(b.due_date), today) : null;
        return {
          party: b.party, group: b.party_group ?? null, bill: b.bill,
          bill_date: b.bill_date ?? null, due_date: b.due_date ?? null,
          amount: b.amount, age, overdue: over != null && over > 0 ? over : 0,
          fam: m?.fam ?? null, salesman: m?.salesman ?? null,
          scan: m?.scan_path ? String(m.scan_name || "scan") : null,
          expected_on: (fup.get(`${b.party}|${b.bill}`)?.expected_on as string) ?? null,
          remarks: (fup.get(`${b.party}|${b.bill}`)?.challenge as string) ?? null,
        };
      }).sort((a, b) => (b.age ?? 0) - (a.age ?? 0));

      const total = rows.reduce((s2, r) => s2 + r.amount, 0);
      const held = [...credit.values()].reduce((s2, v) => s2 + v, 0);
      /* how far back the oldest one actually goes — he asked for five years
         and the register should say whether that is the half of it */
      const oldest = rows.reduce((a, r) => (r.bill_date && (!a || r.bill_date < a) ? r.bill_date : a), "" as string);
      const bands = [
        { key: "0-90", label: "under 90 days", lo: 0, hi: 90 },
        { key: "90-180", label: "90 – 180 days", lo: 90, hi: 180 },
        { key: "180-365", label: "180 days – a year", lo: 180, hi: 365 },
        { key: "1-2y", label: "1 – 2 years", lo: 365, hi: 730 },
        { key: "2-3y", label: "2 – 3 years", lo: 730, hi: 1095 },
        { key: "3y+", label: "over 3 years", lo: 1095, hi: 99999 },
      ].map((b) => {
        const hit = rows.filter((r) => (r.age ?? 0) >= b.lo && (r.age ?? 0) < b.hi);
        return { ...b, count: hit.length, amount: hit.reduce((s2, r) => s2 + r.amount, 0) };
      });

      return NextResponse.json({
        kind, today, rows: rows.slice(0, 4000), count: rows.length, total,
        held, creditParties: credit.size, oldest: oldest || null, bands,
        parties: [...new Set(rows.map((r) => r.party))].sort(),
      });
    }

    if (view === "vreg") {
      const kind = url.searchParams.get("kind") === "purchase" ? "purchase" : "sales";
      const TYPES = kind === "sales" ? ["GST Sales"] : ["Purchase", "Cap-Ex Purchase", "Excise Purchase Import"];
      const fyStartV = today.slice(5, 7) >= "04" ? today.slice(0, 4) + "-04-01" : String(Number(today.slice(0, 4)) - 1) + "-04-01";
      const from = url.searchParams.get("from") || fyStartV;
      const to = url.searchParams.get("to") || today;
      const rows: RR[] = [];
      for (let f = 0; ; f += 1000) {
        const { data, error } = await admin.from("kuber_voucher")
          .select("id, date, vtype, vno, party, narration, amount")
          .in("vtype", TYPES).gte("date", from).lte("date", to)
          .order("date", { ascending: false }).order("id").range(f, f + 999);
        if (error) {
          if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ empty: true });
          throw new Error(error.message);
        }
        rows.push(...((data || []).filter((r) => !isProforma(r.vtype, r.vno))));
        if (!data || data.length < 1000) break;
      }
      const total = rows.reduce((s2, r) => s2 + (Number(r.amount) || 0), 0);

      /**
       * WHAT IS STILL OPEN COMES FROM THE BOOKS, NOT FROM A TYPED BOX.
       *
       * Dr Raghu, 30 Sep 2026, asked for Status, Payment received, Payment
       * date, Days pending and Interest loss on this register — and for the
       * double work to end. Typing a payment status beside a bill Tally
       * already tracks bill-by-bill would have created the second truth, not
       * cured it. So all five are COMPUTED: kuber_bill carries what is still
       * open against each invoice, the invoice carries what it was raised
       * for, and received is the difference.
       *
       * Only what Tally cannot know is typed — the product family, the
       * salesman, the scan — plus an override for the rare bill where the
       * books are wrong and somebody has to say so out loud.
       */
      const openOf = new Map<string, number>();
      if (kind === "sales") {
        try {
          const bills = await pageAll<{ bill: string; amount: number; kind: string }>(async (a, b) => {
            const r = await admin.from("kuber_bill").select("bill, amount, kind").eq("kind", "receivable").range(a, b);
            return { data: r.data as { bill: string; amount: number; kind: string }[] | null, error: r.error };
          }, "the open bills");
          for (const b of bills) {
            const k = String(b.bill || "").trim();
            if (k) openOf.set(k, (openOf.get(k) || 0) + (Number(b.amount) || 0));
          }
        } catch (e) { swallow("kuber/vreg-bills", e); }
      }

      let meta = new Map<string, RR>();
      try {
        const got = await pageAll<RR>(async (a, b) => {
          const r = await admin.from("sales_invoice_meta").select("*").eq("kind", kind).range(a, b);
          return { data: r.data as RR[] | null, error: r.error };
        }, "the invoice register");
        meta = new Map(got.map((m) => [String(m.bill), m]));
      } catch (e) {
        swallow("kuber/vreg-meta", e); /* pre-0184, or pre-0185 (no kind yet) */
        try {
          const got = await pageAll<RR>(async (a, b) => {
            const r = await admin.from("sales_invoice_meta").select("*").range(a, b);
            return { data: r.data as RR[] | null, error: r.error };
          }, "the invoice register");
          if (kind === "sales") meta = new Map(got.map((m) => [String(m.bill), m]));
        } catch (e2) { swallow("kuber/vreg-meta2", e2); }
      }

      /**
       * WHAT WAS ON THE BILL (Dr Raghu, 30 Sep 2026: "in this also there has
       * to be the items ... this will be VERY important for the audit of the
       * bills"). The item lines ride with the voucher so the lightbox can
       * open on a click without a second round trip \u2014 an auditor checking
       * two hundred bills should not wait for two hundred fetches.
       */
      const itemsOf = new Map<string, { item: string; qty: string; rate: number; amount: number }[]>();
      try {
        const ids = rows.slice(0, 3000).map((r) => String(r.id));
        for (let i = 0; i < ids.length; i += 200) {
          const { data: it } = await admin.from("kuber_voucher_item")
            .select("voucher_id, item, qty, rate, amount").in("voucher_id", ids.slice(i, i + 200));
          for (const x of (it || []) as RR[]) {
            const k = String(x.voucher_id);
            const list = itemsOf.get(k) || [];
            list.push({ item: String(x.item || ""), qty: String(x.qty || ""), rate: Number(x.rate) || 0, amount: Math.abs(Number(x.amount) || 0) });
            itemsOf.set(k, list);
          }
        }
      } catch (e) { swallow("kuber/vreg-items", e); /* pre-0081 */ }

      const out = rows.slice(0, 3000).map((r) => {
        const no = String(r.vno || "").trim();
        const gross = Math.abs(Number(r.amount) || 0);
        const m = meta.get(no);
        const open = openOf.has(no) ? Math.max(0, openOf.get(no)!) : null;
        /* no open bill against an invoice that IS in the books means it is
           settled; null means we cannot say, and the screen says so */
        const settled = kind === "sales" ? (open == null ? gross : gross - open) : null;
        const outstanding = kind === "sales" ? (open == null ? 0 : open) : null;
        const derived = kind !== "sales" ? null
          : outstanding! <= 1 ? "paid" : settled! > 1 ? "partial" : "unpaid";
        const status = (m?.pay_status as string) || derived;
        const days = r.date && outstanding && outstanding > 1 ? daysBetween(String(r.date), today) : null;
        /* what the delay has cost, at his 15% — only while it is still out */
        const interest = days && days > 0 && outstanding ? (outstanding * 0.15 * days) / 365 : 0;
        return {
          id: r.id, date: r.date, vno: no, party: r.party, narration: r.narration, amount: gross,
          received: m?.paid_amount != null ? Number(m.paid_amount) : settled,
          outstanding, status, overridden: !!m?.pay_status,
          paid_on: m?.paid_on ?? null,
          days, interest,
          fam: m?.fam ?? null, salesman: m?.salesman ?? null, note: m?.note ?? null,
          scan: m?.scan_path ? { path: String(m.scan_path), name: String(m.scan_name || ""), at: m.scan_at } : null,
          items: itemsOf.get(String(r.id)) || [],
        };
      });

      /* the dropdowns the screen offers — his own lists, never free text */
      let fams: string[] = [];
      try {
        const jf = await pageAll<{ fam: string }>(async (a, b) => {
          const r = await admin.from("jobs").select("fam").range(a, b);
          return { data: r.data as { fam: string }[] | null, error: r.error };
        }, "the product families");
        fams = [...new Set(jf.map((x) => String(x.fam || "").trim()).filter(Boolean))].sort();
      } catch (e) { swallow("kuber/vreg-fams", e); }
      const salesmen = [...new Set(out.map((r) => r.salesman).filter(Boolean) as string[])].sort();

      return NextResponse.json({ kind, from, to, rows: out, count: rows.length, total, fams, salesmen });
    }

    if (view === "ledgers") {
      const q = (url.searchParams.get("q") || "").trim();
      let query = admin.from("kuber_ledger").select("name, parent, opening, closing, loaded_at, fy").order("name").limit(500);
      if (q) query = query.ilike("name", `%${q}%`);
      const { data, error } = await query;
      if (error) return NextResponse.json({ rows: [] });
      /* the register lists a ledger once, not once per year loaded */
      return NextResponse.json({ rows: newestByName(data || []) });
    }

    if (view === "vouchers") {
      const q = (url.searchParams.get("q") || "").trim();
      let query = admin.from("kuber_voucher").select("id, date, vtype, vno, party, narration").order("date", { ascending: false }).limit(500);
      if (q) query = query.or(`party.ilike.%${q}%,narration.ilike.%${q}%,vno.ilike.%${q}%,vtype.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) return NextResponse.json({ rows: [] });
      return NextResponse.json({ rows: data || [] });
    }

    // ---- summary: the dashboard ----
    // the flows of a chosen period, from the vouchers' own values (0083):
    // Billing = GST Sales · Collections = Receipt · Purchases = Purchase
    // family · Payments to suppliers = Payment. YTD = since 1 April.
    const period = url.searchParams.get("period") || "ytd";
    const fyStart = today.slice(5, 7) >= "04" ? today.slice(0, 4) + "-04-01" : String(Number(today.slice(0, 4)) - 1) + "-04-01";
    // MTD from the 1st; QTD from the FY quarter's own 1st (Apr/Jul/Oct/Jan)
    const mtdStart = today.slice(0, 8) + "01";
    const qm = Math.floor(((Number(today.slice(5, 7)) + 8) % 12) / 3) * 3; // months since April, floored to the quarter
    const qMonth = ((3 + qm) % 12) + 1;
    const qYear = qMonth > Number(today.slice(5, 7)) ? Number(today.slice(0, 4)) - 1 : Number(today.slice(0, 4));
    const qtdStart = `${qYear}-${String(qMonth).padStart(2, "0")}-01`;
    // `until` caps the flow window — the dashboard's day ratios prefer LAST
    // MONTH'S LAST DAY (Dr Raghu, 28 Aug 2026) over a moving mid-month cut.
    const until = url.searchParams.get("until") || today;
    const since = period === "ytd" ? fyStart
      : period === "mtd" ? mtdStart
      : period === "qtd" ? qtdStart
      : addDays(until, -Math.max(1, Math.min(365, Number(period) || 30)));
    // THE FLOWS — recut against the review sheet (Dr Raghu, 29 Aug 2026:
    // "these numbers are wrong"): Billing was carrying ₹8.6 Cr of PI-numbered
    // proformas, Collections wore EVERY receipt (borrowings included), and
    // "Payments to suppliers" wore salaries, GST and loan EMIs. Each row is
    // now the thing its name says — proved against the MR's own quarters
    // (Q1 9.45 vs their 9.35, Aug to-the-rupee):
    //   billing            GST Sales invoice values (proformas out)
    //   collections        receipts crediting Sundry Debtors — customers paying
    //   purchases          Purchase / Cap-Ex / Import voucher values
    //   supplier_payments  payments debiting Sundry Creditors — bills cleared
    //   money_in/out       the bank side of every Receipt / every Payment
    // Tally signs on the lines: debit negative, credit positive.
    const flows: Record<string, { value: number; count: number }> = Object.fromEntries(
      ["billing", "collections", "purchases", "supplier_payments", "money_in", "money_out"].map((k) => [k, { value: 0, count: 0 }]));
    let bankCash = 0, bankOd = 0;
    const odSet = new Set<string>();
    try {
      const world = await loadWorld(admin);
      const PURCH = new Set(["Purchase", "Cap-Ex Purchase", "Excise Purchase Import"]);
      const vById = new Map(world.vouchers.map((v) => [String(v.id), v]));
      for (const v of world.vouchers) {
        const d = String(v.date || "");
        if (d < since || d > until) continue;
        if (String(v.vtype) === "GST Sales") { flows.billing.value += Number(v.amount) || 0; flows.billing.count += 1; }
        if (PURCH.has(String(v.vtype))) { flows.purchases.value += Number(v.amount) || 0; flows.purchases.count += 1; }
      }
      /**
       * AN OVERDRAFT IS NOT CASH (Dr Raghu, 30 Sep 2026: "Bank and cash is
       * wrong again!!!").
       *
       * The Union Bank CC account carried Rs 5.39 Cr of the Rs 5.44 Cr this
       * card was showing — and a cash-credit account is money BORROWED from
       * the bank, not money held at it. Counting it as cash turned the
       * company's borrowing into its liquidity.
       *
       * It is not discarded: it is reported on its own, because what is drawn
       * on the CC is a number worth seeing beside what is actually in hand.
       */
      const isCash = (parent: string) => world.chainHas(parent, /^bank accounts$|^cash-in-hand$/);
      const isOd = (parent: string) => world.chainHas(parent, /^bank od/);
      const isBankParent = (parent: string) => isCash(parent) || isOd(parent);
      const seen: Record<string, Set<string>> = { collections: new Set(), supplier_payments: new Set(), money_in: new Set(), money_out: new Set() };
      for (const l of world.lines) {
        const v = vById.get(String(l.voucher_id));
        if (!v) continue;
        const d = String(v.date || "");
        if (d < since || d > until) continue;
        const amt = Number(l.amount) || 0;
        const parent = String(world.ledgerByName.get(String(l.ledger))?.parent || "");
        const t = String(v.vtype);
        if (t === "Receipt") {
          if (amt > 0 && world.chainHas(parent, /^sundry debtors$/)) { flows.collections.value += amt; seen.collections.add(String(v.id)); }
          if (amt < 0 && isBankParent(parent)) { flows.money_in.value += -amt; seen.money_in.add(String(v.id)); }
        } else if (t === "Payment") {
          if (amt < 0 && world.chainHas(parent, /^sundry creditors$/)) { flows.supplier_payments.value += -amt; seen.supplier_payments.add(String(v.id)); }
          if (amt > 0 && isBankParent(parent)) { flows.money_out.value += amt; seen.money_out.add(String(v.id)); }
        }
      }
      for (const k of Object.keys(seen)) flows[k].count = seen[k].size;

      // BANK & CASH — opening + every line on every bank/OD/cash ledger
      // (the closing column is never trusted: a masters export once arrived
      // with all closings zeroed). NOT windowed — a balance, not a flow.
      const bankSet = new Set<string>();
      for (const l of world.ledgers) {
        const par = String(l.parent || "");
        if (isCash(par)) { bankCash += Number(l.opening) || 0; bankSet.add(String(l.name)); }
        else if (isOd(par)) { bankOd += Number(l.opening) || 0; odSet.add(String(l.name)); }
      }
      for (const l of world.lines) {
        if (bankSet.has(String(l.ledger))) bankCash += Number(l.amount) || 0;
        else if (odSet.has(String(l.ledger))) bankOd += Number(l.amount) || 0;
      }
    } catch (e) { swallow("kuber/books", e); /* books not loaded yet */ }
    const bills = await allBills(admin);
    const rec = bills.filter((b) => b.kind === "receivable");
    const pay = bills.filter((b) => b.kind === "payable");
    const sum = (xs: Bill[]) => xs.reduce((s, b) => s + b.amount, 0);
    const pos = (xs: Bill[]) => xs.filter((b) => b.amount > 0);
    const overdue = (xs: Bill[]) => pos(xs).filter((b) => b.due_date && b.due_date < today);
    const dueSoon = (xs: Bill[], days: number) => pos(xs).filter((b) => b.due_date && b.due_date >= today && b.due_date <= addDays(today, days));
    let loadedAt: string | null = null;
    try {
      const { data } = await admin.from("kuber_bill").select("loaded_at").limit(1);
      loadedAt = data?.[0]?.loaded_at ?? null;
    } catch (e) { swallow("kuber/books", e); /* absent */ }
    const reg = async (table: string, dateCol: string, amountCol: string, days: number) => {
      try {
        const { data } = await admin.from(table).select("*").limit(1000);
        const live = (data || []).filter((r) => String(r.status || "live") === "live");
        return {
          count: live.length,
          amount: live.reduce((s, r) => s + (Number(r[amountCol]) || 0), 0),
          expiring: live.filter((r) => r[dateCol] && String(r[dateCol]) <= addDays(today, days)).length,
        };
      } catch { return { count: 0, amount: 0, expiring: 0 }; }
    };
    const [bg, fd, ins] = await Promise.all([
      reg("kuber_bg", "expiry_date", "amount", 60),
      reg("kuber_fd", "maturity_date", "principal", 60),
      reg("kuber_insurance", "expiry_date", "sum_insured", 60),
    ]);
    return NextResponse.json({
      today, loadedAt, since, period,
      flows, bankCash, bankOd,
      /**
       * TWO SEPARATE THINGS, AND NO NET BETWEEN THEM.
       *
       * Dr Raghu, 30 Sep 2026: "Receivables is real receivables. Advances is
       * for those customers where there is nett advance only. There is no
       * purpose of nett recievable!!! Same with supplier."
       *
       * He is right, and it is not a presentation preference. Netting a
       * customer who owes us against a different customer whose money we are
       * holding produces a figure that is neither collectable nor payable —
       * it describes nobody's position. So each party is netted WITHIN
       * ITSELF, and then the two populations are counted apart: those in
       * debit are the receivable, those in credit are money held.
       */
      receivable: partySides(rec),
      payable: partySides(pay),
      bg, fd, insurance: ins,
    });
  } catch (e) {
    return errJson(e);
  }
}

/** POST { action: "classify", ledger, cls: "tvc" | "oe" } — the CFO's flip;
 *  it outranks the seed from then on. */
export async function POST(req: Request) {
  try {
    const user = await requireKuber();
    const body = await readBody(req, {});
    if (String(body.action) === "set_mis_input") {
      const key = String(body.key || "");
      if (!["opening_stock", "closing_stock"].includes(key)) throw new HttpError(400, "key must be opening_stock or closing_stock");
      const { error } = await adminClient().from("kuber_mis_input")
        .upsert({ key, value: Number(body.value) || 0, by: user.email, at: new Date().toISOString() }, { onConflict: "key" });
      if (error) {
        if (/does not exist|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0092 first — the typed inputs have nowhere to live yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }
    if (String(body.action) === "set_ratio_target") {
      const { error } = await adminClient().from("kuber_ratio_target")
        .upsert({ key: String(body.key || ""), target: String(body.target || ""), by: user.email, at: new Date().toISOString() }, { onConflict: "key" });
      if (error) {
        if (/does not exist|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0092 first — the targets have nowhere to live yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }
    /**
     * THE SALES REGISTER'S OWN FIELDS (0184).
     *
     * One row or five hundred — "Also have a facility to do Select multiple
     * or select all then edit where you can change salesperson, product,
     * payment status" (Dr Raghu, 30 Sep 2026). A bulk edit writes only the
     * fields actually sent, so setting the salesman on two hundred invoices
     * cannot wipe the product family somebody set on one of them yesterday.
     */
    /**
     * TICKING OFF A COLLECTION (0183 + 0184).
     *
     * One press can carry three different kinds of fact to two different
     * tables: the expected date and the collection remark are a belief about
     * this BILL, the salesman and the product family are facts about the
     * INVOICE. Both are written, and only the fields actually sent — so
     * setting an expected date on forty bills cannot blank the remarks
     * somebody wrote on one of them this morning.
     */
    /**
     * TICKED SUPPLIER BILLS BECOME THE PLAN (Payment Planning › Supplier
     * Bills, 30 Sep 2026). One row per bill, dated, status planned — a
     * request until somebody approves it. The bill ref rides along so the
     * cash flow and the supplier card can both see which bill the plan is
     * for, and the same bill is not planned twice.
     */
    if (String(body.action) === "plan_bills") {
      const list = (Array.isArray(body.bills) ? body.bills : []) as { party: string; bill: string; amount: number }[];
      const on = String(body.plan_date || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) throw new HttpError(400, "A pay-on date is needed.");
      const rows = list.map((x) => ({ party: String(x?.party || "").trim(), bill: String(x?.bill || "").trim(), amount: Number(x?.amount) || 0 }))
        .filter((x) => x.party && x.bill && x.amount > 0).slice(0, 500);
      if (!rows.length) throw new HttpError(400, "No bill ticked.");
      const db = adminClient();
      const { data: have } = await db.from("kuber_payment_plan").select("party, bill_ref").in("status", ["planned", "approved"]).in("party", [...new Set(rows.map((r) => r.party))]);
      const dup = new Set(((have || []) as { party: string; bill_ref: string }[]).map((h) => `${h.party}|${h.bill_ref}`));
      const fresh = rows.filter((r) => !dup.has(`${r.party}|${r.bill}`));
      if (fresh.length) {
        const { error } = await db.from("kuber_payment_plan").insert(fresh.map((r) => ({
          plan_date: on, party: r.party, amount: r.amount, purpose: "Supplier bill", bill_ref: r.bill, status: "planned", note: "", by: user.email,
        })));
        if (error) throw new Error(error.message);
      }
      return NextResponse.json({ ok: true, planned: fresh.length, alreadyPlanned: rows.length - fresh.length });
    }

    /** the Sunday opening, stated because the books are staler than the plan */
    if (String(body.action) === "cash_opening") {
      const on = String(body.on_date || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) throw new HttpError(400, "Which Sunday?");
      const db = adminClient();
      if (body.amount === null || body.amount === "") {
        const { error } = await db.from("cash_opening").delete().eq("on_date", on);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, cleared: true });
      }
      const { error } = await db.from("cash_opening").upsert(
        { on_date: on, amount: Number(body.amount) || 0, note: body.note ? String(body.note).slice(0, 300) : null, by_email: user.email, at: new Date().toISOString() },
        { onConflict: "on_date" },
      );
      if (error) {
        if (/does not exist|schema cache/i.test(error.message)) throw new HttpError(503, "Run migration 0183 first.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true });
    }

    if (String(body.action) === "collection") {
      const list = (Array.isArray(body.bills) ? body.bills : []) as { party: string; bill: string }[];
      const rows = list.map((x) => ({ party: String(x?.party || "").trim(), bill: String(x?.bill || "").trim() }))
        .filter((x) => x.party && x.bill).slice(0, 2000);
      if (!rows.length) throw new HttpError(400, "No bill named.");
      const db = adminClient();
      const now = new Date().toISOString();

      /* the belief about the bill */
      const fu: Record<string, unknown> = {};
      if ("expected_on" in body) fu.expected_on = body.expected_on ? String(body.expected_on).slice(0, 10) : null;
      if ("remarks" in body) fu.challenge = body.remarks === null || body.remarks === "" ? null : String(body.remarks).slice(0, 2000);
      /* A CALL OR A MAIL IS A DATED LINE ON THE REMARK. It is the collection
         history the sheet never had, and it needs no new table to keep. */
      if ("touch" in body) {
        const kind = String(body.touch) === "mail" ? "e-mailed" : "called";
        const stamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
        const who = String(user.email || "").split("@")[0];
        const { data: cur } = await db.from("collection_followup").select("party, bill, challenge").in("party", [...new Set(rows.map((r) => r.party))]);
        const have = new Map(((cur || []) as { party: string; bill: string; challenge: string | null }[]).map((c) => [`${c.party}|${c.bill}`, c.challenge || ""]));
        const stamped = rows.map((r) => {
          const prev = have.get(`${r.party}|${r.bill}`) || "";
          const line = `[${stamp} · ${kind} by ${who}${body.note ? ` — ${String(body.note).slice(0, 200)}` : ""}]`;
          return { ...r, challenge: (prev ? prev + " " : "") + line, by_email: user.email, at: now };
        });
        const { error } = await db.from("collection_followup").upsert(stamped, { onConflict: "party,bill" });
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, wrote: stamped.length });
      }
      if (Object.keys(fu).length) {
        const { error } = await db.from("collection_followup")
          .upsert(rows.map((r) => ({ ...r, ...fu, by_email: user.email, at: now })), { onConflict: "party,bill" });
        if (error) {
          if (/does not exist|schema cache/i.test(error.message))
            throw new HttpError(503, "Run migration 0183 first — the follow-ups have nowhere to live yet.");
          throw new Error(error.message);
        }
      }

      /* the facts about the invoice, shared with the Sales Register */
      const meta: Record<string, unknown> = {};
      if ("fam" in body) meta.fam = body.fam ? String(body.fam).slice(0, 200) : null;
      if ("salesman" in body) meta.salesman = body.salesman ? String(body.salesman).slice(0, 200) : null;
      if (Object.keys(meta).length) {
        const { error } = await db.from("sales_invoice_meta").upsert(
          rows.map((r) => ({ kind: "sales", bill: r.bill, party: r.party, ...meta, by_email: user.email, at: now })),
          { onConflict: "kind,bill" },
        );
        if (error) {
          if (/does not exist|schema cache/i.test(error.message))
            throw new HttpError(503, "Run migrations 0184 and 0185 first.");
          throw new Error(error.message);
        }
      }
      if (!Object.keys(fu).length && !Object.keys(meta).length) throw new HttpError(400, "Nothing to change.");
      return NextResponse.json({ ok: true, wrote: rows.length });
    }

    if (String(body.action) === "invoice_meta") {
      const bills = (Array.isArray(body.bills) ? body.bills : [body.bill])
        .map((b) => String(b || "").trim()).filter(Boolean).slice(0, 2000);
      if (!bills.length) throw new HttpError(400, "No invoice named.");
      const patch: Record<string, unknown> = { by_email: user.email, at: new Date().toISOString() };
      const F = (k: string, max = 200) => {
        if (!(k in body)) return;
        const v = body[k];
        patch[k] = v === null || v === "" ? null : String(v).slice(0, max);
      };
      F("fam"); F("salesman"); F("note", 2000);
      if ("pay_status" in body) {
        const v = String(body.pay_status || "");
        if (v && !["unpaid", "partial", "paid"].includes(v)) throw new HttpError(400, "Unknown status.");
        patch.pay_status = v || null;          // empty means "the books are right"
      }
      if ("paid_on" in body) patch.paid_on = body.paid_on ? String(body.paid_on).slice(0, 10) : null;
      if ("paid_amount" in body) patch.paid_amount = body.paid_amount === null || body.paid_amount === "" ? null : Number(body.paid_amount) || 0;
      if (Object.keys(patch).length <= 2) throw new HttpError(400, "Nothing to change.");
      /* the party rides along so the row reads on its own if the voucher
         ever leaves the books */
      const partyOf = new Map<string, string>();
      if (bills.length <= 500) {
        const { data: vs } = await adminClient().from("kuber_voucher").select("vno, party").in("vno", bills);
        for (const v of (vs || []) as { vno: string; party: string }[]) partyOf.set(String(v.vno), String(v.party || ""));
      }
      const kindB = String(body.kind || "sales") === "purchase" ? "purchase" : "sales";
      const rows = bills.map((bill) => ({ kind: kindB, bill, party: partyOf.get(bill) || null, ...patch }));
      const { error } = await adminClient().from("sales_invoice_meta").upsert(rows, { onConflict: "kind,bill" });
      if (error) {
        if (/does not exist|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0184 first — the register has nowhere to keep this yet.");
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true, wrote: rows.length });
    }

    if (String(body.action) !== "classify") throw new HttpError(400, "Unknown action.");
    const ledger = String(body.ledger || "").trim();
    const cls = String(body.cls || "");
    if (!ledger || !["tvc", "oe"].includes(cls)) throw new HttpError(400, "ledger and cls (tvc|oe) required");
    const { error } = await adminClient().from("kuber_expense_class")
      .upsert({ ledger, cls, by: user.email, at: new Date().toISOString() }, { onConflict: "ledger" });
    if (error) {
      if (/does not exist|schema cache/i.test(error.message))
        throw new HttpError(503, "Run migration 0087 first — the classification has nowhere to live yet.");
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
