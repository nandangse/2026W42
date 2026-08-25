/**
 * THE MANPOWER ROLLOVER (Dr Raghu, 25 Aug 2026).
 *
 * Today's allocation defaults to yesterday's, written as REAL ROWS in
 * job_manpower so the ledger has no gaps and labour cost can be computed:
 *
 *   - carry from the LAST WORKING DAY: Monday carries Saturday, and on a
 *     third-Saturday week Monday carries Friday
 *   - holidays (every Sunday, the third Saturday) get a ZERO row — work on
 *     a holiday is the exception, so it must be typed, never assumed
 *   - only jobs ticked On Floor and not delivered roll; unticking a job
 *     zeroes that day's row and stops the rolling
 *
 * Rows written here carry noted_by = 'rollover@genie', which is what
 * separates "the floor said 5 fitters" from "Genie assumed 5 fitters".
 * A carried zero row is never used as a carry source, so a real Saturday
 * crew survives across a zero Sunday into Monday.
 *
 * Runs from the 4 AM cron, and again lazily whenever today's ledger is
 * read — so a morning when the cron slept still fills itself in, correctly
 * back-dated, the first time anyone looks.
 */
import { adminClient } from "@/lib/supabase/admin";
import { TRADES } from "@/lib/templates";

export const ROLLOVER_AUTHOR = "rollover@genie";

/** The factory's date, whatever timezone the server wakes up in. */
export function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

const addDays = (iso: string, n: number): string =>
  new Date(new Date(iso + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);

/** Sundays always; Saturdays only the third one — twelve days a year. */
export function isWorkHoliday(iso: string): boolean {
  const d = new Date(iso + "T00:00:00Z");
  const dow = d.getUTCDay();
  if (dow === 0) return true;
  return dow === 6 && d.getUTCDate() >= 15 && d.getUTCDate() <= 21;
}

type CrewMap = Record<string, number>;
type Row = { day: string; crew: CrewMap; noted_by: string | null };

const zero = (): CrewMap => Object.fromEntries(TRADES.map((t) => [t.key, 0]));
const totalOf = (c: CrewMap): number => TRADES.reduce((n, t) => n + (Number(c?.[t.key]) || 0), 0);

/** The crew day D should inherit: the latest earlier row that is not a
 *  Genie-written zero. A HUMAN zero (recorded or untick) does carry — an
 *  empty floor somebody confirmed is a fact, not an assumption. */
function carrySource(history: Row[], before: string): CrewMap {
  for (let i = history.length - 1; i >= 0; i--) {
    const r = history[i];
    if (r.day >= before) continue;
    if (r.noted_by === ROLLOVER_AUTHOR && totalOf(r.crew) === 0) continue;
    return { ...zero(), ...r.crew };
  }
  return zero();
}

/**
 * Fill every missing day up to today for every rolling job. Idempotent and
 * cheap when there is nothing to do; never overwrites a row that exists.
 */
export async function ensureManpowerRollover(): Promise<{ filledDays: string[]; rowsWritten: number }> {
  const admin = adminClient();
  const T = istToday();

  const { data: maxRow } = await admin
    .from("job_manpower").select("day").order("day", { ascending: false }).limit(1);
  const last = maxRow?.[0]?.day ? String(maxRow[0].day).slice(0, 10) : null;
  if (last === T) return { filledDays: [], rowsWritten: 0 };

  const { data: jobRows, error: jerr } = await admin
    .from("jobs").select("id").eq("on_floor", true).eq("delivered", false);
  if (jerr) throw new Error(jerr.message);
  const jobs = (jobRows || []).map((r) => String(r.id));
  if (!jobs.length) return { filledDays: [], rowsWritten: 0 };

  // History for the carry, and to know which rows already exist.
  const { data: hist, error: herr } = await admin
    .from("job_manpower").select("job_id, day, crew, noted_by")
    .in("job_id", jobs).gte("day", addDays(T, -45))
    .order("day", { ascending: true });
  if (herr) throw new Error(herr.message);
  const byJob = new Map<string, Row[]>();
  for (const r of hist || []) {
    const k = String(r.job_id);
    if (!byJob.has(k)) byJob.set(k, []);
    byJob.get(k)!.push({ day: String(r.day).slice(0, 10), crew: (r.crew as CrewMap) || {}, noted_by: r.noted_by });
  }

  // Catch-up window: from the day after the ledger's last day, at most the
  // last ten days — a ledger abandoned for a month restarts near today
  // rather than manufacturing four weeks of guesses.
  let start = last ? addDays(last, 1) : T;
  if (start < addDays(T, -9)) start = addDays(T, -9);

  const filledDays: string[] = [];
  let rowsWritten = 0;

  for (let day = start; day <= T; day = addDays(day, 1)) {
    const holiday = isWorkHoliday(day);
    const inserts: { job_id: string; day: string; crew: CrewMap; noted_by: string }[] = [];
    for (const jobId of jobs) {
      const history = byJob.get(jobId) || [];
      if (history.some((r) => r.day === day)) continue;
      const crew = holiday ? zero() : carrySource(history, day);
      inserts.push({ job_id: jobId, day, crew, noted_by: ROLLOVER_AUTHOR });
    }
    if (inserts.length) {
      const { error } = await admin.from("job_manpower")
        .upsert(inserts, { onConflict: "job_id,day", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      rowsWritten += inserts.length;
      filledDays.push(day);
      for (const ins of inserts) {
        if (!byJob.has(ins.job_id)) byJob.set(ins.job_id, []);
        byJob.get(ins.job_id)!.push({ day: ins.day, crew: ins.crew, noted_by: ins.noted_by });
      }
    }
  }
  return { filledDays, rowsWritten };
}

/** A job just ticked On Floor: give it today's row so the rolling starts
 *  now, not tomorrow. Never overwrites what the floor already typed. */
export async function seedJobToday(jobId: string): Promise<void> {
  const admin = adminClient();
  const T = istToday();
  const { data: existing } = await admin
    .from("job_manpower").select("day").eq("job_id", jobId).eq("day", T).limit(1);
  if (existing?.length) return;
  const { data: hist } = await admin
    .from("job_manpower").select("day, crew, noted_by")
    .eq("job_id", jobId).gte("day", addDays(T, -45)).order("day", { ascending: true });
  const history: Row[] = (hist || []).map((r) => ({
    day: String(r.day).slice(0, 10), crew: (r.crew as CrewMap) || {}, noted_by: r.noted_by,
  }));
  const crew = isWorkHoliday(T) ? zero() : carrySource(history, T);
  await admin.from("job_manpower")
    .upsert([{ job_id: jobId, day: T, crew, noted_by: ROLLOVER_AUTHOR }],
      { onConflict: "job_id,day", ignoreDuplicates: true });
}

/** A job just UNTICKED: that day's entries go to zero, on the record, in
 *  the unticker's name — and with no tick, tomorrow stops rolling. */
export async function zeroJobToday(jobId: string, byEmail: string): Promise<void> {
  const admin = adminClient();
  await admin.from("job_manpower").upsert([{
    job_id: jobId, day: istToday(), crew: zero(),
    noted_by: byEmail, updated_at: new Date().toISOString(),
  }], { onConflict: "job_id,day" });
}
