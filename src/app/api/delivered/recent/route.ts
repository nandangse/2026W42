import { NextResponse } from "next/server";
import { requireReader, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { today, addDays } from "@/lib/schedule";

export const dynamic = "force-dynamic";

/**
 * How far back the delivery calendar shows what actually went out.
 *
 * Not exported: a Next route file may only export its handlers and a fixed set
 * of config names, and exporting anything else fails the build with a type
 * error that does not name the extra export.
 */
const RECENT_DAYS = 30;

/**
 * GET /api/delivered/recent — what went out of the door in the last 30 days.
 *
 * Deliberately NOT /api/delivered, which is gated on the Leadership Circle.
 * That gate is there for the MONEY — the year against target, the ledger, the
 * run rate. What shipped last week is not a secret from the people who built
 * it, and a delivery calendar showing only what is still owed is a calendar
 * that never shows anything going right.
 *
 * So this returns the job, its tag and the day it went — and nothing else. No
 * value, no throughput, no customer. Readers get the fact of the delivery;
 * the LC keeps the figures.
 */
export async function GET() {
  try {
    await requireReader();
    const to = today();
    const from = addDays(to, -RECENT_DAYS);

    const { data, error } = await adminClient()
      .from("delivered_jobs")
      .select("id, tag, delivered_on")
      .gte("delivered_on", from)
      .lte("delivered_on", to)
      .order("delivered_on", { ascending: true })
      .limit(1000);

    if (error) {
      // Before migration 0020 there is no such table. The calendar simply
      // shows no green chips rather than failing the whole board.
      if (/delivered_jobs|schema cache|does not exist/i.test(error.message))
        return NextResponse.json({ installed: false, from, to, jobs: [] });
      throw new Error(error.message);
    }

    return NextResponse.json({
      installed: true,
      from,
      to,
      days: RECENT_DAYS,
      jobs: (data || []).map((r) => ({
        id: String(r.id),
        tag: String(r.tag || "").trim(),
        on: r.delivered_on as string,
      })),
    });
  } catch (e) {
    return errJson(e);
  }
}
