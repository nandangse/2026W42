/**
 * THE DELIVERY RUN AS A PICTURE, for WhatsApp.
 *
 * Dr Raghu, 28 Sep 2026: "make a jpg there which can be seen by stratcom
 * members — Download jpg. This will be useful to send to the whatsapp. In the
 * jpg show the date and day; show how many days completed of year and how
 * many pending; same for quarter and month."
 *
 * DRAWN, NOT SCREENSHOTTED. Turning the live page into an image needs a
 * library that walks the DOM and re-implements CSS, and it gets fonts,
 * shadows and scroll positions wrong in ways nobody notices until the picture
 * is already in a group of thirty people. Drawing it here means the picture
 * is exactly what this file says and nothing else — and it is legible on a
 * phone, which a screenshot of a seven-column board is not.
 *
 * THE THREE CLOCKS ARE THE POINT. A list of late jobs says what is wrong; the
 * year, quarter and month bars say how much time is left to put it right, and
 * that is the thing a delivery message is really about.
 */

export interface RunJob {
  id: string; tag: string; pct: number;
  tdd: string | null; otd: string | null;
  owner: string; colour: string; lateDays: number;
}
export interface RunDay { date: string; label: string; weekday: string; jobs: RunJob[] }

const C = {
  ink: "#16232F", navy: "#1B3A5C", sub: "#46545F", faint: "#8B8F87",
  line: "#DCD8CC", paper: "#FFFFFF", band: "#F4F2EC",
  red: "#B3392E", amber: "#B45309", green: "#0D7A3F", accent: "#E4610F",
};

const d0 = (iso: string) => new Date(`${iso}T00:00:00`);
const days = (a: string, b: string) => Math.round((d0(b).getTime() - d0(a).getTime()) / 86400000);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Where today sits inside the year, the quarter and the month.
 *
 * THE YEAR IS THE FINANCIAL YEAR — 1 April. A delivery message that counted
 * from 1 January would be counting somebody else's year, and every target it
 * sits next to is set against this one.
 *
 * THE QUARTER IS THE FINANCIAL QUARTER: Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar.
 */
export interface Clock { label: string; done: number; total: number; from: string; to: string }

export function clocks(today: string): Clock[] {
  const t = d0(today);
  const y = t.getFullYear(), m = t.getMonth();
  const fyStart = new Date(m >= 3 ? y : y - 1, 3, 1);
  const fyEnd = new Date(m >= 3 ? y + 1 : y, 2, 31);
  const qi = Math.floor(((m - 3 + 12) % 12) / 3);          // 0 = Apr–Jun
  const qStartMonth = (3 + qi * 3) % 12;
  const qYear = qStartMonth >= 3 ? fyStart.getFullYear() : fyStart.getFullYear() + 1;
  const qStart = new Date(qYear, qStartMonth, 1);
  const qEnd = new Date(qYear, qStartMonth + 3, 0);
  const mStart = new Date(y, m, 1);
  const mEnd = new Date(y, m + 1, 0);
  const span = (a: Date, b: Date) => days(iso(a), iso(b)) + 1;   // inclusive
  const fy = `${fyStart.getFullYear()}-${String(fyStart.getFullYear() + 1).slice(2)}`;
  return [
    /* NAMED, NOT JUST "YEAR" (Dr Raghu, 28 Sep 2026: "year is financial
       year"). It was already counted from 1 April — the label was the only
       thing that did not say so, and a bar marked "YEAR" beside a calendar
       date invites exactly the wrong reading. */
    { label: `FY ${fy}`, done: span(fyStart, t), total: span(fyStart, fyEnd), from: iso(fyStart), to: iso(fyEnd) },
    { label: "Quarter", done: span(qStart, t), total: span(qStart, qEnd), from: iso(qStart), to: iso(qEnd) },
    { label: "Month", done: span(mStart, t), total: span(mStart, mEnd), from: iso(mStart), to: iso(mEnd) },
  ];
}

const LONG_DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LONG_MON = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export interface RunTotals {
  jobs: number; val: number; tp: number;          // the whole board
  nextJobs: number; nextVal: number; nextTp: number;   // the next 20 going out
}

/**
 * ONE PAGE, ALWAYS (Dr Raghu, 28 Sep 2026: "Always fit to one page").
 *
 * A picture whose height depends on how bad the week is cannot be sent: on a
 * heavy Monday it becomes a ribbon that WhatsApp shrinks to a thumbnail
 * nobody can read, and the worse the week the less readable the message
 * about it. So the canvas is a fixed 4:5 — the shape a phone shows whole —
 * and what fits is decided against that height.
 *
 * WHAT DOES NOT FIT IS COUNTED, NOT DROPPED. The picture says how many jobs
 * it could not show. A summary that silently ends early is worse than one
 * that admits where it stopped.
 */
export interface DeliveredRow { on: string; val: number; tp: number }

export function runJpg(
  today: string, past: RunJob[], week: RunDay[], heldCr: number, tot: RunTotals,
  delivered: DeliveredRow[] = [],
): string {
  /**
   * TALLER, AND THE ROWS TIGHTER — because twenty must actually appear.
   *
   * Dr Raghu, 28 Sep 2026: "only 12 are seen in the jpg and NOT the 20!"
   *
   * At 4:5 with 58-point rows there was room for twelve, so the picture was
   * promising twenty in its heading and showing twelve underneath. A summary
   * that contradicts its own headline is worse than no summary. 2:3 is still
   * one page on a phone, and a 44-point row still holds two lines.
   */
  const W = 1080, H = 1620, PAD = 34;
  const rowH = 44;
  const colTitle = 34;

  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const x = cv.getContext("2d");
  if (!x) return "";
  const F = (px: number, w = "400") => `${w} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

  x.fillStyle = C.paper; x.fillRect(0, 0, W, H);

  // ---- the header band -----------------------------------------------
  x.fillStyle = C.navy; x.fillRect(0, 0, W, 300);
  const t = d0(today);
  x.fillStyle = "#8FA1B3"; x.font = F(19, "700");
  x.fillText("NANDAN GSE · DELIVERY RUN", PAD, 46);
  x.fillStyle = "#fff"; x.font = F(40, "700");
  x.fillText(`${LONG_DAY[t.getDay()]}, ${t.getDate()} ${LONG_MON[t.getMonth()]} ${t.getFullYear()}`, PAD, 92);

  /**
   * THE THREE CLOCKS — how much of the period is gone, what went out in it,
   * and the rate that produced it.
   *
   * Dr Raghu, 29 Sep 2026: "show number of jobs also for each box. Also
   * mention 182 days done 183 left for each box. Below each period stats
   * also show the Run rate for each period of nos, value, T."
   *
   * THE RATE IS PER MONTH, for all three. It is the unit he already reads
   * the year report in — "₹10.02 Cr per month" — and a rate stated per day
   * in crores is a number nobody can hold in their head. The month's own box
   * is a rate per month computed from part of a month, which is the point:
   * it says what THIS month is running at, not what it has reached.
   */
  const cl = clocks(today);
  const cw = (W - PAD * 2 - 24) / 3;
  cl.forEach((c, i) => {
    const cx = PAD + i * (cw + 12), cy = 108;
    const left = c.total - c.done;
    x.fillStyle = "rgba(255,255,255,.08)"; roundRect(x, cx, cy, cw, 176, 8); x.fill();
    x.fillStyle = "#8FA1B3"; x.font = F(15, "700");
    x.fillText(c.label.toUpperCase(), cx + 14, cy + 22);

    /* Measured in the font it is drawn in, before switching. */
    x.fillStyle = "#fff"; x.font = F(24, "700");
    x.fillText(`${c.done}`, cx + 14, cy + 50);
    const dw = x.measureText(`${c.done}`).width;
    x.fillStyle = "#8FA1B3"; x.font = F(14);
    x.fillText(`days done  ·  ${left} left`, cx + 20 + dw, cy + 50);

    x.fillStyle = "rgba(255,255,255,.16)"; roundRect(x, cx + 14, cy + 60, cw - 28, 7, 4); x.fill();
    x.fillStyle = "#F0A02A"; roundRect(x, cx + 14, cy + 60, (cw - 28) * (c.done / c.total), 7, 4); x.fill();

    const inPeriod = delivered.filter((d) => d.on >= c.from && d.on <= today);
    const n = inPeriod.length;
    const v = inPeriod.reduce((a, d) => a + d.val, 0);
    const tp = inPeriod.reduce((a, d) => a + d.tp, 0);

    x.fillStyle = "#6E8298"; x.font = F(11);
    x.fillText("DELIVERED", cx + 14, cy + 86);
    x.fillStyle = "#fff"; x.font = F(19, "700");
    x.fillText(`${n}`, cx + 14, cy + 108);
    const nw3 = x.measureText(`${n}`).width;
    x.fillStyle = "#8FA1B3"; x.font = F(13);
    x.fillText(n === 1 ? "job" : "jobs", cx + 20 + nw3, cy + 108);

    x.fillStyle = "#F0A02A"; x.font = F(16, "700");
    const vs = `₹${(v / 1e7).toFixed(2)} Cr`;
    x.fillText(vs, cx + 14, cy + 130);
    const vw = x.measureText(vs).width;
    x.fillStyle = "#7BC67E"; x.font = F(16, "700");
    x.fillText(`₹${(tp / 1e7).toFixed(2)} Cr`, cx + 14 + vw + 12, cy + 130);

    /* The rate that produced it, in the unit the year report already uses. */
    const perMonth = c.done > 0 ? 30.44 / c.done : 0;
    x.fillStyle = "rgba(255,255,255,.10)"; roundRect(x, cx + 10, cy + 140, cw - 20, 28, 5); x.fill();
    x.fillStyle = "#6E8298"; x.font = F(10);
    x.fillText("RUN RATE / MONTH", cx + 16, cy + 152);
    x.fillStyle = "#C8D2DC"; x.font = F(12.5, "700");
    x.fillText(
      `${(n * perMonth).toFixed(1)} jobs  ·  ₹${((v / 1e7) * perMonth).toFixed(2)} Cr  ·  ₹${((tp / 1e7) * perMonth).toFixed(2)} Cr`,
      cx + 16, cy + 165,
    );
  });

  // ---- what the board is worth ----------------------------------------
  /* Dr Raghu, 28 Sep 2026: "Total Jobs: <> | Value | Throughput. Next 20
     Jobs <> | Value | Throughput." The two together say the size of the book
     and the size of the next bite of it — a count on its own says neither. */
  let y = 322;
  const money = (r: number) => `₹${(r / 1e7).toFixed(2)} Cr`;
  const sumLine = (label: string, n: number, val: number, tp: number, tone: string) => {
    x.fillStyle = C.band; roundRect(x, PAD, y, W - PAD * 2, 42, 6); x.fill();
    x.fillStyle = tone; x.font = F(17, "700");
    x.fillText(label, PAD + 14, y + 27);
    const lw = x.measureText(label).width;
    x.fillStyle = C.ink; x.font = F(21, "700");
    x.fillText(String(n), PAD + 24 + lw, y + 27);
    const nw2 = x.measureText(String(n)).width;
    x.fillStyle = C.faint; x.font = F(17);
    x.fillText("  |  ", PAD + 26 + lw + nw2, y + 27);
    const barW = x.measureText("  |  ").width;
    x.fillStyle = C.accent; x.font = F(19, "700");
    x.fillText(money(val), PAD + 26 + lw + nw2 + barW, y + 27);
    const vw = x.measureText(money(val)).width;
    x.fillStyle = C.faint; x.font = F(17);
    x.fillText("  |  ", PAD + 28 + lw + nw2 + barW + vw, y + 27);
    x.fillStyle = C.green; x.font = F(19, "700");
    x.fillText(money(tp), PAD + 28 + lw + nw2 + barW + vw + barW, y + 27);
    /* The labels for the two figures, said once, on the right. */
    x.fillStyle = C.faint; x.font = F(13);
    const t = "value  ·  throughput";
    x.fillText(t, W - PAD - 14 - x.measureText(t).width, y + 27);
    y += 48;
  };
  sumLine("Total jobs", tot.jobs, tot.val, tot.tp, C.navy);
  sumLine("Next 20 going out", tot.nextJobs, tot.nextVal, tot.nextTp, C.accent);

  // ---- the headline number --------------------------------------------
  y += 8;
  x.fillStyle = past.length ? C.red : C.green;
  x.font = F(34, "700");
  x.fillText(`${past.length}`, PAD, y + 12);
  const nw = x.measureText(`${past.length}`).width;
  x.fillStyle = C.ink; x.font = F(20);
  x.fillText(past.length ? "  past due" : "  nothing past due", PAD + nw, y + 12);
  if (heldCr > 0) {
    x.fillStyle = C.sub; x.font = F(17);
    const s = `₹${heldCr.toFixed(2)} Cr held up`;
    x.fillText(s, W - PAD - x.measureText(s).width, y + 12);
  }
  y += 34;

  /**
   * HOW MANY ROWS THERE IS ROOM FOR — counted before anything is drawn.
   *
   * Past due is served first because it is the part that cannot wait, then
   * the days in order until the page is full.
   */
  const FOOT = 40;
  const blocksWanted = 1 + week.filter((d) => d.jobs.length).length;
  let room = Math.floor((H - y - FOOT - blocksWanted * (colTitle + 6)) / rowH);
  let notShown = 0;
  /**
   * THE WEEK IS SERVED FIRST, UP TO TWENTY.
   *
   * The heading says "next 20 going out", so the twenty is the promise the
   * picture has already made. Past due takes what is left — never nothing,
   * because late work must always be visible, but it no longer takes half
   * the page and leaves the twenty unshowable.
   */
  const comingRows = week.reduce((a, d) => a + d.jobs.length, 0);
  const forDays = Math.min(20, comingRows, Math.max(0, room - 3));
  const pastRoomMax = Math.max(0, room - forDays);

  // ---- one list per block ---------------------------------------------
  const block = (title: string, sub: string, tone: string, jobs: RunJob[]) => {
    x.fillStyle = tone; roundRect(x, PAD, y, W - PAD * 2, 30, 6); x.fill();
    x.fillStyle = "#fff"; x.font = F(17, "700");
    x.fillText(title, PAD + 12, y + 21);
    /* MEASURED IN THE TITLE'S OWN FONT. It was measured after switching to
       the smaller one, so the subtitle started too far left and printed on
       top of the title. */
    const tw = x.measureText(title).width;
    x.font = F(14);
    x.fillStyle = "rgba(255,255,255,.75)";
    if (sub) x.fillText(sub, PAD + 12 + tw + 14, y + 21);
    y += 30 + 6;
    if (!jobs.length) {
      x.fillStyle = C.faint; x.font = F(15);
      x.fillText("—", PAD + 14, y + 18); y += 30;
      return;
    }
    for (const j of jobs) {
      x.fillStyle = j.colour + "14"; roundRect(x, PAD, y, W - PAD * 2, rowH - 5, 6); x.fill();
      x.fillStyle = j.colour; roundRect(x, PAD, y, 5, rowH - 5, 3); x.fill();
      x.fillStyle = j.colour; x.font = F(18, "700");
      x.fillText(j.id, PAD + 16, y + 20);
      x.fillStyle = C.ink; x.font = F(16);
      x.fillText(cut(x, j.tag, W - PAD * 2 - 300), PAD + 82, y + 20);
      const otd = j.otd
        ? (days(today, j.otd) < 0 ? `OTD ${dm(j.otd)} · ${-days(today, j.otd)}d over` : `OTD ${dm(j.otd)} · in ${days(today, j.otd)}d`)
        : "no OTD set";
      x.font = F(13);
      x.fillStyle = j.otd && days(today, j.otd) < 0 ? C.red : C.sub;
      x.fillText(otd, PAD + 82, y + 36);
      x.fillStyle = C.faint; x.font = F(13);
      x.fillText(j.owner, PAD + 300, y + 36);
      // per cent, right-aligned
      x.font = F(18, "700");
      x.fillStyle = j.pct >= 100 ? C.green : j.pct >= 60 ? C.amber : C.red;
      const p = `${j.pct}%`;
      x.fillText(p, W - PAD - 16 - x.measureText(p).width, y + 20);
      if (j.lateDays > 0) {
        x.font = F(13, "700"); x.fillStyle = C.red;
        const l = `${j.lateDays}d late`;
        x.fillText(l, W - PAD - 16 - x.measureText(l).width, y + 36);
      }
      y += rowH;
    }
    y += 8;
  };

  const pastRoom = Math.min(past.length, Math.max(past.length ? 1 : 0, pastRoomMax));
  notShown += past.length - pastRoom;
  room -= Math.min(pastRoom, past.length);
  block("Past due", past.length > pastRoom ? `${pastRoom} of ${past.length} · oldest first` : "oldest first",
    past.length ? C.red : C.green, past.slice(0, pastRoom));

  for (const d of week) {
    if (!d.jobs.length) continue;
    if (room <= 0) { notShown += d.jobs.length; continue; }
    const take = Math.min(d.jobs.length, room);
    room -= take;
    notShown += d.jobs.length - take;
    block(`${d.label} · ${d.weekday}`, d.date === today ? "today" : "", C.navy, d.jobs.slice(0, take));
  }

  x.fillStyle = C.faint; x.font = F(14);
  x.fillText(`Genie · as at ${dm(today)}-${d0(today).getFullYear()}`, PAD, H - 22);
  if (notShown > 0) {
    /* Said, not silently dropped. */
    const m = `${notShown} more not shown — open Genie for the rest`;
    x.fillStyle = C.sub;
    x.fillText(m, W - PAD - x.measureText(m).width, H - 22);
  }

  return cv.toDataURL("image/jpeg", 0.92);
}

const dm = (s: string) => `${s.slice(8)}-${s.slice(5, 7)}`;

function cut(x: CanvasRenderingContext2D, s: string, max: number): string {
  if (x.measureText(s).width <= max) return s;
  let t = s;
  while (t.length > 4 && x.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

function roundRect(x: CanvasRenderingContext2D, a: number, b: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  x.beginPath();
  x.moveTo(a + rr, b);
  x.arcTo(a + w, b, a + w, b + h, rr);
  x.arcTo(a + w, b + h, a, b + h, rr);
  x.arcTo(a, b + h, a, b, rr);
  x.arcTo(a, b, a + w, b, rr);
  x.closePath();
}
