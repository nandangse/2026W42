import { NextResponse } from "next/server";
import { requireReader, requireUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { tradeOf, type Person } from "@/lib/manpower-plan";
import { TRADES } from "@/lib/templates";
import { swallow } from "@/lib/swallow";
import { ensureManpowerRollover } from "@/lib/manpower-rollover";
import { countsFromNames, ensureCrewRollover } from "@/lib/crew-roll";

export const dynamic = "force-dynamic";

const NOT_INSTALLED = /job_crew_person|job_day_note|schema cache|does not exist/i;
const S = (v: unknown, max = 400) => String(v ?? "").slice(0, max);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * MANPOWER PLANNING — who is on which job, day by day.
 *
 * GET  ?from=&to=   every assignment in the window, the day notes, and the
 *                   list of people who may be assigned
 * POST assign       one person onto one job on one day
 * POST unassign     take them off
 * POST move         the drag: off one cell and onto another in one act
 * POST copy_day     a whole day's assignments forward to the next day
 * POST carry_cell   one job's crew forward to the next day
 * POST note         what happened on a job on a day
 *
 * MOVE IS ONE ACTION, NOT TWO. A drag that deleted and then inserted would,
 * on a dropped connection, leave a person assigned nowhere — and the person
 * who dragged them would have watched it work.
 */
export async function GET(req: Request) {
  try {
    await requireReader();
    const db = adminClient();
    const u = new URL(req.url);
    const from = S(u.searchParams.get("from"), 10);
    const to = S(u.searchParams.get("to"), 10);
    if (!DAY.test(from) || !DAY.test(to)) throw new HttpError(400, "from and to, as YYYY-MM-DD");

    /* The people first: the board is unusable without them, and it is the
       one read that cannot fail on a missing migration. */
    const { data: emp, error: ee } = await db
      .from("hrms_employees")
      .select("id, name, designation, department, active")
      .eq("active", true)
      .order("name");
    if (ee) throw new Error(ee.message);
    const people: Person[] = (emp || []).map((e) => ({
      id: String(e.id),
      name: String(e.name || ""),
      designation: (e.designation as string) || null,
      department: (e.department as string) || null,
      trade: tradeOf(e.designation as string),
    }));

    /* the board heals itself when it is opened: a night the cron slept is
       carried in, back-dated, before anybody reads it */
    try { await ensureManpowerRollover(); await ensureCrewRollover(); } catch (e) { swallow("manpower-plan/roll", e); }

    const [aRes, nRes] = await Promise.all([
      db.from("job_crew_person").select("id, job_id, day, emp_id, emp_name, trade, note, noted_by").gte("day", from).lte("day", to),
      db.from("job_day_note").select("job_id, day, text, noted_by, updated_at").gte("day", from).lte("day", to),
    ]);
    if (aRes.error && !NOT_INSTALLED.test(aRes.error.message)) throw new Error(aRes.error.message);
    if (nRes.error && !NOT_INSTALLED.test(nRes.error.message)) throw new Error(nRes.error.message);

    return NextResponse.json({
      installed: !aRes.error,
      people,
      trades: TRADES,
      assignments: (aRes.data || []).map((a) => ({ ...a, day: String(a.day).slice(0, 10) })),
      notes: (nRes.data || []).map((n) => ({ ...n, day: String(n.day).slice(0, 10) })),
    });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const db = adminClient();
    const body = await readBody(req, {});
    const action = S(body.action, 30);
    const fail = (m: string) => { throw new HttpError(503, NOT_INSTALLED.test(m) ? "Run migration 0171 first — manpower planning has nowhere to live yet." : m); };

    if (action === "assign" || action === "move") {
      const job = S(body.job_id, 64), day = S(body.day, 10);
      if (!job || !DAY.test(day)) throw new HttpError(400, "job_id and day");
      const empId = S(body.emp_id, 64);
      const name = S(body.emp_name, 120);
      if (!empId || !name) throw new HttpError(400, "Which person?");
      const trade = S(body.trade, 30) || null;
      /* The drag: the old place is cleared in the same request that fills the
         new one, so a dropped connection cannot lose somebody. */
      if (action === "move") {
        const fromJob = S(body.from_job, 64), fromDay = S(body.from_day, 10);
        if (fromJob && DAY.test(fromDay)) {
          const { error } = await db.from("job_crew_person").delete()
            .eq("job_id", fromJob).eq("day", fromDay).eq("emp_id", empId);
          if (error) fail(error.message);
        }
      }
      const { error } = await db.from("job_crew_person").upsert({
        job_id: job, day, emp_id: empId, emp_name: name, trade,
        note: body.note === undefined ? null : S(body.note, 400),
        noted_by: user.email, updated_at: new Date().toISOString(),
      }, { onConflict: "job_id,day,emp_id" });
      if (error) fail(error.message);
      await countsFromNames(action === "move" && DAY.test(S(body.from_day, 10)) ? [day, S(body.from_day, 10)] : [day]);
      return NextResponse.json({ ok: true });
    }

    if (action === "unassign") {
      const { error } = await db.from("job_crew_person").delete()
        .eq("job_id", S(body.job_id, 64)).eq("day", S(body.day, 10)).eq("emp_id", S(body.emp_id, 64));
      if (error) fail(error.message);
      if (DAY.test(S(body.day, 10))) await countsFromNames([S(body.day, 10)]);
      return NextResponse.json({ ok: true });
    }

    /**
     * COPY A WHOLE DAY FORWARD, or one job's crew forward.
     *
     * Most days are yesterday repeated, and a plan that has to be retyped
     * every morning is a plan that stops being kept by Wednesday.
     *
     * IT ADDS, IT DOES NOT REPLACE. Somebody who has already put two men on
     * tomorrow must not lose them because a colleague pressed copy — the
     * upsert leaves what is there and fills what is not.
     */
    if (action === "copy_day" || action === "carry_cell") {
      const day = S(body.day, 10), to = S(body.to_day, 10);
      if (!DAY.test(day) || !DAY.test(to)) throw new HttpError(400, "day and to_day");
      let q = db.from("job_crew_person").select("job_id, emp_id, emp_name, trade, note").eq("day", day);
      if (action === "carry_cell") q = q.eq("job_id", S(body.job_id, 64));
      const { data, error } = await q;
      if (error) fail(error.message);
      const rows = (data || []).map((r) => ({
        job_id: r.job_id, day: to, emp_id: r.emp_id, emp_name: r.emp_name, trade: r.trade, note: r.note,
        noted_by: user.email, updated_at: new Date().toISOString(),
      }));
      if (!rows.length) return NextResponse.json({ ok: true, copied: 0, note: "There was nothing on that day to carry." });
      const { error: e2 } = await db.from("job_crew_person").upsert(rows, { onConflict: "job_id,day,emp_id" });
      if (e2) fail(e2.message);
      await countsFromNames([to]);
      return NextResponse.json({ ok: true, copied: rows.length });
    }

    if (action === "note") {
      const job = S(body.job_id, 64), day = S(body.day, 10);
      if (!job || !DAY.test(day)) throw new HttpError(400, "job_id and day");
      const { error } = await db.from("job_day_note").upsert({
        job_id: job, day, text: S(body.text, 4000),
        noted_by: user.email, updated_at: new Date().toISOString(),
      }, { onConflict: "job_id,day" });
      if (error) fail(error.message);
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, `Unknown action "${action}"`);
  } catch (e) { return errJson(e); }
}
