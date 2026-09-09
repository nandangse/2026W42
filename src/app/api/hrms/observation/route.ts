import { NextResponse } from "next/server";
import { requireHrms, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/hrms/observation?id=<run> — THE CHRO'S OBSERVATION
 * (Dr Raghu, 9 Sep 2026: "make a sheet called observation. This observation is
 * the CHRO observations which is the data analytics between the muster that is
 * uploaded in the finalised salary sheet and this one of the month.")
 *
 * TWO RECORDS OF THE SAME MONTH, PUT SIDE BY SIDE. The muster is what HR
 * declared and what the payroll paid. The ESSL export is what the machine at
 * the gate saw. Where they agree there is nothing to say; where they differ
 * there is either an error or a story, and only a person can tell which.
 *
 * SO IT ACCUSES NOBODY. Every line here is a QUESTION, not a finding. A man
 * with no punch may have been on a customer's site all week — which is the
 * whole reason /present exists — so "no biometric record" is reported as
 * exactly that and never as absence. The muster's own site mark (ST) is read
 * and those days are set apart, because counting them as unexplained would
 * bury the real ones under a hundred that are not.
 *
 * THE ONE FIGURE THAT MATTERS IS THE LAST: days paid as present with nothing
 * at the gate and no site mark to explain it. Everything else on this page is
 * context for reading that number.
 *
 * IT COMPUTES, IT DOES NOT STORE. Recomputing from the muster and the punches
 * costs a second and can never go stale; a saved observation would disagree
 * with its own sources the first time either was corrected.
 */
const S = (v: unknown) => String(v ?? "").trim();
const IST = "Asia/Kolkata";

/** The muster's vocabulary, as this house writes it. */
const PRESENT = new Set(["P", "ST", "C"]);          // at work: present, site, comp-off worked
const OFF = new Set(["WO", "H", "PH", "HO"]);       // not expected: weekly off, holiday
const SITE = new Set(["ST"]);                       // at work, but away from the gate

export async function GET(req: Request) {
  try {
    await requireHrms();
    const admin = adminClient();
    const id = S(new URL(req.url).searchParams.get("id"));
    if (!id) throw new HttpError(400, "Which run?");

    const { data: run } = await admin.from("hrms_salary_sheet")
      .select("id, month, year, status, muster").eq("id", id).maybeSingle();
    if (!run) throw new HttpError(404, "No such payroll run.");
    const muster = (run.muster ?? {}) as { days?: number; rows?: Record<string, unknown>[] };
    const rows = Array.isArray(muster.rows) ? muster.rows : [];
    if (!rows.length)
      return NextResponse.json({ ok: true, ready: false, why: "This run has no muster yet — upload it first and the observation writes itself." });

    const month = Number(run.month), year = Number(run.year);
    const days = Number(muster.days) || new Date(Date.UTC(year, month, 0)).getUTCDate();
    const iso = (d: number) => `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

    /* every ESSL punch of the month, paged — PostgREST truncates at 1,000
       silently and a truncated punch list would invent absences */
    const punches: { employee_id: string; for_date: string; at: string; kind: string }[] = [];
    for (let off = 0; ; off += 1000) {
      const { data, error } = await admin.from("hrms_attendance_punch")
        .select("employee_id, for_date, at, kind")
        .eq("source", "essl")
        .gte("for_date", iso(1)).lte("for_date", iso(days))
        .order("for_date").range(off, off + 999);
      if (error) {
        if (/does not exist|schema cache/i.test(error.message))
          return NextResponse.json({ ok: true, ready: false, why: "Run migration 0163 — the biometric punches have nowhere to live yet." });
        throw new Error(error.message);
      }
      if (!data?.length) break;
      punches.push(...data as typeof punches);
      if (data.length < 1000) break;
    }

    if (!punches.length)
      return NextResponse.json({
        ok: true, ready: false,
        why: `No ESSL punches are held for ${String(month).padStart(2, "0")}-${year}. Upload the biometric export on the Uploads tab — the observation is the comparison, so it needs both sides.`,
      });

    /* employee → day → { in, out } */
    const byMan = new Map<string, Map<string, { first: string; last: string; n: number }>>();
    for (const p of punches) {
      const m = byMan.get(p.employee_id) ?? new Map();
      const d = m.get(p.for_date) ?? { first: p.at, last: p.at, n: 0 };
      if (p.at < d.first) d.first = p.at;
      if (p.at > d.last) d.last = p.at;
      d.n++;
      m.set(p.for_date, d); byMan.set(p.employee_id, m);
    }
    const hhmm = (isoT: string) => new Date(isoT).toLocaleTimeString("en-IN", { timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: false });

    const people: Record<string, unknown>[] = [];
    let paidNoRecord = 0, absentButPunched = 0, siteDays = 0, matched = 0, shortDays = 0;
    const onMachine = new Set(punches.map((p) => p.employee_id));
    const inMuster = new Set<string>();

    for (const r of rows) {
      const emp = S(r.employee_id);
      if (!emp) continue;
      inMuster.add(emp);
      const marks = Array.isArray(r.days) ? (r.days as unknown[]).map(S) : [];
      const mine = byMan.get(emp);
      const flags: { day: string; mark: string; what: string; in?: string; out?: string; mins?: number }[] = [];
      let pDays = 0, seen = 0, site = 0;

      for (let d = 1; d <= days; d++) {
        const mark = S(marks[d - 1]).toUpperCase();
        if (!mark) continue;
        const date = iso(d);
        const rec = mine?.get(date);
        const isPresent = PRESENT.has(mark);
        if (isPresent) pDays++;
        if (SITE.has(mark)) site++;

        if (isPresent && rec) {
          seen++; matched++;
          const mins = Math.round((Date.parse(rec.last) - Date.parse(rec.first)) / 60000);
          if (rec.n > 1 && mins > 0 && mins < 240) {
            shortDays++;
            flags.push({ day: date, mark, what: "under four hours at the gate", in: hhmm(rec.first), out: hhmm(rec.last), mins });
          }
        } else if (isPresent && !rec) {
          if (SITE.has(mark)) { siteDays++; flags.push({ day: date, mark, what: "away on site — no gate record expected" }); }
          else { paidNoRecord++; flags.push({ day: date, mark, what: "paid present, nothing at the gate" }); }
        } else if (!isPresent && !OFF.has(mark) && rec) {
          absentButPunched++;
          flags.push({ day: date, mark, what: "marked absent, but the machine saw him", in: hhmm(rec.first), out: hhmm(rec.last) });
        } else if (OFF.has(mark) && rec) {
          flags.push({ day: date, mark, what: "came in on an off day", in: hhmm(rec.first), out: hhmm(rec.last) });
        }
      }

      const unexplained = flags.filter((f) => f.what.startsWith("paid present")).length;
      people.push({
        employee_id: emp, name: S(r.name) || S(r.employee_name) || emp,
        department: S(r.department), designation: S(r.designation), category: S(r.category),
        location: S(r.location),
        paid_present: pDays, seen_at_gate: seen, site_days: site,
        never_on_machine: !mine,
        unexplained, flags: flags.slice(0, 40), flag_count: flags.length,
      });
    }

    const strangers = [...onMachine].filter((e) => !inMuster.has(e));
    const neverSeen = people.filter((p) => p.never_on_machine);

    return NextResponse.json({
      ok: true, ready: true,
      month, year, days,
      totals: {
        people: people.length,
        punches: punches.length,
        on_machine: onMachine.size,
        matched, paid_no_record: paidNoRecord, absent_but_punched: absentButPunched,
        site_days: siteDays, short_days: shortDays,
        never_on_machine: neverSeen.length,
        not_in_muster: strangers.length,
      },
      not_in_muster: strangers.slice(0, 50),
      people: people.sort((a, b) => Number(b.unexplained) - Number(a.unexplained)),
    });
  } catch (e) { return errJson(e); }
}
