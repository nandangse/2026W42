import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { swallow } from "@/lib/swallow";
import { requireReader, requireUser, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { today } from "@/lib/schedule";
import { TRADES } from "@/lib/templates";
import { ensureManpowerRollover, istToday } from "@/lib/manpower-rollover";
import { ensureCrewRollover, crewFromNames } from "@/lib/crew-roll";

export const dynamic = "force-dynamic";

/**
 * The day-wise work study — who is actually standing at each job.
 *
 * GET ?day=YYYY-MM-DD          — every job's crew for that day (default today)
 * GET ?job_id=...&days=30      — one job's last N days, for the study
 * POST { job_id, crew, day? }  — record today's reality for one job
 *
 * Anyone signed in may read; anyone who can write the board may record.
 * Every row keeps who noted it, because a claim about manpower is exactly
 * the kind of claim somebody later asks "says who?" about.
 */
export async function GET(req: Request) {
  try {
    await requireReader();
    const admin = adminClient();
    const url = new URL(req.url);
    const jobId = url.searchParams.get("job_id");

    if (jobId) {
      const days = Math.min(120, Math.max(1, Number(url.searchParams.get("days")) || 30));
      const from = new Date(today() + "T00:00:00");
      from.setDate(from.getDate() - days);
      const { data, error } = await admin
        .from("job_manpower").select("day, crew, noted_by, updated_at")
        .eq("job_id", jobId).gte("day", from.toISOString().slice(0, 10))
        .order("day", { ascending: false });
      if (error) {
        if (/job_manpower|schema cache|does not exist/i.test(error.message))
          return NextResponse.json({ rows: [], needsMigration: true });
        throw new Error(error.message);
      }
      return NextResponse.json({ rows: data || [] });
    }

    /**
     * A WINDOW OF DAYS, for the week grid (Dr Raghu, 28 Sep 2026:
     * "workforce planning ... next column YESTERDAY, then TODAY and date,
     * then the next 7 days").
     *
     * One read for the whole window rather than nine reads a day apart: a
     * grid that fetches per column flickers in nine steps and asks the
     * database nine questions it could have asked once.
     */
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (from && to) {
      /* Today is inside the window, so the rollover still gets its chance to
         heal a missed night before anybody reads it. */
      if (from <= istToday() && istToday() <= to) {
        try { await ensureManpowerRollover(); await ensureCrewRollover(); } catch (e) { swallow("on-floor/manpower", e); }
      }
      const { data, error } = await admin
        .from("job_manpower").select("job_id, day, crew, noted_by, updated_at")
        .gte("day", from).lte("day", to);
      if (error) {
        if (/job_manpower|schema cache|does not exist/i.test(error.message))
          return NextResponse.json({ rows: [], needsMigration: true });
        throw new Error(error.message);
      }
      return NextResponse.json({ rows: data || [] });
    }

    const day = url.searchParams.get("day") || istToday();
    // Reading today's ledger is also what heals it: if the 4 AM cron slept,
    // the missing days fill themselves in — back-dated correctly — the first
    // time anyone looks. Cheap when there is nothing to do.
    if (day === istToday()) {
      try { await ensureManpowerRollover(); await ensureCrewRollover(); } catch (e) { swallow("on-floor/manpower", e); /* read still answers */ }
    }
    const { data, error } = await admin
      .from("job_manpower").select("job_id, day, crew, noted_by, updated_at").eq("day", day);
    if (error) {
      if (/job_manpower|schema cache|does not exist/i.test(error.message))
        return NextResponse.json({ rows: [], needsMigration: true });
      throw new Error(error.message);
    }
    /* THE ASSIGNMENT, BY JOB (Dr Raghu, 15 Oct 2026: "in this manpower now start merging the
       numbers from the manpower assignment") — the names on the Manpower Plan for the day, as
       trade counts, with the names, so the card can show the assignment beside the stage plan */
    const assigned: Record<string, { crew: Record<string, number>; names: string[] }> = {};
    try {
      const { data: names } = await admin.from("job_crew_person").select("job_id, emp_id, emp_name, trade, noted_by").eq("day", day);
      const crew = crewFromNames(names || []);
      for (const [job, c] of crew.entries()) assigned[job] = { crew: c, names: (names || []).filter((n) => String(n.job_id) === job).map((n) => `${String(n.emp_name || n.emp_id)} · ${String(n.trade)}${String(n.noted_by) === "rollover@genie" ? " ↻" : ""}`) };
    } catch { /* before 0171 — no names */ }
    return NextResponse.json({ rows: data || [], assigned });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const admin = adminClient();
    const body = await readBody(req, {});
    const jobId = String(body.job_id || "");
    if (!jobId) throw new HttpError(400, "Which job?");
    const day = String(body.day || today()).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpError(400, "Which day?");

    // only the six trades, only whole small numbers — a typo of 200 fitters
    // must not become a fact in the study
    const crew: Record<string, number> = {};
    for (const t of TRADES) {
      const n = Math.round(Number((body.crew || {})[t.key]) || 0);
      if (n < 0 || n > 99) throw new HttpError(400, `${t.label}: ${n} is not a crew size.`);
      crew[t.key] = n;
    }

    /* WHERE THERE ARE NAMES, THE NAMES ARE THE COUNT (Dr Raghu, 6 Oct 2026:
       "whatever is manually written will slowly get overridden by this one").
       A typed count beside them would be overwritten at the next change of
       names, so it is refused with the reason, not silently lost later. */
    const { data: named, error: nerr } = await admin.from("job_crew_person").select("emp_name").eq("job_id", jobId).eq("day", day);
    if (!nerr && (named || []).length)
      throw new HttpError(409, `This job has ${named!.length} name${named!.length === 1 ? "" : "s"} on the Manpower Plan for ${day} — the count comes from them. Change the names there.`);

    const { error } = await admin.from("job_manpower").upsert({
      job_id: jobId, day, crew,
      noted_by: user.email, updated_at: new Date().toISOString(),
    }, { onConflict: "job_id,day" });
    if (error) {
      if (/job_manpower|schema cache|does not exist/i.test(error.message))
        throw new HttpError(503, "Run migration 0071 first — the work study has nowhere to live yet.");
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true, crew });
  } catch (e) {
    return errJson(e);
  }
}
