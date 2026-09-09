import { NextResponse } from "next/server";
import { requireReader, errJson, currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { fyStart, fyLabel, throughputOf } from "@/lib/delivered";
import { fyEnd } from "@/lib/run-rate";
import { today } from "@/lib/schedule";
import { monthKey } from "@/lib/fmt";

export const dynamic = "force-dynamic";

/** Either 0020 or 0103 has not been run. Neither is worth a 500. */
const NOT_INSTALLED = /delivered_jobs|plan_belief|does not exist|schema cache/i;

/** PostgREST caps a read at 1000 rows and ignores a bigger .limit(). */
const PAGE = 1000;
const MAX_ROWS = 20000;

/**
 * GET /api/board-year — the two things THE YEAR panel on the Job Delivery
 * Board cannot work out for itself.
 *
 *   WHAT WENT OUT, month by month. The board holds only the pending
 *   snapshot; a job leaves it the day it is delivered, so the board can
 *   never answer "how many did we actually ship in July" from its own list.
 *
 *   WHOSE CONFIDENCE. plan_belief is one row per job PER PLANNER — the
 *   Month & Qtr Plan lets each of them state a belief from 0 to 100 on the
 *   jobs in their window. Which is exactly what the confidence panel needs,
 *   and it belongs to a named person rather than to the system.
 *
 * Everything else the panel shows — jobs, value, throughput per month — is
 * computed on the client from the SAME filtered job list the rest of the
 * board is showing, so the owner filter and the search box carry into it.
 * An analytics panel that quietly ignores the filter above it is how two
 * people end up quoting different numbers off one screen.
 *
 * A BELIEF THAT WAS NEVER STATED IS NOT 100. The month-plan route defaults a
 * missing belief to 100 when it totals a signer's own window, which is fair
 * there — the signer has looked at every row. Here it would be a lie: most
 * of the 114 pending jobs have never been in anybody's month window. Jobs
 * with no row come back absent, and the panel counts them as "not yet
 * called" rather than as certainties.
 */
export async function GET() {
  try {
    await requireReader();
    const u = await currentUser();
    /** The money in the DELIVERED half — the same gate Delivered Jobs uses. */
    const money = !!(u && (u.isOwner || u.lc || u.stratcom));

    const to = today();
    const from = fyStart(to);
    const end = fyEnd(to);
    const db = adminClient();

    // ---- what went out, month by month --------------------------------
    const months: Record<string, { jobs: number; value: number; tp: number }> = {};
    let deliveredInstalled = true;
    for (let off = 0; off < MAX_ROWS; off += PAGE) {
      const { data, error } = await db
        .from("delivered_jobs")
        .select("delivered_on, val, tp, tpv")
        .gte("delivered_on", from)
        .lte("delivered_on", to)
        .order("delivered_on", { ascending: true })
        .range(off, off + PAGE - 1);
      if (error) {
        if (NOT_INSTALLED.test(error.message)) { deliveredInstalled = false; break; }
        throw new Error(error.message);
      }
      for (const r of data || []) {
        const k = monthKey(String(r.delivered_on));
        const m = (months[k] ||= { jobs: 0, value: 0, tp: 0 });
        m.jobs += 1;
        m.value += Number(r.val) || 0;
        m.tp += throughputOf(r as { tp: number; tpv: number });
      }
      if (!data || data.length < PAGE) break;
    }
    if (!money) for (const k of Object.keys(months)) { months[k].value = 0; months[k].tp = 0; }

    // ---- whose confidence ---------------------------------------------
    /** job_id → email → belief 0..100. */
    const beliefs: Record<string, Record<string, number>> = {};
    const counted: Record<string, number> = {};
    let beliefsInstalled = true;
    for (let off = 0; off < MAX_ROWS; off += PAGE) {
      const { data, error } = await db
        .from("plan_belief")
        .select("job_id, by_email, belief_pct")
        .range(off, off + PAGE - 1);
      if (error) {
        if (NOT_INSTALLED.test(error.message)) { beliefsInstalled = false; break; }
        throw new Error(error.message);
      }
      for (const r of data || []) {
        const e = String(r.by_email || "").toLowerCase();
        const j = String(r.job_id || "");
        if (!e || !j) continue;
        (beliefs[j] ||= {})[e] = Number(r.belief_pct) || 0;
        counted[e] = (counted[e] || 0) + 1;
      }
      if (!data || data.length < PAGE) break;
    }

    // Name the planners. An e-mail address is not a person on a screen the
    // whole works reads.
    const emails = Object.keys(counted);
    const names: Record<string, string> = {};
    if (emails.length) {
      const { data: profs } = await db
        .from("profiles").select("email, display_name").in("email", emails);
      for (const p of profs || [])
        names[String(p.email).toLowerCase()] = String(p.display_name || "").trim();
    }

    return NextResponse.json({
      installed: deliveredInstalled || beliefsInstalled,
      fy: fyLabel(to),
      from, to, end,
      money,
      delivered: months,
      beliefs,
      planners: emails
        .map((e) => ({ email: e, name: names[e] || e.split("@")[0], jobs: counted[e] }))
        .sort((a, b) => b.jobs - a.jobs),
    });
  } catch (e) {
    return errJson(e);
  }
}
