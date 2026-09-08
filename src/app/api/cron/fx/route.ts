import { NextResponse } from "next/server";
import { currentUser, errJson, HttpError } from "@/lib/auth";
import { crmDb, crmConfigured } from "@/crm/db";
import { beat } from "@/lib/cron-beat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/fx — what a dollar is worth, once a day (Dr Raghu, 8 Sep
 * 2026: "show the latest foreign exchange rate for USD and euro, and later on
 * we can of course add more currencies also. It will come from the table").
 *
 * The rate comes from the EUROPEAN CENTRAL BANK's daily reference rates, read
 * through frankfurter.dev — free, no key, no account to lapse. The ECB
 * publishes once a working day at about 16:00 CET, so this runs at 16:15 UTC
 * and there is nothing to gain from asking more often.
 *
 * IT ASKS FOR WHATEVER THE TABLE HOLDS. The list of currencies is the fx_rate
 * table, not a constant here, so the day he adds AED the cron starts fetching
 * AED without a deploy. INR is skipped: the home currency is 1 by definition,
 * and the table's own trigger keeps it there.
 *
 * A FAILED FETCH CHANGES NOTHING. The last good rate stands, with the `as_of`
 * date it came in on, so a quote is never priced against a rate that quietly
 * became zero. That is also why a rate that comes back absurd — a factor of
 * two from what we hold — is refused rather than written: a bad rate is worse
 * than a stale one, because a stale one is visible on the screen.
 */
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const fromCron = !!secret && (req.headers.get("authorization") || "") === `Bearer ${secret}`;
    if (!fromCron) {
      const u = await currentUser();
      if (!u || u.disabled) throw new HttpError(401, "The daily cron, or a signed-in hand.");
    }
    await beat("fx", "fired", { fromCron });
    if (!crmConfigured()) return NextResponse.json({ ok: false, note: "CRM not configured." });
    const db = crmDb();

    const { data: held } = await db.from("fx_rate")
      .select("code, inr_per_unit, as_of").eq("is_active", true);
    const wanted = (held ?? []).map((r) => String(r.code)).filter((c) => c && c !== "INR");
    if (!wanted.length) return NextResponse.json({ ok: true, note: "Only INR is on the list — nothing to fetch." });

    const url = `https://api.frankfurter.dev/v1/latest?base=INR&symbols=${encodeURIComponent(wanted.join(","))}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`the rate feed answered ${r.status}`);
    const j = (await r.json()) as { date?: string; rates?: Record<string, number> };
    const rates = j.rates ?? {};
    const asOf = String(j.date || new Date().toISOString().slice(0, 10));

    const changed: Record<string, string> = {};
    for (const row of held ?? []) {
      const code = String(row.code);
      if (code === "INR") continue;
      const perInr = Number(rates[code]);
      if (!perInr || !isFinite(perInr) || perInr <= 0) { changed[code] = "the feed did not carry it"; continue; }
      const inrPerUnit = Number((1 / perInr).toFixed(4));

      /* A BAD RATE IS WORSE THAN A STALE ONE. Anything twice or half what we
         hold is refused — the rupee does not move like that in a day, so a
         number like that is a feed fault, not a market. */
      const was = Number(row.inr_per_unit) || 0;
      if (was && (inrPerUnit > was * 2 || inrPerUnit < was / 2)) {
        changed[code] = `refused ${inrPerUnit} against the held ${was} — too far to be real`;
        continue;
      }
      const { error } = await db.from("fx_rate")
        .update({ inr_per_unit: inrPerUnit, as_of: asOf, source: "European Central Bank, via frankfurter.dev" })
        .eq("code", code);
      changed[code] = error ? `not saved: ${error.message}` : `₹${inrPerUnit} (was ₹${was})`;
    }

    await beat("fx", "done", { asOf, changed });
    return NextResponse.json({ ok: true, asOf, changed });
  } catch (e) { return errJson(e); }
}
