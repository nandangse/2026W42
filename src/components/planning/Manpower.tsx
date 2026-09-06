"use client";
// split out of PlanningSuite.tsx (Genie 5.0.1.1) — one file per tab, loaded when opened
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";

import { TRADES, type Crew } from "@/lib/templates";
import { today, fmt, fmtFull, jobNo, computeSchedule, manDays, type Plan } from "@/lib/schedule";

import { Job, TODAY } from "./shared";

// ============================ On Floor ============================

/**
 * What is actually being worked on, and what the floor is saying about it.
 *
 * The rest of the suite is written down by people at desks. This page is for
 * the person standing at the machine: they will SAY what is happening, they
 * will not type it. So each job takes voice notes — kept as audio because tone
 * carries what a transcript loses, and as text because nobody scrubs through
 * ninety seconds to find out whether the part arrived.
 *
 * Three notes a job, oldest dropped. That is the point rather than a limit: an
 * unbounded log is a thing nobody listens to, and the last three are what is
 * happening now.
 */
/**
 * The Job Plan's line of truth for today: who is standing at this job now,
 * as recorded from On Floor. Editable here too — the plan is where the
 * planner already is, and a fact that can only be typed in one screen is a
 * fact that stops being typed.
 */
export function JobManpowerStrip({ jobId, canEdit }: { jobId: string; canEdit: boolean }) {
  const [crew, setCrew] = useState<Crew | null>(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => {
    api.get(`/api/on-floor/manpower?job_id=${encodeURIComponent(jobId)}&days=1`)
      .then((r: { rows?: { day: string; crew: Crew }[] }) => {
        const t = (r.rows || []).find((x) => String(x.day).slice(0, 10) === today());
        setCrew(t?.crew ?? null);
      })
      .catch(() => {});
  }, [jobId]);
  useEffect(() => { load(); }, [load]);
  const total = crew ? TRADES.reduce((n, t) => n + (Number(crew[t.key]) || 0), 0) : 0;
  return (
    <div className="rounded-lg border px-3 py-2 mb-3 bg-white" style={{ borderColor: "var(--line)" }}>
      <div className="flex items-center gap-2.5 flex-wrap">
        <b className="text-xs" style={{ color: "var(--muted)", letterSpacing: ".04em" }}>WORKING TODAY</b>
        {crew && total > 0 ? (
          <>
            {TRADES.map((t) => (
              <span key={t.key} className="text-sm font-bold" style={{ color: t.color, opacity: Number(crew[t.key]) ? 1 : 0.35 }}>
                {t.tiny} {Number(crew[t.key]) || 0}
              </span>
            ))}
            <b className="text-sm" style={{ color: "var(--ink)" }}>— {total} people</b>
          </>
        ) : (
          <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>no manpower recorded for today</span>
        )}
        {canEdit && (
          <button onClick={() => setOpen((v) => !v)} className="text-xs font-bold rounded px-2 py-0.5"
            style={{ background: open ? "var(--ink)" : "#F4F2EC", color: open ? "#fff" : "var(--ink)" }}>
            {open ? "✕ close" : "Manpower Allocation"}
          </button>
        )}
        <span className="text-xs" style={{ color: "var(--muted)" }}>kept per day as the work study · must match attendance</span>
      </div>
      {open && <ManpowerEditor jobId={jobId} value={crew ?? undefined} onSaved={() => { setOpen(false); load(); }} />}
    </div>
  );
}

/**
 * The Manpower tab: the job's day-wise ledger. Every day is a row — typed by
 * the floor, carried forward by the 4 AM rollover, or a holiday zero — and
 * where the rates are set (Admin → Settings) and the reader may see money,
 * each day prices itself: headcount × day-rate, summed at the bottom.
 */
export function ManpowerLedger({ jobId, V }: { jobId: string; V: (n: number) => string }) {
  type LedgerRow = { day: string; crew: Record<string, number>; noted_by: string | null };
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [rates, setRates] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    api.get(`/api/on-floor/manpower?job_id=${encodeURIComponent(jobId)}&days=60`)
      .then((r: { rows?: LedgerRow[] }) => setRows(r.rows || []))
      .catch(() => setRows([]));
    // Rates answer Stratcom only — everyone else simply gets no cost column.
    api.get("/api/admin/labour-rates")
      .then((r: { rates?: Record<string, number> | null }) => {
        if (r.rates && Object.values(r.rates).some((n) => n > 0)) setRates(r.rates);
      })
      .catch(() => {});
  }, [jobId]);

  const isHoliday = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    return d.getDay() === 0 || (d.getDay() === 6 && d.getDate() >= 15 && d.getDate() <= 21);
  };
  const totalOf = (c: Record<string, number>) => TRADES.reduce((n, t) => n + (Number(c?.[t.key]) || 0), 0);
  const costOf = (c: Record<string, number>) =>
    rates ? TRADES.reduce((n, t) => n + (Number(c?.[t.key]) || 0) * (rates[t.key] || 0), 0) : 0;
  const srcOf = (r: LedgerRow) => {
    if (r.noted_by !== "rollover@genie") return r.noted_by ? `by ${String(r.noted_by).split("@")[0]}` : "recorded";
    return totalOf(r.crew) === 0 && isHoliday(r.day) ? "holiday" : "carried";
  };

  if (rows === null) return <div className="text-sm" style={{ color: "var(--muted)" }}>loading…</div>;
  if (!rows.length)
    return (
      <div className="bg-white rounded-lg border p-4 text-sm" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
        No manpower recorded on this job yet. Tick it On Floor and the ledger starts today.
      </div>
    );

  const manDays = rows.reduce((n, r) => n + totalOf(r.crew), 0);
  const totalCost = rows.reduce((n, r) => n + costOf(r.crew), 0);

  return (
    <div className="bg-white rounded-lg border mb-4" style={{ borderColor: "var(--line)", overflowX: "auto" }}>
      <div className="px-3 pt-2 pb-1 flex items-baseline gap-2 flex-wrap">
        <h2 className="font-bold" style={{ color: "var(--navy)" }}>Manpower — the work study</h2>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          one row per day · typed by the floor or carried at 4 AM · must match the attendance muster
        </span>
      </div>
      <table className="genie-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
        <thead>
          <tr>
            {["DATE", ...TRADES.map((t) => t.tiny), "TOTAL", "SOURCE", ...(rates ? ["COST"] : [])].map((h, i) => (
              <th key={h + i} style={{
                textAlign: i === 0 || h === "SOURCE" ? "left" : "right", padding: "6px 10px",
                fontSize: 10, letterSpacing: ".05em", color: "var(--muted)",
                borderBottom: "2px solid #E2E0DA", whiteSpace: "nowrap",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const carried = r.noted_by === "rollover@genie";
            const tot = totalOf(r.crew);
            return (
              <tr key={r.day} style={{ opacity: carried && tot === 0 ? 0.55 : 1 }}>
                <td className="tnum" style={{ padding: "5px 10px", fontSize: 12.5, borderBottom: "1px solid #F0EEE8", whiteSpace: "nowrap" }}>
                  {fmtFull(r.day)}{isHoliday(r.day) ? " ·" : ""}
                  {isHoliday(r.day) && <span style={{ color: "var(--muted)", fontSize: 10 }}> holiday</span>}
                </td>
                {TRADES.map((t) => (
                  <td key={t.key} className="tnum" style={{
                    textAlign: "right", padding: "5px 10px", fontSize: 12.5,
                    borderBottom: "1px solid #F0EEE8",
                    color: Number(r.crew?.[t.key]) ? t.color : "#C9C6BD",
                    fontWeight: Number(r.crew?.[t.key]) && !carried ? 700 : 400,
                  }}>
                    {Number(r.crew?.[t.key]) || 0}
                  </td>
                ))}
                <td className="tnum" style={{ textAlign: "right", padding: "5px 10px", fontSize: 12.5, fontWeight: 700, borderBottom: "1px solid #F0EEE8" }}>
                  {tot}
                </td>
                <td style={{ padding: "5px 10px", fontSize: 11, borderBottom: "1px solid #F0EEE8", color: carried ? "var(--muted)" : "var(--green)", whiteSpace: "nowrap" }}>
                  {srcOf(r)}
                </td>
                {rates && (
                  <td className="tnum" style={{ textAlign: "right", padding: "5px 10px", fontSize: 12.5, borderBottom: "1px solid #F0EEE8" }}>
                    {tot ? V(costOf(r.crew)) : "—"}
                  </td>
                )}
              </tr>
            );
          })}
          <tr>
            <td style={{ padding: "7px 10px", fontSize: 12, fontWeight: 800 }}>TOTAL · {rows.length} days</td>
            {TRADES.map((t) => (
              <td key={t.key} className="tnum" style={{ textAlign: "right", padding: "7px 10px", fontSize: 12, fontWeight: 800, color: t.color }}>
                {rows.reduce((n, r) => n + (Number(r.crew?.[t.key]) || 0), 0)}
              </td>
            ))}
            <td className="tnum" style={{ textAlign: "right", padding: "7px 10px", fontSize: 12, fontWeight: 800 }}>{manDays}</td>
            <td style={{ padding: "7px 10px", fontSize: 10.5, color: "var(--muted)" }}>man-days</td>
            {rates && (
              <td className="tnum" style={{ textAlign: "right", padding: "7px 10px", fontSize: 12, fontWeight: 800, color: "var(--navy)" }}>
                {V(totalCost)}
              </td>
            )}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * MANPOWER PLANNING (Dr Raghu, 1 Sep 2026):
 *
 *   "In On floor make another view - for Manpower planning as a button on the
 *    top. In the buttons number show how many have people working on the 'On
 *    floor jobs'. Manpower planning should show Date - Project - Job - Fitter
 *    - Welder - Helper etc. Then show this as editable for each job at a time
 *    By default"
 *
 * The floor view answers "what is happening on this job". This one answers a
 * different question — "where are my people today" — so it is a table of the
 * whole floor at once, one row a job, a column a trade, and the day at the
 * top because manpower is planned forward as well as recorded back.
 *
 * EDITABLE ONE JOB AT A TIME, as asked, and that is a real safeguard rather
 * than a limitation: a grid where every cell of every row is live invites a
 * stray keystroke into a ledger that is checked against the attendance
 * muster. A row is opened, typed, saved, closed.
 */
/**
 * MANPOWER PLANNING (Dr Raghu, 1–2 Sep 2026).
 *
 * The floor view asks what is happening on a job. This one asks where the
 * people are — so it is the whole floor at once, one row a job, a column a
 * trade, and the day at the top because manpower is planned forward as much
 * as it is recorded back.
 *
 * It answers a foreman's questions in his own order: who owns this, what is
 * the last thing still not done, and how many hands are on it today. Hence
 * the owners, the outstanding milestone, and the trade totals standing above
 * the table rather than buried at its foot.
 *
 * EDIT ONE, OR EDIT ALL. A single row opened is the safe default — these
 * numbers are checked against the attendance muster. But filling a whole
 * morning one row at a time is its own kind of error, so ✎ Edit all opens
 * every visible row at once and saves them together.
 */
export function ManpowerPlanning({
  jobs, projects, manpower, day, onDay, onSaved, canEdit, plans, V, onOpenJob,
}: {
  jobs: Job[];
  projects: Record<string, { mgr?: string | null }>;
  manpower: Record<string, Crew>;
  day: string;
  onDay: (d: string) => void;
  onSaved: () => void;
  canEdit: boolean;
  plans: Record<string, Plan & { baseline_on?: string | null; baseline_end?: string | null }>;
  V: (n: number) => string;
  onOpenJob: (j: Job) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [fam, setFam] = useState("all");
  const [owner, setOwner] = useState("all");

  const crewOf = (id: string) => manpower[id];
  const sumOf = (id: string) => TRADES.reduce((n, t) => n + (Number(crewOf(id)?.[t.key]) || 0), 0);

  /** The last milestone still not done — the thing actually holding the job. */
  const lastUndone = (j: Job): string => {
    const pl = plans[j.id];
    if (!pl?.milestones?.length) return "";
    const sched = computeSchedule({ start: pl.start || TODAY, milestones: pl.milestones });
    const open = sched.filter((m) => !m.done);
    if (!open.length) return "all done";
    const m = open[0];
    return `${m.name}${m.end ? ` · due ${fmt(m.end)}` : ""}`;
  };

  const ownerOf = (j: Job) => ({
    project: projects[j.proj]?.mgr || j.ownerName || "—",
    production: j.productionOwner || "—",
    kitting: j.kittingOwner || "—",
  });

  const fams = useMemo(() => [...new Set(jobs.map((x) => x.fam).filter(Boolean))].sort(), [jobs]);
  const owners = useMemo(() => {
    const set = new Set<string>();
    for (const j of jobs) {
      const o = ownerOf(j);
      [o.project, o.production, o.kitting].forEach((x) => { if (x && x !== "—") set.add(x); });
    }
    return [...set].sort();
  }, [jobs, projects]);

  const needle = q.trim().toLowerCase();
  const rows = useMemo(() => {
    const list = jobs.filter((j) => {
      if (fam !== "all" && j.fam !== fam) return false;
      if (owner !== "all") {
        const o = ownerOf(j);
        if (o.project !== owner && o.production !== owner && o.kitting !== owner) return false;
      }
      if (!needle) return true;
      const o = ownerOf(j);
      return `${j.id} ${j.tag} ${j.proj} ${j.stat} ${j.fam} ${o.project} ${o.production} ${o.kitting}`
        .toLowerCase().includes(needle);
    });
    return list.sort((a, b) =>
      String(a.proj || "zzz").localeCompare(String(b.proj || "zzz"))
      || String(a.tdd || "9999").localeCompare(String(b.tdd || "9999")));
  }, [jobs, fam, owner, needle, projects]);

  // Totals follow the FILTER, not the floor: a number that ignored the filter
  // above it would be answering a question nobody asked.
  const colTotal = (k: keyof Crew) => rows.reduce((n, j) => n + (Number(crewOf(j.id)?.[k]) || 0), 0);
  const grand = rows.reduce((n, j) => n + sumOf(j.id), 0);
  const staffed = rows.filter((j) => sumOf(j.id) > 0).length;
  const filtered = fam !== "all" || owner !== "all" || !!needle;

  const openRow = (j: Job) => {
    const c = manpower[j.id];
    setDraft((d) => ({ ...d, [j.id]: Object.fromEntries(TRADES.map((t) => [t.key, String(Number(c?.[t.key]) || 0)])) }));
    setEditing(j.id);
  };
  const openAll = () => {
    const next: Record<string, Record<string, string>> = {};
    for (const j of rows) {
      const c = manpower[j.id];
      next[j.id] = Object.fromEntries(TRADES.map((t) => [t.key, String(Number(c?.[t.key]) || 0)]));
    }
    setDraft(next); setAll(true); setEditing(null); setErr("");
  };
  const cell = (id: string, k: string) => draft[id]?.[k] ?? "0";
  const setCell = (id: string, k: string, v: string) =>
    setDraft((d) => ({ ...d, [id]: { ...(d[id] || {}), [k]: v.replace(/[^0-9]/g, "").slice(0, 2) } }));

  const saveOne = async (jobId: string) => {
    setBusy(true); setErr("");
    try {
      await api.post("/api/on-floor/manpower", {
        job_id: jobId, day,
        crew: Object.fromEntries(TRADES.map((t) => [t.key, Number(cell(jobId, t.key)) || 0])),
      });
      setEditing(null); onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const saveAll = async () => {
    setBusy(true); setErr("");
    let n = 0;
    try {
      for (const j of rows) {
        const d = draft[j.id];
        if (!d) continue;
        const was = TRADES.map((t) => Number(manpower[j.id]?.[t.key]) || 0).join(",");
        const now = TRADES.map((t) => Number(d[t.key]) || 0).join(",");
        if (was === now) continue;           // only what actually moved
        await api.post("/api/on-floor/manpower", {
          job_id: j.id, day,
          crew: Object.fromEntries(TRADES.map((t) => [t.key, Number(d[t.key]) || 0])),
        });
        n++;
      }
      setAll(false); setDraft({}); onSaved();
      setErr(n ? "" : "Nothing had changed — nothing was written.");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const shift = (n: number) => {
    const d = new Date(day + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    onDay(d.toISOString().slice(0, 10));
  };

  const HEAD: React.CSSProperties = { position: "sticky", top: 0, background: "var(--ink)", zIndex: 2 };

  return (
    <div className="mb-4">
      {/* the day, the filters, the search — and the totals, on top */}
      <div className="rounded-lg border px-3 py-2 mb-2" style={{ borderColor: "var(--line)", background: "#fff" }}>
        <div className="flex items-center gap-2 flex-wrap">
          <b className="text-xs" style={{ color: "var(--muted)", letterSpacing: ".04em" }}>MANPOWER FOR</b>
          <button onClick={() => shift(-1)} className="rounded border px-2 py-1 text-xs font-bold" style={{ borderColor: "var(--line)" }}>‹</button>
          <input type="date" value={day} onChange={(e) => onDay(e.target.value)}
            className="rounded border px-2 py-1 text-sm font-bold tnum" style={{ borderColor: "var(--line)" }} />
          <button onClick={() => shift(1)} className="rounded border px-2 py-1 text-xs font-bold" style={{ borderColor: "var(--line)" }}>›</button>
          <button onClick={() => onDay(TODAY)} className="rounded px-2 py-1 text-xs font-bold" style={{ background: "#F3F1EB", color: "var(--blue)" }}>today</button>

          <select value={fam} onChange={(e) => setFam(e.target.value)}
            className="rounded border px-2 py-1 text-xs font-bold bg-white"
            style={{ borderColor: fam === "all" ? "var(--line)" : "var(--accent)" }}>
            <option value="all">All products</option>
            {fams.map((f) => <option key={f}>{f}</option>)}
          </select>
          <select value={owner} onChange={(e) => setOwner(e.target.value)}
            className="rounded border px-2 py-1 text-xs font-bold bg-white"
            style={{ borderColor: owner === "all" ? "var(--line)" : "var(--accent)" }}>
            <option value="all">All owners</option>
            {owners.map((o) => <option key={o}>{o}</option>)}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 job, tag, project, owner…"
            className="rounded border px-2 py-1 text-xs" style={{ borderColor: needle ? "var(--accent)" : "var(--line)", width: 230 }} />
          {filtered && (
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {rows.length} of {jobs.length} ·{" "}
              <button onClick={() => { setFam("all"); setOwner("all"); setQ(""); }} style={{ color: "var(--accent)", fontWeight: 700 }}>clear</button>
            </span>
          )}

          <span className="ml-auto" />
          {canEdit && !all && (
            <button onClick={openAll} className="rounded px-3 py-1 text-xs font-bold text-white" style={{ background: "var(--blue)" }}
              title="Open every row on screen and fill them in one pass">
              ✎ Edit all{filtered ? ` (${rows.length})` : ""}
            </button>
          )}
          {all && (
            <>
              <button onClick={() => void saveAll()} disabled={busy}
                className="rounded px-3 py-1 text-xs font-bold text-white" style={{ background: busy ? "#B9BEC4" : "var(--green)" }}>
                {busy ? "Saving…" : "💾 Save all"}
              </button>
              <button onClick={() => { setAll(false); setDraft({}); }} className="text-xs font-bold" style={{ color: "var(--muted)" }}>cancel</button>
            </>
          )}
        </div>

        {/* THE TRADE TOTALS, ON TOP (Dr Raghu, 2 Sep 2026) */}
        <div className="flex items-center gap-3 flex-wrap mt-2 pt-2" style={{ borderTop: "1px solid #EFEDE7" }}>
          <span className="text-sm font-extrabold" style={{ color: "var(--ink)" }}>{grand} people</span>
          {TRADES.map((t) => (
            <span key={t.key} className="text-xs" style={{ color: colTotal(t.key) ? t.color : "#C9C6BE", fontWeight: colTotal(t.key) ? 700 : 400 }}>
              {t.label} <b>{colTotal(t.key) || "·"}</b>
            </span>
          ))}
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            on {staffed} of {rows.length} job{rows.length === 1 ? "" : "s"}{filtered ? " shown" : " on the floor"}
          </span>
          {!canEdit && <span className="text-xs" style={{ color: "var(--muted)" }}>· read-only for your role</span>}
          {err && <span className="text-xs font-bold" style={{ color: "var(--red)" }}>{err}</span>}
        </div>
      </div>

      <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: "var(--line)", maxHeight: "70vh" }}>
        <table className="text-xs w-full genie-table" style={{ minWidth: 1320, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: "var(--ink)", color: "#fff" }}>
              <th className="px-2 py-2 text-left whitespace-nowrap" style={HEAD}>Date</th>
              <th className="px-2 py-2 text-left whitespace-nowrap" style={HEAD}>Project</th>
              <th className="px-2 py-2 text-left" style={HEAD}>Job</th>
              <th className="px-2 py-2 text-left whitespace-nowrap" style={HEAD}>Owners</th>
              <th className="px-2 py-2 text-left" style={HEAD}>Last milestone undone</th>
              {TRADES.map((t) => (
                <th key={t.key} className="px-2 py-2 text-center whitespace-nowrap" style={HEAD} title={t.label}>{t.label}</th>
              ))}
              <th className="px-2 py-2 text-center" style={HEAD}>Total</th>
              <th className="px-2 py-2" style={HEAD} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={TRADES.length + 7} className="px-3 py-6 text-center" style={{ color: "var(--muted)" }}>
                {jobs.length ? "Nothing matches the filter." : "No jobs are on the floor — tick a job On Floor and it appears here."}
              </td></tr>
            )}
            {rows.map((j, i) => {
              const live = all || editing === j.id;
              const o = ownerOf(j);
              const total = live
                ? TRADES.reduce((n, t) => n + (Number(cell(j.id, t.key)) || 0), 0)
                : sumOf(j.id);
              const undone = lastUndone(j);
              return (
                <tr key={j.id} style={{ background: live ? "#FFF7E6" : i % 2 ? "#FAF9F5" : "#fff", boxShadow: "inset 0 1px 0 #EFEDE7" }}>
                  <td className="px-2 py-1.5 tnum whitespace-nowrap" style={{ color: "var(--muted)" }}>{fmt(day)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap"><b>{j.proj || "—"}</b></td>
                  <td className="px-2 py-1.5" style={{ maxWidth: 300 }}>
                    <button onClick={() => onOpenJob(j)} className="text-left"
                      title={`${jobNo(j.id)} · ${j.tag}\n${j.cust}\n\nStatus: ${j.stat}\nKitting ${j.kit}% · Production ${j.pct}%\nTDD ${fmtFull(j.tdd)} · OTD ${fmtFull(j.otd)}\nValue ${V(j.val)}\n\nClick to open the job.`}>
                      <b style={{ color: "var(--blue)", textDecoration: "underline", textUnderlineOffset: 2 }}>{jobNo(j.id)}</b>{" "}
                      <span style={{ color: "var(--dim)" }}>{j.tag}</span>
                      <div style={{ color: "var(--muted)", fontSize: 10 }}>{j.stat}</div>
                    </button>
                  </td>
                  <td className="px-2 py-1.5" style={{ color: "var(--dim)", lineHeight: 1.5, minWidth: 170 }}>
                    <div><span style={{ color: "var(--muted)" }}>Proj</span> <b>{o.project}</b></div>
                    <div><span style={{ color: "var(--muted)" }}>Prod</span> {o.production}</div>
                    <div><span style={{ color: "var(--muted)" }}>Kit</span> {o.kitting}</div>
                  </td>
                  <td className="px-2 py-1.5" style={{ minWidth: 190, maxWidth: 260, color: undone === "all done" ? "var(--green)" : "var(--ink)" }}>
                    {undone || <span style={{ color: "#C9C6BE" }}>no plan yet</span>}
                  </td>
                  {TRADES.map((t) => (
                    <td key={t.key} className="px-2 py-1.5 text-center tnum">
                      {live ? (
                        <input value={cell(j.id, t.key)} inputMode="numeric"
                          onChange={(e) => setCell(j.id, t.key, e.target.value)}
                          className="w-10 text-center rounded border px-1 py-0.5 font-bold"
                          style={{ borderColor: t.color }} />
                      ) : (
                        <span style={{ color: Number(crewOf(j.id)?.[t.key]) ? t.color : "#C9C6BE", fontWeight: Number(crewOf(j.id)?.[t.key]) ? 700 : 400 }}>
                          {Number(crewOf(j.id)?.[t.key]) || "·"}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-center font-bold tnum" style={{ color: total ? "var(--ink)" : "var(--red)" }}>{total || "—"}</td>
                  <td className="px-2 py-1.5 text-center whitespace-nowrap">
                    {all ? null : editing === j.id ? (
                      <>
                        <button onClick={() => void saveOne(j.id)} disabled={busy}
                          className="rounded px-2 py-1 font-bold text-white" style={{ background: "var(--green)" }}>{busy ? "…" : "Save"}</button>
                        <button onClick={() => setEditing(null)} className="ml-1 font-bold" style={{ color: "var(--muted)" }}>✕</button>
                      </>
                    ) : canEdit ? (
                      <button onClick={() => openRow(j)} className="rounded border px-2 py-1 font-bold"
                        style={{ borderColor: "var(--line)", color: "var(--blue)" }}>✎ Edit</button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            <tr style={{ background: "var(--navy)", color: "var(--amber)" }} className="font-bold">
              <td className="px-2 py-2" colSpan={5}>TOTAL · {fmt(day)}{filtered ? " · filtered" : ""}</td>
              {TRADES.map((t) => (<td key={t.key} className="px-2 py-2 text-center tnum">{colTotal(t.key) || "·"}</td>))}
              <td className="px-2 py-2 text-center tnum">{grand}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
        One job at a time by default; <b>✎ Edit all</b> opens every row on screen and writes only the ones that changed.
        These numbers are checked against the attendance muster, so they are a ledger rather than a scribble.
      </div>
    </div>
  );
}

/** Six small boxes and a save — today's reality for one job. */
export function ManpowerEditor({ jobId, value, onSaved }: { jobId: string; value?: Crew; onSaved: () => void }) {
  const [crew, setCrew] = useState<Record<string, string>>(
    () => Object.fromEntries(TRADES.map((t) => [t.key, String(Number(value?.[t.key]) || 0)])),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const total = TRADES.reduce((n, t) => n + (Number(crew[t.key]) || 0), 0);
  const save = async () => {
    setBusy(true); setErr("");
    try {
      await api.post("/api/on-floor/manpower", { job_id: jobId, crew: Object.fromEntries(TRADES.map((t) => [t.key, Number(crew[t.key]) || 0])) });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  return (
    <div className="mt-1 rounded p-2" style={{ background: "#F7F6F2", border: "1px solid #E2E0DA" }}>
      <div className="flex gap-1.5 flex-wrap items-end">
        {TRADES.map((t) => (
          <label key={t.key} className="text-center" style={{ fontSize: 10, color: t.color, fontWeight: 700 }}>
            {t.tiny}
            <input value={crew[t.key]} inputMode="numeric"
              onChange={(e) => setCrew((c) => ({ ...c, [t.key]: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) }))}
              className="block w-9 text-center rounded border px-1 py-0.5 text-sm font-bold"
              style={{ borderColor: "var(--line)", color: "var(--ink)" }} />
          </label>
        ))}
        <b className="text-sm" style={{ color: "var(--ink)" }}>= {total}</b>
        <button onClick={save} disabled={busy}
          className="rounded px-2.5 py-1 text-xs font-bold" style={{ background: "var(--green)", color: "#fff" }}>
          {busy ? "…" : "Save today"}
        </button>
      </div>
      {err && <div className="text-xs font-semibold mt-1" style={{ color: "var(--red)" }}>{err}</div>}
    </div>
  );
}