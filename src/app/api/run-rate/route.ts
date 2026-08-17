import { NextResponse } from "next/server";
import { requireReader, requireOwner, errJson, RAGHU_EMAIL } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { fyStart, fyLabel, throughputOf } from "@/lib/delivered";
import { fyEnd } from "@/lib/run-rate";
import { today } from "@/lib/schedule";

export const dynamic = "force-dynamic";

/** Either 0025 or 0020 has not been run yet. Neither is an error worth a 500. */
const NOT_INSTALLED = /fy_targets|delivered_jobs|does not exist|schema cache/i;

/**
 * PostgREST caps a response at 1000 rows and IGNORES a larger .limit(). A
 * financial year of deliveries fits inside that today and will not forever;
 * paging now costs one extra round trip in the year it stops fitting, and
 * costs a silently understated target percentage if it is left out.
 */
const PAGE = 1000;
const MAX_ROWS = 20000;

/**
 * GET /api/run-rate — the targets, and what has actually been billed against
 * them this financial year.
 *
 * Computed server-side rather than in each page for one reason: the card
 * appears on both the Job Delivery Board and Delivered Jobs, and two copies of
 * this arithmetic is two copies to disagree. The Delivery Board also holds
 * only the live pending snapshot, so it has no way to answer "what have we
 * billed" on its own.
 *
 * NOTE the two sources: the TARGET is what we said we would do (fy_targets);
 * the ACTUAL is what went out of the door (delivered_jobs). Pending jobs sitting
 * on the board are neither — a job is billed when it is delivered, not when it
 * is promised.
 */
export async function GET() {
  try {
    const user = await requireReader();
    const db = supabaseServer();
    const on = today();
    const fy = fyLabel(on);
    const from = fyStart(on);
    const to = on;

    // ---- the target ----
    const { data: t, error: tErr } = await db
      .from("fy_targets")
      .select("sales_target,throughput_target,updated_at,updated_by")
      .eq("fy", fy)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);

    // ---- what has been billed against it ----
    const rows: { val: number | null; tp: number | null; tpv: number | null }[] = [];
    for (let off = 0; off < MAX_ROWS; off += PAGE) {
      const { data, error } = await db
        .from("delivered_jobs")
        .select("val,tp,tpv")
        .gte("delivered_on", from)
        .lte("delivered_on", to)
        .order("id", { ascending: true })
        .range(off, off + PAGE - 1);
      if (error) throw new Error(error.message);
      rows.push(...((data || []) as typeof rows));
      if (!data || data.length < PAGE) break;
    }

    const actuals = rows.reduce(
      (a, r) => ({
        sales: a.sales + (Number(r.val) || 0),
        throughput: a.throughput + throughputOf({ tp: Number(r.tp) || 0, tpv: Number(r.tpv) || 0 }),
      }),
      { sales: 0, throughput: 0 },
    );

    // A delivery banked without a date cannot be placed in a financial year,
    // so it is missing from `actuals` — and a target percentage that is quietly
    // short is worse than one that says why. Counted, never guessed at.
    let undated = 0;
    try {
      const { count } = await db
        .from("delivered_jobs")
        .select("id", { count: "exact", head: true })
        .is("delivered_on", null);
      undated = count ?? 0;
    } catch {
      /* the caveat is context, never the point */
    }

    // Who last set the target — a target with no author invites "says who?".
    let updatedBy: string | null = null;
    if (t?.updated_by) {
      const { data: p } = await adminClient()
        .from("profiles")
        .select("display_name,email")
        .eq("id", t.updated_by)
        .maybeSingle();
      updatedBy = p?.display_name || p?.email || null;
    }

    return NextResponse.json({
      installed: true,
      fy,
      from,
      to,
      end: fyEnd(on),
      // No row for this FY is a real state, not an error: on 1 April the year
      // rolls over and nobody has set a target yet. The card says so.
      hasTarget: !!t,
      targets: {
        sales: Number(t?.sales_target) || 0,
        throughput: Number(t?.throughput_target) || 0,
      },
      actuals,
      undated,
      deliveries: rows.length,
      updatedAt: t?.updated_at ?? null,
      updatedBy,
      /** Only the owner may edit. Everyone else sees the targets as fixed. */
      editable: user.isOwner,
      ownerEmail: RAGHU_EMAIL,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // A missing table means the migration has not been pasted yet. The card
    // hides itself rather than pushing an error onto two working pages.
    if (NOT_INSTALLED.test(msg))
      return NextResponse.json({ installed: false, message: msg });
    return errJson(e);
  }
}

/**
 * POST /api/run-rate — set this financial year's targets. Owner only.
 * { sales_target, throughput_target, fy? } in rupees.
 */
export async function POST(req: Request) {
  try {
    const user = await requireOwner();
    const body = await req.json();
    const fy = String(body.fy || fyLabel(today())).trim();
    if (!/^FY\d{4}-\d{2}$/.test(fy))
      return NextResponse.json({ error: `"${fy}" is not a financial year, e.g. FY2026-27` }, { status: 400 });

    const num = (v: unknown, name: string): number => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a number of rupees, zero or more`);
      return n;
    };
    const sales_target = num(body.sales_target, "Sales target");
    const throughput_target = num(body.throughput_target, "Throughput target");

    const { error } = await adminClient()
      .from("fy_targets")
      .upsert(
        { fy, sales_target, throughput_target, updated_at: new Date().toISOString(), updated_by: user.id },
        { onConflict: "fy" },
      );
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, fy, sales_target, throughput_target });
  } catch (e) {
    return errJson(e);
  }
}
