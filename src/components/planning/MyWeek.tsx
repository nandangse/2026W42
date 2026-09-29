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
/* THE LIGHTBOX IS THE ONE THE BOARDS ALREADY USE (Dr Raghu, 28 Sep 2026:
   "dont invent your own lightbox... we already have the one from before").
   A second box showing the same job differently is a second thing to learn
   and a second thing to keep true — and this one edits through
   /api/job-field, so corrections still reach the ERP. */
import { JobLightbox, type WipJob } from "../JobsInProgress";
import { runJpg, type RunJob } from "@/lib/run-jpg";

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

/** Where this job stands against the date the customer was first given. */
function otdLine(j: Job): { text: string; tone: string } {
  if (!j.otd) return { text: "no OTD set", tone: "#B8B5AC" };
  const d = daysBetween(TODAY, j.otd);
  if (d < 0) return { text: `OTD ${fmt(j.otd)} · ${-d}d over`, tone: "var(--red)" };
  if (d === 0) return { text: `OTD ${fmt(j.otd)} · today`, tone: "#8A5B00" };
  return { text: `OTD ${fmt(j.otd)} · in ${d}d`, tone: d <= 7 ? "#8A5B00" : "var(--dim)" };
}

function JobBox({ j, onPeek, dense }: { j: Job; onPeek: (j: Job) => void; dense?: boolean }) {
  const who = ownerOf(j);
  const c = ownerColour(who);
  const otd = otdLine(j);
  return (
    <button onClick={() => onPeek(j)} className="rounded-lg text-left w-full"
      style={{ border: `1px solid ${c}44`, borderLeft: `4px solid ${c}`, background: `${c}0D`, padding: dense ? "5px 7px" : "7px 8px" }}
      title={`${j.tag} — ${who}`}>
      <div className="flex items-baseline gap-1">
        <span className="font-bold tnum" style={{ color: c, fontSize: 12.5 }}>{jobNo(j.id)}</span>
        <div className="flex-1" />
        <span className="font-bold tnum" style={{ fontSize: 10.5, color: j.pct >= 100 ? "var(--green)" : j.pct >= 60 ? "#8A5B00" : "var(--red)" }}>{j.pct}%</span>
      </div>
      {/* The tag is the line that gives up size first: it is the longest
          thing on the box and the one a reader skims rather than reads. */}
      <div title={j.tag} style={{ fontSize: 9.5, color: "var(--ink)", lineHeight: 1.28, marginTop: 1, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>
        {j.tag}
      </div>
      {/* THE OTD, NOT THE OWNER (Dr Raghu, 28 Sep 2026: "remove project
          owners name, put in delay from OTD (if passed) or days to OTD if in
          future").

          The name was already being said twice — the colour of the box IS
          the owner, with the key across the top — so the line was a label on
          a thing that had already labelled itself. The OTD is the date the
          customer was ORIGINALLY given, and the distance from it is the only
          number on this board that says whether we have kept our word. */}
      <div className="truncate" style={{ fontSize: 9.5, marginTop: 2, fontWeight: 700, color: otd.tone }}>{otd.text}</div>
      <div className="rounded" style={{ height: 3, background: "rgba(0,0,0,.08)", marginTop: 3 }}>
        <div style={{ height: 3, width: `${Math.max(0, Math.min(100, j.pct))}%`, background: j.pct >= 100 ? "var(--green)" : j.pct >= 60 ? "#D97706" : "var(--red)", borderRadius: 3 }} />
      </div>
    </button>
  );
}

/**
 * PAST DUE SPILLS SIDEWAYS, NOT DOWNWARDS.
 *
 * Dr Raghu, 28 Sep 2026: "in this past due make it limited to as many jobs
 * as are listed for one day or 5, whichever is higher. Make multiple past
 * due columns if needed. Eg currently it being 16, show as 6+5+5."
 *
 * A COLUMN SHOULD NOT BE TALLER THAN THE BOARD IT SITS IN. Sixteen boxes in
 * one column made the whole board sixteen boxes tall to hold a column nobody
 * wants to be long — the week beside it, which is the part that can still be
 * acted on, was pushed off the bottom of the screen by the part that cannot.
 *
 * SO: the column's height is the busiest day of the week, or five, whichever
 * is greater — and anything more opens another column beside it. The jobs are
 * then spread EVENLY across those columns rather than filling the first to
 * the brim, so three columns of sixteen read 6+5+5 and the board stays the
 * height of its tallest day.
 *
 * Three columns is the limit. Past its third, late work is not a layout
 * problem any more, and the rest go behind a count that says how many.
 */
const LATE_MIN = 5;
/* TWO COLUMNS, ONE HEADING (Dr Raghu, 28 Sep 2026: "past due just make two
   columns. Show both with one heading. Show total past due."). Three columns
   each carrying their own red heading read as three separate problems; it is
   one problem, counted once, in a block two columns wide. */
const LATE_COLS = 2;
const LATE_MAX = 24;

/** Spread n items over `cols` columns as evenly as possible, biggest first. */
function spread<T>(items: T[], cols: number): T[][] {
  if (cols <= 1) return [items];
  const base = Math.floor(items.length / cols);
  const extra = items.length % cols;
  const out: T[][] = [];
  let at = 0;
  for (let i = 0; i < cols; i++) {
    const take = base + (i < extra ? 1 : 0);
    out.push(items.slice(at, at + take));
    at += take;
  }
  return out.filter((c) => c.length > 0);
}

/** The board's job, in the shape the shared lightbox reads. */
const toWip = (j: Job): WipJob => ({
  id: j.id, tag: j.tag || "", cust: j.cust || "", fam: j.fam || "",
  tdd: j.tdd, otd: j.otd, stat: j.stat || "",
  val: Number(j.val) || 0, tpv: Number(j.tpv) || 0, tpp: Number(j.tpp) || 0,
  kit: Number(j.kit) || 0, pct: Number(j.pct) || 0, note: j.note || "",
  escalation: j.escalation ?? null, amtNeeded: j.amtNeeded ?? null,
  payOnDelivery: j.payOnDelivery ?? null, mandays: j.mandays ?? null,
  chassisNo: j.chassisNo ?? null, engineNo: j.engineNo ?? null,
  ownerInitials: j.ownerInitials, ownerName: j.ownerName,
});

function DeliveryBoard({ jobs, board, onOpen, V, reload, canEdit, isStrat }: {
  jobs: Job[]; board: Board; onOpen: (id: string) => void; V: (v: number) => string;
  reload: () => Promise<Board | null>; canEdit: boolean; isStrat: boolean;
}) {
  /**
   * THE OPEN BOX IS HELD BY ID, NOT BY VALUE.
   *
   * Dr Raghu, 28 Sep 2026: "after changing date in the lightbox, it still
   * shows old one. but on closing and reopening it has changed."
   *
   * It was holding the job OBJECT taken at the moment of the click. Saving
   * refreshes the board, but the box was still rendering that first copy —
   * so the field it had just written was the one field on screen that had
   * not changed. Holding the id and looking the job up on every render means
   * the box is always reading the same board everybody else is.
   */
  const [peekId, setPeekId] = useState<string | null>(null);
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

  const lateShown = allLate ? past : past.slice(0, LATE_MAX);
  const lateHidden = past.length - lateShown.length;
  const lateCols = spread(lateShown, Math.min(LATE_COLS, Math.max(1, Math.ceil(lateShown.length / LATE_MIN))));
  const totalTp = past.reduce((a, j) => a + (Number(j.tpv) || 0), 0);
  /* Looked up fresh every render, so a saved field is visible immediately. */
  const peek = peekId ? jobs.find((j) => j.id === peekId) || null : null;

  /* Who is carrying this board, so the colours have a key rather than being
     decoration somebody has to decode. */
  const owners = [...new Set([...past, ...coming].map(ownerOf))].sort();

  return (
    <div className="bg-white rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <div className="font-bold text-sm">Delivery run</div>
        <div className="text-xs" style={{ color: "var(--muted)" }}>past due, then the week ahead</div>
        <div className="flex-1" />
        <div className="flex gap-1.5 flex-wrap items-center">
          {owners.map((o) => (
            <span key={o} className="rounded px-1.5" style={{ fontSize: 10.5, fontWeight: 700, color: ownerColour(o), background: `${ownerColour(o)}14` }}>{o}</span>
          ))}
          {/**
            * A PICTURE FOR WHATSAPP (Dr Raghu, 28 Sep 2026: "make a jpg there
            * which can be seen by stratcom members — Download jpg. This will
            * be useful to send to the whatsapp").
            *
            * Stratcom only, because it carries the whole shop's late work and
            * the money held up in it out of Genie and into a chat — which is
            * the point, and also the reason it is not a button everybody has.
            */}
          {isStrat && (
            <button onClick={async () => {
              const toRun = (j: Job): RunJob => ({
                id: jobNo(j.id), tag: j.tag, pct: j.pct, tdd: j.tdd, otd: j.otd,
                owner: ownerOf(j), colour: ownerColour(ownerOf(j)),
                lateDays: j.tdd && j.tdd < TODAY ? Math.abs(daysBetween(TODAY, j.tdd)) : 0,
              });
              const url = runJpg(
                TODAY,
                past.map(toRun),
                days.map((d) => ({ date: d, label: dayHead(d).day, weekday: dayHead(d).weekday, jobs: onDay(d).map(toRun) })),
                totalTp / 1e7,
                /* The whole board, and the next twenty going out — the size
                   of the book and the size of the next bite of it. */
                (() => {
                  const next20 = [...past, ...coming].slice(0, 20);
                  const sum = (rows: Job[], k: "val" | "tpv") => rows.reduce((a, j) => a + (Number(j[k]) || 0), 0);
                  return {
                    jobs: jobs.length, val: sum(jobs, "val"), tp: sum(jobs, "tpv"),
                    nextJobs: next20.length, nextVal: sum(next20, "val"), nextTp: sum(next20, "tpv"),
                  };
                })(),
                /**
                 * WHAT ACTUALLY WENT OUT — from `delivered_jobs`, which is
                 * the table the year report reads, so the picture and the
                 * report cannot disagree.
                 *
                 * It was being totalled off the job board, which holds what
                 * is still being BUILT. That reported ₹6.52 Cr against a
                 * true ₹24.38 Cr, in a picture meant to be sent to people.
                 */
                await fetch("/api/delivered-summary", { cache: "no-store" })
                  .then((r) => r.json())
                  .then((j) => (j.rows || []) as { on: string; val: number; tp: number }[])
                  .catch(() => []),
              );
              if (!url) { window.alert("This browser would not draw the picture."); return; }
              const a = document.createElement("a");
              a.href = url;
              a.download = `delivery-run-${TODAY}.jpg`;
              a.click();
            }} className="rounded px-2 py-1 font-bold" style={{ fontSize: 11, background: "var(--navy)", color: "#fff" }}
              title="A picture of the run — date, the year/quarter/month clocks, and every job. For WhatsApp.">
              ⤓ JPG
            </button>
          )}
        </div>
      </div>

      {/* IT MUST FIT THE SCREEN (Dr Raghu, 28 Sep 2026: "make this fit into
          the screen width. Reduce font size of the customer tag if needed").
          minmax(0,…) rather than a pixel floor: a minimum width is a promise
          the grid keeps by pushing Sunday off the right-hand edge, and the
          last day of the week is exactly the one somebody scrolls to find.
          The columns share what there is and the tag gives up the points. */}
      <div className="grid gap-1.5" style={{
        gridTemplateColumns: `minmax(0,1.9fr) repeat(7, minmax(0,1fr))`,
      }}>
        {/* ---- past due: ONE heading, two columns under it ---- */}
        <div style={{ minWidth: 0 }}>
          <div className="rounded px-2 py-1 mb-1.5" style={{ background: past.length ? "var(--red)" : "var(--green)" }}>
            <div className="flex items-baseline gap-2">
              <div className="text-xs font-bold" style={{ color: "#fff" }}>Past due</div>
              {/* THE TOTAL, ON THE HEADING. One problem counted once — three
                  columns each with their own red heading read as three
                  separate problems. */}
              <div className="tnum font-bold" style={{ color: "#fff", fontSize: 15, lineHeight: 1 }}>{past.length}</div>
              <div className="flex-1" />
              {totalTp > 0 && <div style={{ fontSize: 10.5, color: past.length ? "#FFD9D2" : "#D7F0DF" }}>₹{(totalTp / 1e7).toFixed(2)} Cr held up</div>}
            </div>
            <div style={{ fontSize: 10.5, color: past.length ? "#FFD9D2" : "#D7F0DF" }}>
              {past.length ? "oldest first · the TDD needs revising" : "nothing late"}
            </div>
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: lateCols.length > 1 ? "1fr 1fr" : "1fr" }}>
            {lateCols.map((col, ci) => (
              <div key={`late-${ci}`} className="flex flex-col gap-1.5" style={{ minWidth: 0 }}>
                {col.map((j) => (
                  <div key={j.id}>
                    {/* How late, on the box: "4 days" is the fact a date
                        makes the reader work out. */}
                    <div style={{ fontSize: 10, color: "var(--red)", fontWeight: 700 }}>
                      {fmt(j.tdd)} · {Math.abs(daysBetween(TODAY, j.tdd as string))}d late
                    </div>
                    <JobBox j={j} onPeek={(j) => setPeekId(j.id)} dense />
                  </div>
                ))}
              </div>
            ))}
          </div>
          {(lateHidden > 0 || allLate) && (
            <button onClick={() => setAllLate(!allLate)} className="rounded text-xs font-bold py-1.5 w-full mt-1.5"
              style={{ border: "1px solid var(--red)", color: "var(--red)", background: "#fff" }}>
              {allLate ? "Show fewer" : `+ ${lateHidden} more past due`}
            </button>
          )}
        </div>

        {/* ---- one column per day ---- */}
        {days.map((d) => {
          const h = dayHead(d);
          const mine = onDay(d);
          const isToday = d === TODAY;
          return (
            <div key={d} style={{ minWidth: 0 }}>
              <div className="rounded px-2 py-1 mb-1.5" style={{ background: isToday ? "var(--navy)" : "#F4F2EC" }}>
                <div className="font-bold" style={{ fontSize: 11.5, color: isToday ? "#fff" : "var(--ink)" }}>{h.day}</div>
                <div className="truncate" style={{ fontSize: 9.5, color: isToday ? "#8FA1B3" : "var(--muted)" }}>
                  {h.weekday}{isToday ? " · today" : ""} · {mine.length}
                </div>
              </div>
              <div className="flex flex-col gap-1.5" style={{ maxHeight: 430, overflowY: "auto" }}>
                {mine.length === 0
                  ? <div className="text-xs py-3 text-center" style={{ color: "#C9C6BD" }}>—</div>
                  : mine.map((j) => <JobBox key={j.id} j={j} onPeek={(j) => setPeekId(j.id)} dense />)}
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

      {peek && (
        <JobLightbox
          job={toWip(peek)}
          V={V}
          colour={ownerColour(ownerOf(peek))}
          onClose={() => setPeekId(null)}
          onOpenPlan={() => { setPeekId(null); onOpen(peek.id); }}
          canEdit={canEdit}
          onSaved={reload}
          /* The board's own vocabulary of statuses, so the list cannot drift
             from what the ERP actually sends. */
          statuses={[...new Set(jobs.map((j) => (j.stat || "").trim()).filter(Boolean))]}
        />
      )}
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
  isStrat,
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
  isStrat: boolean;
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
      <div className="mb-4">
        <DeliveryBoard jobs={board.jobs} board={board} onOpen={onOpen} V={V} reload={reload} isStrat={isStrat}
          canEdit={me.role === "admin" || me.role === "planner" || me.role === "project_owner"} />
      </div>

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