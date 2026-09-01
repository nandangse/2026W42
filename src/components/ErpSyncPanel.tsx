"use client";
/**
 * SYNCHRONISE — the button that replaced three morning sheets, and the table
 * that says what it did (Dr Raghu, 1 Sep 2026).
 *
 *   "just make a button there saying Synchronise … Anybody pressing that will
 *    just synchronise it once again. Otherwise it should just mention that, in
 *    the last one day, whatever changes have happened in the last one week or
 *    last one month. Just make a table which showcases what summary has
 *    happened and that you make it in the morning of updates."
 *
 * A button that only says "done" teaches nobody anything. What the morning
 * wants to know is WHAT MOVED — whose delivery date slipped, which job came
 * on, which left the board — so the run reports it and the table remembers it
 * over a day, a week and a month.
 */
import { useCallback, useEffect, useState } from "react";

interface Win {
  days: number; runs: number;
  jobs_new: number; jobs_changed: number; jobs_archived: number;
  proj_new: number; proj_changed: number;
  deliv_new: number; deliv_changed: number;
}
interface Change { kind: string; id: string; label: string; key: string; field: string; from: string; to: string }
type Winner = "erp" | "genie";
const dKey = (c: Change) => `${c.kind}:${c.id}:${c.key}`;
interface Run {
  id: string; at: string; by: string | null; dry: boolean; ok: boolean; error: string;
  jobs_new: number; jobs_changed: number; jobs_archived: number;
  proj_new: number; proj_changed: number; deliv_new: number; deliv_changed: number;
  changes: Change[]; notes: string[]; seconds: number | null;
}

const INK = "#16232F", MUTED = "#8A94A0", BORDER = "#E2E0DA", ORANGE = "#E8600A", GREEN = "#0D7A3F", NAVY = "#1B3A5C";
const when = (v: unknown) =>
  v ? new Date(String(v)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export default function ErpSyncPanel() {
  const [data, setData] = useState<{ installed: boolean; windows: Win[]; lastRun: Run | null; runs: Run[] } | null>(null);
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState("");
  const [showChanges, setShowChanges] = useState(false);

  const load = useCallback(() => {
    fetch("/api/erp-sync?summary=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setData(j))
      .catch(() => setData({ installed: false, windows: [], lastRun: null, runs: [] }));
  }, []);
  useEffect(() => { load(); }, [load]);

  /**
   * WHO WINS, ONE ROW AT A TIME (Dr Raghu, 1 Sep 2026: "for now show those
   * with a radio button and complete it in that import. Post that we will say
   * Genie wins!!!").
   *
   * Records are still born in the ERP this month, so the ERP's answer is
   * pre-selected and a difference is only overruled deliberately. From
   * October the default flips to Genie, and the switch below is how — the
   * date is a setting, not a deploy.
   */
  const [pick, setPick] = useState<Record<string, Winner>>({});
  const [fallback, setFallback] = useState<Winner>("erp");

  const run = async (dry: boolean) => {
    setBusy(dry ? "dry" : "live"); setErr(""); setResult(null);
    try {
      const r = await fetch("/api/erp-sync", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ dry, decisions: dry ? {} : pick, fallback }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "The sync did not finish.");
      setResult(j); setShowChanges(true);
      // A completed import has answered its own questions; the next check
      // starts from a clean sheet rather than yesterday's ticks.
      if (!dry) setPick({});
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  };

  const wins = data?.windows ?? [];
  const label = (d: number) => (d === 1 ? "Last 24 hours" : d === 7 ? "Last 7 days" : "Last 30 days");
  const changes = (result?.changes as Change[] | undefined) ?? data?.lastRun?.changes ?? [];

  return (
    <div className="bg-white rounded-lg border p-4 mb-4" style={{ borderColor: BORDER }}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div>
          <div className="font-bold text-sm" style={{ color: INK }}>↻ Synchronise with the ERP</div>
          <div className="text-xs mt-0.5" style={{ color: "#5A6672", lineHeight: 1.6, maxWidth: 640 }}>
            Jobs, Projects and Delivered Jobs come straight from nandanerp — <b>these three sheets no longer
            need loading</b>. Press it whenever you want the boards current; it is safe to press twice.
            Genie&apos;s own columns are never touched: the Management Target Date, kitting and production
            percentages, the floor note, the escalation and the client update all stay as your team left them.
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => void run(true)} disabled={!!busy}
            className="rounded border px-3 py-1.5 text-sm font-bold"
            style={{ borderColor: NAVY, color: NAVY, opacity: busy ? 0.5 : 1 }}
            title="Read the ERP and show what would change — writes nothing">
            {busy === "dry" ? "Checking…" : "Check first"}
          </button>
          <button onClick={() => void run(false)} disabled={!!busy}
            className="rounded px-4 py-1.5 text-sm font-bold text-white"
            style={{ background: busy ? "#B9BEC4" : ORANGE }}>
            {busy === "live" ? "Synchronising…" : "↻ Synchronise"}
          </button>
        </div>
      </div>

      {data?.installed === false && (
        <div className="rounded p-2 text-xs font-semibold mb-2" style={{ background: "#FCF6E8", color: "#8A6D1A" }}>
          Run Genie migration 0108 — the sync ledger has nowhere to write yet. Synchronise still works; only this
          summary is blank.
        </div>
      )}
      {err && <div className="rounded p-2 text-xs font-semibold mb-2" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>}

      {result && (
        <div className="rounded p-2 text-xs mb-2" style={{ background: "#EAF4EE", color: "#14532D", lineHeight: 1.7 }}>
          <b>{(result as { dry?: boolean }).dry ? "Checked — nothing was written." : "Synchronised."}</b>{" "}
          Jobs {(result.jobs as { created: number }).created} new, {(result.jobs as { changed: number }).changed} changed,{" "}
          {(result.jobs as { archived: number }).archived} left the board · Projects{" "}
          {(result.projects as { created: number }).created} new, {(result.projects as { changed: number }).changed} changed ·{" "}
          Delivered {(result.delivered as { created: number }).created} new, {(result.delivered as { changed: number }).changed} changed
          {typeof result.seconds === "number" && <> · {Number(result.seconds).toFixed(1)}s</>}
          {Array.isArray(result.notes) && (result.notes as string[]).length > 0 && (
            <div style={{ color: "#8A6D1A", marginTop: 4 }}>{(result.notes as string[]).join(" · ")}</div>
          )}
        </div>
      )}

      {/* THE SUMMARY — a day, a week, a month */}
      <div className="overflow-x-auto">
        <table className="text-xs" style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: 620 }}>
          <thead>
            <tr style={{ background: "#22303C", color: "#fff" }}>
              <th className="px-2 py-1.5 text-left">What changed</th>
              <th className="px-2 py-1.5 text-right">Jobs in</th>
              <th className="px-2 py-1.5 text-right">Jobs changed</th>
              <th className="px-2 py-1.5 text-right">Jobs off</th>
              <th className="px-2 py-1.5 text-right">Projects in</th>
              <th className="px-2 py-1.5 text-right">Projects changed</th>
              <th className="px-2 py-1.5 text-right">Delivered in</th>
              <th className="px-2 py-1.5 text-right">Syncs</th>
            </tr>
          </thead>
          <tbody>
            {wins.length === 0 && (
              <tr><td colSpan={8} className="px-2 py-4 text-center" style={{ color: MUTED }}>
                Nothing synchronised yet — press ↻ Synchronise and this fills.
              </td></tr>
            )}
            {wins.map((w, i) => (
              <tr key={w.days} className="border-t" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                <td className="px-2 py-1.5 font-semibold">{label(w.days)}</td>
                <td className="px-2 py-1.5 text-right tnum" style={{ color: w.jobs_new ? GREEN : MUTED }}>{w.jobs_new || "·"}</td>
                <td className="px-2 py-1.5 text-right tnum" style={{ color: w.jobs_changed ? INK : MUTED }}>{w.jobs_changed || "·"}</td>
                <td className="px-2 py-1.5 text-right tnum" style={{ color: w.jobs_archived ? "#B26A00" : MUTED }}>{w.jobs_archived || "·"}</td>
                <td className="px-2 py-1.5 text-right tnum" style={{ color: w.proj_new ? GREEN : MUTED }}>{w.proj_new || "·"}</td>
                <td className="px-2 py-1.5 text-right tnum" style={{ color: w.proj_changed ? INK : MUTED }}>{w.proj_changed || "·"}</td>
                <td className="px-2 py-1.5 text-right tnum" style={{ color: w.deliv_new ? GREEN : MUTED }}>{w.deliv_new || "·"}</td>
                <td className="px-2 py-1.5 text-right tnum" style={{ color: MUTED }}>{w.runs || "·"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs mt-2 flex items-center gap-2 flex-wrap" style={{ color: MUTED }}>
        {data?.lastRun
          ? <>Last synchronised {when(data.lastRun.at)} by {String(data.lastRun.by || "—").split("@")[0]}
              {data.lastRun.ok ? "" : <span style={{ color: "#B3261E", fontWeight: 700 }}> · that run FAILED: {data.lastRun.error}</span>}</>
          : "Never synchronised."}
        {changes.length > 0 && (
          <button onClick={() => setShowChanges((v) => !v)} style={{ color: NAVY, fontWeight: 700 }}>
            {showChanges ? "hide" : `see the ${changes.length} change${changes.length === 1 ? "" : "s"}`}
          </button>
        )}
      </div>

      {/* THE DETAIL — which machine, which field, and WHO WINS */}
      {showChanges && changes.length > 0 && (
        <>
          <div className="flex items-center gap-3 mt-2 flex-wrap text-xs">
            <span style={{ color: MUTED }}>
              Pick a side for any row that should not follow the default.
            </span>
            <span className="rounded px-2 py-1" style={{ background: "#F3F1EB" }}>
              Anything untouched:{" "}
              <label className="ml-1 cursor-pointer">
                <input type="radio" checked={fallback === "erp"} onChange={() => setFallback("erp")} style={{ accentColor: NAVY }} />{" "}
                <b>ERP wins</b>
              </label>
              <label className="ml-2 cursor-pointer">
                <input type="radio" checked={fallback === "genie"} onChange={() => setFallback("genie")} style={{ accentColor: ORANGE }} />{" "}
                <b>Genie wins</b>
              </label>
            </span>
            <button onClick={() => setPick(Object.fromEntries(changes.map((c) => [dKey(c), "genie" as Winner])))}
              style={{ color: ORANGE, fontWeight: 700 }}>keep Genie on all</button>
            <button onClick={() => setPick({})} style={{ color: NAVY, fontWeight: 700 }}>clear picks</button>
          </div>
          {fallback === "genie" && (
            <div className="rounded p-2 text-xs font-semibold mt-1" style={{ background: "#FCF6E8", color: "#8A6D1A" }}>
              Genie wins by default — the ERP&apos;s answers below will NOT be applied unless you pick ERP on the row.
              Right while records are born in Genie; wrong while they are still born in the ERP.
            </div>
          )}
          <div className="mt-2 border rounded overflow-auto" style={{ borderColor: BORDER, maxHeight: 300 }}>
            <table className="w-full text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <thead><tr style={{ background: "#F3F1EB", color: MUTED }}>
                <th className="px-2 py-1 text-left">What</th><th className="px-2 py-1 text-left">Job / project</th>
                <th className="px-2 py-1 text-left">Field</th>
                <th className="px-2 py-1 text-left">Keep Genie&apos;s</th>
                <th className="px-2 py-1 text-left">Take the ERP&apos;s</th>
              </tr></thead>
              <tbody>
                {changes.slice(0, 300).map((c, i) => {
                  const k = dKey(c);
                  const who: Winner = pick[k] ?? fallback;
                  return (
                    <tr key={i} className="border-t" style={{ borderColor: "#EFEDE7" }}>
                      <td className="px-2 py-1" style={{ color: MUTED }}>{c.kind}</td>
                      <td className="px-2 py-1"><b>{c.id}</b>{c.label && c.label !== c.id ? ` · ${c.label}` : ""}</td>
                      <td className="px-2 py-1 font-semibold">{c.field}</td>
                      <td className="px-2 py-1">
                        <label className="cursor-pointer flex items-start gap-1">
                          <input type="radio" name={k} checked={who === "genie"} onChange={() => setPick((p) => ({ ...p, [k]: "genie" }))}
                            style={{ accentColor: ORANGE, marginTop: 2 }} />
                          <span style={{ color: who === "genie" ? INK : MUTED, fontWeight: who === "genie" ? 700 : 400 }}>{c.from}</span>
                        </label>
                      </td>
                      <td className="px-2 py-1">
                        <label className="cursor-pointer flex items-start gap-1">
                          <input type="radio" name={k} checked={who === "erp"} onChange={() => setPick((p) => ({ ...p, [k]: "erp" }))}
                            style={{ accentColor: NAVY, marginTop: 2 }} />
                          <span style={{ color: who === "erp" ? INK : MUTED, fontWeight: who === "erp" ? 700 : 400 }}>{c.to}</span>
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {changes.length > 300 && <div className="px-2 py-1 text-xs" style={{ color: MUTED }}>…and {changes.length - 300} more, which follow the default.</div>}
          </div>
          <div className="text-xs mt-1" style={{ color: MUTED }}>
            These choices apply to the <b>next ↻ Synchronise</b> — Check first only rehearses. New jobs and new
            projects are never in this list: there is nothing on Genie&apos;s side to weigh them against.
          </div>
        </>
      )}
    </div>
  );
}
