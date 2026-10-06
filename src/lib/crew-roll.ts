/**
 * THE NAMED CREW ROLLS FORWARD, AND THE COUNT FOLLOWS THE NAMES
 * (Dr Raghu, 6 Oct 2026).
 *
 *   "On the manpower plan, please make sure that you will move it to the
 *    next day. If there is no update on that, the same guy has to work on
 *    the same job for the next day. Keep moving that accordingly till the
 *    time it finishes. If this is not done, then the manpower count will come
 *    out wrong. Right now, whatever is manually written will slowly get
 *    overridden by this one."
 *
 * THE CARRY. Each working day, every job's names from the previous working
 * day are carried in — unless somebody has already put names on that job
 * for the day (that is an update), and never a man who is already on
 * another job that day (he has been moved). It stops when the job is
 * delivered, or when somebody empties the job: the carry reads only the day
 * immediately before, so an emptied day breaks the chain. Sundays and the
 * third Saturday are skipped, as the count rollover skips them. A day is
 * carried once (job_crew_roll, migration 0200), so opening the board twice
 * cannot refill a job somebody emptied.
 *
 * THE COUNT. On any day a job has names, its job_manpower row — the count
 * the labour cost is worked out from — is the names, counted: a man on two
 * jobs is half a man-day on each (his rule, 28 Sep). A name whose
 * designation maps to no trade counts as a helper, the cheapest trade, so
 * the cost is never overstated by a guess. Rows written this way carry
 * noted_by = names@genie; a job whose names are all taken off goes to zero.
 */
import { adminClient } from "@/lib/supabase/admin";
import { TRADES } from "@/lib/templates";
import { addDays, istToday } from "@/lib/fmt";
import { isWorkHoliday } from "@/lib/manpower-rollover";

export const CARRY_AUTHOR = "rollover@genie";
export const NAMES_AUTHOR = "names@genie";
const TRADE_KEYS = new Set<string>(TRADES.map((t) => t.key));
const zero = (): Record<string, number> => Object.fromEntries(TRADES.map((t) => [t.key, 0]));
const missing = (m: string) => /job_crew_roll|job_crew_person|schema cache|does not exist/i.test(m);

/** The working day before `day` — Monday's is Saturday, or Friday in a third-Saturday week. */
export function prevWorkingDay(day: string): string {
  let d = addDays(day, -1);
  for (let i = 0; i < 7 && isWorkHoliday(d); i++) d = addDays(d, -1);
  return d;
}

/** One day's names, counted per job and trade: a man on n jobs is 1/n on each. */
export function crewFromNames(names: { job_id: unknown; emp_id: unknown; trade: unknown }[]): Map<string, Record<string, number>> {
  const per = new Map<string, number>();
  for (const n of names) per.set(String(n.emp_id), (per.get(String(n.emp_id)) || 0) + 1);
  const crew = new Map<string, Record<string, number>>();
  for (const n of names) {
    const c = crew.get(String(n.job_id)) ?? crew.set(String(n.job_id), zero()).get(String(n.job_id))!;
    const t = TRADE_KEYS.has(String(n.trade)) ? String(n.trade) : "helper";
    c[t] = Math.round(((c[t] || 0) + 1 / (per.get(String(n.emp_id)) || 1)) * 100) / 100;
  }
  return crew;
}

/**
 * Re-derive job_manpower from the names for these days. Called after every
 * change of names, and by the daily carry for today and the planned days
 * ahead. Never touches a day with no names except to zero a count that was
 * itself derived from names that have since been taken off.
 */
export async function countsFromNames(days: string[]): Promise<number> {
  const admin = adminClient();
  let written = 0;
  for (const day of [...new Set(days)]) {
    const { data: names, error } = await admin.from("job_crew_person").select("job_id, emp_id, trade").eq("day", day);
    if (error) { if (missing(error.message)) return written; throw new Error(error.message); }
    const crew = crewFromNames(names || []);
    const { data: derived } = await admin.from("job_manpower").select("job_id").eq("day", day).eq("noted_by", NAMES_AUTHOR);
    const rows = [...crew.entries()].map(([job_id, c]) => ({ job_id, day, crew: c, noted_by: NAMES_AUTHOR, updated_at: new Date().toISOString() }));
    for (const d of derived || []) if (!crew.has(String(d.job_id)))
      rows.push({ job_id: String(d.job_id), day, crew: zero(), noted_by: NAMES_AUTHOR, updated_at: new Date().toISOString() });
    if (rows.length) {
      const { error: e2 } = await admin.from("job_manpower").upsert(rows, { onConflict: "job_id,day" });
      if (e2) throw new Error(e2.message);
      written += rows.length;
    }
  }
  return written;
}

/**
 * Carry the names into every working day not yet carried, up to today (at
 * most ten days back, so a board left alone for a month restarts near today
 * rather than inventing four weeks). Then today's and the coming week's
 * counts are taken from the names. Cheap when there is nothing to do.
 */
export async function ensureCrewRollover(): Promise<{ days: string[]; carried: number; counted: number; installed: boolean }> {
  const admin = adminClient();
  const T = istToday();
  const { data: last, error } = await admin.from("job_crew_roll").select("day").order("day", { ascending: false }).limit(1);
  if (error) { if (missing(error.message)) return { days: [], carried: 0, counted: 0, installed: false }; throw new Error(error.message); }
  const lastDay = last?.[0]?.day ? String(last[0].day).slice(0, 10) : null;
  if (lastDay && lastDay >= T) return { days: [], carried: 0, counted: 0, installed: true };

  let start = lastDay ? addDays(lastDay, 1) : T;
  if (start < addDays(T, -9)) start = addDays(T, -9);

  const done: string[] = [];
  let carried = 0;
  for (let day = start; day <= T; day = addDays(day, 1)) {
    let n = 0;
    if (!isWorkHoliday(day)) {
      const prev = prevWorkingDay(day);
      const [src, here] = await Promise.all([
        admin.from("job_crew_person").select("job_id, emp_id, emp_name, trade, note").eq("day", prev),
        admin.from("job_crew_person").select("job_id, emp_id").eq("day", day),
      ]);
      if (src.error) throw new Error(src.error.message);
      if (here.error) throw new Error(here.error.message);
      const jobsHere = new Set((here.data || []).map((r) => String(r.job_id)));
      const busy = new Set((here.data || []).map((r) => String(r.emp_id)));
      /* only jobs still being built */
      const ids = [...new Set((src.data || []).map((r) => String(r.job_id)))];
      const live = new Set<string>();
      for (let i = 0; i < ids.length; i += 300) {
        const { data: js } = await admin.from("jobs").select("id, delivered, active").in("id", ids.slice(i, i + 300));
        for (const j of js || []) if (!j.delivered && j.active !== false) live.add(String(j.id));
      }
      const rows = (src.data || [])
        .filter((r) => live.has(String(r.job_id)) && !jobsHere.has(String(r.job_id)) && !busy.has(String(r.emp_id)))
        .map((r) => ({ job_id: r.job_id, day, emp_id: r.emp_id, emp_name: r.emp_name, trade: r.trade, note: r.note, noted_by: CARRY_AUTHOR, updated_at: new Date().toISOString() }));
      if (rows.length) {
        const { error: e2 } = await admin.from("job_crew_person").upsert(rows, { onConflict: "job_id,day,emp_id", ignoreDuplicates: true });
        if (e2) throw new Error(e2.message);
        n = rows.length;
      }
    }
    await admin.from("job_crew_roll").upsert({ day, carried: n, at: new Date().toISOString() }, { onConflict: "day" });
    carried += n;
    done.push(day);
  }

  /* today and the planned days ahead: the count is the names */
  const ahead: string[] = [];
  for (let i = 0; i <= 8; i++) ahead.push(addDays(T, i));
  const counted = await countsFromNames([...done, ...ahead]);
  return { days: done, carried, counted, installed: true };
}
