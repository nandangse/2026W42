import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireKuber } from "@/lib/accounts";

export const dynamic = "force-dynamic";

/**
 * THE STOCK REGISTER — one value a month, and the P&L reads it.
 *
 * Dr Raghu, 30 Sep 2026: "Opening stock as of 1/4/2026, then April 30 <>,
 * May 31 <> etc. No entries put inside in line."
 *
 * It is deliberately a register and not two boxes on the statement. A number
 * somebody types is an input; a statement is an output; and a figure typed
 * into a line of the P&L is a figure that can be nudged until the statement
 * reads better. This is the input, kept where inputs belong.
 */

/**
 * 1 April of the financial year, and every month end since.
 *
 * NOT exported: a Next.js route file may only export the handlers and its
 * config. Exporting a helper from one compiles under tsc and fails the build
 * — which is why nothing ships here without a full build.
 */
function stockDates(fyStart: string, upto: string): string[] {
  /* THE YEAR OPENS ON THE PREVIOUS YEAR'S CLOSING (0181). Suresh counts the
     floor on 31 March; that figure closes one year and opens the next, and
     asking him for the one he actually produces removes a translation step. */
  const s = new Date(`${fyStart}T00:00:00`);
  const prior = new Date(s.getFullYear(), s.getMonth(), 0);
  const out = [`${prior.getFullYear()}-${String(prior.getMonth() + 1).padStart(2, "0")}-${String(prior.getDate()).padStart(2, "0")}`];
  for (let i = 0; i < 24; i++) {
    /* day 0 of the next month is the last day of this one — the calendar's
       own arithmetic rather than a table of 30s and 31s. */
    const end = new Date(s.getFullYear(), s.getMonth() + i + 1, 0);
    const iso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
    if (iso > upto) break;
    out.push(iso);
  }
  return out;
}

const REQUIRE_0179 = "Run migration 0179 first — the stock register has nowhere to live yet.";

const S = (v: unknown) => (v == null ? "" : String(v).trim());
const stripNo = (r: string) => r.replace(/^\s*\d+\s*[.)-]*\s*/, "");
const isProforma = (vtype: unknown, vno: unknown) =>
  S(vtype) === "Proforma Invoice" || /^PI[-/]/i.test(S(vno));

/**
 * WHAT WAS BOUGHT IN EACH MONTH — so the register can finish the sum.
 *
 * Dr Raghu, 30 Sep 2026: "in this show purchase of the month and then it will
 * also give the COGS."
 *
 * He is right that it belongs here rather than only on the P&L. A stock value
 * typed with no consequence in front of it is a number somebody enters to
 * clear a warning; a stock value sitting beside the cost of sales it produces
 * is a number somebody checks. Opening plus what was bought, less what is
 * still on the floor, is what the month actually consumed.
 */
async function purchasesByMonth(admin: ReturnType<typeof adminClient>): Promise<Record<string, number>> {
  const page = async <T>(run: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: unknown }>) => {
    const out: T[] = [];
    for (let a = 0; ; a += 1000) {
      const { data, error } = await run(a, a + 999);
      if (error) return out;
      out.push(...((data || []) as T[]));
      if (!data || data.length < 1000) break;
    }
    return out;
  };
  const [groups, ledgers, vouchers, lines] = await Promise.all([
    page<{ name: string; parent: string }>((a, b) => admin.from("kuber_group").select("name, parent").order("name").range(a, b)),
    page<{ name: string; parent: string }>((a, b) => admin.from("kuber_ledger").select("name, parent").order("name").range(a, b)),
    page<{ id: string; date: string; vtype: string; vno: string }>((a, b) => admin.from("kuber_voucher").select("id, date, vtype, vno").order("id").range(a, b)),
    page<{ voucher_id: string; ledger: string; amount: number }>((a, b) => admin.from("kuber_voucher_line").select("voucher_id, ledger, amount").order("id").range(a, b)),
  ]);
  const gp = new Map(groups.map((g) => [g.name, g.parent]));
  const rootOf = (n0: string) => { let n = n0, s = 0; while (gp.get(n) && s++ < 30) n = gp.get(n)!; return n; };
  const isPurchase = new Map(ledgers.map((l) => [l.name, stripNo(rootOf(l.parent)) === "Purchase Accounts"]));
  const V = new Map(vouchers.map((v) => [String(v.id), v]));
  const out: Record<string, number> = {};
  for (const l of lines) {
    if (!isPurchase.get(l.ledger)) continue;
    const v = V.get(String(l.voucher_id));
    if (!v || !v.date || isProforma(v.vtype, v.vno)) continue;
    const k = S(v.date).slice(0, 7);
    /* Tally signs: a purchase is a debit and arrives negative. */
    out[k] = (out[k] || 0) - (Number(l.amount) || 0);
  }
  return out;
}

/** GET — every entry, oldest first, with the month ends that have none. */
export async function GET(req: Request) {
  try {
    await requireKuber();
    const url = new URL(req.url);
    const fyStart = url.searchParams.get("fy_start") || "2026-04-01";
    const upto = url.searchParams.get("upto") || new Date().toISOString().slice(0, 10);
    const { data, error } = await adminClient()
      .from("kuber_stock").select("as_on, amount, note, by, at").order("as_on");
    if (error) {
      if (/does not exist|schema cache/i.test(error.message))
        return NextResponse.json({ ok: true, installed: false, rows: [], dates: stockDates(fyStart, upto) });
      throw new Error(error.message);
    }
    const bought = await purchasesByMonth(adminClient()).catch(() => ({} as Record<string, number>));
    const have = new Map((data || []).map((r) => [String(r.as_on), r]));
    /* Every month end the year has reached, whether or not it has a figure —
       an empty row is the ask, and a missing row is invisible. */
    const dates = stockDates(fyStart, upto);
    const rows = dates.map((d, i) => {
      const r = have.get(d);
      const amount = r ? Number(r.amount) : null;
      /* The month this row closes — the opening row closes no month. */
      const month = i === 0 ? null : d.slice(0, 7);
      const purchases = month ? (bought[month] ?? 0) : null;
      /* COGS = what was here + what was bought − what is still here. Only
         struck where BOTH ends are valued: a cost of sales computed against a
         missing stock figure is a guess with a decimal point. */
      const prevAmt = i > 0 ? (have.get(dates[i - 1]) ? Number(have.get(dates[i - 1])!.amount) : null) : null;
      const cogs = amount != null && prevAmt != null && purchases != null
        ? prevAmt + purchases - amount : null;
      return {
        as_on: d, amount,
        note: r?.note ?? null,
        by: r?.by ?? null,
        at: r?.at ?? null,
        opening: d < fyStart,          // the 31 March closing, which opens the year
        month, purchases, cogs,
      };
    });
    /* Anything entered outside the expected dates is still shown — somebody
       valuing stock at a quarter end should not find it swallowed. */
    const extra = (data || [])
      .filter((r) => !rows.some((x) => x.as_on === String(r.as_on)))
      .map((r) => ({ as_on: String(r.as_on), amount: Number(r.amount), note: r.note ?? null, by: r.by ?? null, at: r.at ?? null, opening: false, month: null, purchases: null, cogs: null }));
    return NextResponse.json({
      ok: true, installed: true,
      rows: [...rows, ...extra].sort((a, b) => a.as_on.localeCompare(b.as_on)),
      filled: (data || []).length,
    });
  } catch (e) { return errJson(e); }
}

/** POST { as_on, amount, note? } — one month's value. A blank amount clears it. */
export async function POST(req: Request) {
  try {
    const user = await requireKuber();
    const body = await readBody(req, {});
    const asOn = String(body.as_on || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOn)) throw new HttpError(400, "as_on must be a date.");
    const admin = adminClient();

    if (body.amount === null || body.amount === "") {
      const { error } = await admin.from("kuber_stock").delete().eq("as_on", asOn);
      if (error) {
        if (/does not exist|schema cache/i.test(error.message)) throw new HttpError(503, REQUIRE_0179);
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true, cleared: true });
    }

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0)
      throw new HttpError(400, "A stock value is a number, zero or more.");
    const { error } = await admin.from("kuber_stock").upsert(
      { as_on: asOn, amount, note: String(body.note || "").trim() || null, by: user.email, at: new Date().toISOString() },
      { onConflict: "as_on" },
    );
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) throw new HttpError(503, REQUIRE_0179);
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) { return errJson(e); }
}
