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
  const out = [fyStart];
  const s = new Date(`${fyStart}T00:00:00`);
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
    const have = new Map((data || []).map((r) => [String(r.as_on), r]));
    /* Every month end the year has reached, whether or not it has a figure —
       an empty row is the ask, and a missing row is invisible. */
    const rows = stockDates(fyStart, upto).map((d) => {
      const r = have.get(d);
      return {
        as_on: d,
        amount: r ? Number(r.amount) : null,
        note: r?.note ?? null,
        by: r?.by ?? null,
        at: r?.at ?? null,
        opening: d === fyStart,
      };
    });
    /* Anything entered outside the expected dates is still shown — somebody
       valuing stock at a quarter end should not find it swallowed. */
    const extra = (data || [])
      .filter((r) => !rows.some((x) => x.as_on === String(r.as_on)))
      .map((r) => ({ as_on: String(r.as_on), amount: Number(r.amount), note: r.note ?? null, by: r.by ?? null, at: r.at ?? null, opening: false }));
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
