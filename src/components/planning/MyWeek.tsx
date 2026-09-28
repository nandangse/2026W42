"use client";
// split out of PlanningSuite.tsx (Genie 5.0.1.1) — one file per tab, loaded when opened
import React, { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";
import { Greeting, DoorTiles, useHome } from "@/components/HomeDoors";

import { fmt, fmtFull, jobNo, initials, addDays, computeSchedule, manDays, dueStyle, greeting } from "@/lib/schedule";

import { QuoteCard } from "../QuoteOfDay";

import { useMyWeek, HowsMyDay, ImageQuote, Birthdays, MyLearningCard } from "../MyWeekPanels";
import { hhmm } from "@/lib/lms";
import { Board, Job, TODAY, Task, assignees, myHandles, stamp, taskJobRef, taskLate } from "./shared";
import { TaskModal } from "./Tasking";

/**
 * DELIVERY, AS A CALENDAR (Dr Raghu, 28 Sep 2026: "instead of this list show
 * a calendar ... Make a box for each job ... then next day, then next day").
 *
 * WHY A DAY IS A ROW AND NOT A COLUMN. A month grid would give every day the
 * same square whether it holds nothing or nine machines, and the days that
 * matter here are exactly the crowded ones. Days stacked as rows let a day
 * with nine jobs be nine boxes tall and a day with one be one box tall, so
 * the shape of the week is the shape of the load.
 *
 * EMPTY DAYS ARE NOT DRAWN. A calendar that prints every date to be a
 * calendar pushes the next real delivery off the screen.
 */
function dayHead(iso: string): { day: string; weekday: string } {
  const d = new Date(`${iso}T00:00:00`);
  const n = d.getDate();
  const suffix = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return {
    day: `${n}${suffix} ${d.toLocaleDateString("en-IN", { month: "short" })}`,
    weekday: d.toLocaleDateString("en-IN", { weekday: "long" }),
  };
}

/** Whole days between two ISO dates — for "4 days late", which is the fact. */
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000);

/**
 * ONE COLUMN PER DAY, AND PAST DUE FIRST (Dr Raghu, 28 Sep 2026: "First
 * column show past due in one column sort by TDD ... then make one column
 * for each day of the week").
 *
 * WHY PAST DUE GETS ITS OWN COLUMN AND NOT ITS OWN DATE ROWS. Sixteen
 * overdue machines spread over eleven past dates was eleven headings before
 * the reader reached today — and on the first cut the overdue jobs ate the
 * twenty, so only four upcoming ones survived to be seen. The thing that has
 * slipped and the thing that is coming are two different questions; they get
 * two different shapes, and the twenty is spent on what is coming.
 *
 * COLOUR IS THE PLANNING OWNER. The eye groups by colour before it reads
 * anything, so a week's board answers "how much is Pankaj carrying on
 * Thursday" at a glance. The colour is derived from the name itself, so a
 * person keeps their colour everywhere without a table to maintain.
 */
const OWNER_INK = ["#1B3A5C", "#B45309", "#0D7A3F", "#7C3AED", "#B3392E", "#0E7490", "#8A5B00", "#4338CA", "#9D174D", "#155E75"];
function ownerColour(name: string): string {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return "#8B8F87";
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return OWNER_INK[h % OWNER_INK.length];
}
const ownerOf = (j: Job) => j.ownerName || j.ownerInitials || (j.own ? j.own.split("@")[0] : "—");

/** The seven columns after today, whether or not anything lands on them. */
function nextDays(from: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(addDays(from, i));
  return out;
}

function JobBox({ j, onPeek, dense }: { j: Job; onPeek: (j: Job) => void; dense?: boolean }) {
  const who = ownerOf(j);
  const c = ownerColour(who);
  return (
    <button onClick={() => onPeek(j)} className="rounded-lg text-left w-full"
      style={{ border: `1px solid ${c}44`, borderLeft: `4px solid ${c}`, background: `${c}0D`, padding: dense ? "5px 7px" : "7px 8px" }}
      title={`${j.tag} — ${who}`}>
      <div className="flex items-baseline gap-1.5">
        <span className="font-bold tnum" style={{ color: c, fontSize: 13.5 }}>{jobNo(j.id)}</span>
        <div className="flex-1" />
        <span className="font-bold tnum" style={{ fontSize: 11.5, color: j.pct >= 100 ? "var(--green)" : j.pct >= 60 ? "#8A5B00" : "var(--red)" }}>{j.pct}%</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--ink)", lineHeight: 1.3, marginTop: 1, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {j.tag}
      </div>
      <div className="truncate" style={{ fontSize: 10.5, color: c, fontWeight: 600, marginTop: 2 }}>{who}</div>
      <div className="rounded" style={{ height: 3, background: "rgba(0,0,0,.08)", marginTop: 3 }}>
        <div style={{ height: 3, width: `${Math.max(0, Math.min(100, j.pct))}%`, background: j.pct >= 100 ? "var(--green)" : j.pct >= 60 ? "#D97706" : "var(--red)", borderRadius: 3 }} />
      </div>
    </button>
  );
}

/**
 * HOW MANY LATE JOBS THE COLUMN SHOWS BEFORE IT ASKS.
 *
 * Dr Raghu, 28 Sep 2026: "past due should reduce!! It will always be 5-6
 * jobs anyways always." Six is the normal state of that column, so six is
 * what it is built for; today's sixteen is the abnormality and it should
 * look like one rather than quietly setting the height of the board.
 *
 * NOTHING IS HIDDEN. The count is in the heading whatever is drawn, and the
 * rest are one press away — a board that made late work smaller by not
 * mentioning it would be the worst thing this page could do.
 */
const LATE_SHOWN = 6;

function DeliveryBoard({ jobs, onOpen }: { jobs: Job[]; onOpen: (id: string) => void }) {
  const [peek, setPeek] = useState<Job | null>(null);
  const [allLate, setAllLate] = useState(false);

  const dated = jobs.filter((j) => !!j.tdd);
  const past = dated.filter((j) => (j.tdd as string) < TODAY)
    .sort((a, b) => ((a.tdd as string) < (b.tdd as string) ? -1 : 1));
  const days = nextDays(TODAY, 7);
  const horizon = days[days.length - 1];
  /* The twenty is spent on what is COMING — the overdue column is complete
     on its own and must not eat the allowance. */
  const coming = dated.filter((j) => (j.tdd as string) >= TODAY && (j.tdd as string) <= horizon)
    .sort((a, b) => ((a.tdd as string) < (b.tdd as string) ? -1 : 1))
    .slice(0, 20);
  const onDay = (d: string) => coming.filter((j) => j.tdd === d);
  const later = dated.filter((j) => (j.tdd as string) > horizon).length;

  /* Who is carrying this board, so the colours have a key rather than being
     decoration somebody has to decode. */
  const owners = [...new Set([...past, ...coming].map(ownerOf))].sort();

  return (
    <div className="bg-white rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <div className="font-bold text-sm">Delivery run</div>
        <div className="text-xs" style={{ color: "var(--muted)" }}>past due, then the week ahead</div>
        <div className="flex-1" />
        <div className="flex gap-1.5 flex-wrap">
          {owners.map((o) => (
            <span key={o} className="rounded px-1.5" style={{ fontSize: 10.5, fontWeight: 700, color: ownerColour(o), background: `${ownerColour(o)}14` }}>{o}</span>
          ))}
        </div>
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: "minmax(170px,1.1fr) repeat(7, minmax(150px,1fr))", overflowX: "auto" }}>
        {/* ---- past due ---- */}
        <div style={{ minWidth: 0 }}>
          <div className="rounded px-2 py-1 mb-1.5" style={{ background: "var(--red)" }}>
            <div className="text-xs font-bold" style={{ color: "#fff" }}>Past due</div>
            {/* WHAT THE COLUMN IS ASKING FOR (Dr Raghu, 28 Sep 2026: "else
                the planning engineer will anyways have to change the TDD").
                A late job is not a fact to be noted, it is a date that has
                stopped being true and a person who must re-date it. Said
                that way, a long column reads as work owed rather than as
                bad news nobody owns. */}
            <div style={{ fontSize: 10.5, color: "#FFD9D2" }}>
              {past.length} job{past.length === 1 ? "" : "s"} · oldest first · the TDD needs revising
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            {past.length === 0 && <div className="text-xs py-3 text-center" style={{ color: "var(--green)", fontWeight: 700 }}>Nothing late.</div>}
            {(allLate ? past : past.slice(0, LATE_SHOWN)).map((j) => (
              <div key={j.id}>
                {/* How late, on the box: "4 days" is the fact a date makes
                    the reader work out. */}
                <div style={{ fontSize: 10, color: "var(--red)", fontWeight: 700 }}>
                  {fmt(j.tdd)} · {Math.abs(daysBetween(TODAY, j.tdd as string))}d late
                </div>
                <JobBox j={j} onPeek={setPeek} dense />
              </div>
            ))}
            {past.length > LATE_SHOWN && (
              <button onClick={() => setAllLate(!allLate)} className="rounded text-xs font-bold py-1.5"
                style={{ border: "1px solid var(--red)", color: "var(--red)", background: "#fff" }}>
                {allLate ? "Show the worst 6" : `+ ${past.length - LATE_SHOWN} more past due`}
              </button>
            )}
          </div>
        </div>

        {/* ---- one column per day ---- */}
        {days.map((d) => {
          const h = dayHead(d);
          const mine = onDay(d);
          const isToday = d === TODAY;
          return (
            <div key={d} style={{ minWidth: 0 }}>
              <div className="rounded px-2 py-1 mb-1.5" style={{ background: isToday ? "var(--navy)" : "#F4F2EC" }}>
                <div className="text-xs font-bold" style={{ color: isToday ? "#fff" : "var(--ink)" }}>{h.day}</div>
                <div style={{ fontSize: 10.5, color: isToday ? "#8FA1B3" : "var(--muted)" }}>
                  {h.weekday}{isToday ? " · today" : ""} · {mine.length}
                </div>
              </div>
              <div className="flex flex-col gap-1.5" style={{ maxHeight: 430, overflowY: "auto" }}>
                {mine.length === 0
                  ? <div className="text-xs py-3 text-center" style={{ color: "#C9C6BD" }}>—</div>
                  : mine.map((j) => <JobBox key={j.id} j={j} onPeek={setPeek} dense />)}
              </div>
            </div>
          );
        })}
      </div>

      {later > 0 && (
        <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>
          {later} more with a date beyond {fmtFull(horizon)}.
        </div>
      )}

      {peek && <JobPeek job={peek} onClose={() => setPeek(null)} onOpen={onOpen} />}
    </div>
  );
}

/**
 * The box, opened. Enough to decide whether to act without leaving the
 * morning page — and one button to the job itself when it is not enough.
 */
function JobPeek({ job: j, onClose, onOpen }: { job: Job; onClose: () => void; onOpen: (id: string) => void }) {
  const overdue = !!j.tdd && j.tdd < TODAY;
  const L = ({ k, v, tone }: { k: string; v: React.ReactNode; tone?: string }) => (
    <div className="flex gap-2 py-1 border-b" style={{ borderColor: "var(--line-soft)" }}>
      <span className="text-xs" style={{ color: "var(--muted)", minWidth: 118 }}>{k}</span>
      <span className="text-xs font-semibold" style={{ color: tone || "var(--ink)", flex: 1 }}>{v || "—"}</span>
    </div>
  );
  return (
    <div onClick={onClose} role="button" tabIndex={0}
      style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(22,35,47,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} role="button" tabIndex={0} className="rounded-lg bg-white"
        style={{ width: "min(520px,100%)", maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
        <div className="flex items-start gap-3 px-4 py-3" style={{ background: "var(--navy)", borderRadius: "8px 8px 0 0" }}>
          <div style={{ flex: 1 }}>
            <div className="text-xs font-bold" style={{ color: "#8FA1B3", letterSpacing: 1.2 }}>JOB {jobNo(j.id)}</div>
            <div className="font-bold text-white" style={{ fontSize: 15, lineHeight: 1.3 }}>{j.tag}</div>
          </div>
          <button onClick={onClose} className="font-bold" style={{ color: "#8FA1B3", fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <div className="p-3">
          <div className="flex gap-2 mb-2">
            <Chip label="Production" value={`${j.pct}%`} color={j.pct >= 100 ? "var(--green)" : j.pct >= 60 ? "#8A5B00" : "var(--red)"} />
            <Chip label="TDD" value={fmtFull(j.tdd)} color={overdue ? "var(--red)" : "var(--ink)"} />
            {j.otd && <Chip label="OTD" value={fmtFull(j.otd)} />}
          </div>
          <L k="Customer" v={j.cust} />
          <L k="Planning owner" v={j.ownerName || j.ownerInitials || (j.own ? j.own.split("@")[0] : "")} />
          <L k="Production owner" v={j.productionOwner} />
          <L k="Quality owner" v={j.qualityOwner} />
          <L k="Project" v={j.proj} />
          <L k="Status" v={j.stat} />
          <L k="On the floor" v={j.onFloor ? `yes${j.onFloorAt ? ` · since ${fmtFull(j.onFloorAt)}` : ""}` : "not yet"} tone={j.onFloor ? "var(--green)" : "var(--muted)"} />
          {j.escalation && j.escalation !== "None" && <L k="Escalation" v={j.escalation} tone="var(--red)" />}
          {j.floorSummary && (
            <div className="rounded p-2 mt-2" style={{ background: "#F4F2EC" }}>
              <div className="text-xs font-bold mb-0.5" style={{ color: "var(--muted)", letterSpacing: 1 }}>
                FROM THE FLOOR{j.floorSummaryAt ? ` · ${fmtFull(j.floorSummaryAt)}` : ""}
              </div>
              <div className="text-xs" style={{ color: "var(--ink)", lineHeight: 1.5 }}>{j.floorSummary}</div>
            </div>
          )}
          <button onClick={() => { onClose(); onOpen(j.id); }}
            className="w-full rounded font-bold mt-3 py-2" style={{ background: "var(--accent)", color: "#fff", fontSize: 13 }}>
            Open the full job →
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================ shared bits ============================
export function Chip({ label, value, color = "var(--ink)" }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded px-2 py-1" style={{ background: "#F4F2EC" }}>
      <div className="text-xs" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="text-sm font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

export function CrewCell({ value, onChange, color }: { value: number; onChange: (v: number) => void; color: string }) {
  return (
    <input
      type="number"
      min={0}
      max={99}
      value={value === 0 ? "" : value}
      placeholder="·"
      onChange={(e) => onChange(Math.max(0, parseInt(e.target.value || "0", 10)))}
      className="w-9 text-center text-xs py-1 rounded border bg-white focus:outline-none tnum"
      style={{ borderColor: "var(--line)", color: value > 0 ? color : "#B8B5AC", fontWeight: value > 0 ? 700 : 400 }}
    />
  );
}

// ============================ My Week (landing) ============================
export interface TodayItem {
  source: "goal" | "task";
  id: string;
  kind: string;
  title: string;
  job_id: string | null;
  due: string | null;
  originalDue: string | null;
  pushCount: number;
  carriedDays: number;
  cat: string;
  /** Goal items only — the root goal this hangs off, for Tasking's By Goals. */
  goalId?: string | null;
  goalName?: string;
  esc: string | null;
  late: boolean;
}

export function MyWeek({
  board,
  me,
  V,
  onOpen,
  reload,
  goTasks,
  goGoals,
  goalsAccess,
  goLms,
  isAdmin,
}: {
  board: Board;
  me: { email: string; initials: string | null; displayName: string | null; erpOwner: string | null; role: string };
  V: (v: number) => string;
  onOpen: (id: string) => void;
  reload: () => Promise<Board | null>;
  goTasks: () => void;
  goGoals: () => void;
  goalsAccess: boolean;
  goLms: () => void;
  isAdmin: boolean;
}) {
  const home = useHome();
  const isAdminHere = isAdmin;
  const weekEnd = addDays(TODAY, 7);
  // mood, learning, participation, birthdays and the image quote — one fetch
  const [mw, reloadMw] = useMyWeek();
  const handles = useMemo(() => myHandles(me), [me]);

  // Goal work owed today, merged in from the goals layer — but ONLY for people
  // who hold a goals grant. Showing goal items to someone whose Goals tab is
  // hidden read as an inconsistency ("why can I see this but not open it"), so
  // the whole card follows the same grant as the workspace. Trade-off, made
  // deliberately: a person with goal work assigned but no grant won't see it
  // anywhere — if someone is expected to work goals, give them View.
  const [goalItems, setGoalItems] = useState<TodayItem[]>([]);
  useEffect(() => {
    if (!goalsAccess) { setGoalItems([]); return; }
    api.get("/api/today")
      .then((r) => setGoalItems((r.items || []).filter((i: TodayItem) => i.source === "goal")))
      .catch(() => setGoalItems([]));
  }, [goalsAccess]);

  // my open tasks: overdue, or due within the next seven days
  const myTasks = useMemo(() => {
    const mine = board.tasks.filter((t) => !t.done && handles.has(String(t.who || "").toLowerCase()));
    return mine
      .filter((t) => !t.due || t.due <= weekEnd)
      .sort((a, b) => ((a.due || "9999") < (b.due || "9999") ? -1 : 1));
  }, [board.tasks, handles, weekEnd]);
  // late against the date first promised — see taskLate()
  const overdue = myTasks.filter((t) => taskLate(t, TODAY));
  const dueToday = myTasks.filter((t) => t.due === TODAY);
  const laterThisWeek = myTasks.filter((t) => !t.due || t.due > TODAY);

  // jobs I own — matched on the resolved Project Owner account
  const myJobs = useMemo(
    () => board.jobs.filter((j) => j.ownerInitials && j.ownerInitials === me.initials),
    [board.jobs, me.initials],
  );

  // delivery expected in the next seven days — shop-wide
  const dueJobs = useMemo(
    () =>
      board.jobs
        .filter((j) => j.tdd && j.tdd <= weekEnd)
        .sort((a, b) => ((a.tdd || "9999") < (b.tdd || "9999") ? -1 : 1)),
    [board.jobs, weekEnd],
  );

  // milestones of mine landing this week
  // this week's landings, and — behind "See more" — everything undone that
  // lands after it (Dr Raghu, 29 Aug 2026: "they can scroll further away")
  const myMilestones = useMemo(() => {
    const week: { job: Job; idx: number; name: string; end: string }[] = [];
    const later: typeof week = [];
    for (const j of myJobs) {
      const plan = board.plans[j.id];
      if (!plan?.milestones?.length) continue;
      for (const m of computeSchedule({ start: plan.start || TODAY, milestones: plan.milestones })) {
        if (m.done || m.end < TODAY || manDays(m) <= 0) continue;
        (m.end <= weekEnd ? week : later).push({ job: j, idx: m.idx, name: m.name, end: m.end });
      }
    }
    const byEnd = (a: { end: string }, b: { end: string }) => (a.end < b.end ? -1 : 1);
    return { week: week.sort(byEnd), later: later.sort(byEnd).slice(0, 40) };
  }, [myJobs, board.plans, weekEnd]);
  const [msMore, setMsMore] = useState(false);

  const [lightbox, setLightbox] = useState<Task | null>(null);
  const who = me.displayName || me.email.split("@")[0];

  const Card = ({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) => (
    <div className="bg-white rounded-lg border px-3 py-2" style={{ borderColor: "var(--line)", borderTop: `3px solid ${color}` }}>
      <div className="text-xs font-bold" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="text-xl font-bold tnum" style={{ color }}>{value}</div>
      {sub && <div className="text-xs" style={{ color: "var(--muted)" }}>{sub}</div>}
    </div>
  );

  return (
    <div className="p-4">
      <Greeting d={home} />
      <DoorTiles d={home} current="main" />
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
        <h2 className="text-xl font-bold" style={{ color: "var(--navy)" }}>
          {greeting()}, {who}
          {me.initials && <span className="ml-2 rounded px-1.5 py-0.5 text-sm font-bold" style={{ background: "var(--accent)", color: "#fff" }}>{me.initials}</span>}
        </h2>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          Week of {fmtFull(TODAY)} → {fmtFull(weekEnd)} · 🕒 files as of {stamp(board.lastUpdated)}
        </span>
      </div>

      {!me.initials && (
        <div className="text-xs font-bold rounded px-2 py-1.5 mb-3" style={{ background: "#FFF3E8", color: "var(--red)", border: "1px solid #E8600A" }}>
          ⚠ You have no initials assigned yet, so tasks can&apos;t be matched to you. An admin can set them in Admin → User management.
        </div>
      )}

      {/* ===== the top: one five-column band =====
          Four numbers and the birthdays across the top; the quote runs under
          the first three and How's My Day sits under the number it belongs
          with. The quote gets three columns' width because a line of prose set
          in a narrow card is a line nobody reads. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
        <Card label="MY OPEN TASKS" value={myTasks.length} sub={overdue.length ? `${overdue.length} overdue` : "this week"} color={overdue.length ? "var(--red)" : "var(--navy)"} />
        <Card label="DELIVERIES THIS WEEK" value={dueJobs.length} sub="shop-wide" color="#7C3AED" />
        <Card label="MY LEARNING · 90 DAYS" value={mw ? hhmm(mw.learning.minutes) : "—"}
          sub={mw ? `${mw.learning.completed} lesson${mw.learning.completed === 1 ? "" : "s"} finished` : "loading"} color="#0D9488" />
        <Card label="MY PARTICIPATION" value={mw ? `${mw.participation.days}/${mw.participation.of}` : "—"}
          sub="days active in the last 30" color="var(--blue)" />
        {/* birthdays hold the fifth column down both rows — a list of names
            needs the height, and it is the one card here that grows */}
        <div className="lg:row-span-2" style={{ minWidth: 0 }}>
          <Birthdays data={mw} />
        </div>
        <div className="col-span-2 lg:col-span-3" style={{ minWidth: 0 }}>
          <QuoteCard />
        </div>
        <HowsMyDay data={mw} onSaved={reloadMw} />
      </div>

      {/* ===== what is going out, full width, above everything else =====
           Dr Raghu, 28 Sep 2026: "this should come full width. above the
           tasks this week". It is the shop's question, not one person's —
           a third of the page was making it look like a personal panel. */}
      <div className="mb-4"><DeliveryBoard jobs={board.jobs} onOpen={onOpen} /></div>

      {/* ===== three columns ===== */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        {/* LEFT — my tasks */}
        <div className="flex flex-col gap-4" style={{ minWidth: 0 }}>
        {/* my tasks */}
        <div className="bg-white rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
          <div className="flex items-center justify-between mb-2">
            <div className="font-bold text-sm">My tasks this week</div>
            <button onClick={goTasks} className="text-xs font-bold" style={{ color: "var(--accent)" }}>Open Tasking →</button>
          </div>
          {myTasks.length === 0 ? (
            <div className="text-sm py-4 text-center" style={{ color: "var(--muted)" }}>
              {me.initials ? "Nothing assigned to you this week ✓" : "Assign initials to see your tasks here."}
            </div>
          ) : (
            <>
              {overdue.length > 0 && (
                <div className="text-xs font-bold rounded px-2 py-1 mb-2 inline-block" style={{ background: "var(--red)", color: "#fff" }}>
                  ⚠ {overdue.length} overdue
                </div>
              )}
              {[...overdue, ...dueToday, ...laterThisWeek].map((t) => {
                const job = board.jobs.find((j) => j.id === t.j);
                return (
                  <div key={t.id} role="button" tabIndex={0} onClick={() => setLightbox(t)} className="rounded p-2 mb-1.5 cursor-pointer border relative" style={{ ...dueStyle(t.due), borderColor: "rgba(0,0,0,0.08)" }}>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const warn = t.kind === "erp" ? "\n\n⚠ From the ERP ToDo list — the next upload will bring it back unless it is closed in the ERP." : "";
                        if (!window.confirm(`Delete "${t.t}"?${warn}\n\nThis cannot be undone.`)) return;
                        try { await api.post("/api/tasks", { action: "delete", id: t.id, kind: t.kind }); await reload(); }
                        catch (err) { alert(err instanceof Error ? err.message : String(err)); }
                      }}
                      className="absolute rounded font-bold"
                      style={{ top: 2, right: 3, width: 16, height: 16, lineHeight: "14px", fontSize: 11, background: "rgba(0,0,0,0.10)", color: "var(--red)" }}
                      title="Delete this task"
                    >✕</button>
                    <div className="text-xs font-semibold" style={{ paddingRight: 16 }}>{t.t}</div>
                    <div className="flex items-center justify-between mt-1 text-xs gap-2" style={{ opacity: 0.85 }}>
                      {/* the customer tag says which machine this is; the bare job number didn't */}
                      <span className="font-bold truncate" style={{ maxWidth: 150 }} title={job ? `${job.tag} · JOB ${jobNo(t.j)}` : undefined}>
                        {job ? job.tag : "—"}
                      </span>
                      {t.esc && t.esc !== "None" && <span className="font-bold rounded px-1 flex-shrink-0" style={{ background: "var(--red)", color: "#fff", fontSize: 9 }}>⚠ {t.esc.slice(0, 2)}</span>}
                      <span className="flex-shrink-0" style={{ fontSize: 10 }}>{(t.cat || "").toLowerCase()}</span>
                      <span className="tnum flex-shrink-0">{fmt(t.due)}</span>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
        </div>

        {/* CENTRE — what is going out, and what I am driving */}
        <div className="flex flex-col gap-4" style={{ minWidth: 0 }}>
        {/* goal work owed today — the merge of the two layers */}
        {goalItems.length > 0 && (
          <div className="bg-white rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
            <div className="flex items-center justify-between mb-2">
              <div className="font-bold text-sm">🎯 My goal work</div>
              <button onClick={goGoals} className="text-xs font-bold" style={{ color: "var(--accent)" }}>Open Goals →</button>
            </div>
            {goalItems.map((g) => (
              <div key={g.id} className="rounded p-2 mb-1.5 border" style={{ background: g.late ? "#FBEDEA" : "#F4F2EC", borderColor: g.late ? "var(--red)" : "var(--line)", borderLeft: `3px solid ${g.late ? "var(--red)" : "#7C3AED"}` }}>
                <div className="text-xs font-semibold" style={{ color: "var(--navy)" }}>{g.title}</div>
                <div className="flex items-center gap-2 mt-1 text-xs flex-wrap" style={{ color: "var(--muted)" }}>
                  <span className="rounded px-1 font-bold" style={{ background: "#F3EEFB", color: "#7C3AED", fontSize: 9 }}>{g.cat.toUpperCase()}</span>
                  {g.carriedDays > 0 && <span className="tnum">carried {g.carriedDays}d</span>}
                  {g.pushCount > 0 && <span style={{ color: "var(--warn)" }}>pushed {g.pushCount}×</span>}
                  {g.late && <span className="font-bold" style={{ color: "var(--red)" }}>past {fmt(g.originalDue)}</span>}
                  <span className="ml-auto tnum">{fmt(g.due)}</span>
                </div>
              </div>
            ))}
            <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              Carried days and pushes are counted against the date first committed, not the one on screen.
            </div>
          </div>
        )}
        </div>

        {/* RIGHT — the picture, then my own work. Birthdays have moved up to
            the top band; the image quote takes their place here, where it has
            the width to be looked at rather than glanced past. */}
        <div className="flex flex-col gap-4" style={{ minWidth: 0 }}>
          <ImageQuote data={mw} isAdmin={isAdmin} />
          <MyLearningCard data={mw} onOpenLms={goLms} />
        {/* my milestones this week — and, behind See more, the ones after */}
        <div className="bg-white rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
          <div className="font-bold text-sm mb-2">My milestones landing this week</div>
          {myMilestones.week.length === 0 && (
            <div className="text-sm py-4 text-center" style={{ color: "var(--muted)" }}>No milestones due on your jobs this week.</div>
          )}
          {myMilestones.week.map((m, i) => (
            <div key={i} role="button" tabIndex={0} onClick={() => onOpen(m.job.id)} className="rounded p-2 mb-1.5 cursor-pointer border" style={{ background: "#DDE6EE", borderColor: "#B9C7D4" }}>
              <div className="text-xs font-bold" style={{ color: "var(--blue)" }}>⚑ M{m.idx} · {m.name}</div>
              <div className="text-xs flex justify-between mt-0.5" style={{ color: "var(--dim)" }}>
                <span>JOB {jobNo(m.job.id)} · {m.job.tag}</span>
                <span className="tnum">{fmt(m.end)}</span>
              </div>
            </div>
          ))}
          {msMore && myMilestones.later.length > 0 && (
            <>
              <div className="text-xs font-bold mt-2 mb-1" style={{ color: "var(--muted)", letterSpacing: 0.8 }}>FURTHER OUT</div>
              {myMilestones.later.map((m, i) => (
                <div key={i} role="button" tabIndex={0} onClick={() => onOpen(m.job.id)} className="rounded p-2 mb-1.5 cursor-pointer border" style={{ background: "#F4F2EC", borderColor: "var(--line)" }}>
                  <div className="text-xs font-bold" style={{ color: "var(--dim)" }}>⚑ M{m.idx} · {m.name}</div>
                  <div className="text-xs flex justify-between mt-0.5" style={{ color: "var(--muted)" }}>
                    <span>JOB {jobNo(m.job.id)} · {m.job.tag}</span>
                    <span className="tnum font-bold">{fmtFull(m.end)}</span>
                  </div>
                </div>
              ))}
            </>
          )}
          {myMilestones.later.length > 0 && (
            <button onClick={() => setMsMore((v) => !v)} className="w-full text-xs font-bold rounded py-1.5 mt-1 border"
              style={{ color: "var(--blue)", borderColor: "#B9C7D4", background: "#fff" }}>
              {msMore ? "See less ↑" : `See more ↓ · ${myMilestones.later.length} further out`}
            </button>
          )}
        </div>
        {/* my jobs */}
        <div className="bg-white rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
          <div className="font-bold text-sm mb-2">My jobs {myJobs.length > 0 && <span className="font-normal text-xs" style={{ color: "var(--muted)" }}>· {myJobs.length}</span>}</div>
          {myJobs.length === 0 ? (
            <div className="text-sm py-4 text-center" style={{ color: "var(--muted)" }}>
              No jobs list you as Planning Owner. Matching uses your initials or the ERP owner name on your profile.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs genie-table">
                <tbody>
                  {myJobs.slice(0, 12).map((j) => (
                    <tr key={j.id} className="border-t" style={{ borderColor: "var(--line-soft)" }}>
                      <td className="py-1.5"><button onClick={() => onOpen(j.id)} className="font-bold underline decoration-dotted" style={{ color: "var(--blue)" }}>{jobNo(j.id)}</button></td>
                      <td className="py-1.5">{j.tag}</td>
                      <td className="py-1.5 text-center font-bold tnum" style={{ color: j.tdd && j.tdd < TODAY ? "var(--red)" : "var(--ink)" }}>{fmtFull(j.tdd)}</td>
                      <td className="py-1.5 text-right" style={{ color: "var(--muted)" }}>{stamp(j.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {myJobs.length > 12 && <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>+{myJobs.length - 12} more…</div>}
            </div>
          )}
        </div>
        </div>
      </div>

      {lightbox && <TaskModal canDelete={isAdminHere} task={lightbox} jobRef={taskJobRef(board, lightbox)} onOpenJob={onOpen} owners={assignees(board)} onClose={() => setLightbox(null)} onToggle={async (prevention) => { await api.post("/api/tasks", { action: "toggle", id: lightbox.id, kind: lightbox.kind, done: !lightbox.done, prevention }); setLightbox(null); await reload(); }} reload={reload} />}
    </div>
  );
}