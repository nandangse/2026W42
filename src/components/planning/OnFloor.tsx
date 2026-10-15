"use client";
// split out of PlanningSuite.tsx (Genie 5.0.1.1) — one file per tab, loaded when opened
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { swallow } from "@/lib/swallow";

import { api } from "@/lib/api";

import { TRADES, type Crew } from "@/lib/templates";
import { today, fmtFull, jobNo, initials, whoTag, diffDays, escalated } from "@/lib/schedule";

import { JobLightbox, type WipJob } from "../JobsInProgress";

import { Board, Job, Person, TODAY, Task, erpJobLink, personLabel, redactMoney, taskLate } from "./shared";
import { tpOf } from "./DeliveryBoard";
import { ManpowerEditor, ManpowerPlanning } from "./Manpower";
import { CrewRowsTable, FloorCrewTable, StatCard } from "./Material";
import { ThankYou } from "./Feature";

export function OnFloor({
  board,
  V,
  onOpen,
  reload,
  canEdit,
  canTask,
  isStrat,
  myName,
}: {
  board: Board;
  V: (n: number) => string;
  onOpen: (id: string) => void;
  reload: () => Promise<Board | null>;
  canEdit: boolean;
  /** May add photos and record manpower — the floor's own hands, not just planners. */
  canTask: boolean;
  isStrat: boolean;
  /** Who to thank when they leave an update. */
  myName: string;
}) {
  interface Note { id: string; job_id: string; url: string | null; seconds: number | null; transcript: string; summary: string; by: string | null; at: string }
  const [notes, setNotes] = useState<Note[]>([]);
  const [installed, setInstalled] = useState(true);
  const [msg, setMsg] = useState("");
  /** The job whose own lightbox is open — the same one the scatter uses. */
  const [picked, setPicked] = useState<Job | null>(null);

  /**
   * A LIGHTBOX MUST NOT HOLD A STALE JOB (Dr Raghu, 2 Sep 2026: "after edit
   * still old data is seen. however on closing in the main db it has
   * changed").
   *
   * `picked` was the job as it stood at the moment of the click. Saving wrote
   * to the database and reloaded the board — but the open panel kept its own
   * copy, so the number on screen contradicted the number just saved, which
   * is the one thing a confirmation must never do.
   *
   * Syncing off the reloaded list rather than patching the field means it is
   * right whoever caused the refresh: this panel, another tab, the cron.
   */
  useEffect(() => {
    if (!picked) return;
    const fresh = board.jobs.find((x) => x.id === picked.id);
    if (fresh && fresh !== picked) setPicked(fresh);
  }, [board.jobs, picked]);

  /** A job's open work, listed. "tasks" or "esc" decides which half. */
  const [work, setWork] = useState<{ job: Job; only: "tasks" | "esc" } | null>(null);
  /** A project, listed by its jobs. */
  const [proj, setProj] = useState<string | null>(null);
  /** The job whose photographs are open. */
  const [gallery, setGallery] = useState<Job | null>(null);

  // Open work per job, counted once for every row on the page.
  const workByJob = useMemo(() => {
    const m = new Map<string, { tasks: Task[]; esc: Task[] }>();
    for (const t of board.tasks) {
      if (t.done || !t.j) continue;
      const cur = m.get(t.j) || { tasks: [], esc: [] };
      cur.tasks.push(t);
      if (escalated(t.esc)) cur.esc.push(t);
      m.set(t.j, cur);
    }
    return m;
  }, [board.tasks]);

  const jobs = useMemo(
    () => board.jobs.filter((j) => j.onFloor).sort((a, b) => String(a.tdd || "9999").localeCompare(String(b.tdd || "9999"))),
    [board.jobs],
  );

  const load = useCallback(() => {
    api.get("/api/voice-note")
      .then((r: { installed?: boolean; notes?: Note[] }) => { setInstalled(r.installed !== false); setNotes(r.notes || []); })
      .catch(() => setInstalled(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const byJob = useMemo(() => {
    const m = new Map<string, Note[]>();
    for (const n of notes) m.set(n.job_id, [...(m.get(n.job_id) || []), n]);
    return m;
  }, [notes]);

  /**
   * Per FIELD, who is named most across the jobs on the floor — so the
   * dropdown offers "the usual people first". Somebody who owns production on
   * eleven jobs is the likely answer on the twelfth, and scrolling past forty
   * names to reach them every time is how the column stays empty.
   */
  const ownerRank = useMemo(() => {
    const fields: [string, (j: Job) => string | null | undefined][] = [
      ["quality_owner", (j) => j.qualityOwner],
      ["production_owner", (j) => j.productionOwner],
      ["kitting_owner", (j) => j.kittingOwner],
      ["design_owner", (j) => j.designOwner],
    ];
    const m = new Map<string, Map<string, number>>();
    for (const [field, get] of fields) {
      const counts = new Map<string, number>();
      for (const j of board.jobs) {
        const v = get(j);
        if (v) counts.set(v, (counts.get(v) || 0) + 1);
      }
      m.set(field, counts);
    }
    return m;
  }, [board.jobs]);

  const usersFor = (field: string): Person[] => {
    const counts = ownerRank.get(field) || new Map<string, number>();
    return [...(board.assignableUsers || [])].sort((a, b) => {
      const ca = counts.get(a.initials || "") || 0;
      const cb = counts.get(b.initials || "") || 0;
      if (cb !== ca) return cb - ca; // most-used first
      return String(personLabel(a)).localeCompare(String(personLabel(b)));
    });
  };

  const setOwner = async (j: Job, field: string, who: string) => {
    try {
      await api.post("/api/job-field", { job_id: j.id, field, value: who });
      await reload();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  const totVal = jobs.reduce((s, j) => s + (j.val || 0), 0);
  const totTp = jobs.reduce((s, j) => s + tpOf(j), 0);
  // Late against OTD — the promise on the order — not the board's working
  // target (Dr Raghu, 25 Aug 2026). A job with no OTD falls back to its
  // target date rather than hiding from the count.
  const late = jobs.filter((j) => (j.otd || j.tdd) && String(j.otd || j.tdd) < TODAY);

  // What actually went out the gate, from the delivery record — the same
  // 7/30-day boxes the walk sheet prints, standing beside the floor's cards.
  const [deliv, setDeliv] = useState<{ on: string | null; val: number; tpv: number }[]>([]);
  /**
   * WHETHER THIS READER MAY SEE THE MONEY (Dr Raghu, 8 Sep 2026: "the v and
   * the T is wrong").
   *
   * They were not wrong so much as never asked for. This card read
   * /api/delivered/recent, which selects id, tag and delivered_on and NOTHING
   * ELSE — deliberately, because that list is open to every reader on the
   * floor and the commercials are not. So val and tpv came back undefined,
   * `Number(undefined) || 0` made them zero, and the card printed ₹0.0 L as
   * though nothing had been earned on two jobs worth ₹38.5 lakh each.
   *
   * A zero that means "not shown to you" is the same lie as a zero that means
   * "nothing owed" — his own words on the Job Commercials page. So the money
   * is asked for from the ledger that has it, and when this reader may not
   * have it the line says what it can and stops, rather than inventing a nil.
   */
  const [moneyOk, setMoneyOk] = useState(false);
  useEffect(() => {
    const norm = (r: { jobs?: Record<string, unknown>[] }) =>
      (r.jobs || []).map((j) => ({
        on: String(j.on ?? j.delivered_on ?? "").slice(0, 10) || null,
        val: Number(j.val) || 0,
        tpv: Number(j.tpv) || 0,
      }));
    api.get("/api/delivered")
      .then((r: { jobs?: Record<string, unknown>[] }) => { setDeliv(norm(r)); setMoneyOk(true); })
      .catch(() => {
        api.get("/api/delivered/recent")
          .then((r: { jobs?: Record<string, unknown>[] }) => setDeliv(norm(r)))
          .catch(() => {});
      });
  }, []);
  const deliveredSince = (days: number) => {
    const from = new Date(new Date(TODAY + "T00:00:00").getTime() - days * 86400000)
      .toISOString().slice(0, 10);
    const js = deliv.filter((j) => j.on && j.on >= from && j.on <= TODAY);
    return { n: js.length, val: js.reduce((s, j) => s + j.val, 0), tp: js.reduce((s, j) => s + j.tpv, 0) };
  };
  const d7 = deliveredSince(7);
  const d30 = deliveredSince(30);

  // Pending material per job, for the OPEN ON IT chip.
  const [matCounts, setMatCounts] = useState<Record<string, number>>({});
  const loadMatCounts = useCallback(() => {
    api.get("/api/materials?pending_counts=1")
      .then((r: { counts?: Record<string, number> }) => setMatCounts(r.counts || {}))
      .catch(() => {});
  }, []);
  useEffect(() => { loadMatCounts(); }, [loadMatCounts]);
  const [quickAdd, setQuickAdd] = useState<{ job: Job; kind: "task" | "material" } | null>(null);

  // The WHO list, most-assigned first — the hands that get the work sit at
  // the top of the type-ahead (Dr Raghu, 25 Aug 2026).
  const rankedPeople = useMemo(() => {
    const n = new Map<string, number>();
    for (const t of board.tasks) {
      const w = String(t.who || "").toUpperCase();
      if (w && w !== "UNASSIGNED") n.set(w, (n.get(w) || 0) + 1);
    }
    const of2 = (p: { initials?: string | null }) => n.get(String(p.initials || "").toUpperCase()) || 0;
    return [...(board.assignableUsers || [])].sort(
      (a, b) => of2(b) - of2(a) || String(a.initials || "").localeCompare(String(b.initials || "")),
    );
  }, [board.tasks, board.assignableUsers]);

  /**
   * What the floor has said TODAY.
   *
   * The count that matters is not how many recordings exist — it is whether
   * anybody spoke this morning. Two updates across sixty jobs on the floor is
   * the finding, and it is only visible if today is counted on its own.
   *
   * Compared on the local date rather than a 24-hour window: "today" to
   * somebody on the shop floor means since they came in, not since this time
   * yesterday.
   */
  const todayNotes = notes.filter((n) => String(n.at).slice(0, 10) === TODAY);
  const todayJobs = new Set(todayNotes.map((n) => n.job_id)).size;

  /**
   * The day-wise work study: who is actually standing at each job TODAY.
   * Recorded here, shown on the Job Plan and the walk sheet, kept per day —
   * and meant to be checked against the attendance muster, which is the
   * whole reason it is a ledger and not a scribble.
   */
  const [manpower, setManpower] = useState<Record<string, Crew>>({});
  /* the names assigned for the day, as counts — the assignment row on the card (15 Oct 2026) */
  const [assigned, setAssigned] = useState<Record<string, { crew: Record<string, number>; names: string[] }>>({});
  const [mpOpen, setMpOpen] = useState<string | null>(null);
  /**
   * THE SECOND VIEW (Dr Raghu, 1 Sep 2026: "In On floor make another view -
   * for Manpower planning as a button on the top").
   *
   * The floor view asks what is happening on a job; this one asks where the
   * people are. Same jobs, a different question, so it is a view rather than
   * a page — and the day is part of its state because manpower is planned
   * forward as much as it is recorded back.
   */
  const [view, setView] = useState<"floor" | "manpower">("floor");
  const [mpDay, setMpDay] = useState<string>(() => TODAY);
  const loadManpower = useCallback(() => {
    api.get(`/api/on-floor/manpower?day=${encodeURIComponent(mpDay)}`)
      .then((r: { rows?: { job_id: string; crew: Crew }[]; assigned?: Record<string, { crew: Record<string, number>; names: string[] }> }) => {
        setManpower(Object.fromEntries((r.rows || []).map((x) => [x.job_id, x.crew])));
        setAssigned(r.assigned || {});
      })
      .catch(() => {});
  }, [mpDay]);
  useEffect(() => { loadManpower(); }, [loadManpower]);

  const mpTotals = useMemo(() => {
    const tot: Record<string, number> = {};
    let people = 0, jobsWith = 0;
    for (const j of jobs) {
      const c = manpower[j.id];
      if (!c) continue;
      let any = false;
      for (const t of TRADES) {
        const n = Number(c[t.key]) || 0;
        tot[t.key] = (tot[t.key] || 0) + n;
        people += n;
        if (n) any = true;
      }
      if (any) jobsWith++;
    }
    return { tot, people, jobsWith };
  }, [jobs, manpower]);

  return (
    <div className="p-4">
      {/* THE VIEW SWITCH (Dr Raghu, 1 Sep 2026) — the count rides on the
          button itself, because "how many people are on the floor today" is
          the number he wants without opening anything. */}
      <div className="flex items-center gap-2 mb-2 no-print flex-wrap">
        <button onClick={() => setView("floor")}
          className="rounded px-3 py-1.5 font-bold text-xs"
          style={view === "floor" ? { background: "var(--navy)", color: "#fff" } : { background: "#EDEAE3", color: "var(--dim)" }}>
          ▣ On Floor · {jobs.length}
        </button>
        <button onClick={() => setView("manpower")}
          className="rounded px-3 py-1.5 font-bold text-xs"
          style={view === "manpower" ? { background: "var(--green)", color: "#fff" } : { background: "#EDEAE3", color: "var(--dim)" }}
          title="Where the people are — by job, by trade, by day">
          👷 Manpower planning · {mpTotals.people}
        </button>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {view === "manpower"
            ? "people standing at the jobs on the floor"
            : `${mpTotals.people} people on the floor today`}
        </span>
        <span className="ml-auto" />
        <a href="/floor-report" target="_blank" rel="noopener noreferrer"
          className="rounded px-3 py-1.5 font-bold text-xs"
          style={{ background: "var(--navy)", color: "#fff" }}>
          📄 Quick print — the walk sheet
        </a>
        {isStrat && (
          <a href="/floor-report?full=1" target="_blank" rel="noopener noreferrer"
            className="rounded px-3 py-1.5 font-bold text-xs"
            style={{ background: "var(--accent)", color: "#fff" }}
            title="With the commercials and the pending-jobs pages — Stratcom's print">
            📄 PRE edition — with commercials
          </a>
        )}
      </div>
      {view === "manpower" && (
        <ManpowerPlanning
          jobs={jobs}
          projects={board.projects as unknown as Record<string, { mgr?: string | null }>}
          manpower={manpower}
          day={mpDay}
          onDay={setMpDay}
          onSaved={loadManpower}
          canEdit={canTask}
          plans={board.plans}
          V={V}
          /* THE LIGHTBOX FIRST (Dr Raghu, 2 Sep 2026: "clicking on the job
             should open the lightbox first. only then open the full job") —
             the same `picked` the floor view uses, whose own button walks on
             to the full plan. A click should show you the job, not move you
             to another screen. */
          onOpenJob={(j) => setPicked(j)}
        />
      )}

      {view === "floor" && (<>
      <div className="rounded-lg border px-3 py-2 mb-2 flex items-center gap-3 flex-wrap" style={{ borderColor: "var(--line)", background: "#fff" }}>
        <b className="text-xs" style={{ color: "var(--muted)", letterSpacing: ".04em" }}>WORKING TODAY</b>
        <CrewRowsTable rows={[{ label: "today", crew: mpTotals.tot as Partial<Crew>, bold: true }]} />
        <span className="text-sm font-extrabold" style={{ color: "var(--ink)" }}>{mpTotals.people} people</span>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          on {mpTotals.jobsWith} of {jobs.length} jobs
          {mpTotals.jobsWith < jobs.length ? " · the rest have no allocation recorded today" : ""}
        </span>
        <span className="text-xs" style={{ color: "var(--red)" }}>must match the attendance muster</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2 mb-3">
        <StatCard label="ON FLOOR" value={String(jobs.length)} sub="jobs ticked as being worked on" color="var(--green)" />
        {/* "also show Jobs worked on - that is those jobs with people working
            on them" (Dr Raghu, 2 Sep 2026). ON FLOOR is a tick somebody made;
            this is the ledger's own answer — where the manpower actually
            stands today. The gap between the two numbers is the interesting
            part, and it now has somewhere to show itself. */}
        <StatCard label="JOBS WORKED ON" value={String(mpTotals.jobsWith)}
          sub={`${mpTotals.people} people${mpTotals.jobsWith < jobs.length ? ` · ${jobs.length - mpTotals.jobsWith} on floor with nobody recorded` : ""}`}
          color={mpTotals.jobsWith ? "var(--blue)" : "var(--red)"} />
        <StatCard label="VALUE" value={V(totVal)} color="var(--blue)" />
        <StatCard label="THROUGHPUT" value={V(totTp)} sub={totVal ? `${Math.round((totTp / totVal) * 100)}% of value` : ""} color="var(--accent)" />
        <StatCard label="DELIVERED · 7 DAYS" value={String(d7.n)}
          sub={!d7.n ? "nothing went out" : moneyOk ? `${V(d7.val)} · TP ${V(d7.tp)}` : "went out the gate"} color="var(--blue)" />
        <StatCard label="DELIVERED · 30 DAYS" value={String(d30.n)}
          sub={!d30.n ? "nothing went out" : moneyOk ? `${V(d30.val)} · TP ${V(d30.tp)}` : "went out the gate"} color="var(--blue)" />
        {/* WITH PEOPLE (Dr Raghu, 7 Sep 2026: "those number of jobs where
            there is someone today"). Lateness is on every row already; what
            the top of the page could not say was how many jobs actually have
            a man on them. */}
        <StatCard label="WITH PEOPLE" value={String(mpTotals.jobsWith)}
          sub={jobs.length ? `of ${jobs.length} on the floor · ${jobs.length - mpTotals.jobsWith} with nobody` : "nothing on the floor"}
          color={jobs.length && mpTotals.jobsWith === jobs.length ? "var(--green)" : mpTotals.jobsWith ? "var(--accent)" : "var(--red)"} />
        <StatCard
          label="SHOP UPDATES TODAY"
          value={String(todayNotes.length)}
          sub={
            todayNotes.length
              ? `on ${todayJobs} of ${jobs.length} job${jobs.length === 1 ? "" : "s"} on the floor`
              : jobs.length
                ? "nobody has said anything yet today"
                : ""
          }
          color={todayNotes.length ? "#7C3AED" : "var(--muted)"}
        />
      </div>

      {!installed && (
        <div className="text-xs rounded p-2 mb-3" style={{ background: "#FFF7E6", color: "#8A5A00" }}>
          Run migration 0040 — voice notes have nowhere to save yet. The table below works regardless.
        </div>
      )}
      {msg && <div className="text-xs font-bold rounded p-2 mb-2" style={{ background: "#FBEDEA", color: "var(--red)" }}>{msg}</div>}

      {jobs.length === 0 && (
        <div className="text-sm rounded-lg border p-4" style={{ borderColor: "var(--line)", background: "#fff", color: "var(--muted)" }}>
          No job is ticked as being on the floor. {isStrat ? "Tick them on the Priority List." : "Stratcom and planners tick these on the Priority List."}
        </div>
      )}

      <div className="space-y-2">
        {jobs.map((j) => {
          // Late against the date on the board — this page is about today.
          const delay = j.tdd ? diffDays(j.tdd, TODAY) : null;
          const mine = byJob.get(j.id) || [];
          return (
            <div key={j.id} className="bg-white rounded-lg border" style={{ borderColor: "var(--line)", borderLeft: `4px solid ${delay && delay > 0 ? "var(--red)" : "var(--green)"}` }}>
              {/* Stacks on a phone. This page is read at the machine far more
                  often than at a desk, so the narrow layout is the real one:
                  every column goes full width rather than being squeezed. */}
              <div className="flex flex-wrap gap-3 p-3 floor-row">
                {/* who and what */}
                <div className="floor-cell" style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <button onClick={() => setPicked(j)} className="font-bold" style={{ color: "var(--blue)", textDecoration: "underline" }} title="Open this job">{jobNo(j.id)}</button>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>{j.fam}</span>
                  </div>
                  <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{j.tag}</div>
                  <div className="text-xs mt-0.5 flex gap-3 flex-wrap">
                    <span style={{ color: "var(--muted)" }}>TDD <b style={{ color: delay && delay > 0 ? "var(--red)" : "var(--ink)" }}>{fmtFull(j.tdd)}</b></span>
                    <span style={{ color: delay == null ? "#B8B5AC" : delay > 0 ? "var(--red)" : "var(--green)", fontWeight: 700 }}>
                      {delay == null ? "no date" : delay > 0 ? `${delay}d late` : delay === 0 ? "due today" : `${-delay}d to go`}
                    </span>
                    {j.proj ? (
                      <button onClick={() => setProj(j.proj)} style={{ color: "#7C3AED", fontWeight: 700, textDecoration: "underline" }} title="Every job on this project">
                        {String(j.proj).replace(/^NGSE-PROJ-/, "PROJ ")}
                      </button>
                    ) : (
                      <span style={{ color: "#B8B5AC" }}>no project</span>
                    )}
                  </div>

                  {/* the crew as the walk sheet prints it: PLAN (the stage's
                      crew from the milestone plan) over TODAY (recorded, bold) */}
                  <div className="mt-1.5">
                    <FloorCrewTable
                      plan={(() => {
                        const p = board.plans[j.id];
                        const stage = (p?.milestones || []).find((m) => !m.done);
                        return (stage as { crew?: Partial<Crew> } | undefined)?.crew ?? null;
                      })()}
                      today={manpower[j.id] ?? null}
                      assigned={assigned[j.id] ?? null}
                    />
                    <div className="mt-1">
                      {!(manpower[j.id] && Object.values(manpower[j.id]).some((n) => n)) && (
                        <div className="text-xs font-bold" style={{ color: "var(--accent)" }}>no manpower recorded today</div>
                      )}
                      {canTask && (
                        <button onClick={() => setMpOpen(mpOpen === j.id ? null : j.id)}
                          className="text-xs font-bold rounded px-2 py-0.5 mt-0.5"
                          style={{ background: mpOpen === j.id ? "var(--ink)" : "#F4F2EC", color: mpOpen === j.id ? "#fff" : "var(--ink)" }}>
                          {mpOpen === j.id ? "✕ close" : "Manpower Allocation"}
                        </button>
                      )}
                      {mpOpen === j.id && (
                        <ManpowerEditor jobId={j.id} value={manpower[j.id]}
                          onSaved={() => { setMpOpen(null); loadManpower(); }} />
                      )}
                    </div>
                  </div>
                </div>

                {/* owners */}
                <div className="floor-cell" style={{ flex: "0 0 230px" }}>
                  <div className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>OWNERS</div>
                  {/* The Planning Owner comes from the ERP and is read-only
                      here; the other four are Genie's own and are set from
                      this row. Four names, because "who do I ring about this"
                      has a different answer depending on what has gone wrong. */}
                  <div className="text-xs mb-1">
                    <span style={{ color: "var(--muted)" }}>Job </span>
                    <b style={{ color: "var(--ink)" }}>{j.ownerName || j.own || "—"}</b>
                  </div>
                  {([
                    ["Quality", "quality_owner", j.qualityOwner],
                    ["Production", "production_owner", j.productionOwner],
                    ["Kitting", "kitting_owner", j.kittingOwner],
                    ["Design", "design_owner", j.designOwner],
                  ] as const).map(([label, field, val]) => (
                    <div key={field} className="text-xs flex items-center gap-1 mb-0.5">
                      <span style={{ color: "var(--muted)", width: 58, flexShrink: 0 }}>{label}</span>
                      {canEdit ? (
                        <select
                          value={val || ""}
                          onChange={(e) => setOwner(j, field, e.target.value)}
                          className="text-xs border rounded px-1 py-0.5 bg-white font-semibold"
                          style={{ borderColor: val ? "var(--line)" : "var(--accent)", color: val ? "var(--ink)" : "var(--accent)", maxWidth: 150 }}
                        >
                          <option value="">— not set —</option>
                          {usersFor(field).map((p) => (
                            <option key={p.initials || p.email} value={p.initials || ""}>{personLabel(p)}</option>
                          ))}
                        </select>
                      ) : (
                        <b style={{ color: val ? "var(--ink)" : "#B8B5AC" }}>{val || "not set"}</b>
                      )}
                    </div>
                  ))}

                </div>

                {/* what is open on it */}
                <div className="floor-cell floor-work" style={{ flex: "0 0 150px" }}>
                  <div className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>OPEN ON IT</div>
                  {(() => {
                    const w = workByJob.get(j.id) || { tasks: [], esc: [] };
                    return (
                      <div className="flex flex-col gap-1 floor-btns">
                        <div className="flex gap-1 items-stretch">
                          <button
                            onClick={() => w.tasks.length && setWork({ job: j, only: "tasks" })}
                            disabled={!w.tasks.length}
                            className="rounded px-2 py-1 text-left flex-1"
                            style={{ background: w.tasks.length ? "#DCE8F5" : "#F4F2EC", cursor: w.tasks.length ? "pointer" : "default" }}
                          >
                            <b className="tnum" style={{ color: w.tasks.length ? "var(--blue)" : "#B8B5AC", fontSize: 15 }}>{w.tasks.length}</b>
                            <span className="text-xs" style={{ color: "var(--dim)" }}> task{w.tasks.length === 1 ? "" : "s"} pending</span>
                          </button>
                          {canTask && (
                            <button
                              onClick={() => setQuickAdd({ job: j, kind: "task" })}
                              className="rounded px-1.5 font-bold"
                              style={{ background: "var(--blue)", color: "#fff" }}
                              title="Add a task on this job"
                            >
                              +
                            </button>
                          )}
                        </div>
                        <div className="flex gap-1 items-stretch">
                          <button
                            onClick={() => onOpen(j.id)}
                            className="rounded px-2 py-1 text-left flex-1"
                            style={{ background: (matCounts[j.id] || 0) ? "#FDF3E1" : "#F4F2EC", cursor: "pointer" }}
                            title="Open the job's Material Kitting"
                          >
                            <b className="tnum" style={{ color: (matCounts[j.id] || 0) ? "#8A5A00" : "#B8B5AC", fontSize: 15 }}>{matCounts[j.id] || 0}</b>
                            <span className="text-xs" style={{ color: "var(--dim)" }}> material pending</span>
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => setQuickAdd({ job: j, kind: "material" })}
                              className="rounded px-1.5 font-bold"
                              style={{ background: "#8A5A00", color: "#fff" }}
                              title="Add a kitting line on this job"
                            >
                              +
                            </button>
                          )}
                        </div>
                        <button
                          onClick={() => w.esc.length && setWork({ job: j, only: "esc" })}
                          disabled={!w.esc.length}
                          className="rounded px-2 py-1 text-left"
                          style={{ background: w.esc.length ? "#FBEDEA" : "#F4F2EC", cursor: w.esc.length ? "pointer" : "default" }}
                        >
                          <b className="tnum" style={{ color: w.esc.length ? "var(--red)" : "#B8B5AC", fontSize: 15 }}>{w.esc.length}</b>
                          <span className="text-xs" style={{ color: "var(--dim)" }}> escalation{w.esc.length === 1 ? "" : "s"}</span>
                        </button>
                        <button
                          onClick={() => setGallery(j)}
                          className="rounded px-2 py-1 text-left"
                          style={{ background: "#F3EEFB" }}
                          title="Photographs of this job as it is built"
                        >
                          <span className="text-xs font-bold" style={{ color: "#7C3AED" }}>📷 Photos</span>
                        </button>
                      </div>
                    );
                  })()}
                </div>

                {/* the floor's own words */}
                <div className="floor-cell" style={{ flex: "2 1 340px", minWidth: 0 }}>
                  <VoiceNotes jobId={j.id} notes={mine} installed={installed} onSaved={load}
                    floor={j.floorSummary} floorAt={j.floorSummaryAt}
                    thanksFor={{ name: myName, tdd: j.tdd, job: jobNo(j.id) }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      </>)}

      {picked && (
        <JobLightbox
          job={toWip(picked)}
          V={V}
          colour="var(--green)"
          onClose={() => setPicked(null)}
          onOpenPlan={() => { const id = picked.id; setPicked(null); onOpen(id); }}
          canEdit={canEdit}
          onSaved={reload}
        />
      )}

      {work && (
        <WorkList
          job={work.job}
          tasks={(workByJob.get(work.job.id) || { tasks: [], esc: [] })[work.only]}
          only={work.only}
          canTask={canTask}
          people={rankedPeople}
          onChanged={() => { void reload(); }}
          onClose={() => setWork(null)}
        />
      )}

      {quickAdd && (
        <QuickAddOnFloor
          job={quickAdd.job}
          kind={quickAdd.kind}
          people={rankedPeople}
          onClose={() => setQuickAdd(null)}
          onDone={() => {
            setQuickAdd(null);
            if (quickAdd.kind === "material") loadMatCounts();
            else void reload();
          }}
        />
      )}

      {proj && (
        <ProjectJobs
          proj={proj}
          jobs={board.jobs.filter((x) => x.proj === proj)}
          V={V}
          onClose={() => setProj(null)}
          onOpen={(id) => { setProj(null); onOpen(id); }}
        />
      )}

      {gallery && <PhotoGallery job={gallery} canEdit={canTask} onClose={() => setGallery(null)} />}
    </div>
  );
}

/** A board Job in the shape the scatter's lightbox expects. */
export function toWip(j: Job): WipJob {
  return {
    id: j.id, tag: j.tag, cust: j.cust, fam: j.fam || "Unassigned",
    tdd: j.tdd, otd: j.otd, stat: j.stat, val: j.val, tpv: j.tpv, tpp: j.tpp,
    kit: j.kit, pct: j.pct, note: j.note, escalation: j.escalation,
    clientUpdate: j.clientUpdate, cashflow: j.cashflow,
    amtNeeded: j.amtNeeded, payOnDelivery: j.payOnDelivery,
    ownerInitials: j.ownerInitials, ownerName: j.ownerName,
  } as WipJob;
}

/**
 * What is open on a job, listed.
 *
 * The job name is at the top because this opens from a count on a row: by the
 * time the box is up, the row that was clicked is behind it, and a list of
 * tasks with no job on it belongs to nothing.
 */
export function WorkList({
  job, tasks, only, canTask, people, onChanged, onClose,
}: {
  job: Job; tasks: Task[]; only: "tasks" | "esc"; canTask: boolean;
  people: { initials?: string | null; name?: string | null }[];
  onChanged: () => void; onClose: () => void;
}) {
  const sorted = [...tasks].sort((a, b) => String(a.due || "9999").localeCompare(String(b.due || "9999")));
  // A row opens the task itself — the count was the door, not the room.
  const [editing, setEditing] = useState<Task | null>(null);
  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.45)", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg w-full" style={{ maxWidth: 620, maxHeight: "82vh", overflow: "auto" }}>
        <div className="px-4 py-3" style={{ background: "var(--navy)", color: "#fff", position: "sticky", top: 0 }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold" style={{ letterSpacing: 1.2, color: "#8FA1B3" }}>
                {only === "esc" ? "ESCALATIONS" : "TASKS PENDING"} · {sorted.length}
              </div>
              <div className="font-bold" style={{ fontSize: 17 }}>JOB {jobNo(job.id)} · {job.tag}</div>
            </div>
            <button onClick={onClose} style={{ color: "#8FA1B3", fontSize: 18 }}>✕</button>
          </div>
        </div>
        <div className="p-3">
          {sorted.length === 0 && <div className="text-sm" style={{ color: "var(--muted)" }}>Nothing open.</div>}
          {sorted.map((t) => (
            <div
              key={t.kind + t.id}
              role="button" tabIndex={0} onClick={() => canTask && setEditing(t)}
              className="rounded border p-2 mb-1.5"
              style={{
                borderColor: "var(--line)", borderLeft: `3px solid ${escalated(t.esc) ? "var(--red)" : "var(--blue)"}`,
                cursor: canTask ? "pointer" : "default",
              }}
              title={canTask ? "Open this task" : undefined}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <div className="text-sm font-semibold" style={{ color: "var(--navy)" }}>{t.t}</div>
                  <div className="text-xs mt-0.5 flex gap-3 flex-wrap" style={{ color: "var(--muted)" }}>
                    <span>{t.cat}</span>
                    <span>{t.who ? whoTag(t.who) : "unassigned"}</span>
                    <span style={{ color: taskLate(t, TODAY) ? "var(--red)" : "var(--muted)", fontWeight: taskLate(t, TODAY) ? 700 : 400 }}>
                      due {fmtFull(t.due)}
                    </span>
                    {(t.push_count || 0) > 0 && <span style={{ color: "var(--red)" }}>moved {t.push_count}×</span>}
                  </div>
                </div>
                {escalated(t.esc) && (
                  <span className="rounded px-1.5 py-0.5 text-xs font-bold flex-shrink-0" style={{ background: "var(--red)", color: "#fff" }}>{(t.esc || "").slice(0, 2)}</span>
                )}
              </div>
              {t.esc_why && <div className="text-xs mt-1" style={{ color: "var(--dim)" }}>{t.esc_why}</div>}
            </div>
          ))}
        </div>
      </div>
      {editing && (
        <TaskQuickEdit
          task={editing}
          people={people}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged(); }}
        />
      )}
    </div>
  );
}

/**
 * Type-and-choose for a person — the dropdown was irritating (Dr Raghu,
 * 25 Aug 2026). Type initials or a name, pick from what matches; whatever
 * lands is ALWAYS CAPS, because that is how initials are written here.
 */
export function WhoTypeAhead({
  value, people, onPick, width = 150,
}: {
  value: string;
  people: { initials?: string | null; name?: string | null }[];
  onPick: (v: string) => void;
  width?: number;
}) {
  const [text, setText] = useState(value === "unassigned" ? "" : value.toUpperCase());
  const [open, setOpen] = useState(false);
  useEffect(() => { setText(value === "unassigned" ? "" : value.toUpperCase()); }, [value]);
  const needle = text.trim().toLowerCase();
  const hits = people
    .filter((p) => p.initials)
    .filter((p) =>
      !needle
      || String(p.initials).toLowerCase().startsWith(needle)
      || String(p.name || "").toLowerCase().includes(needle))
    .slice(0, 8);
  return (
    <div style={{ position: "relative", width }}>
      <input
        value={text}
        placeholder="WHO?"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onChange={(e) => {
          const v = e.target.value.toUpperCase();
          setText(v); setOpen(true);
          onPick(v.trim() || "unassigned");
        }}
        className="w-full rounded border px-2 py-1.5 text-sm font-bold"
        style={{ borderColor: "var(--line)", textTransform: "uppercase" }}
      />
      {open && hits.length > 0 && (
        <div className="rounded border" style={{
          position: "absolute", top: "105%", left: 0, right: 0, zIndex: 80,
          background: "#fff", borderColor: "var(--line)", maxHeight: 200, overflowY: "auto",
          boxShadow: "0 8px 24px rgba(22,35,47,.2)",
        }}>
          {hits.map((p) => (
            <button
              key={p.initials as string}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(String(p.initials).toUpperCase());
                setText(String(p.initials).toUpperCase());
                setOpen(false);
              }}
              className="w-full text-left px-2 py-1.5 text-sm"
            >
              <b>{String(p.initials).toUpperCase()}</b>
              <span className="text-xs" style={{ color: "var(--muted)" }}> · {p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The task, opened from the pending/escalations list — title, owner, date,
 * escalation, done — enough to act without leaving the floor. Writes through
 * the same /api/tasks the Tasking screen uses, so the drift log (push_count,
 * original_due) keeps working here too.
 */
export function TaskQuickEdit({
  task, people, onClose, onSaved,
}: {
  task: Task;
  people: { initials?: string | null; name?: string | null }[];
  onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(task.t);
  const [who, setWho] = useState(task.who || "unassigned");
  const [due, setDue] = useState(task.due || "");
  const [esc, setEsc] = useState(task.esc || "None");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async (alsoDone: boolean) => {
    setBusy(true); setErr("");
    try {
      await api.post("/api/tasks", {
        action: "update", id: task.id, kind: task.kind,
        title, who, due: due || null, esc,
      });
      if (alsoDone) await api.post("/api/tasks", { action: "toggle", id: task.id, kind: task.kind });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.5)", zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg w-full" style={{ maxWidth: 480 }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ background: "var(--navy)", color: "#fff" }}>
          <div className="text-xs font-bold" style={{ letterSpacing: 1.2, color: "#8FA1B3" }}>TASK</div>
          <button onClick={onClose} style={{ color: "#8FA1B3", fontSize: 18 }}>✕</button>
        </div>
        <div className="p-3 space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--line)" }} />
          <div className="flex gap-2 flex-wrap">
            <WhoTypeAhead value={who} people={people} onPick={setWho} />
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
              className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--line)" }} />
            <select value={esc} onChange={(e) => setEsc(e.target.value)}
              className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--line)" }}>
              {["None", "L1", "L2", "L3"].map((x) => <option key={x} value={x}>{x === "None" ? "no escalation" : x}</option>)}
            </select>
          </div>
          {err && <div className="text-xs font-bold rounded p-2" style={{ background: "#FBEDEA", color: "var(--red)" }}>{err}</div>}
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => save(true)} disabled={busy}
              className="rounded px-3 py-1.5 text-xs font-bold" style={{ background: "#E6F4EA", color: "var(--green)" }}>
              ✔ Save &amp; mark done
            </button>
            <button onClick={() => save(false)} disabled={busy}
              className="rounded px-3 py-1.5 text-xs font-bold" style={{ background: "var(--navy)", color: "#fff" }}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The + beside the On Floor chips: a task or a kitting line, born on the job
 * where the need was noticed, without leaving the page.
 */
export function QuickAddOnFloor({
  job, kind, people, onClose, onDone,
}: {
  job: Job; kind: "task" | "material";
  people: { initials?: string | null; name?: string | null }[];
  onClose: () => void; onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [who, setWho] = useState("unassigned");
  const [due, setDue] = useState("");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    if (!text.trim()) { setErr(kind === "task" ? "What is the task?" : "What is the material?"); return; }
    setBusy(true); setErr("");
    try {
      if (kind === "task") {
        await api.post("/api/tasks", {
          action: "create", job_id: job.id, title: text.trim(),
          who, due: due || null, cat: "Production",
        });
      } else {
        await api.post("/api/materials", {
          action: "add", job_id: job.id, item: text.trim(),
          qty, status: "Yet to receive", due: due || null,
        });
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.5)", zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg w-full" style={{ maxWidth: 480 }}>
        <div className="px-4 py-3" style={{ background: "var(--navy)", color: "#fff" }}>
          <div className="text-xs font-bold" style={{ letterSpacing: 1.2, color: "#8FA1B3" }}>
            {kind === "task" ? "NEW TASK" : "NEW KITTING LINE"}
          </div>
          <div className="font-bold" style={{ fontSize: 15 }}>JOB {jobNo(job.id)} · {job.tag}</div>
        </div>
        <div className="p-3 space-y-2">
          <input
            autoFocus value={text} onChange={(e) => setText(e.target.value)}
            placeholder={kind === "task" ? "What needs doing?" : "What material is needed?"}
            className="w-full rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--line)" }}
          />
          <div className="flex gap-2 flex-wrap">
            {kind === "task" ? (
              <WhoTypeAhead value={who} people={people} onPick={setWho} />
            ) : (
              <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="qty"
                className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--line)", width: 90 }} />
            )}
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
              className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--line)" }}
              title={kind === "task" ? "due" : "needed by"} />
          </div>
          {err && <div className="text-xs font-bold rounded p-2" style={{ background: "#FBEDEA", color: "var(--red)" }}>{err}</div>}
          <div className="flex justify-end pt-1">
            <button onClick={save} disabled={busy}
              className="rounded px-3 py-1.5 text-xs font-bold" style={{ background: "var(--accent)", color: "#fff" }}>
              {busy ? "Saving…" : kind === "task" ? "Add task" : "Add line"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Every job on one project. */
export function ProjectJobs({
  proj, jobs, V, onClose, onOpen,
}: { proj: string; jobs: Job[]; V: (n: number) => string; onClose: () => void; onOpen: (id: string) => void }) {
  const sorted = [...jobs].sort((a, b) => String(a.tdd || "9999").localeCompare(String(b.tdd || "9999")));
  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.45)", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg w-full" style={{ maxWidth: 680, maxHeight: "82vh", overflow: "auto" }}>
        <div className="px-4 py-3" style={{ background: "var(--navy)", color: "#fff", position: "sticky", top: 0 }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold" style={{ letterSpacing: 1.2, color: "#8FA1B3" }}>PROJECT · {sorted.length} JOB{sorted.length === 1 ? "" : "S"}</div>
              <div className="font-bold" style={{ fontSize: 17 }}>{proj}</div>
            </div>
            <button onClick={onClose} style={{ color: "#8FA1B3", fontSize: 18 }}>✕</button>
          </div>
        </div>
        <div className="p-3">
          {sorted.map((j) => (
            <div key={j.id} className="flex items-baseline gap-2 rounded border p-2 mb-1.5" style={{ borderColor: "var(--line)" }}>
              <button onClick={() => onOpen(j.id)} className="font-bold" style={{ color: "var(--blue)", textDecoration: "underline" }}>{jobNo(j.id)}</button>
              <span className="text-sm flex-1" style={{ color: "var(--ink)" }}>{j.tag}</span>
              <span className="text-xs tnum" style={{ color: j.tdd && j.tdd < TODAY ? "var(--red)" : "var(--muted)" }}>{fmtFull(j.tdd)}</span>
              <span className="text-xs tnum" style={{ color: "var(--dim)" }}>{V(j.val)}</span>
              <span className="text-xs tnum" style={{ color: "var(--muted)" }}>{j.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Record, transcribe, keep.
 *
 * Transcription happens IN THE BROWSER, through the Web Speech API, while the
 * recording is running. That is deliberate: it needs no second API key, costs
 * nothing per note, and the words appear as they are spoken so somebody can
 * see it heard them correctly before they stop. Where the browser has no
 * dictation the audio is still saved — a note you can play is better than no
 * note, and the summary falls back to whatever text there is.
 */
export function VoiceNotes({
  jobId,
  notes,
  installed,
  onSaved,
  floor,
  floorAt,
  thanksFor,
}: {
  jobId: string;
  notes: { id: string; url: string | null; seconds: number | null; transcript: string; summary: string; by: string | null; at: string }[];
  installed: boolean;
  onSaved: () => void;
  /** Genie's read of the last three. Written when a note is recorded. */
  floor?: string | null;
  floorAt?: string | null;
  /** Enough to thank the person by name and tell them what they just moved. */
  thanksFor?: { name: string; tdd: string | null; job: string };
}) {
  /** Three in front of you; the rest a click away, never deleted. */
  const RECENT = 3;
  const [showAll, setShowAll] = useState(false);
  const [rec, setRec] = useState(false);
  const [live, setLive] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [openNote, setOpenNote] = useState<string | null>(null);
  /** Shown once, straight after a note is saved. */
  const [thanks, setThanks] = useState(false);
  /**
   * The read is the answer; the recordings are the evidence.
   *
   * Folded by default because on a page listing every job on the floor, three
   * players and two suggestions per row is a wall nobody scrolls past. Open it
   * when you want to hear it said or act on what was heard.
   */
  const [detail, setDetail] = useState(false);
  /**
   * Genie's read, folded (Dr Raghu, 2 Sep 2026). Closed on every screen, not
   * just the phone: a paragraph that is always open is read by nobody and
   * measured by nobody. Folded, the click is a real signal — and it is
   * counted, so "is anyone using this?" stops being a matter of opinion.
   */
  const [genieOpen, setGenieOpen] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srRef = useRef<any>(null);
  const startedRef = useRef(0);
  const textRef = useRef("");

  const stop = () => {
    try { mediaRef.current?.stop(); } catch (e) { swallow("PlanningSuite", e); /* already stopped */ }
    try { srRef.current?.stop(); } catch (e) { swallow("PlanningSuite", e); /* dictation may not be running */ }
    setRec(false);
  };

  const start = async () => {
    setErr(""); setLive(""); textRef.current = "";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        const seconds = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000));
        const transcript = textRef.current.trim();
        if (!blob.size && !transcript) return;
        setBusy(true);
        try {
          const fd = new FormData();
          fd.append("job_id", jobId);
          fd.append("transcript", transcript);
          fd.append("seconds", String(seconds));
          if (blob.size) fd.append("file", new File([blob], "note.webm", { type: blob.type }));
          const r = await fetch("/api/voice-note", { method: "POST", body: fd });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || "Could not save the note");
          onSaved();
          setThanks(true);
        } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
        setBusy(false);
        setLive("");
      };
      mr.start();
      mediaRef.current = mr;
      startedRef.current = Date.now();
      setRec(true);

      // Dictation, where the browser has it. Absence is not an error.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        const sr = new SR();
        sr.continuous = true;
        sr.interimResults = true;
        sr.lang = "en-IN";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sr.onresult = (ev: any) => {
          let done = "", interim = "";
          for (let i = 0; i < ev.results.length; i++) {
            const r0 = ev.results[i];
            if (r0.isFinal) done += r0[0].transcript + " ";
            else interim += r0[0].transcript;
          }
          textRef.current = done.trim();
          setLive((done + interim).trim());
        };
        sr.onerror = () => {};
        sr.start();
        srRef.current = sr;
      }
    } catch (e) {
      // The old message blamed the device for what was usually a refused
      // prompt. Name the actual cause, and say what to do about it.
      const name = (e as { name?: string })?.name || "";
      setErr(
        name === "NotAllowedError"
          ? "The browser blocked the microphone. Click the padlock in the address bar → Microphone → Allow, then press Record again."
          : name === "NotFoundError"
            ? "No microphone is connected to this machine."
            : name === "NotReadableError"
              ? "Something else is using the microphone — close it and press Record again."
              : "Could not open the microphone on this browser.",
      );
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <div className="text-xs font-bold" style={{ color: "var(--muted)" }}>FROM THE FLOOR</div>
        {installed && (
          rec ? (
            <button onClick={stop} className="rounded px-2 py-0.5 text-xs font-bold text-white" style={{ background: "var(--red)" }}>■ Stop</button>
          ) : (
            <button onClick={start} disabled={busy} className="rounded px-2 py-0.5 text-xs font-bold text-white" style={{ background: busy ? "#B8B5AC" : "var(--green)" }}>
              {busy ? "saving…" : "🎙 Record"}
            </button>
          )
        )}
        <span className="text-xs ml-auto" style={{ color: "#B8B5AC" }}>
          {notes.length} note{notes.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Genie's read of the last three. Three separate accounts of one job is
          not a position; this is. The recordings stay underneath for anyone
          who wants to hear it said. */}
      {/* FOLDED BY DEFAULT, ON EVERY SCREEN (Dr Raghu, 2 Sep 2026: "hide it in
          mobile view. Also on the desktop, too let it be hidden — write
          ✨ GENIE — THE READ ON THIS JOB, on clicking it will expand. Please
          take a count of how many people are clicking it").

          A paragraph that is always open is read by nobody and measured by
          nobody. Folded, the click is a real signal — so it is recorded, and
          the answer to "is anyone actually using this?" stops being a matter
          of opinion. */}
      {floor && (
        <div className="rounded mb-1.5" style={{ background: "#F3EEFB", border: "1px solid #C9B6EA" }}>
          <button
            onClick={() => {
              const opening = !genieOpen;
              setGenieOpen(opening);
              if (opening) {
                // never blocks the panel — see /api/feature-click
                void fetch("/api/feature-click", {
                  method: "POST", headers: { "content-type": "application/json" },
                  body: JSON.stringify({ feature: "genie_read_on_job", ref: jobId }),
                }).catch(() => {});
              }
            }}
            className="w-full text-left px-2 py-1.5 text-xs font-bold flex items-center gap-1.5"
            style={{ color: "#7C3AED", letterSpacing: .6 }}
            title={genieOpen ? "Fold it away" : "Genie's read of the last few notes — click to open"}>
            <span>{genieOpen ? "▾" : "▸"}</span>
            ✨ GENIE — THE READ ON THIS JOB
            {!genieOpen && <span className="font-normal" style={{ color: "var(--muted)" }}>· click to read</span>}
          </button>
          {genieOpen && (
            <div className="px-2 pb-2">
              <div className="text-xs" style={{ color: "var(--ink)", lineHeight: 1.55 }}>{floor}</div>
              {floorAt && (
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>
                  from the last {Math.min(notes.length, RECENT)} note{Math.min(notes.length, RECENT) === 1 ? "" : "s"} · {new Date(floorAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {rec && (
        <div className="rounded p-2 mb-1 text-xs" style={{ background: "#FBEDEA", border: "1px solid #B3261E", color: "var(--ink)" }}>
          <b style={{ color: "var(--red)" }}>● recording</b> {live || <span style={{ color: "var(--muted)" }}>speak — the words appear here as you go</span>}
        </div>
      )}
      {err && <div className="text-xs font-bold mb-1" style={{ color: "var(--red)" }}>{err}</div>}

      {(notes.length > 0 || floor) && (
        <button
          onClick={() => setDetail((v) => !v)}
          className="text-xs font-bold w-full text-left rounded px-2 py-1"
          style={{ background: detail ? "#F4F2EC" : "transparent", color: "var(--blue)" }}
        >
          {detail ? "⌃ hide the recordings" : `⌄ ${notes.length} recording${notes.length === 1 ? "" : "s"} — and anything Genie heard to do`}
        </button>
      )}

      {detail && <TaskProposals jobId={jobId} />}

      {notes.length === 0 && !rec && (
        <div className="text-xs" style={{ color: "#B8B5AC" }}>Nothing recorded on this job yet.</div>
      )}

      {detail && (showAll ? notes : notes.slice(0, RECENT)).map((n) => (
        <div key={n.id} className="rounded mb-1 px-2 py-1.5" style={{ background: "#F4F2EC", border: "1px solid #E2E0DA" }}>
          <div className="text-xs" style={{ color: "var(--ink)", lineHeight: 1.5 }}>{n.summary || n.transcript || "(no words captured)"}</div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {n.url && <audio controls preload="none" src={n.url} style={{ height: 26, maxWidth: 210 }} />}
            <span style={{ fontSize: 10, color: "var(--muted)" }}>
              {whoTag(n.by)} · {new Date(n.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              {n.seconds ? ` · ${n.seconds}s` : ""}
            </span>
            {n.transcript && n.transcript !== n.summary && (
              <button onClick={() => setOpenNote(openNote === n.id ? null : n.id)} className="font-bold" style={{ fontSize: 10, color: "var(--blue)" }}>
                {openNote === n.id ? "hide what was said" : "what was said"}
              </button>
            )}
          </div>
          {openNote === n.id && (
            <div className="text-xs mt-1 pt-1" style={{ color: "var(--dim)", borderTop: "1px solid #E2E0DA", lineHeight: 1.55 }}>{n.transcript}</div>
          )}
        </div>
      ))}

      {thanks && thanksFor && (
        <ThankYou who={thanksFor.name} tdd={thanksFor.tdd} job={thanksFor.job} onClose={() => setThanks(false)} />
      )}

      {detail && notes.length > RECENT && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-xs font-bold"
          style={{ color: "var(--blue)" }}
        >
          {showAll ? `↑ show the latest ${RECENT}` : `↓ all ${notes.length} recordings — nothing is deleted`}
        </button>
      )}
    </div>
  );
}

/**
 * The build history of a job, in photographs.
 *
 * Production completion is a number somebody types. A photograph is not
 * arguable — and a row of them in date order is the only record in Genie of
 * what the machine actually looked like on the way.
 *
 * Each photo keeps the COMPLETION AS IT WAS on the day it was taken, not a
 * reading of whatever the job says now. The number on a job moves; the picture
 * does not, and "70% on 12 August" is what makes the pair worth keeping.
 */
export function PhotoGallery({ job, canEdit, onClose }: { job: Job; canEdit: boolean; onClose: () => void }) {
  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.5)", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg w-full" style={{ maxWidth: 860, maxHeight: "88vh", overflow: "auto" }}>
        <div className="px-4 py-3" style={{ background: "var(--navy)", color: "#fff", position: "sticky", top: 0, zIndex: 2 }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold" style={{ letterSpacing: 1.2, color: "#8FA1B3" }}>PHOTOS</div>
              <div className="font-bold" style={{ fontSize: 17 }}>JOB {jobNo(job.id)} · {job.tag}</div>
            </div>
            <button onClick={onClose} style={{ color: "#8FA1B3", fontSize: 18 }}>✕</button>
          </div>
        </div>
        <div className="p-3"><PhotoBody job={job} canEdit={canEdit} /></div>
      </div>
    </div>
  );
}

/** The gallery itself, shared by the lightbox and the Photos tab. */
export function PhotoBody({ job, canEdit }: { job: Job; canEdit: boolean }) {
  interface P { id: string; url: string | null; caption: string; pct: number | null; taken_on: string; by: string | null }
  const [photos, setPhotos] = useState<P[]>([]);
  const [installed, setInstalled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [big, setBig] = useState<P | null>(null);
  const [form, setForm] = useState({ caption: "", pct: String(job.pct ?? ""), taken_on: TODAY });
  /**
   * The photo waiting to be saved.
   *
   * It used to upload the instant a file was chosen, which meant you could not
   * see what you had picked, and the date, completion and caption you typed
   * were applied to whatever you selected NEXT. Choose, look, then Save.
   */
  const [chosen, setChosen] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  /**
   * Said out loud after a save.
   *
   * A photo appearing in a grid of photos is not obviously YOUR photo having
   * been saved, particularly on a phone where the grid is below the fold. It
   * clears itself — a confirmation that stays becomes furniture.
   */
  const [saved, setSaved] = useState(false);
  const pick = useRef<HTMLInputElement | null>(null);

  // Object URLs are held by the browser until told otherwise.
  useEffect(() => {
    if (!chosen) { setPreview(null); return; }
    const url = URL.createObjectURL(chosen);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [chosen]);

  const load = useCallback(() => {
    api.get(`/api/job-photo?job_id=${encodeURIComponent(job.id)}`)
      .then((r: { installed?: boolean; photos?: P[] }) => { setInstalled(r.installed !== false); setPhotos(r.photos || []); })
      .catch(() => setInstalled(false));
  }, [job.id]);
  useEffect(() => { load(); }, [load]);

  const upload = async () => {
    const f = chosen;
    if (!f) return;
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("job_id", job.id);
      fd.append("caption", form.caption);
      fd.append("pct", form.pct);
      fd.append("taken_on", form.taken_on);
      const r = await fetch("/api/job-photo", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save that photo");
      setForm({ caption: "", pct: String(job.pct ?? ""), taken_on: TODAY });
      setChosen(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
    if (pick.current) pick.current.value = "";
  };

  const remove = async (p: P) => {
    if (!window.confirm("Remove this photo?\n\nThe file is deleted, not hidden.")) return;
    try {
      const r = await fetch(`/api/job-photo?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error || "Could not remove it");
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <>
          {!installed && (
            <div className="text-xs rounded p-2 mb-2" style={{ background: "#FFF7E6", color: "#8A5A00" }}>
              Run migration 0042 — photos have nowhere to go yet.
            </div>
          )}
          {err && <div className="text-xs font-bold rounded p-2 mb-2" style={{ background: "#FBEDEA", color: "var(--red)" }}>{err}</div>}

          {photos.length === 0 && installed && (
            <div className="text-sm mb-3" style={{ color: "var(--muted)" }}>No photographs of this job yet.</div>
          )}

          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))" }}>
            {photos.map((p) => (
              <div key={p.id} className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--line)" }}>
                {p.url && (
                  <button onClick={() => setBig(p)} style={{ display: "block", width: "100%", padding: 0, border: 0, cursor: "zoom-in" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.caption || `Job ${jobNo(job.id)}`} style={{ width: "100%", height: 130, objectFit: "cover", display: "block" }} />
                  </button>
                )}
                <div className="p-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <b className="text-xs tnum" style={{ color: "var(--navy)" }}>
                      {fmtFull(p.taken_on)}
                      {saved && photos[0]?.id === p.id && (
                        <span className="ml-1 rounded px-1" style={{ background: "#E6F4EA", color: "var(--green)", fontSize: 9 }}>SAVED</span>
                      )}
                    </b>
                    {p.pct != null && (
                      <span className="rounded px-1.5 text-xs font-bold" style={{ background: "#E6F4EA", color: "var(--green)" }}>{p.pct}%</span>
                    )}
                  </div>
                  {p.caption && <div className="text-xs mt-0.5" style={{ color: "var(--dim)", lineHeight: 1.45 }}>{p.caption}</div>}
                  <div className="flex items-center justify-between mt-1">
                    <span style={{ fontSize: 10, color: "#B8B5AC" }}>{whoTag(p.by)}</span>
                    {canEdit && (
                      <button onClick={() => remove(p)} className="font-bold" style={{ fontSize: 10, color: "var(--red)" }}>remove</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {canEdit && installed && (
            <div className="rounded-lg border p-3 mt-3" style={{ borderColor: "var(--line)", background: "#FAF9F5" }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold" style={{ color: "var(--muted)" }}>ADD A PHOTO</span>
                {saved && (
                  <span className="rounded px-2 py-0.5 text-xs font-bold" style={{ background: "#E6F4EA", color: "var(--green)" }}>
                    ✓ SAVED
                  </span>
                )}
              </div>
              <div className="flex gap-2 flex-wrap mb-2">
                <label className="text-xs" style={{ color: "var(--dim)" }}>
                  Taken on<br />
                  <input type="date" value={form.taken_on} onChange={(e) => setForm({ ...form, taken_on: e.target.value })}
                    className="text-xs border rounded px-1 py-1" style={{ borderColor: "var(--line)" }} />
                </label>
                <label className="text-xs" style={{ color: "var(--dim)" }}>
                  Completion %<br />
                  <input type="number" min={0} max={100} value={form.pct} onChange={(e) => setForm({ ...form, pct: e.target.value })}
                    className="text-xs border rounded px-1 py-1" style={{ borderColor: "var(--line)", width: 80 }} />
                </label>
                <label className="text-xs flex-1" style={{ color: "var(--dim)", minWidth: 200 }}>
                  What it shows<br />
                  <input value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })}
                    placeholder="optional" className="w-full text-xs border rounded px-2 py-1" style={{ borderColor: "var(--line)" }} />
                </label>
              </div>
              <input ref={pick} type="file" accept="image/*" capture="environment"
                onChange={(e) => { setErr(""); setChosen(e.target.files?.[0] || null); }} style={{ display: "none" }} />

              {chosen && preview ? (
                <div className="flex gap-3 items-center flex-wrap">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="" style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 6, border: "1px solid #E2E0DA" }} />
                  <div style={{ minWidth: 0 }}>
                    <div className="text-xs font-semibold truncate" style={{ color: "var(--ink)", maxWidth: 220 }}>{chosen.name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      {chosen.size > 1e6 ? `${(chosen.size / 1e6).toFixed(1)} MB` : `${Math.round(chosen.size / 1e3)} KB`}
                    </div>
                    <button onClick={() => pick.current?.click()} className="font-bold" style={{ fontSize: 11, color: "var(--blue)" }}>
                      choose a different one
                    </button>
                  </div>
                  <button onClick={upload} disabled={busy}
                    className="rounded px-4 py-1.5 text-sm font-bold text-white"
                    style={{ background: busy ? "#B8B5AC" : "var(--green)" }}>
                    {busy ? "saving…" : "💾 Save photo"}
                  </button>
                  <button onClick={() => { setChosen(null); if (pick.current) pick.current.value = ""; }}
                    className="text-xs font-semibold" style={{ color: "var(--muted)" }}>Cancel</button>
                </div>
              ) : (
                <>
                  <button onClick={() => pick.current?.click()} disabled={busy}
                    className="rounded px-4 py-1.5 text-sm font-bold text-white" style={{ background: busy ? "#B8B5AC" : "#7C3AED" }}>
                    📷 Take or choose a photo
                  </button>
                  <span className="text-xs ml-2" style={{ color: "var(--muted)" }}>
                    the completion is stored as it is today, and does not move afterwards
                  </span>
                </>
              )}
            </div>
          )}
      {big?.url && (
        <div onClick={(e) => { e.stopPropagation(); setBig(null); }}
          className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.85)", zIndex: 61, cursor: "zoom-out" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={big.url} alt={big.caption || ""} style={{ maxWidth: "94vw", maxHeight: "88vh", objectFit: "contain" }} />
        </div>
      )}
    </>
  );
}

// ============================ Job top row ============================

/**
 * What a job is worth, and how much of it is real yet.
 *
 * THE FORMULAS. `tpp` is the throughput PERCENTAGE of a job — what the company
 * earns on it — so the rest of the value is bought-in material:
 *
 *   material   = value × (1 − tpp%)         what has to be purchased
 *   kitted     = material × kitting%        of that, what is in
 *   throughput = value × tpp%               what the company earns
 *   WIP        = kitted + throughput × production%
 *
 * WIP is the one worth explaining. Material is money spent the day it arrives,
 * so all of the kitted value is already in the job. Throughput is not: it is
 * earned by converting that material, so it accrues with production. Adding
 * them gives what is genuinely sunk into the job today — which is a different
 * and more useful number than "value × production %", the figure that treats a
 * job with all its steel on the floor and nothing built as worth nothing.
 */
export function jobMoney(j: Job) {
  const val = j.val || 0;
  const tpp = (j.tpp || 0) / 100;
  const material = val * (1 - tpp);
  const kitted = material * ((j.kit || 0) / 100);
  // tpv is the throughput in rupees where the export carries it; the
  // percentage is the fallback, never both.
  const throughput = j.tpv || val * tpp;
  const wip = kitted + throughput * ((j.pct || 0) / 100);
  // Advance is what has already been paid: the order value less whatever is
  // still due on delivery. Null when nobody has recorded the pending figure —
  // a job with no number is not a job that was paid in full.
  const pending = j.payOnDelivery;
  const advance = pending == null ? null : Math.max(0, val - pending);
  return { val, material, kitted, throughput, wip, pending, advance };
}

export function JobTopRow({
  job, V, sticky, shadow, onShopUpdate,
}: {
  job: Job; V: (n: number) => string; sticky?: boolean; shadow?: boolean; onShopUpdate: () => void;
}) {
  const m = jobMoney(job);
  const Cell = ({ label, children, grow = "1 1 190px" }: { label: string; children: React.ReactNode; grow?: string }) => (
    <div style={{ flex: grow, minWidth: 0 }}>
      <div className="text-xs font-bold" style={{ color: "var(--muted)", letterSpacing: .8, marginBottom: 2 }}>{label}</div>
      {children}
    </div>
  );
  const Pair = ({ a, av, b, bv, ac, bc }: { a: string; av: string; b: string; bv: string; ac?: string; bc?: string }) => (
    <div className="flex gap-3 flex-wrap" style={{ fontSize: 12 }}>
      <span style={{ color: "var(--muted)" }}>{a} <b className="tnum" style={{ color: ac || "var(--ink)" }}>{av}</b></span>
      <span style={{ color: "var(--muted)" }}>{b} <b className="tnum" style={{ color: bc || "var(--ink)" }}>{bv}</b></span>
    </div>
  );

  return (
    <div
      className="rounded-lg border bg-white px-3 py-2 mb-2 job-top"
      style={{
        borderColor: "var(--line)",
        borderLeft: "5px solid #E8600A",
        ...(sticky
          ? { position: "sticky" as const, top: "calc(var(--hdr-h, 92px) + 46px)", zIndex: 21 }
          : {}),
        boxShadow: shadow ? "0 10px 18px -12px rgba(0,0,0,.35)" : undefined,
      }}
    >
      <div className="flex gap-4 flex-wrap items-start">
        {/* 1 — which job */}
        <div style={{ flex: "0 0 150px", minWidth: 0 }}>
          <div className="font-bold" style={{ color: "var(--navy)", fontSize: 24, lineHeight: 1.05 }}>JOB {jobNo(job.id)}</div>
          <a href={erpJobLink(job.id)} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--muted)", fontSize: 11 }}>
            {job.id} ↗
          </a>
        </div>

        {/* 2 — who it is for */}
        <Cell label="CUSTOMER TAG" grow="1 1 240px">
          <div className="text-sm font-semibold truncate" style={{ color: "var(--blue)" }} title={job.tag}>{job.tag}</div>
          <div className="text-xs truncate" style={{ color: "var(--dim)" }} title={`${job.cust} · ${job.fam}`}>
            {job.cust} <span style={{ color: "#B8B5AC" }}>|</span> {job.fam}
          </div>
        </Cell>

        {/* 3 — what it is worth, and how much of it is real */}
        <Cell label="VALUE &amp; PROGRESS" grow="1 1 250px">
          <Pair a="Value" av={V(m.val)} b="Throughput" bv={V(m.throughput)} bc="var(--green)" />
          <Pair a={`Kitting ${job.kit || 0}%`} av={V(m.kitted)} b="of material" bv={V(m.material)} ac="#0D9488" bc="var(--muted)" />
          <Pair a={`Built ${job.pct || 0}%`} av={V(m.wip)} b="WIP" bv="" ac="#7C3AED" />
        </Cell>

        {/* 4 — the money */}
        <Cell label="MONEY" grow="1 1 230px">
          <Pair
            a="Needed next month" av={job.amtNeeded == null ? "—" : V(job.amtNeeded)}
            b="Advance in" bv={m.advance == null ? "not known" : V(m.advance)}
            ac="var(--warn)" bc={m.advance == null ? "#B8B5AC" : "var(--green)"}
          />
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Pending on delivery <b className="tnum" style={{ color: m.pending == null ? "#B8B5AC" : "var(--red)" }}>
              {m.pending == null ? "not recorded" : V(m.pending)}
            </b>
          </div>
          {m.advance != null && (
            <div style={{ fontSize: 10, color: "#B8B5AC" }}>advance = value − pending on delivery</div>
          )}
        </Cell>

        {/* 5 — what the floor last said */}
        <Cell label="SHOP UPDATE" grow="2 1 280px">
          {job.floorSummary ? (
            <>
              <div className="text-xs" style={{ color: "var(--ink)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {redactMoney(job.floorSummary)}
              </div>
              <button onClick={onShopUpdate} className="text-xs font-bold mt-0.5" style={{ color: "#7C3AED" }}>
                all updates ↗
              </button>
            </>
          ) : (
            <div className="text-xs" style={{ color: "#B8B5AC" }}>
              Nothing recorded from the floor yet.{" "}
              <button onClick={onShopUpdate} className="font-bold" style={{ color: "#7C3AED" }}>open</button>
            </div>
          )}
        </Cell>
      </div>
    </div>
  );
}

/**
 * Every shop update on a job, newest first — the summary, then what was said,
 * then the recording itself.
 *
 * All three because they answer different questions. The summary is what you
 * read; the transcript is what you search; the recording is what you fall back
 * to when the words on the page do not sound like what somebody meant.
 */
export function ShopUpdates({ job, onClose }: { job: Job; onClose: () => void }) {
  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.5)", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg w-full" style={{ maxWidth: 720, maxHeight: "88vh", overflow: "auto" }}>
        <div className="px-4 py-3" style={{ background: "var(--navy)", color: "#fff", position: "sticky", top: 0, zIndex: 2 }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold" style={{ letterSpacing: 1.2, color: "#8FA1B3" }}>SHOP UPDATES</div>
              <div className="font-bold" style={{ fontSize: 17 }}>JOB {jobNo(job.id)} · {job.tag}</div>
            </div>
            <button onClick={onClose} style={{ color: "#8FA1B3", fontSize: 18 }}>✕</button>
          </div>
        </div>

        <div className="p-3">
          <ShopUpdatesBody job={job} />
        </div>
      </div>
    </div>
  );
}

/** The history itself, shared by the lightbox and the tab. */
export function ShopUpdatesBody({ job }: { job: Job }) {
  interface N { id: string; url: string | null; seconds: number | null; transcript: string; summary: string; by: string | null; at: string }
  const [notes, setNotes] = useState<N[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/api/voice-note?job_id=${encodeURIComponent(job.id)}`)
      .then((r: { notes?: N[] }) => setNotes(r.notes || []))
      .catch(() => setNotes([]))
      .finally(() => setLoading(false));
  }, [job.id]);

  const todayN = notes.filter((n) => String(n.at).slice(0, 10) === TODAY).length;

  return (
    <>
          {/* Today first. "Nine updates on record" says nothing about whether
              anybody has looked at this job this morning; "2 today" does. */}
          {!loading && (
            <div className="flex items-baseline gap-3 flex-wrap mb-2">
              <span className="rounded px-2 py-1 text-sm font-bold"
                style={{ background: todayN ? "#F3EEFB" : "#F4F2EC", color: todayN ? "#7C3AED" : "var(--muted)" }}>
                {todayN} today
              </span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {notes.length} in total{notes.length ? ` · latest ${new Date(notes[0].at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
              </span>
            </div>
          )}

          {job.floorSummary && (
            <div className="rounded p-3 mb-3" style={{ background: "#F3EEFB", border: "1px solid #C9B6EA" }}>
              <div className="text-xs font-bold" style={{ color: "#7C3AED", letterSpacing: .6 }}>✨ GENIE — THE READ ON THIS JOB</div>
              <div className="text-sm mt-1" style={{ color: "var(--ink)", lineHeight: 1.6 }}>{redactMoney(job.floorSummary)}</div>
              {job.floorSummaryAt && (
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                  from the latest notes · {new Date(job.floorSummaryAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </div>
          )}

          {loading && <div className="text-sm" style={{ color: "var(--muted)" }}>Reading…</div>}
          {!loading && notes.length === 0 && (
            <div className="text-sm" style={{ color: "var(--muted)" }}>
              Nothing recorded on this job yet. Updates are recorded on the <b>On Floor</b> tab.
            </div>
          )}

          {notes.map((n) => (
            <div key={n.id} className="rounded border p-3 mb-2" style={{ borderColor: "var(--line)" }}>
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <b className="text-sm" style={{ color: "var(--navy)" }}>{n.summary || "(no summary)"}</b>
                <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
                  {whoTag(n.by)} · {new Date(n.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {n.seconds ? ` · ${n.seconds}s` : ""}
                </span>
              </div>
              {n.transcript && (
                <div className="text-xs mt-1.5 rounded px-2 py-1.5" style={{ background: "#F4F2EC", color: "var(--dim)", lineHeight: 1.55 }}>
                  {n.transcript}
                </div>
              )}
              {n.url && <audio controls preload="none" src={n.url} style={{ height: 30, width: "100%", marginTop: 6 }} />}
            </div>
          ))}
    </>
  );
}

/**
 * Shop Updates, as a page under the plan rather than a box over it.
 *
 * Same content as the lightbox, and deliberately the same component beneath —
 * the summary first, then every entry newest first with what was said and the
 * recording. Two renderings of one history is two places for them to disagree
 * about the order.
 */
export function ShopUpdatesPanel({ job }: { job: Job }) {
  return (
    <div className="bg-white rounded-lg border p-3 mb-4" style={{ borderColor: "var(--line)" }}>
      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <h2 className="font-bold" style={{ color: "var(--navy)" }}>Shop Updates</h2>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          what the floor has said about JOB {jobNo(job.id)} — newest first · recorded on the On Floor tab
        </span>
      </div>
      <ShopUpdatesBody job={job} />
    </div>
  );
}

/**
 * What Genie heard somebody needs to do — offered, not created.
 *
 * A task list is only worth opening if everything on it was put there on
 * purpose. Things appearing that nobody asked for is how people stop reading
 * the list within a fortnight, so nothing reaches a task list until a person
 * presses Add.
 *
 * Accepting makes an ORDINARY task on the Planning Owner, who reassigns if it
 * belongs elsewhere. Once it exists nothing distinguishes it from a typed one:
 * a task that behaves differently because of where it came from is a task
 * people have to think about before trusting.
 */
export function TaskProposals({ jobId }: { jobId: string }) {
  interface P { id: string; title: string; detail: string; cat: string | null; due: string | null }
  const [items, setItems] = useState<P[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    api.get(`/api/task-proposal?job_id=${encodeURIComponent(jobId)}`)
      .then((r: { proposals?: P[] }) => setItems(r.proposals || []))
      .catch(() => setItems([]));
  }, [jobId]);
  useEffect(() => { load(); }, [load]);

  const act = async (p: P, action: "accept" | "dismiss") => {
    setBusy(p.id); setErr("");
    try {
      const r = await api.post("/api/task-proposal", { action, id: p.id });
      if (action === "accept" && !r.who) {
        setErr("Added — but this job has no Planning Owner, so it is unassigned. Set one on the job, or assign it from Tasking.");
      }
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  if (!items.length && !err) return null;

  return (
    <div className="rounded p-2 mb-1.5" style={{ background: "#FFF7E6", border: "1px solid #E0B25C" }}>
      {items.length > 0 && (
        <div className="text-xs font-bold mb-1" style={{ color: "#8A5A00", letterSpacing: .5 }}>
          ✨ GENIE HEARD {items.length} THING{items.length === 1 ? "" : "S"} TO DO
        </div>
      )}
      {err && <div className="text-xs font-bold mb-1" style={{ color: "var(--red)" }}>{err}</div>}
      {items.map((p) => (
        <div key={p.id} className="rounded bg-white px-2 py-1.5 mb-1" style={{ border: "1px solid #EFE3C8" }}>
          <div className="text-xs font-semibold" style={{ color: "var(--navy)", lineHeight: 1.45 }}>{p.title}</div>
          {p.detail && <div className="text-xs" style={{ color: "var(--muted)", lineHeight: 1.4 }}>{p.detail}</div>}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span style={{ fontSize: 10, color: "var(--muted)" }}>
              {p.cat || "Production"}{p.due ? ` · due ${fmtFull(p.due)}` : " · no date said"}
            </span>
            <button
              onClick={() => act(p, "accept")}
              disabled={busy === p.id}
              className="rounded px-2 py-0.5 font-bold text-white"
              style={{ background: busy === p.id ? "#B8B5AC" : "var(--green)", fontSize: 11 }}
              title="Create this task on the job's Planning Owner, who can reassign it"
            >
              + Add to the job
            </button>
            <button
              onClick={() => act(p, "dismiss")}
              disabled={busy === p.id}
              className="font-bold"
              style={{ color: "var(--muted)", fontSize: 11 }}
              title="Not a task — Genie keeps the rejection so a suggestion that keeps being wrong can be spotted"
            >
              not a task
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}