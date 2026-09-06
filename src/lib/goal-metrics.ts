// Auto-fed key results.
//
// A goal node with `metric_source` set has its current_no READ from the planning
// data rather than typed in a review. This is the one thing a standalone goal
// tool could never do: the goal moves because the shop floor moved.
//
// Adding a resolver is the whole contract — register it here, set the node's
// metric_source to its key, and the number goes live.
import type { SupabaseClient } from "@supabase/supabase-js";
import { swallow } from "@/lib/swallow";

export interface MetricResult {
  current: number;
  note: string; // shown under the number, so the reading is never a mystery
}

export interface MetricDef {
  key: string;
  label: string;
  unitHint: string;
  describe: string;
  resolve: (db: SupabaseClient) => Promise<MetricResult>;
}

const count = async (db: SupabaseClient, table: string, apply?: (q: any) => any) => {
  let q = db.from(table).select("*", { count: "exact", head: true });
  if (apply) q = apply(q);
  const { count: c, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return c ?? 0;
};

export const METRICS: MetricDef[] = [
  {
    key: "jobs_with_plan",
    label: "Live jobs carrying a milestone plan",
    unitHint: "Jobs",
    describe: "Counts jobs that have a saved plan, against the active job list.",
    async resolve(db) {
      const [plans, active] = await Promise.all([
        count(db, "plans"),
        count(db, "jobs", (q: any) => q.eq("active", true)),
      ]);
      return { current: plans, note: `${plans} of ${active} active jobs have a saved plan` };
    },
  },
  {
    key: "jobs_baselined",
    label: "Live jobs with a locked baseline",
    unitHint: "Jobs",
    describe: "Counts jobs whose plan has been saved as a baseline.",
    async resolve(db) {
      const [based, active] = await Promise.all([
        count(db, "plans", (q: any) => q.not("baseline_on", "is", null)),
        count(db, "jobs", (q: any) => q.eq("active", true)),
      ]);
      return { current: based, note: `${based} of ${active} active jobs are baselined` };
    },
  },
  {
    key: "kitting_pct",
    label: "Kitting % across the board",
    unitHint: "%",
    describe: "Σ value × (1 − T%) × Kit% ÷ Σ value × (1 − T%), over active jobs.",
    async resolve(db) {
      const { data, error } = await db.from("jobs").select("val,tpp,kit").eq("active", true);
      if (error) throw new Error(error.message);
      let mat = 0;
      let kit = 0;
      for (const j of data || []) {
        const m = Number(j.val || 0) * (1 - Number(j.tpp || 0) / 100);
        mat += m;
        kit += m * (Number(j.kit || 0) / 100);
      }
      const pct = mat > 0 ? (kit / mat) * 100 : 0;
      return { current: Math.round(pct * 10) / 10, note: `across ${data?.length ?? 0} active jobs` };
    },
  },
  {
    key: "morning_upload_streak",
    label: "Consecutive days the morning upload landed",
    unitHint: "Days",
    describe: "Counts back from today over days that received a jobs upload. A miss resets it.",
    async resolve(db) {
      const { data, error } = await db
        .from("import_batches")
        .select("uploaded_at")
        .eq("kind", "jobs")
        .order("uploaded_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      const days = new Set((data || []).map((b) => String(b.uploaded_at).slice(0, 10)));
      // walk back from today; Sundays are skipped rather than breaking the run
      let streak = 0;
      const d = new Date();
      for (let i = 0; i < 180; i++) {
        const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        const dow = d.getUTCDay();
        if (dow !== 0) {
          if (days.has(iso)) streak++;
          else if (i > 0) break; // today not yet uploaded is not a broken streak
        }
        d.setDate(d.getDate() - 1);
      }
      return { current: streak, note: `${days.size} upload days on record` };
    },
  },
  {
    key: "jobs_on_time",
    label: "Active jobs still inside their target date",
    unitHint: "%",
    describe: "Share of active jobs whose Target Delivery Date has not passed.",
    async resolve(db) {
      const { data, error } = await db.from("jobs").select("tdd").eq("active", true);
      if (error) throw new Error(error.message);
      const today = new Date().toISOString().slice(0, 10);
      const rows = data || [];
      const ok = rows.filter((j) => !j.tdd || j.tdd >= today).length;
      const pct = rows.length ? (ok / rows.length) * 100 : 0;
      return { current: Math.round(pct * 10) / 10, note: `${ok} of ${rows.length} inside target` };
    },
  },
  {
    key: "open_tasks",
    label: "Open tasks across the boards",
    unitHint: "Nos",
    describe: "ERP plus manual tasks not yet closed.",
    async resolve(db) {
      const [e, m] = await Promise.all([
        count(db, "erp_tasks", (q: any) => q.eq("done", false)),
        count(db, "manual_tasks", (q: any) => q.eq("done", false)),
      ]);
      return { current: e + m, note: `${e} from ERP, ${m} raised in-app` };
    },
  },
];

const METRIC_BY_KEY = new Map(METRICS.map((m) => [m.key, m]));

/**
 * Resolve every metric a tree actually uses, once each. Failures are swallowed
 * per-metric: a broken resolver must never take the Goals page down with it.
 */
export async function resolveMetrics(
  db: SupabaseClient,
  keys: string[],
): Promise<Record<string, MetricResult>> {
  const wanted = [...new Set(keys.filter((k) => METRIC_BY_KEY.has(k)))];
  const out: Record<string, MetricResult> = {};
  await Promise.all(
    wanted.map(async (k) => {
      try {
        out[k] = await METRIC_BY_KEY.get(k)!.resolve(db);
      } catch (e) { swallow("lib/goal-metrics", e); /* leave unresolved; the node falls back to its stored current_no */ }
    }),
  );
  return out;
}
