import { NextResponse } from "next/server";
import { requireReader, errJson } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** 0020 has not been run yet — the workspace says so rather than erroring. */
const NOT_INSTALLED = /delivered_jobs|does not exist|schema cache/i;

/**
 * GET /api/delivered — the whole delivered ledger.
 *
 * Served in one payload rather than filtered server-side per period. The
 * ledger is one row per delivery for the life of the company, and the page
 * offers MTD/QTD/YTD/12-month/custom cuts over it — round-tripping on every
 * chip press would make the page feel broken for data that fits in memory
 * many times over. The row cap below is the backstop if that ever stops
 * being true.
 */
const MAX_ROWS = 20000;

export async function GET() {
  try {
    await requireReader();
    const db = supabaseServer();

    const { data, error } = await db
      .from("delivered_jobs")
      .select("id, tag, fam, cust, val, delivered_on, date_source, tdd, otd, proj, stat, own, tp, tpv, tpp")
      .order("delivered_on", { ascending: false, nullsFirst: false })
      .limit(MAX_ROWS);
    if (error) throw new Error(error.message);

    const rows = data || [];

    // When the report last landed, and which header the date was read from —
    // both belong on the page, because a dashboard whose source silently
    // stopped updating looks exactly like a quarter with no deliveries.
    let lastUpload: string | null = null;
    try {
      const { data: b } = await adminClient()
        .from("import_batches")
        .select("uploaded_at")
        .eq("kind", "delivered")
        .order("uploaded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      lastUpload = b?.uploaded_at ?? null;
    } catch {
      /* the stamp is context, never the point */
    }

    const dateSources = [...new Set(rows.map((r) => r.date_source).filter(Boolean))] as string[];

    return NextResponse.json({
      jobs: rows.map((r) => ({
        ...r,
        val: Number(r.val) || 0,
        tpv: Number(r.tpv) || 0,
        tpp: Number(r.tpp) || 0,
      })),
      lastUpload,
      dateSources,
      truncated: rows.length >= MAX_ROWS,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (NOT_INSTALLED.test(msg))
      return NextResponse.json({ error: "not_installed", message: msg }, { status: 503 });
    return errJson(e);
  }
}
