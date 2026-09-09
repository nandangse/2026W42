"use client";
// split out of PlanningSuite.tsx (Genie 5.0.1.1) — one file per tab, loaded when opened
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/lib/api";

import { LOGO } from "@/lib/logo";

import NextThirtyDays from "../NextThirtyDays";

import { today, fmt, fmtFull, jobNo, initials, diffDays, addDays, isoWeek, otdColor, otdDelay, parseISO, toISO } from "@/lib/schedule";

import RunRate, { useRunRatePayload, type Payload } from "../RunRate";
import { runRate } from "@/lib/run-rate";
import { deliveryReportHtml } from "@/lib/delivery-report";

import DeliveryOutlook from "../DeliveryOutlook";

import YearPanel from "./YearPanel";

import { JobLightbox } from "../JobsInProgress";

import { Board, Job, TODAY, groupAnchor, investedIn, ownerInk, ownerTint, personLabel, stamp } from "./shared";
import { toWip } from "./OnFloor";

/** The commonest non-empty value — used to name a project's customer from its jobs. */
export function mode(vals: (string | null | undefined)[]): string {
  const c: Record<string, number> = {};
  for (const v of vals) { const k = String(v || "").trim(); if (k) c[k] = (c[k] || 0) + 1; }
  const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : "";
}

/**
 * What has to go out every month from here to reach the target.
 *
 * Straight from runRate(), the same function behind the card further down the
 * page -- not re-derived, so the number card and the card below it cannot
 * drift apart.
 */
export function rrPerMonth(p: Payload) {
  const r = runRate(p.to, p.targets, p.actuals);
  return { sales: r.sales.perMonth ?? 0, tp: r.throughput.perMonth ?? 0, days: r.left };
}

/**
 * How much of the target has NO order behind it yet.
 *
 *   target  -  (delivered so far  +  every pending job dated inside this FY)
 *
 * This is deliberately a different question from the run rate. The run rate
 * asks what has to be BUILT from here; this asks what has to be SOLD, because
 * the book already on the floor cannot reach the target on its own. It is the
 * gap nobody in production can close, which is exactly why it is worth its own
 * card rather than being buried in the run rate.
 *
 * Never negative: a target already covered by the book is not a debt.
 */
export function newNeeded(p: Payload) {
  const e = p.anticipated?.expected;
  // No anticipated block means the route is older than this card. Showing the
  // whole target as "new sales needed" would be badly wrong, so show nothing.
  if (!e) return { sales: 0, tp: 0 };
  return {
    sales: Math.max(0, p.targets.sales - e.sales),
    tp: Math.max(0, p.targets.throughput - e.throughput),
  };
}

/**
 * The delivery calendar as a printable A4 sheet.
 *
 * Written into a new window rather than printed from the page: the board's
 * calendar is a scrolling pane inside a scrolling app, and printing that gives
 * you whichever fortnight happened to be on screen. This lays every month out
 * in full, one after another, and prints landscape so a week fits across the
 * page without the job descriptions collapsing to nothing.
 *
 * It carries the date it was produced. A delivery calendar with no date on it
 * gets pinned to a wall and read for a month.
 */
/**
 * Open the delivery report in its own window and go to the print dialog.
 *
 * The document itself is built by deliveryReportHtml() in src/lib -- pure, so
 * it can be rendered and looked at without a browser session (see
 * scratchpad/report/). The last version of this shipped with a blank first
 * page precisely because it could not be checked.
 */
export function printCalendar(
  byDay: Record<string, Job[]>,
  V: (n: number) => string,
  jobs: Job[],
  shipped: { id: string; tag: string; on: string }[],
  ytd: { n: number; sales: number; tp: number } | null,
) {
  if (!jobs.length) { alert("There are no live jobs to report on."); return; }
  const html = deliveryReportHtml({ today: TODAY, byDay, jobs, shipped, ytd, logo: LOGO, V });
  const w = window.open("", "_blank");
  if (!w) { alert("Your browser blocked the print window. Allow pop-ups for this site and press Give PDF again."); return; }
  w.document.write(html);
  w.document.close();
}

/** Throughput in rupees, the same field the TOTAL THROUGHPUT card sums. */
export const tpOf = (j: Job) => j.tpv || 0;

export function DeliveryBoard({
  board,
  V,
  onOpen,
  reload,
  pushERP,
  showForward,
  canFloor,
  canDragTdd,
}: {
  board: Board;
  V: (v: number) => string;
  onOpen: (id: string) => void;
  reload: () => Promise<Board | null>;
  pushERP: (dt: string, id: string, f: string, v: string) => void;
  /** Raghu and Pankaj only — a dragged date goes to the ERP. */
  canDragTdd: boolean;
  /** Stratcom. The two forward-looking cards are theirs. */
  showForward: boolean;
  /** The On Floor tick — Stratcom, planners and admins (28 Aug 2026). */
  canFloor: boolean;
}) {
  /**
   * The year's targets and what is already on the books against them.
   *
   * Read from the same endpoint as the Required Run Rate card further down
   * this page, so the two cannot say different things about one target.
   */
  const rr = useRunRatePayload();
  /**
   * On Floor — is this job actually being worked on right now?
   *
   * Nothing else on a job answers that. Kitting is what was bought, Production
   * is what was built, and a job sits at 40% built for six weeks with nobody
   * touching it. Stratcom says so; everyone else reads it.
   */
  const [floorBusy, setFloorBusy] = useState<string | null>(null);
  const setOnFloor = async (j: Job, on: boolean) => {
    setFloorBusy(j.id);
    try {
      await api.post("/api/on-floor", { job_id: j.id, on });
      await reload();
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    setFloorBusy(null);
  };
  /**
   * What actually went out in the last 30 days, for the calendar.
   *
   * Its own endpoint rather than /api/delivered, which is the LC's: that gate
   * protects the money, and what shipped last week is not a secret from the
   * people who built it. This carries the job, the tag and the day, and
   * nothing else.
   */
  const [shipped, setShipped] = useState<{ id: string; tag: string; on: string }[]>([]);
  /**
   * Delivered since 1 April, for the report's cover.
   *
   * From the run-rate payload rather than counted here: those totals are the
   * ones the board's own cards show, and a report that disagreed with the
   * screen it was printed from would be worse than one without the figure.
   */
  const ytd = rr
    ? { n: rr.deliveries, sales: rr.actuals.sales, tp: rr.actuals.throughput }
    : null;
  useEffect(() => {
    let live = true;
    api.get("/api/delivered/recent")
      .then((r: { jobs?: { id: string; tag: string; on: string }[] }) => { if (live) setShipped(r.jobs || []); })
      // The calendar works without it — green chips are a bonus, not the page.
      .catch(() => {});
    return () => { live = false; };
  }, []);
  const [subTab, setSubTab] = useState<"priority" | "okan" | "cal" | "fam" | "cust">("priority");
  /**
   * The figures above the tabs: open on the Priority List, folded away on the
   * rest.
   *
   * They are the header for the priority list -- that view is the whole book,
   * and the totals are its totals. On the calendar or a product schedule they
   * are half a screen of the same numbers pushing the thing you actually came
   * to look at below the fold.
   *
   * Following the tab rather than being remembered per person: the right
   * default is a property of the view, not of the reader. Anyone can open it
   * anywhere, and it stays open until they move to another tab.
   */
  const [cardsOpen, setCardsOpen] = useState(true);
  useEffect(() => { setCardsOpen(subTab === "priority"); }, [subTab]);
  const [outlook, setOutlook] = useState(false);
  const [delOwn, setDelOwn] = useState("all");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const calRef = useRef<HTMLDivElement | null>(null);
  const scrollCalToToday = () => {
    const c = calRef.current;
    const el = c?.querySelector('[data-today-row="1"]') as HTMLElement | null;
    if (c && el)
      c.scrollTop += el.getBoundingClientRect().top - c.getBoundingClientRect().top - c.clientHeight / 2;
  };
  useEffect(() => {
    if (subTab !== "cal") return;
    const t = setTimeout(scrollCalToToday, 60);
    return () => clearTimeout(t);
  }, [subTab]);

  const [q, setQ] = useState("");
  /**
   * The board opens sorted by Target Delivery Date, soonest first.
   *
   * It used to open on whatever manual priority had last been dragged, which
   * is an order somebody set on a day that has since passed -- so the first
   * rows were not the next deliveries, and the list had to be re-read before
   * it could be used. The date is the one ordering that is right every morning
   * without anybody maintaining it.
   *
   * Manual priority is not lost: "clear sort" puts it straight back, and the
   * saved order is untouched in the meantime.
   */
  const [sortKey, setSortKey] = useState<string>("tdd");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const allJobs = board.jobs;
  const prio = board.priority; // array or null

  // Only Project Owner ACCOUNTS are offered — never raw Jobmaster text. Jobs
  // carry a resolved ownerInitials (see resolveOwners on the server), so the
  // filter matches on that.
  const ownerOptions = useMemo(
    () => (board.projectOwners || []).map((p) => ({ value: p.initials!, label: personLabel(p) })),
    [board.projectOwners],
  );

  // Owner + search are applied ONCE here so every sub-view (priority list,
  // kanban, calendar, by-product, by-customer) and the KPI cards all honour them.
  const jobs = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return allJobs.filter((j) => {
      if (delOwn === "none" && j.ownerInitials) return false;
      if (delOwn !== "all" && delOwn !== "none" && j.ownerInitials !== delOwn) return false;
      if (!needle) return true;
      return (
        j.id.includes(needle) ||
        jobNo(j.id).includes(needle) ||
        j.tag.toLowerCase().includes(needle) ||
        j.cust.toLowerCase().includes(needle) ||
        j.fam.toLowerCase().includes(needle) ||
        j.stat.toLowerCase().includes(needle) ||
        String(j.own || "").toLowerCase().includes(needle) ||
        String(j.proj || "").toLowerCase().includes(needle)
      );
    });
  }, [allJobs, delOwn, q]);

  /** Column sorting for the priority table. Click a header to cycle asc/desc. */
  const sortJobs = (list: Job[]): Job[] => {
    if (!sortKey) return list;
    const val = (j: Job): string | number => {
      switch (sortKey) {
        case "job": return j.id;
        case "tag": return j.tag.toLowerCase();
        case "fam": return j.fam.toLowerCase();
        case "cust": return j.cust.toLowerCase();
        case "tdd": return j.tdd || "9999-12-31";
        case "otd": return j.otd || "9999-12-31";
        case "own": return String(j.own || "").toLowerCase();
        case "stat": return j.stat.toLowerCase();
        case "pct": return j.pct;
        case "val": return j.val;
        case "tpv": return j.tpv;
        case "tpp": return j.tpp;
        case "kit": return j.kit;
        case "inv": return investedIn(j);
        // Not recorded sorts BELOW nothing-due rather than above it: a job with
        // no figure is not the biggest collection on the board.
        case "pod": return j.payOnDelivery == null ? -1 : j.payOnDelivery;
        case "upd": return j.updated_at || "";
        default: return 0;
      }
    };
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b);
      if (x === y) return 0;
      return (x < y ? -1 : 1) * sortDir;
    });
  };
  const toggleSort = (k: string) => {
    if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(1); }
  };

  // Kanban columns are Project Owner accounts present on the filtered jobs,
  // plus one Unassigned column for jobs whose ERP owner matches no account.
  const kanbanOwners = useMemo(() => {
    const set = new Set(jobs.map((j) => j.ownerInitials).filter(Boolean) as string[]);
    const list = [...set].sort();
    return jobs.some((j) => !j.ownerInitials) ? [...list, "Unassigned"] : list;
  }, [jobs]);
  const ownerLabel = (init: string) =>
    init === "Unassigned"
      ? "Unassigned"
      : ownerOptions.find((o) => o.value === init)?.label || init;
  /** Sortable <th>. */
  const SortTh = ({ k, label, align = "left" }: { k: string; label: string; align?: "left" | "center" | "right" }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`px-2 py-2 text-${align} cursor-pointer select-none whitespace-nowrap`}
      style={{ position: "sticky", top: 0, zIndex: 3, background: "var(--ink)", color: sortKey === k ? "var(--amber)" : "#fff" }}
      title={`Sort by ${label}`}
    >
      {label}{sortKey === k ? (sortDir === 1 ? " ▲" : " ▼") : " ⇅"}
    </th>
  );
  const byTDD = useMemo(
    () => [...jobs].sort((a, b) => ((a.tdd || "9999") < (b.tdd || "9999") ? -1 : 1)),
    [jobs],
  );

  const setPrio = async (ids: string[] | null) => {
    await api.post("/api/priority", { order: ids || [] });
    await reload();
  };
  const editStat = async (j: Job, value: string) => {
    try {
      await api.post("/api/job-field", { job_id: j.id, field: "stat", value });
      pushERP("Jobmaster", j.id, "job_status", value);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };
  const groupBy = (key: "fam" | "cust"): [string, Job[]][] => {
    const g: Record<string, Job[]> = {};
    byTDD.forEach((j) => (g[j[key]] = g[j[key]] || []).push(j));
    return Object.entries(g).sort((a, b) =>
      (a[1][0].tdd || "9999") < (b[1][0].tdd || "9999") ? -1 : 1,
    );
  };

  /**
   * A job number shows the JOB, not another screen (Dr Raghu, 2 Sep 2026:
   * "in all these views the clicking of the job should first give lightbox
   * then the person can click deeper").
   *
   * It used to jump straight to the milestone plan, which is a long way to
   * travel to answer "what is this one?" — and a long way back. The lightbox
   * answers it in place and carries its own button onward for the people who
   * actually wanted the plan.
   */
  const [picked, setPicked] = useState<Job | null>(null);
  /**
   * Jumping from the summary row to the family's own jobs. The group name is
   * free text off the ERP -- "AGSE - Hi Lift", "DEF-Customised" -- so it is
   * encoded rather than dropped into an id raw, where a space or a slash would
   * quietly break the lookup.
   */
  /**
   * DRAGGING A JOB TO ANOTHER DAY (Dr Raghu, 2 Sep 2026: "in the calendar
   * view, can we make the job draf and drop?").
   *
   * A drag here is not a cosmetic move: the day you drop on becomes the job's
   * TARGET DELIVERY DATE, it is written through the same /api/job-field the
   * lightbox uses, and it QUEUES FOR THE ERP like any other correction. That
   * is the whole point -- the calendar is where a date is best judged -- but
   * it is also why the drop asks first. A date that a slip of the mouse can
   * change is a date nobody can trust, and this one travels to Jobmaster.
   */
  const [dragJob, setDragJob] = useState<Job | null>(null);
  const [dropDay, setDropDay] = useState<string | null>(null);
  const moveTdd = useCallback(async (day: string) => {
    const j = dragJob;
    setDropDay(null); setDragJob(null);
    if (!j || !canDragTdd) return;
    if ((j.tdd || "").slice(0, 10) === day) return;          // dropped where it already was
    const ok = window.confirm(
      `Move ${jobNo(j.id)} — ${j.tag}\n\n`
      + `Target delivery ${fmtFull(j.tdd)}  →  ${fmtFull(day)}\n\n`
      + `This changes the job's Target Delivery Date and queues it to go back to the ERP.`,
    );
    if (!ok) return;
    const r = await api.post("/api/job-field", { job_id: j.id, field: "tdd", value: day });
    if (!r.ok) { window.alert(`Could not move it: ${r.error || "unknown error"}`); return; }
    await reload();
  }, [dragJob, canDragTdd, reload]);

  const [jumped, setJumped] = useState<string | null>(null);
  const jumpTo = useCallback((g: string) => {
    setJumped(g);
    // The section renders below in the same pass; wait for the frame.
    requestAnimationFrame(() => {
      document.getElementById(groupAnchor(g))?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    // The highlight is a pointer, not a state — it should fade.
    window.setTimeout(() => setJumped((cur) => (cur === g ? null : cur)), 2600);
  }, []);

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
  /** Which column of the 30-day strip the mouse is over. */
  const [hoverDay, setHoverDay] = useState<string | null>(null);

  const JobLink = ({ j }: { j: Job }) => (
    <button onClick={() => setPicked(j)} className="font-bold underline decoration-dotted" style={{ color: "var(--blue)" }}
      title={`${jobNo(j.id)} · ${j.tag}\n${j.cust}\n\nStatus: ${j.stat}\nKitting ${j.kit}% · Production ${j.pct}%\nTDD ${fmtFull(j.tdd)} · OTD ${fmtFull(j.otd)}\n\nClick to open the job.`}>
      {jobNo(j.id)}
    </button>
  );

  // ---- KPI cards ----
  const totVal = jobs.reduce((s, j) => s + j.val, 0);
  const totTp = jobs.reduce((s, j) => s + (j.tpv || 0), 0);
  /** Counted from the SAME filtered list as every other card on this row. */
  const onFloorJobs = jobs.filter((j) => j.onFloor);
  const matVal = jobs.reduce((s, j) => s + j.val * (1 - (j.tpp || 0) / 100), 0);
  const kitted = jobs.reduce((s, j) => s + j.val * (1 - (j.tpp || 0) / 100) * ((j.kit || 0) / 100), 0);
  const kitPct = matVal ? Math.round((kitted / matVal) * 100) : 0;
  const Card = ({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) => (
    <div className="bg-white rounded-lg border px-3 py-2" style={{ borderColor: "var(--line)", borderTop: `3px solid ${color}` }}>
      <div className="text-xs font-bold" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="text-xl font-bold tnum" style={{ color }}>{value}</div>
      {sub && <div className="text-xs" style={{ color: "var(--muted)" }}>{sub}</div>}
    </div>
  );

  const OutlookCard = ({ label, value, sub, color, onClick, open }: { label: string; value: string | number; sub?: string; color: string; onClick: () => void; open: boolean }) => (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      className="bg-white rounded-lg border px-3 py-2"
      style={{ borderColor: open ? color : "var(--line)", borderTop: `3px solid ${color}`, cursor: "pointer", boxShadow: open ? `0 0 0 1px ${color}` : undefined }}
      title={open ? "Hide the delivery outlook" : "Open the delivery outlook — what is coming, month by month, and which jobs are worth finishing"}
    >
      <div className="text-xs font-bold flex justify-between" style={{ color: "var(--muted)" }}>
        <span>{label}</span><span style={{ color }}>{open ? "▲" : "▼"}</span>
      </div>
      <div className="text-xl font-bold tnum" style={{ color }}>{value}</div>
      {sub && <div className="text-xs" style={{ color: "var(--muted)" }}>{sub}</div>}
    </div>
  );

  const SubBtn = ({ k, l }: { k: typeof subTab; l: string }) => (
    <button onClick={() => setSubTab(k)} className="px-3 py-1 rounded text-sm font-semibold" style={subTab === k ? { background: "var(--ink)", color: "#fff" } : { color: "var(--dim)" }}>{l}</button>
  );

  return (
    <div className="p-4">
      {!cardsOpen && (
        <div
          className="bg-white rounded-lg border px-3 py-1.5 mb-3 flex items-center gap-3 flex-wrap"
          style={{ borderColor: "var(--line)", cursor: "pointer" }}
          role="button" tabIndex={0} onClick={() => setCardsOpen(true)}
          title="Show the totals and the run rate"
        >
          <span className="text-xs font-bold" style={{ color: "var(--muted)" }}>THE BOOK</span>
          <span className="text-sm font-bold tnum" style={{ color: "var(--navy)" }}>{jobs.length} jobs</span>
          <span className="text-sm tnum" style={{ color: "var(--blue)" }}>{V(totVal)}</span>
          <span className="text-sm tnum" style={{ color: "var(--accent)" }}>{V(totTp)} throughput</span>
          <span className="text-sm tnum" style={{ color: "#0D9488" }}>{kitPct}% kitted</span>
          <span className="text-sm tnum" style={{ color: "var(--green)" }}>{onFloorJobs.length} on floor</span>
          <button
            onClick={(e) => { e.stopPropagation(); setCardsOpen(true); }}
            className="ml-auto rounded px-2 py-0.5 text-xs font-bold"
            style={{ background: "#F4F2EC", color: "var(--dim)" }}
            title="Show the totals and the run rate"
          >
            ⌄ Show totals
          </button>
        </div>
      )}

      {cardsOpen && (<>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-3">
        <OutlookCard label="PENDING JOBS" value={jobs.length} sub={outlook ? "hide the outlook" : "open the delivery outlook"} color="var(--navy)"
          open={outlook} onClick={() => setOutlook((o) => !o)} />
        <Card label="TOTAL VALUE" value={V(totVal)} color="var(--blue)" />
        <Card label="TOTAL THROUGHPUT" value={V(totTp)} sub={totVal ? Math.round((totTp / totVal) * 100) + "% of value" : ""} color="var(--accent)" />
        <Card label="KITTING %" value={kitPct + "%"} sub="Σ val × (1−T%) × Kit% ÷ Σ val × (1−T%)" color="#0D9488" />
        <Card label="KITTED MATERIAL VALUE" value={V(kitted)} sub="Σ value × (1 − T%) × Kitting%" color="#7C3AED" />
        <Card
          label="ON FLOOR"
          value={String(onFloorJobs.length)}
          sub={
            onFloorJobs.length
              // Value AND throughput: nineteen jobs on the floor is a different
              // sentence depending on whether they invoice ₹10 Cr or ₹1 Cr, and
              // what the company earns on them is a third number again.
              ? `${V(onFloorJobs.reduce((s2, j) => s2 + (j.val || 0), 0))} value · ${V(onFloorJobs.reduce((s2, j) => s2 + tpOf(j), 0))} throughput`
              : "nothing marked as being worked on"
          }
          color={onFloorJobs.length ? "var(--green)" : "var(--muted)"}
        />
      </div>

      {/*
        Two forward-looking cards, Stratcom only.

        The five above are the book as it stands. These two are the year: what
        has to go out every month from here, and how much of the target has no
        order behind it yet. The second is the one that cannot be fixed on the
        shop floor, which is why it is stated separately rather than folded
        into the run rate.
      */}
      {showForward && rr?.hasTarget && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
          <Card
            label="REQUIRED RUN RATE"
            value={`${V(rrPerMonth(rr).sales)} / month`}
            sub={`sales · with ${V(rrPerMonth(rr).tp)} / month throughput · ${rrPerMonth(rr).days} days left`}
            color="var(--red)"
          />
          <Card
            label="NEW SALES NEEDED — WITH DELIVERY INSIDE THIS YEAR"
            value={V(newNeeded(rr).sales)}
            sub={
              newNeeded(rr).sales > 0
                ? `sales · and ${V(newNeeded(rr).tp)} throughput · orders not yet on the book, to be WON AND DELIVERED before 31 March`
                : "the book already covers the target — nothing further has to be won to reach it"
            }
            color={newNeeded(rr).sales > 0 ? "var(--warn)" : "var(--green)"}
          />
        </div>
      )}

      {/*
        THE YEAR — the month spine and whose confidence sits behind it
        (Dr Raghu, 9 Sep 2026). Placed directly under the number cards and
        inside the same fold, so "Hide totals" puts it away with them: it is
        the same question those cards raise, answered month by month.
      */}
      <YearPanel
        jobs={jobs}
        V={V}
        planPerMonth={showForward && rr?.hasTarget ? rrPerMonth(rr).sales : null}
        planTpPerMonth={showForward && rr?.hasTarget ? rrPerMonth(rr).tp : null}
        onOpen={(id) => { const j = jobs.find((x) => x.id === id); if (j) setPicked(j); }}
      />

      {/* Opened from the PENDING JOBS card. It reads the SAME filtered list the
          rest of the board is showing, so the owner filter and the search box
          carry into it — an analytics panel that quietly ignores the filter
          above it is how two people end up quoting different numbers. */}
      {outlook && <DeliveryOutlook jobs={jobs} V={V} onOpen={onOpen} />}

      {/* The cards above are the live pending book — what is still to come.
          This is the year against its target — what has actually gone out. The
          two are deliberately adjacent: what is left to bill only means
          something beside what is left to build. */}
      <RunRate V={V} />

      {/* Collapsing is offered everywhere, including the Priority List --
          somebody who knows the totals should be able to put them away. */}
      <div className="flex justify-end -mt-1 mb-2">
        <button
          onClick={() => setCardsOpen(false)}
          className="rounded px-2 py-0.5 text-xs font-bold"
          style={{ background: "#F4F2EC", color: "var(--dim)" }}
          title="Fold the totals away"
        >
          ⌃ Hide totals
        </button>
      </div>
      </>)}

      <div className="flex gap-1 rounded p-1 bg-white border mb-3 flex-wrap" style={{ borderColor: "var(--line)", width: "fit-content" }}>
        <SubBtn k="priority" l="Priority List (A60 → O)" />
        <SubBtn k="okan" l="By Planning Owner (Kanban)" />
        <SubBtn k="cal" l="📅 Calendar (ISO weeks)" />
        <SubBtn k="fam" l="Schedule by Product" />
        <SubBtn k="cust" l="Schedule by Customer" />
        <select value={delOwn} onChange={(e) => setDelOwn(e.target.value)} className="px-2 py-1 rounded border text-sm ml-1 font-semibold" style={{ borderColor: delOwn === "all" ? "#D9D6CD" : "var(--accent)", background: delOwn === "all" ? "#fff" : "#FFF3E8", color: delOwn === "all" ? "var(--ink)" : "var(--accent)" }} title="Filter every view on this board by Planning Owner">
          <option value="all">All planning owners</option>
          {ownerOptions.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
          {ownerOptions.length === 0 && <option disabled>No Planning Owner accounts yet</option>}
          <option value="none">— Unassigned jobs —</option>
        </select>
        <div className="relative">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 Search job no, tag, customer, product, status…"
            className="px-2 py-1 rounded border text-sm"
            style={{ borderColor: q ? "var(--accent)" : "#D9D6CD", minWidth: 290 }}
          />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-2 top-1 font-bold" style={{ color: "var(--accent)" }} title="Clear search">✕</button>
          )}
        </div>
        {(delOwn !== "all" || q) && (
          <button onClick={() => { setDelOwn("all"); setQ(""); }} className="px-2 py-1 rounded text-xs font-bold" style={{ background: "var(--accent)", color: "#fff" }} title="Clear filters">
            {jobs.length} of {allJobs.length} jobs · clear ✕
          </button>
        )}
      </div>

      {/* ---- Calendar (ISO weeks) — one continuous scroll through the months ---- */}
      {subTab === "cal" && (() => {
        const tdds = jobs.map((j) => j.tdd).filter(Boolean) as string[];
        const lo0 = tdds.length ? tdds.reduce((a, b) => (a < b ? a : b)) : TODAY;
        const hi0 = tdds.length ? tdds.reduce((a, b) => (a > b ? a : b)) : TODAY;
        const lo = lo0 < TODAY ? lo0 : TODAY;
        let hi = hi0 > TODAY ? hi0 : TODAY;
        if (diffDays(lo, hi) > 730) hi = addDays(lo, 730); // clamp to ~24 months of rows
        // full Mon–Sun weeks covering from the 1st of the earliest month to the end of the latest
        const start = parseISO(lo.slice(0, 7) + "-01");
        start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
        const hiD = parseISO(hi);
        const end = new Date(Date.UTC(hiD.getUTCFullYear(), hiD.getUTCMonth() + 1, 0));
        end.setUTCDate(end.getUTCDate() + (6 - ((end.getUTCDay() + 6) % 7)));
        const weeks: string[][] = [];
        for (let d = new Date(start); d <= end; ) {
          const wk: string[] = [];
          for (let k = 0; k < 7; k++) { wk.push(toISO(new Date(d))); d.setUTCDate(d.getUTCDate() + 1); }
          weeks.push(wk);
        }
        const byDay: Record<string, Job[]> = {};
        jobs.forEach((j) => { if (j.tdd) (byDay[j.tdd] = byDay[j.tdd] || []).push(j); });
        // Delivered, keyed by the day it actually WENT — not the day it was
        // promised. A job that shipped late belongs on the day it shipped;
        // filing it under its old target date would draw a calendar of
        // intentions rather than of deliveries.
        const doneDay: Record<string, { id: string; tag: string; on: string }[]> = {};
        shipped.forEach((d) => { (doneDay[d.on] = doneDay[d.on] || []).push(d); });
        const monthOf = (iso: string) => parseISO(iso).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
        let lastMonth = "";
        return (
          <div className="bg-white rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div className="font-bold" style={{ color: "var(--navy)" }}>Delivery calendar <span className="text-xs font-normal" style={{ color: "var(--muted)" }}>· continuous — scroll through the months · jobs on their Target Delivery Date · ISO weeks on the left</span></div>
              <div className="flex gap-2">
                <button onClick={() => printCalendar(byDay, V, jobs, shipped, ytd)} className="px-2 py-1 rounded text-xs font-bold" style={{ background: "var(--ink)", color: "#fff" }} title="Open a printable A4 landscape copy of this calendar, dated today, and go straight to Save as PDF">🖨 Give PDF</button>
                <button onClick={scrollCalToToday} className="px-2 py-1 rounded text-xs font-bold" style={{ background: "var(--accent)", color: "#fff" }}>⤓ Jump to today</button>
              </div>
            </div>
            {/* GONE, AND THEREFORE INVISIBLE (Dr Raghu, 9 Sep 2026: "the
                delivered jobs should be on the board too so we know it's
                gone", and then: "board means the calendar view only").
                A delivered job leaves the active board — rightly, it is not
                work any more — so its chip sits on the day it WENT and its
                TDD cell falls silent. Look at Wednesday and nothing was due;
                in fact two Navy sets were due and had already gone on the
                Tuesday. This says so, above the grid, before anyone scrolls.
                A count and names, no value: the feed this board is allowed to
                read carries the job, the tag and the day and nothing else, on
                purpose, because the page is open to more readers than the
                Leadership Circle's. */}
            {(() => {
              const goneWeek = shipped
                .filter((d) => d.on >= addDays(TODAY, -7) && d.on <= TODAY)
                .sort((a, b) => b.on.localeCompare(a.on));
              if (!goneWeek.length) return null;
              return (
                <div className="rounded p-2 mb-2" style={{ background: "#E9F5EC", border: "1px solid #BFDCC6" }}>
                  <div className="text-xs font-bold" style={{ color: "var(--green)", letterSpacing: .5 }}>
                    ✓ LEFT THE GATE THIS WEEK — {goneWeek.length} job{goneWeek.length === 1 ? "" : "s"}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {goneWeek.map((d) => (
                      <span key={d.id} title={`Delivered ${fmtFull(d.on)} · ${d.tag}`}
                        className="rounded px-2 py-0.5"
                        style={{ background: "var(--green)", color: "#fff", fontSize: 11, fontWeight: 700 }}>
                        {jobNo(d.id)} <span style={{ fontWeight: 400, opacity: .9 }}>{d.tag}</span>
                        <span style={{ fontWeight: 400, opacity: .75 }}> · {fmt(d.on)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
            <div ref={calRef} style={{ maxHeight: "70vh", overflowY: "auto" }}>
              <table className="w-full text-xs genie-table" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th className="px-1 py-1.5" style={{ width: 58, position: "sticky", top: 0, zIndex: 6, background: "var(--ink)", color: "#fff" }}>ISO Wk</th>
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                      <th key={d} className="px-1 py-1.5" style={{ position: "sticky", top: 0, zIndex: 6, background: "var(--ink)", color: "#fff" }}>{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((wk) => {
                    const rows: React.ReactNode[] = [];
                    const mLabel = monthOf(wk[3]); // the week's Thursday decides which month owns it (ISO convention)
                    if (mLabel !== lastMonth) {
                      lastMonth = mLabel;
                      rows.push(
                        <tr key={"m" + wk[0]}>
                          <td colSpan={8} className="px-2 py-1.5 font-bold" style={{ background: "var(--navy)", color: "var(--amber)", position: "sticky", top: 28, zIndex: 5 }}>{mLabel}</td>
                        </tr>,
                      );
                    }
                    const wkCount = wk.reduce((n, d2) => n + (byDay[d2] || []).length, 0);
                    const wkVal = wk.reduce((v, d2) => v + (byDay[d2] || []).reduce((x, j) => x + (j.val || 0), 0), 0);
                    /* WHAT ACTUALLY WENT, BESIDE WHAT WAS DUE (Dr Raghu, 9 Sep
                       2026: "in this view also show the deliveries that have
                       happened in the last week as green").
                       The day cells have carried green delivery chips all
                       along; the week cell only ever counted what was OWED
                       that week, so a week could read "18 jobs" and say
                       nothing about the four that left the gate. A COUNT and
                       no value: this board is deliberately open to more
                       readers than the LC's page, and its delivery feed
                       carries no money on purpose. */
                    const wkDone = wk.reduce((n, d2) => n + (doneDay[d2] || []).length, 0);
                    const isTodayWk = wk[0] <= TODAY && TODAY <= wk[6];
                    rows.push(
                      <tr key={wk[0]} data-today-row={isTodayWk ? "1" : undefined} className="border-t align-top" style={{ borderColor: "var(--line-soft)" }}>
                        <td className="px-1 py-1 font-bold text-center" style={{ background: isTodayWk ? "#FFF3E8" : "#F4F2EC", color: "var(--blue)" }}>
                          W{isoWeek(wk[0])}
                          {wkCount > 0 && (<div className="font-normal" style={{ color: "var(--muted)", fontSize: 9 }}>{wkCount} job{wkCount === 1 ? "" : "s"}<br />{V(wkVal)}</div>)}
                          {wkDone > 0 && (
                            <div className="font-bold" style={{ color: "var(--green)", fontSize: 9.5, marginTop: 2 }}
                              title={`${wkDone} job${wkDone === 1 ? "" : "s"} actually delivered in this week`}>
                              ✓ {wkDone} out
                            </div>
                          )}
                        </td>
                        {wk.map((d2) => {
                          const list = byDay[d2] || [];
                          return (
                            <td key={d2} className="px-1 py-1 border-l"
                              onDragOver={(ev) => { if (dragJob) { ev.preventDefault(); setDropDay(d2); } }}
                              onDragLeave={() => setDropDay((c) => (c === d2 ? null : c))}
                              onDrop={(ev) => { ev.preventDefault(); void moveTdd(d2); }}
                              style={{
                                borderColor: "var(--line-soft)", height: 78,
                                background: dropDay === d2 && dragJob ? "#E8F3E9" : d2 === TODAY ? "#FFF3E8" : "#fff",
                                outline: dropDay === d2 && dragJob ? "2px dashed #0D7A3F" : undefined,
                              }}>
                              <div className="font-bold tnum" style={{ color: d2 === TODAY ? "var(--accent)" : "var(--muted)" }}>
                                {parseInt(d2.slice(8), 10)}
                                {list.length > 1 && <span style={{ color: "var(--blue)" }}> ({list.length})</span>}
                                {d2 === TODAY ? " · today" : ""}
                              </div>
                              {list.map((j) => (
                                <div
                                  key={j.id}
                                  /* THE LIGHTBOX FIRST (Dr Raghu, 2 Sep 2026:
                                     "in this view also please make the lightbox
                                     job open up!" — and before that, "in all
                                     these views the clicking of the job should
                                     first give lightbox then the poerson can
                                     click deeper"). The calendar was the last
                                     place still jumping straight to the full
                                     job. */
                                  role="button" tabIndex={0} onClick={() => setPicked(j)}
                                  draggable={canDragTdd}
                                  onDragStart={(ev) => { setDragJob(j); ev.dataTransfer.effectAllowed = "move"; }}
                                  onDragEnd={() => { setDragJob(null); setDropDay(null); }}
                                  title={`${j.tag} · ${j.cust} · ${j.stat || ""} — click for the job's read${canDragTdd ? " · drag to another day to change its target delivery date" : ""}`}
                                  className="rounded px-1 py-0.5 mb-0.5 cursor-pointer"
                                  style={{
                                    background: j.tdd && j.tdd < TODAY ? "var(--red)" : ownerTint(j.ownerName || j.ownerInitials || j.own),
                                    color: j.tdd && j.tdd < TODAY ? "#fff" : ownerInk(j.ownerName || j.ownerInitials || j.own),
                                    fontSize: 9, overflow: "hidden",
                                    opacity: dragJob?.id === j.id ? .4 : 1,
                                  }}
                                >
                                  {/* Two lines: the job number always readable,
                                      the description given the room to be read.
                                      One truncated line meant every chip on a
                                      busy day said "Single Stage Scissor…". */}
                                  <div className="font-bold tnum">{jobNo(j.id)}</div>
                                  <div style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.25 }}>{j.tag}</div>
                                </div>
                              ))}
                              {(doneDay[d2] || []).map((d) => (
                                <div
                                  key={"d" + d.id}
                                  title={`DELIVERED ${fmtFull(d.on)} · ${d.tag}`}
                                  className="rounded px-1 py-0.5 mb-0.5"
                                  style={{ background: "var(--green)", color: "#fff", fontSize: 9, overflow: "hidden" }}
                                >
                                  <div className="font-bold tnum">✓ {jobNo(d.id)}</div>
                                  <div style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.25 }}>{d.tag}</div>
                                </div>
                              ))}
                            </td>
                          );
                        })}
                      </tr>,
                    );
                    return rows;
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>Scroll for more months · tap a job chip to open its milestone plan · <b style={{ color: "var(--green)" }}>green = delivered</b>, on the day it actually went, last 30 days · the week cell&apos;s <b style={{ color: "var(--green)" }}>✓ n out</b> is what left the gate that week, against what was due · red chip = TDD already past · (n) = jobs due that day · week cell shows count &amp; value due that ISO week</div>
          </div>
        );
      })()}

      {/* ---- Priority List (drag to reorder) ---- */}
      {/* ── THE NEXT THIRTY DAYS (Dr Raghu, 2 Sep 2026) ──────────────────
          "Show a calendar view on one line … Show number of jobs TDD for each
          day … Firt column show - previous, last colum show later …
          On mobile this can be skipped. Only on computer."

          The priority list answers what to do first. This answers a different
          question in one glance — WHEN the month actually lands — and the two
          ends matter as much as the middle: everything already overdue is
          gathered into PREVIOUS, everything beyond the horizon into LATER, so
          no job is invisible merely because it falls outside thirty days.

          Sunday is yellow and carries its ISO week, because a delivery date
          on a Sunday is worth seeing before it is promised.

          `hidden md:block` — a thirty-column strip on a phone is a smear, and
          he said so. */}
      {subTab === "priority" && <NextThirtyDays jobs={byTDD} />}

      {subTab === "priority" && (() => {
        const base = prio
          ? prio.map((id) => byTDD.find((j) => j.id === id)).filter(Boolean).concat(byTDD.filter((j) => !prio.includes(j.id))) as Job[]
          : byTDD;
        const plist = sortJobs(base); // owner/search filtered upstream, then sorted
        // reordering writes the full priority list, so only allow it unfiltered
        const canDrag = delOwn === "all" && !q && !sortKey;
        const onDrop = (ti: number) => {
          if (dragIdx === null || dragIdx === ti) return;
          const ids = base.map((j) => j.id);
          const [moved] = ids.splice(dragIdx, 1);
          ids.splice(ti, 0, moved);
          setDragIdx(null);
          pushERP("Jobmaster", moved, "priority_rank", `position ${ti + 1}`);
          setPrio(ids);
        };
        return (
          <div className="bg-white rounded-lg border" style={{ borderColor: "var(--line)" }}>
            <div className="px-3 pt-2 pb-1 text-xs flex justify-between flex-wrap gap-2" style={{ color: "var(--muted)" }}>
              <span>
                {canDrag
                  ? "⠿ Drag any row to set manual priority"
                  : sortKey
                    ? "Sorted by column — clear the sort to drag-reorder"
                    : "Filter active — clear it to drag-reorder"}
                {sortKey
                  ? prio
                    ? " · manual order saved — clear the sort to see it"
                    : ""
                  : prio
                    ? " · manual order active"
                    : " · sorted by Target Delivery Date"}
                {sortKey && <button onClick={() => setSortKey("")} className="ml-2 font-bold" style={{ color: "var(--accent)" }}>↺ clear sort</button>}
              </span>
              {prio && <button onClick={() => setPrio(null)} className="font-bold" style={{ color: "var(--accent)" }}>↺ Reset to TDD order</button>}
            </div>
            {/* the header sticks while the rows scroll */}
            <div className="overflow-auto" style={{ maxHeight: "68vh" }}>
            <table className="w-full text-xs genie-table" style={{ minWidth: 1040, borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr style={{ background: "var(--ink)", color: "#fff" }}>
                  <th className="px-2 py-2 text-left" style={{ position: "sticky", top: 0, zIndex: 3, background: "var(--ink)" }}>Pri</th>
                  <SortTh k="job" label="Job" />
                  <th className="px-2 py-2 text-center" style={{ position: "sticky", top: 0, zIndex: 3, background: "var(--ink)" }}
                      title={canFloor ? "Tick the jobs actually being worked on right now. Stratcom and planners." : "The jobs actually being worked on right now. Stratcom and planners set this."}>
                    On Floor
                  </th>
                  <SortTh k="tag" label="Customer Tag" />
                  <SortTh k="fam" label="Product Family" />
                  <SortTh k="tdd" label="Target Delivery" align="center" />
                  <SortTh k="otd" label="OTD Date" align="center" />
                  <SortTh k="own" label="Planning Owner" />
                  {/* Job Status is gone from this table — it is a 32-value
                      dropdown that ate 190px on every row to say what Prod %
                      says in three characters. Still editable on the Job Plan
                      page and still on the kanban card. */}
                  <SortTh k="pct" label="Prod %" align="center" />
                  <SortTh k="kit" label="Kit%" align="center" />
                  <SortTh k="val" label="Value" align="center" />
                  <SortTh k="tpv" label="Throughput" align="center" />
                  <SortTh k="tpp" label="T%" align="center" />
                  <SortTh k="inv" label="Invested" align="center" />
                  <SortTh k="pod" label="Pay on Delivery" align="center" />
                  <SortTh k="upd" label="Last updated" align="center" />
                </tr>
              </thead>
              <tbody>
                {plist.map((j, i) => (
                  <tr key={j.id} draggable={canDrag} onDragStart={() => setDragIdx(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(i)} className="border-t" style={{ borderColor: "var(--line-soft)", background: dragIdx === i ? "#FFF3E8" : i % 2 ? "#FAF9F5" : "#fff", cursor: canDrag ? "grab" : "default" }} title={j.note}>
                    <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: "var(--muted)" }}>{canDrag && <span style={{ color: "#B8B5AC" }}>⠿ </span>}<b style={{ color: "var(--accent)" }}>{i + 1}</b></td>
                    <td className="px-2 py-1.5"><JobLink j={j} /></td>
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={!!j.onFloor}
                        disabled={!canFloor || floorBusy === j.id}
                        onChange={(e) => setOnFloor(j, e.target.checked)}
                        style={{ accentColor: "var(--green)", width: 14, height: 14, cursor: canFloor ? "pointer" : "default" }}
                        title={
                          canFloor
                            ? j.onFloor ? "On the floor — untick when it comes off" : "Tick when work actually starts on it"
                            : j.onFloor ? "On the floor" : "Not on the floor"
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5 font-medium">{j.tag}</td>
                    <td className="px-2 py-1.5" style={{ color: "var(--dim)" }}>{j.fam}</td>
                    <td className="px-2 py-1.5 text-center font-bold whitespace-nowrap tnum" style={{ color: j.tdd && j.tdd < TODAY ? "var(--red)" : "var(--ink)" }}>{fmtFull(j.tdd)}</td>
                    <td className="px-2 py-1.5 text-center font-bold whitespace-nowrap tnum" style={{ color: otdColor(j.otd) }}>{fmtFull(j.otd)}{otdDelay(j) && (<div style={{ fontSize: 10 }}>+{otdDelay(j)}d late</div>)}</td>
                    <td className="px-2 py-1.5" style={{ color: j.ownerInitials ? "var(--blue)" : "#B8B5AC" }} title={j.own ? `Jobmaster: ${j.own}` : "No owner in the Jobmaster"}>
                      {j.ownerInitials ? (
                        <><span className="font-bold rounded px-1 mr-1" style={{ background: "#DCE8F5" }}>{j.ownerInitials}</span>{j.ownerName}</>
                      ) : (j.own || "—")}
                    </td>
                    <td className="px-2 py-1.5 text-center tnum">{j.pct}%</td>
                    <td className="px-2 py-1.5 text-center tnum" style={{ color: (j.kit || 0) >= 80 ? "var(--green)" : (j.kit || 0) >= 40 ? "var(--warn)" : "var(--red)" }}>{j.kit || 0}%</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap tnum">{V(j.val)}</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap tnum" style={{ color: "var(--accent)" }}>{V(j.tpv || 0)}</td>
                    <td className="px-2 py-1.5 text-center tnum">{j.tpp || 0}%</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap tnum" style={{ color: "#7C3AED" }}
                      title={`Invested = (1 − ${j.tpp || 0}%) × ${j.kit || 0}% × ${V(j.val)}\nMaterial value already drawn against this job.`}>
                      {V(investedIn(j))}
                    </td>
                    {/* Null is "not recorded" and reads as a dash. Zero would be
                        "nothing to collect", and sorting must not treat a gap in
                        the export as a job with no money behind it. */}
                    <td className="px-2 py-1.5 text-right whitespace-nowrap tnum"
                      style={{ color: j.payOnDelivery == null ? "#B8B5AC" : "var(--green)", fontWeight: j.payOnDelivery ? 700 : 400 }}
                      title={j.payOnDelivery == null ? "Not recorded in the Jobmaster export" : "Falls due when this job is delivered"}>
                      {j.payOnDelivery == null ? "—" : V(j.payOnDelivery)}
                    </td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap" style={{ color: "var(--muted)" }}>{stamp(j.updated_at)}</td>
                  </tr>
                ))}
                {plist.length === 0 && (
                  <tr><td colSpan={15} className="py-6 text-center" style={{ color: "var(--muted)" }}>No jobs match this filter.</td></tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        );
      })()}

      {/* ---- By Planning Owner (Kanban) ---- */}
      {subTab === "okan" && (
        <div className="flex gap-3 overflow-x-auto pb-2 items-start">
          {(delOwn === "all" ? kanbanOwners : [delOwn]).map((o) => {
            const ojobs = byTDD.filter((j) => (o === "Unassigned" ? !j.ownerInitials : j.ownerInitials === o));
            if (!ojobs.length) return null;
            return (
              <div key={o} style={{ minWidth: 250, maxWidth: 270 }}>
                <div className="rounded-t-lg p-2" style={{ background: "var(--navy)", color: "#fff", borderBottom: "3px solid #E8600A" }}>
                  <div className="flex justify-between items-baseline">
                    <span className="font-bold text-sm" style={{ color: "var(--amber)" }}>{ownerLabel(o)}</span>
                    <span className="text-xs">{ojobs.length} jobs · {V(ojobs.reduce((s, j) => s + j.val, 0))}</span>
                  </div>
                </div>
                <div className="rounded-b-lg p-2" style={{ background: "#E9E6DD" }}>
                  {ojobs.map((j) => (
                    <div key={j.id} role="button" tabIndex={0} onClick={() => onOpen(j.id)} className="rounded p-2 mb-1.5 cursor-pointer bg-white border" style={{ borderColor: "var(--line)", borderLeft: `4px solid ${otdColor(j.otd)}` }}>
                      <div className="flex justify-between items-baseline">
                        <span className="font-bold text-xs" style={{ color: "var(--blue)" }}>JOB {jobNo(j.id)}</span>
                        <span className="text-xs font-bold" style={{ color: j.tdd && j.tdd < TODAY ? "var(--red)" : "var(--dim)" }}>TDD {fmt(j.tdd)}</span>
                      </div>
                      <div className="text-xs truncate" title={j.tag}>{j.tag}</div>
                      <div className="text-xs flex justify-between mt-0.5" style={{ color: "var(--muted)" }}><span>{j.stat.slice(0, 22)}</span><span>{j.pct}%</span></div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---- Schedule by Product / Customer: month-wise matrix ---- */}
      {(subTab === "fam" || subTab === "cust") && (() => {
        const key = subTab;
        const mset = [...new Set(byTDD.map((j) => (j.tdd || "").slice(0, 7)).filter(Boolean))].sort();
        const mlabel = (m: string) => parseISO(m + "-01").toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
        // Value AND throughput per cell. Value is what the job invoices;
        // throughput is what the company actually earns on it, and the two
        // rank the families differently — a big-value family bought in as a
        // bought-out item can earn less than a small one made in-house.
        // THE JOBS THEMSELVES ride in every cell (Dr Raghu, 1 Sep 2026: "in
        // this by product and by customer show the mouseover which will show
        // the details of the job list"). A number tells you seven Hi Lifts
        // land in October; only the list tells you WHICH seven, so hovering
        // gives the job, its tag, its date and its value.
        type Cell = { n: number; v: number; t: number; jobs: Job[] };
        const cell = (): Cell => ({ n: 0, v: 0, t: 0, jobs: [] });
        const groups: Record<string, { total: Cell; m: Record<string, Cell> }> = {};
        byTDD.forEach((j) => {
          const g = (groups[j[key]] = groups[j[key]] || { total: cell(), m: {} });
          g.total.n++; g.total.v += j.val; g.total.t += tpOf(j); g.total.jobs.push(j);
          const mm = (j.tdd || "").slice(0, 7);
          if (mm) { const c = (g.m[mm] = g.m[mm] || cell()); c.n++; c.v += j.val; c.t += tpOf(j); c.jobs.push(j); }
        });
        /** What the mouse reveals: one line a job, in delivery order. */
        const hover = (list: Job[]) => list
          .slice()
          .sort((a, b) => String(a.tdd || "").localeCompare(String(b.tdd || "")))
          .map((j) => `${j.id.slice(-4)}  ${j.tag}\n      TDD ${fmtFull(j.tdd)} · ${V(j.val)}${j.stat ? " · " + j.stat : ""}`)
          .join("\n");
        const names = Object.keys(groups).sort();
        return (
          <div className="bg-white rounded-lg border overflow-x-auto mb-4" style={{ borderColor: "var(--line)" }}>
            <div className="px-3 pt-2 text-xs font-bold" style={{ color: "var(--muted)" }}>NANDAN GSE PRODUCTION SCHEDULE — month-wise by {key === "fam" ? "product family" : "customer"} (live from Target Delivery Dates)</div>
            <table className="text-xs w-full genie-table" style={{ minWidth: 720 }}>
              <thead>
                <tr style={{ background: "var(--ink)", color: "#fff" }}>
                  <th className="px-3 py-2 text-left">{key === "fam" ? "Product Family" : "Customer"}</th><th className="px-2 py-2">Jobs</th><th className="px-2 py-2">Value</th><th className="px-2 py-2">Throughput</th>
                  {mset.map((m) => (<th key={m} className="px-2 py-2 whitespace-nowrap">{mlabel(m)}</th>))}
                </tr>
              </thead>
              <tbody>
                {names.map((n, i) => (
                  <tr key={n} className="border-t" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                    {/*
                      THE NAME IS THE WAY DOWN (Dr Raghu, 2 Sep 2026: "in this
                      schedule by product and by customer, when clicking on the
                      product or customer it shoiuld go the place below where
                      thge details are there").

                      The summary says a family is 15 jobs and Rs 4.49 Cr; the
                      jobs themselves are further down the same page, and the
                      only way there was to scroll and hunt. Now the name
                      carries you.
                    */}
                    <td className="px-3 py-1.5 font-semibold" title={`${n} — ${groups[n].total.n} job${groups[n].total.n === 1 ? "" : "s"} · click to jump to the jobs\n\n${hover(groups[n].total.jobs)}`}>
                      <button onClick={() => jumpTo(n)} className="text-left underline decoration-dotted hover:opacity-70"
                        style={{ color: "var(--blue)", font: "inherit", cursor: "pointer" }}>{n}</button>
                    </td>
                    <td className="px-2 py-1.5 text-center font-bold tnum" title={hover(groups[n].total.jobs)} style={{ cursor: "help" }}>{groups[n].total.n}</td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap tnum">{V(groups[n].total.v)}</td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap tnum font-semibold" style={{ color: "var(--green)" }}>{V(groups[n].total.t)}</td>
                    {mset.map((m) => { const c = groups[n].m[m]; return (<td key={m} title={c ? `${n} · ${mlabel(m)} — ${c.n} job${c.n === 1 ? "" : "s"}\n\n${hover(c.jobs)}` : undefined} className="px-2 py-1.5 text-center whitespace-nowrap tnum" style={{ background: c ? "#DCE8F5" : "transparent", border: "1px solid #F1EFE9", cursor: c ? "help" : "default" }}>{c ? (<><div><b>{c.n}</b> · {V(c.v)}</div><div style={{ color: "var(--green)", fontSize: 10.5 }}>T {V(c.t)}</div></>) : "·"}</td>); })}
                  </tr>
                ))}
                <tr style={{ background: "var(--navy)", color: "var(--amber)" }} className="font-bold">
                  <td className="px-3 py-2">TOTAL</td><td className="px-2 py-2 text-center">{byTDD.length}</td><td className="px-2 py-2 text-center whitespace-nowrap">{V(byTDD.reduce((s, j) => s + j.val, 0))}</td><td className="px-2 py-2 text-center whitespace-nowrap">{V(byTDD.reduce((s, j) => s + tpOf(j), 0))}</td>
                  {mset.map((m) => { const list = byTDD.filter((j) => (j.tdd || "").slice(0, 7) === m); return (<td key={m} title={list.length ? `${mlabel(m)} — ${list.length} job${list.length === 1 ? "" : "s"}\n\n${hover(list)}` : undefined} className="px-2 py-2 text-center whitespace-nowrap" style={{ cursor: list.length ? "help" : "default" }}>{list.length ? (<><div>{list.length} · {V(list.reduce((s, j) => s + j.val, 0))}</div><div style={{ fontSize: 10.5, opacity: .85 }}>T {V(list.reduce((s, j) => s + tpOf(j), 0))}</div></>) : "·"}</td>); })}
                </tr>
              </tbody>
            </table>
          </div>
        );
      })()}

      {(subTab === "fam" || subTab === "cust") && groupBy(subTab).map(([g, list]) => (
        <div key={g} id={groupAnchor(g)} className="mb-4"
          style={jumped === g ? { scrollMarginTop: 90, outline: "2px solid #F5B32B", outlineOffset: 4, borderRadius: 8 } : { scrollMarginTop: 90 }}>
          <div className="flex items-baseline gap-2 mb-1">
            <h3 className="font-bold" style={{ color: "var(--navy)" }}>{g}</h3>
            <span className="text-xs" style={{ color: "var(--muted)" }}>{list.length} jobs · {V(list.reduce((s, j) => s + j.val, 0))} · earliest TDD {fmt(list[0].tdd)}</span>
          </div>
          <div className="bg-white rounded-lg border overflow-x-auto" style={{ borderColor: "var(--line)" }}>
            <table className="w-full text-xs genie-table" style={{ minWidth: 760 }}>
              <tbody>
                {list.map((j, i) => (
                  <tr key={j.id} className="border-t" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }} title={j.note}>
                    <td className="px-2 py-1.5" style={{ width: 50 }}><JobLink j={j} /></td>
                    <td className="px-2 py-1.5 font-medium">{j.tag}</td>
                    <td className="px-2 py-1.5" style={{ color: "var(--dim)" }}>{subTab === "fam" ? j.cust : j.fam}</td>
                    <td className="px-2 py-1.5 text-center font-bold whitespace-nowrap" style={{ color: j.tdd && j.tdd < TODAY ? "var(--red)" : "var(--ink)" }}>TDD {fmtFull(j.tdd)}</td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap font-bold" style={{ color: otdColor(j.otd) }}>OTD {fmtFull(j.otd)}{otdDelay(j) && (<span style={{ fontSize: 10 }}> +{otdDelay(j)}d</span>)}</td>
                    <td className="px-2 py-1.5" style={{ width: 170 }}>{j.stat}</td>
                    <td className="px-2 py-1.5 text-center" style={{ width: 46 }}>{j.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* THE JOB ITSELF (Dr Raghu, 2 Sep 2026: "job delivery board also the
          lightbox is not opening"). The click was rewired to setPicked, but
          nothing was ever rendering `picked` on this board — so the state
          changed and the screen did not, which looks exactly like a dead
          button. Its own "Open the full job plan" walks on from here. */}
      {picked && (
        <JobLightbox
          job={toWip(picked)}
          V={V}
          colour="var(--blue)"
          canEdit={canFloor}
          onClose={() => setPicked(null)}
          onOpenPlan={() => { const id = picked.id; setPicked(null); onOpen(id); }}
          onSaved={async () => { await reload(); }}
        />
      )}

    </div>
  );
}