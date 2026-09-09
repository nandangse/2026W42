import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { requireReader, requireUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { today } from "@/lib/schedule";

export const dynamic = "force-dynamic";

/**
 * THE JOBS THAT WENT OUT WITHOUT A DATE.
 *
 * Dr Raghu, 9 Sep 2026: "September 2 more jobs got delivered!!!"
 *
 * They had. Both 8 BRD jobs left the ERP's in-process list at 13:02 that
 * afternoon and Genie archived them within the minute — the sync was
 * working perfectly. But the ERP carries NO actual_delivery_date for
 * either, and the delivered ledger is keyed on that date. So the two jobs
 * fell into the gap between the two lists: no longer pending, not yet
 * delivered. Invisible.
 *
 * This is not a rare corner. 1,491 of the ERP's 2,717 delivered jobs carry
 * no date at all — it is the ERP's normal state, not an exception, and the
 * sync already refuses to write those blanks over dates Genie holds.
 *
 * GET  — which jobs are in that gap, newest first.
 * POST { job_id, on } — say when it went. The row is banked into the ledger
 *        with date_source naming the person, so a date typed here is never
 *        mistaken for one the ERP gave. The sync's rule that a blank from
 *        the ERP may not un-date a banked row is what keeps it there.
 *
 * IT DOES NOT WRITE TO THE ERP. Genie recording what it knows is one thing;
 * reaching into the ERP and stamping a delivery date on somebody else's
 * document is another, and nobody has asked for that.
 */

/** The ledger's own columns, so a banked row looks like every other one. */
const LEDGER_COLS = "id, tag, fam, cust, val, tdd, otd, start_date, proj, stat, pct, own, tp, tpv, tpp, kit";

export async function GET() {
  try {
    await requireReader();
    const db = adminClient();

    // Left the board, and the ERP never said when.
    const { data: gone, error } = await db.from("jobs")
      .select(`${LEDGER_COLS}, archived_at, delivered, delivered_on`)
      .eq("active", false)
      .is("delivered_on", null)
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false })
      .limit(200);
    if (error) throw new HttpError(500, error.message);

    const ids = (gone || []).map((r) => String(r.id));
    if (!ids.length) return NextResponse.json({ jobs: [] });

    // Some of them are already in the ledger under a date banked earlier.
    const { data: banked } = await db.from("delivered_jobs").select("id").in("id", ids);
    const have = new Set((banked || []).map((r) => String(r.id)));

    return NextResponse.json({
      jobs: (gone || [])
        .filter((r) => !have.has(String(r.id)))
        .map((r) => ({
          id: String(r.id),
          tag: String(r.tag || "").trim(),
          cust: String(r.cust || "").trim(),
          val: Number(r.val) || 0,
          tpv: Number(r.tpv) || 0,
          tdd: r.tdd as string | null,
          left_on: String(r.archived_at).slice(0, 10),
        })),
    });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const u = await requireUser();
    /* The people who run the board. Reading is open; saying a job went out
       is a statement of fact about production and carries a name. */
    if (!(u.isOwner || u.stratcom || ["admin", "planner", "project_owner"].includes(String(u.role))))
      throw new HttpError(403, "Marking a delivery is for the planners and Stratcom.");

    const body = await readBody(req, {});
    const jobId = String(body.job_id || "").trim();
    const on = String(body.on || "").trim();
    if (!jobId) throw new HttpError(400, "Which job?");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) throw new HttpError(400, "A date, as YYYY-MM-DD.");
    if (on > today()) throw new HttpError(400, "That is in the future. A delivery is recorded after it happens.");

    const db = adminClient();
    const { data: job, error } = await db.from("jobs")
      .select(`${LEDGER_COLS}, active`).eq("id", jobId).maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!job) throw new HttpError(404, "No such job.");

    const { active: _active, ...ledger } = job as Record<string, unknown>;
    const { error: ue } = await db.from("delivered_jobs").upsert({
      ...ledger,
      delivered_on: on,
      /* Named, so nobody later reads this as the ERP's own record. */
      date_source: `set in Genie by ${u.displayName || u.email}`,
    }, { onConflict: "id" });
    if (ue) throw new HttpError(500, ue.message);

    // The jobmaster tells the truth about its own row, per migration 0020.
    await db.from("jobs").update({
      delivered: true, delivered_on: on, active: false,
    }).eq("id", jobId);

    return NextResponse.json({ ok: true, id: jobId, on });
  } catch (e) { return errJson(e); }
}
