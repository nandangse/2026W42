import { NextResponse } from "next/server";
import { requireLC, errJson } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { today } from "@/lib/schedule";
import { fyStart } from "@/lib/delivered";

export const dynamic = "force-dynamic";

/**
 * GET /api/delivered-summary — what actually went out this financial year,
 * one row per delivery.
 *
 * WHY THIS EXISTS AT ALL. The delivery picture was totalling deliveries off
 * the JOB BOARD, which holds the jobs still being built and only those
 * delivered ones that still carry a plan. It reported ₹6.52 Cr against a
 * true ₹24.38 Cr — a quarter of the year's work, in a picture meant to be
 * sent to people. The board was never the place to ask.
 *
 * `delivered_jobs` is. It is the same table the year report reads, so the
 * picture and the report cannot disagree.
 *
 * THE THROUGHPUT COLUMN IS `tp`, NOT `tpv`. tpv stands at ₹0.31 Cr across
 * all eighty-one deliveries and tp at ₹11.73 Cr, which is the figure the
 * report prints. Reading the wrong one of two similarly named columns is
 * how a number comes out thirty times too small and still looks like money.
 */
export async function GET() {
  try {
    await requireLC();
    const on = today();
    const { data, error } = await adminClient()
      .from("delivered_jobs")
      .select("delivered_on, val, tp")
      .gte("delivered_on", fyStart(on))
      .lte("delivered_on", on)
      .limit(1000);
    if (error) throw new Error(error.message);
    return NextResponse.json({
      on,
      rows: (data || []).map((r) => ({
        on: String(r.delivered_on),
        val: Number(r.val) || 0,
        tp: Number(r.tp) || 0,
      })),
    });
  } catch (e) {
    return errJson(e);
  }
}
