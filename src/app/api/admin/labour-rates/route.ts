import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { requireStratcom, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { TRADES } from "@/lib/templates";

export const dynamic = "force-dynamic";

/**
 * Labour day-rates, one per trade. Rates are money — Stratcom reads and
 * writes them, and screens that cannot fetch them simply do not draw a cost
 * column. Dr Raghu keys the values in Admin → Settings.
 */
export async function GET() {
  try {
    await requireStratcom();
    const { data, error } = await adminClient()
      .from("labour_rate").select("trade, day_rate, updated_by, updated_at");
    if (error) {
      if (/labour_rate|schema cache|does not exist/i.test(error.message))
        return NextResponse.json({ rates: null, needsMigration: true });
      throw new Error(error.message);
    }
    const rates: Record<string, number> = {};
    for (const r of data || []) rates[String(r.trade)] = Number(r.day_rate) || 0;
    return NextResponse.json({ rates });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireStratcom();
    const body = await readBody(req, {});
    const rows = TRADES.map((t) => {
      const n = Number((body.rates || {})[t.key]);
      if (!Number.isFinite(n) || n < 0 || n > 100000)
        throw new HttpError(400, `${t.label}: ${String((body.rates || {})[t.key])} is not a day rate.`);
      return { trade: t.key, day_rate: Math.round(n * 100) / 100, updated_by: user.email, updated_at: new Date().toISOString() };
    });
    const { error } = await adminClient().from("labour_rate").upsert(rows, { onConflict: "trade" });
    if (error) {
      if (/labour_rate|schema cache|does not exist/i.test(error.message))
        throw new HttpError(503, "Run migration 0072 first — the rates have nowhere to live yet.");
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
