"use client";
// Quote of the day — shown once after login, plus on demand via the header
// button. Quotes are bundled as static data (src/lib/quotes-data.ts), NOT
// stored in the database. Everyone sees the same quote on a given day, and the
// collection cycles fully before anything repeats.
import { useEffect, useState } from "react";
import { swallow } from "@/lib/swallow";
import { QUOTES } from "@/lib/quotes-data";

const KEY = "nps-quote-hide-until";
const DAY_MS = 86400000;

function todayISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Same quote for everyone on a given date; cycles the whole list. */
function quoteFor(iso: string) {
  const dayNo = Math.floor(Date.parse(iso + "T00:00:00Z") / DAY_MS);
  return QUOTES[((dayNo % QUOTES.length) + QUOTES.length) % QUOTES.length];
}

/**
 * The quote as a panel on My Week — always there, nothing to dismiss.
 *
 * A different one on every page load, not one a day. The people who read this
 * page open it eight times between eight and six, and a quote that does not
 * change stops being read by the second look.
 *
 * Chosen in an effect rather than during render: picking at random while
 * rendering makes the server and the browser disagree about what they drew,
 * and React reports that as a hydration error. One frame with an empty card is
 * the cost.
 */
export function QuoteCard() {
  const [quote, setQuote] = useState<(typeof QUOTES)[number] | null>(null);
  useEffect(() => {
    setQuote(QUOTES.length ? QUOTES[Math.floor(Math.random() * QUOTES.length)] : null);
  }, []);
  if (!quote) return null;
  return (
    <div className="bg-white rounded-lg border p-3" style={{ borderColor: "var(--line)", borderTop: "3px solid #F5B32B" }}>
      <div className="text-xs font-bold mb-1" style={{ color: "var(--muted)", letterSpacing: 1.1 }}>QUOTE OF THE DAY</div>
      <div className="text-sm" style={{ color: "var(--ink)", lineHeight: 1.55 }}>{quote.q}</div>
      <div className="text-xs mt-1 flex items-baseline gap-2 flex-wrap">
        <span className="font-semibold" style={{ color: "var(--muted)" }}>— {quote.by}</span>
        {quote.cat && <span style={{ color: "#B8B5AC" }}>{quote.cat}</span>}
      </div>
    </div>
  );
}

/**
 * @param trigger increment to force the quote open on demand (header button),
 *        bypassing the don't-show-again-today flag.
 */
/**
 * THE MORNING BOX (Dr Raghu, 30 Sep 2026): "in this popup, show quote of the
 * day, birthday today, jobs for delivery today-tomorrow (nos) and job nos
 * (cust tag), today should include the jobs whose TDD has passed too, my
 * tasks (job related) nos, my tasks (others) nos."
 *
 * IT IS THE ONE THING EVERYBODY SEES EVERY MORNING, so it is the cheapest
 * place in Genie to put the four facts a day actually turns on. A quote on
 * its own is a nice thing that people learn to dismiss without reading; a
 * quote with today's deliveries under it is a thing people read.
 *
 * TODAY INCLUDES WHAT IS ALREADY LATE — his instruction, and the only honest
 * reading of "for delivery today". A machine due on the 24th and still here
 * is more today's problem than one due this afternoon.
 *
 * TASKS ARE SPLIT JOB / OTHER because they are answered differently: one is
 * chased on the floor, the other is somebody's own list.
 */
export default function QuoteOfDay({ trigger = 0, board, me }: {
  trigger?: number;
  board?: { jobs: BriefJob[]; tasks: BriefTask[] } | null;
  me?: { email: string; initials: string | null; displayName: string | null; erpOwner: string | null } | null;
}) {
  const [show, setShow] = useState(false);
  const today = todayISO();
  const quote = quoteFor(today);

  // auto-show once per day
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) !== today) setShow(true);
    } catch {
      setShow(true); // private mode — still show it
    }
  }, [today]);

  // manual open — always shows, even after dismissing for the day
  useEffect(() => {
    if (trigger) setShow(true);
  }, [trigger]);

  if (!show || !quote) return null;

  const hideToday = () => {
    try {
      localStorage.setItem(KEY, today);
    } catch (e) { swallow("QuoteOfDay", e); /* private mode — just close */ }
    setShow(false);
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background: "rgba(13,22,31,0.7)", zIndex: 90 }}
      role="button" tabIndex={0} onClick={() => setShow(false)}
    >
      <div
        role="button" tabIndex={0} onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg p-5 w-full"
        style={{ maxWidth: 520, maxHeight: "88vh", overflowY: "auto", borderTop: "5px solid #E8600A" }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-xs font-bold tracking-widest" style={{ color: "var(--accent)" }}>
            ☀ QUOTE OF THE DAY
          </div>
          {quote.cat && (
            <div className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
              {quote.cat}
            </div>
          )}
        </div>

        <div className="text-lg mt-3" style={{ color: "var(--navy)", lineHeight: 1.45 }}>
          &ldquo;{quote.q}&rdquo;
        </div>

        <div className="text-sm mt-2 font-semibold" style={{ color: "var(--muted)" }}>
          — {quote.by || "Unattributed"}
          {quote.orig && (
            <span
              className="ml-2 rounded px-1.5 py-0.5 font-bold"
              style={{ background: "#F3EEFB", color: "#7C3AED", fontSize: 10 }}
              title="From the original Nandan collection"
            >
              ORIGINAL
            </span>
          )}
        </div>

        <Brief board={board} me={me} today={today} />

        <div className="flex gap-2 mt-5">
          <button
            onClick={hideToday}
            className="flex-1 py-2 rounded font-bold text-sm"
            style={{ background: "var(--ink)", color: "#fff" }}
          >
            Don&apos;t show again till tomorrow
          </button>
          <button
            onClick={() => setShow(false)}
            className="py-2 px-4 rounded font-bold text-sm border"
            style={{ borderColor: "#D9D6CD", color: "var(--dim)" }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── the morning brief ─────────────────────────── */

export interface BriefJob {
  id: string; tag: string; tdd: string | null;
  delivered?: boolean; active?: boolean;
}
export interface BriefTask {
  id: string; t: string; who: string | null; due: string | null;
  done?: boolean; j?: string | null;
}

const dm = (s: string | null | undefined) =>
  s ? `${s.slice(8, 10)}-${s.slice(5, 7)}` : "";
const jobNo4 = (id: string) => String(id).replace(/\D/g, "").slice(-4) || String(id);

function Brief({ board, me, today }: {
  board?: { jobs: BriefJob[]; tasks: BriefTask[] } | null;
  me?: { email: string; initials: string | null; displayName: string | null; erpOwner: string | null } | null;
  today: string;
}) {
  const [bdays, setBdays] = useState<{ name: string; department: string | null }[]>([]);

  useEffect(() => {
    /* Birthdays come from the same place the week panel reads them; a quiet
       failure just means the line is not drawn, never a broken popup. */
    fetch("/api/my-week", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setBdays((j.birthdays || []).filter((b: { inDays: number }) => b.inDays === 0)))
      .catch(() => setBdays([]));
  }, []);

  if (!board) return null;

  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const live = (board.jobs || []).filter((j) => !j.delivered && j.tdd);
  /* TODAY CARRIES THE PAST WITH IT — his rule. A job due on the 24th and
     still here is more today's problem than one due this afternoon. */
  const dueToday = live.filter((j) => (j.tdd as string) <= today);
  const dueTomorrow = live.filter((j) => j.tdd === tomorrow);

  /* Whose tasks are mine — the same handles the week panel matches on. */
  const handles = new Set(
    [me?.email, me?.initials, me?.erpOwner, me?.displayName, String(me?.email || "").split("@")[0]]
      .map((x) => String(x || "").trim().toLowerCase()).filter(Boolean),
  );
  const mine = (board.tasks || []).filter((t) => !t.done && handles.has(String(t.who || "").toLowerCase()));
  const jobTasks = mine.filter((t) => t.j);
  const otherTasks = mine.filter((t) => !t.j);

  const Line = ({ label, n, tone, children }: { label: string; n: number; tone: string; children?: React.ReactNode }) => (
    <div style={{ padding: "7px 0", borderTop: "1px solid #EFEDE7" }}>
      <div className="flex items-baseline gap-2">
        <b className="tnum" style={{ fontSize: 19, color: n ? tone : "#B8B5AC", minWidth: 32 }}>{n}</b>
        <span style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 600 }}>{label}</span>
      </div>
      {children}
    </div>
  );

  const Jobs = ({ list }: { list: BriefJob[] }) => (
    <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.6, paddingLeft: 40 }}>
      {list.slice(0, 8).map((j, i) => (
        <span key={j.id}>
          {i ? " · " : ""}
          <b style={{ color: "var(--blue)" }}>{jobNo4(j.id)}</b>
          {j.tag ? ` ${String(j.tag).slice(0, 34)}` : ""}
          {j.tdd && j.tdd < today ? <b style={{ color: "var(--red)" }}> ({dm(j.tdd)})</b> : null}
        </span>
      ))}
      {list.length > 8 && <span> · and {list.length - 8} more</span>}
    </div>
  );

  return (
    <div className="mt-4">
      {bdays.length > 0 && (
        <div className="rounded px-2 py-1.5 mb-2" style={{ background: "#FFF3E8" }}>
          <span style={{ fontSize: 12.5, color: "#8A5B00" }}>
            🎂 <b>{bdays.map((b) => b.name).join(", ")}</b>
            {bdays[0]?.department ? <span style={{ color: "#A98750" }}> · {bdays[0].department}</span> : null}
            {" — birthday today."}
          </span>
        </div>
      )}

      <Line label={`for delivery today${dueToday.some((j) => (j.tdd as string) < today) ? " — including what is already late" : ""}`}
        n={dueToday.length} tone="var(--red)">
        {dueToday.length > 0 && <Jobs list={dueToday} />}
      </Line>

      <Line label="for delivery tomorrow" n={dueTomorrow.length} tone="var(--accent)">
        {dueTomorrow.length > 0 && <Jobs list={dueTomorrow} />}
      </Line>

      <Line label="my tasks on jobs" n={jobTasks.length} tone="var(--navy)" />
      <Line label="my other tasks" n={otherTasks.length} tone="var(--navy)" />
    </div>
  );
}
