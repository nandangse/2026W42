import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured } from "@/crm/db";
import { readBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

/**
 * THE CURRENCY LIST, AND WHAT EACH IS WORTH (Dr Raghu, 8 Sep 2026).
 *
 * GET  /api/crm/fx        → every active currency, INR first
 * POST /api/crm/fx        → { code, inr_per_unit } — a rate set by hand
 *
 * The quote's dropdown reads this, so the list of currencies a quote may be
 * written in is a table and not a constant in the screen. A rate set by hand
 * stands until the next daily cron run replaces it.
 */
export async function GET() {
  try {
    await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, "CRM not configured.");
    const { data, error } = await crmDb().from("fx_rate")
      .select("code, name, symbol, inr_per_unit, as_of, source, sort_order")
      .eq("is_active", true).order("sort_order");
    if (error) {
      const gone = /does not exist|schema cache/i.test(error.message);
      throw new HttpError(gone ? 503 : 500,
        gone ? "Run migration 0060 first — the currencies have nowhere to live yet." : error.message);
    }
    return NextResponse.json({ rows: data ?? [] });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, "CRM not configured.");
    const b = await readBody(req, {});
    const code = String(b.code ?? "").trim().toUpperCase();
    const rate = Number(b.inr_per_unit);
    if (!code) throw new HttpError(400, "Which currency?");
    if (code === "INR") throw new HttpError(400, "The rupee is the home currency — it stays at 1.");
    if (!rate || !isFinite(rate) || rate <= 0) throw new HttpError(400, "A rate has to be a positive number of rupees per unit.");
    const { data, error } = await crmDb().from("fx_rate")
      .update({ inr_per_unit: rate, as_of: new Date().toISOString().slice(0, 10), source: "set by hand" })
      .eq("code", code).select().maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!data) throw new HttpError(404, `${code} is not on the currency list.`);
    return NextResponse.json({ row: data });
  } catch (e) { return errJson(e); }
}
