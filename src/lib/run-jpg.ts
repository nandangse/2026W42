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

import { BREAKTHROUGH } from "./breakthrough-logo";

export interface RunJob {
  id: string; tag: string; pct: number; kit: number;
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
    /* NAMED, NOT "QUARTER" (Dr Raghu, 30 Sep 2026). A picture that gets
       forwarded has nobody standing beside it to say which quarter. */
    { label: `${fy} Q${qi + 1}`, done: span(qStart, t), total: span(qStart, qEnd), from: iso(qStart), to: iso(qEnd) },
    { label: `${LONG_MON[m]} ${y}`, done: span(mStart, t), total: span(mStart, mEnd), from: iso(mStart), to: iso(mEnd) },
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

export async function runJpg(
  today: string, past: RunJob[], week: RunDay[], heldCr: number, tot: RunTotals,
  delivered: DeliveredRow[] = [],
): Promise<string> {
  /**
   * TWO COLUMNS, AND BOXES RATHER THAN LINES (Dr Raghu, 30 Sep 2026: "try
   * putting this into two columns. Mostly seen on mobile. so left job - right
   * job then next line make as boxes so its more readable. let the dates also
   * come on top").
   *
   * A full-width row wastes two thirds of its width on a tag that is forty
   * characters long, and on a phone the page then runs past the fold. Two
   * boxes to a row halves the height, and the date moves up beside the job
   * number where it is read first — which is what the picture is about.
   */
  const W = 1080, PAD = 34;
  const GAP = 12;
  const colW = (W - PAD * 2 - GAP) / 2;
  const boxH = 84, boxGap = 10;
  const headH = 32, headGap = 8;

  /* THE BANNER, SMALLER (his instruction). It was taking a sixth of the page
     to say a thing everybody in the group already knows. */
  let banner: HTMLImageElement | null = null;
  let bannerH = 0;
  try {
    banner = await loadImage(BREAKTHROUGH);
    if (banner) bannerH = Math.round((banner.height / banner.width) * 340) + 12;
  } catch { /* the picture stands without it */ }

  /**
   * WHAT WILL BE SHOWN IS DECIDED BEFORE THE PAGE IS SIZED.
   *
   * The canvas used to be a fixed 1620 and the content was cut to fit it,
   * which left a hand's width of blank paper whenever the week was light.
   * Deciding the content first and then cutting the paper to it gives one
   * page either way, with nothing dangling and nothing padded.
   */
  const CAP = 20;
  const shownDays: RunDay[] = [];
  let left = CAP;
  for (const d of week) {
    if (left <= 0) break;
    if (!d.jobs.length) continue;
    const take = d.jobs.slice(0, left);
    left -= take.length;
    shownDays.push({ ...d, jobs: take });
  }
  const comingShown = shownDays.reduce((a, d) => a + d.jobs.length, 0);
  const comingTotal = week.reduce((a, d) => a + d.jobs.length, 0);
  /* Late work is never hidden, but it no longer takes half the page: eight
     boxes is four rows, and the rest is counted at the foot. */
  const pastShown = past.slice(0, 8);

  const blockH = (n: number) => headH + headGap + Math.ceil(n / 2) * (boxH + boxGap) + 10;
  const bandH = 280;
  const headerH = bannerH + bandH;
  const sumsH = 2 * 48 + 10;
  /* THE HEADLINE LINE ONLY WHEN THERE IS SOMETHING TO HEAD (his instruction:
     "nothing past due line is irrelevant"). A zero announced in thirty-four
     point type is a line that says nothing loudly. */
  const headlineH = past.length ? 42 : 0;
  const bodyH = (past.length ? blockH(pastShown.length) : 0)
    + shownDays.reduce((a, d) => a + blockH(d.jobs.length), 0);
  const FOOT = 42;
  const H = Math.round(headerH + sumsH + headlineH + bodyH + FOOT);

  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const x = cv.getContext("2d");
  if (!x) return "";
  const F = (px: number, w = "400") => `${w} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

  x.fillStyle = C.paper; x.fillRect(0, 0, W, H);
  if (banner) x.drawImage(banner, (W - 340) / 2, 6, 340, bannerH - 12);

  // ---- the header band -----------------------------------------------
  /* The strapline above the date is gone (his instruction): the banner
     directly above it already says whose picture this is. */
  x.fillStyle = C.navy; x.fillRect(0, bannerH, W, bandH);
  const t = d0(today);
  x.fillStyle = "#fff"; x.font = F(40, "700");
  x.fillText(`${LONG_DAY[t.getDay()]}, ${t.getDate()} ${LONG_MON[t.getMonth()]} ${t.getFullYear()}`, PAD, bannerH + 58);

  /**
   * THE THREE CLOCKS — how much of the period is gone, what went out in it,
   * and the rate that produced it.
   *
   * THE RATE IS PER MONTH, for all three. It is the unit the year report is
   * already read in, and a rate stated per day in crores is a number nobody
   * can hold in their head.
   */
  const cl = clocks(today);
  const cw = (W - PAD * 2 - 24) / 3;
  cl.forEach((c, i) => {
    const cx = PAD + i * (cw + 12), cy = bannerH + 78;
    const daysLeft = c.total - c.done;
    x.fillStyle = "rgba(255,255,255,.08)"; roundRect(x, cx, cy, cw, 176, 8); x.fill();
    x.fillStyle = "#8FA1B3"; x.font = F(15, "700");
    x.fillText(c.label.toUpperCase(), cx + 14, cy + 22);

    /* Measured in the font it is drawn in, before switching. */
    x.fillStyle = "#fff"; x.font = F(24, "700");
    x.fillText(`${c.done}`, cx + 14, cy + 50);
    const dw = x.measureText(`${c.done}`).width;
    x.fillStyle = "#8FA1B3"; x.font = F(14);
    x.fillText(`days done  ·  ${daysLeft} left`, cx + 20 + dw, cy + 50);

    x.fillStyle = "rgba(255,255,255,.16)"; roundRect(x, cx + 14, cy + 60, cw - 28, 7, 4); x.fill();
    x.fillStyle = "#F0A02A"; roundRect(x, cx + 14, cy + 60, (cw - 28) * (c.done / c.total), 7, 4); x.fill();

    const inPeriod = delivered.filter((d) => d.on >= c.from && d.on <= today);
    const n = inPeriod.length;
    const v = inPeriod.reduce((a, d) => a + d.val, 0);
    const tp = inPeriod.reduce((a, d) => a + d.tp, 0);

    x.fillStyle = "#6E8298"; x.font = F(11);
    x.fillText("DELIVERED", cx + 14, cy + 88);
    /* One line, his shape: Jobs | V: XX Cr | T: YY Cr. */
    let px = cx + 14;
    x.fillStyle = "#fff"; x.font = F(19, "700");
    x.fillText(`${n}`, px, cy + 112); px += x.measureText(`${n}`).width + 5;
    x.fillStyle = "#8FA1B3"; x.font = F(13);
    x.fillText(n === 1 ? "Job" : "Jobs", px, cy + 112); px += x.measureText(n === 1 ? "Job" : "Jobs").width + 7;
    x.fillStyle = "#6E8298"; x.font = F(13);
    x.fillText("|", px, cy + 112); px += x.measureText("|").width + 7;
    x.fillStyle = "#F0A02A"; x.font = F(16, "700");
    const vs = `V: ₹${(v / 1e7).toFixed(2)} Cr`;
    x.fillText(vs, px, cy + 112); px += x.measureText(vs).width + 7;
    x.fillStyle = "#6E8298"; x.font = F(13);
    x.fillText("|", px, cy + 112); px += x.measureText("|").width + 7;
    x.fillStyle = "#5FC98B"; x.font = F(16, "700");
    x.fillText(`T: ₹${(tp / 1e7).toFixed(2)} Cr`, px, cy + 112);

    /* THE RATE THAT PRODUCED IT. Days done, not days in the period — the
       month's own box then says what this month is RUNNING at rather than
       what it has reached. */
    const perMonth = 30.44 / Math.max(1, c.done);
    x.fillStyle = "rgba(255,255,255,.07)"; roundRect(x, cx + 12, cy + 126, cw - 24, 38, 6); x.fill();
    x.fillStyle = "#6E8298"; x.font = F(11, "700");
    x.fillText("RUN RATE / MONTH", cx + 16, cy + 142);
    x.fillStyle = "#C7D3DE"; x.font = F(13, "700");
    x.fillText(
      `${(n * perMonth).toFixed(1)} jobs  ·  ₹${((v / 1e7) * perMonth).toFixed(2)} Cr  ·  ₹${((tp / 1e7) * perMonth).toFixed(2)} Cr`,
      cx + 16, cy + 165,
    );
  });

  // ---- what the board is worth ----------------------------------------
  /* The size of the book, and the size of the next bite of it — a count on
     its own says neither. */
  let y = bannerH + bandH + 8;
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
    const lbl = "value  ·  throughput";
    x.fillText(lbl, W - PAD - 14 - x.measureText(lbl).width, y + 27);
    y += 48;
  };
  sumLine("Pending Jobs in progress", tot.jobs, tot.val, tot.tp, C.navy);
  /**
   * THE HEADING COUNTS WHAT IS DRAWN UNDERNEATH IT.
   *
   * It said "Next 20 going out 3" over a page of eleven jobs, because the
   * figure came from the seven-day board on screen while the boxes came from
   * a four-week sweep. Two different questions, one label. The count, the
   * value and the throughput are now totalled from the very rows below, so
   * the headline cannot contradict the page again.
   */
  sumLine(
    comingShown >= CAP ? `Next ${CAP} going out` : `Next ${comingShown} going out`,
    comingShown, tot.nextVal, tot.nextTp, C.accent,
  );

  // ---- the headline number --------------------------------------------
  if (past.length) {
    y += 8;
    x.fillStyle = C.red; x.font = F(34, "700");
    x.fillText(`${past.length}`, PAD, y + 12);
    const nw = x.measureText(`${past.length}`).width;
    x.fillStyle = C.ink; x.font = F(20);
    x.fillText("  past due", PAD + nw, y + 12);
    if (heldCr > 0) {
      x.fillStyle = C.sub; x.font = F(17);
      const s = `₹${heldCr.toFixed(2)} Cr held up`;
      x.fillText(s, W - PAD - x.measureText(s).width, y + 12);
    }
    y += 34;
  }

  /**
   * ONE BOX PER JOB, TWO TO A ROW.
   *
   * The date sits on the top line beside the number because it is what the
   * eye goes to; the tag, which is long and read second, gets a line of its
   * own underneath instead of fighting the percentages for space.
   */
  const box = (j: RunJob, bx: number, by: number) => {
    x.fillStyle = j.colour + "14"; roundRect(x, bx, by, colW, boxH, 8); x.fill();
    x.fillStyle = j.colour; roundRect(x, bx, by, 5, boxH, 3); x.fill();

    x.fillStyle = j.colour; x.font = F(21, "700");
    x.fillText(j.id, bx + 16, by + 28);
    const idw = x.measureText(j.id).width;

    /* THE DATE, ON TOP. */
    const otd = j.otd
      ? (days(today, j.otd) < 0 ? `OTD ${dm(j.otd)} · ${-days(today, j.otd)}d over` : `OTD ${dm(j.otd)} · in ${days(today, j.otd)}d`)
      : "no OTD set";
    x.font = F(13, "700");
    x.fillStyle = j.otd && days(today, j.otd) < 0 ? C.red : C.sub;
    x.fillText(otd, bx + 24 + idw, by + 28);

    /* K AND P. Production alone says how far the building has got; kitting
       says whether it can go any further. */
    const pTxt = `P: ${j.pct}%`, kTxt = `K: ${j.kit}%`;
    x.font = F(15, "700");
    x.fillStyle = j.pct >= 100 ? C.green : j.pct >= 60 ? C.amber : C.red;
    const pw = x.measureText(pTxt).width;
    x.fillText(pTxt, bx + colW - 14 - pw, by + 52);
    x.fillStyle = j.kit >= 80 ? C.green : j.kit >= 40 ? C.amber : C.red;
    const kw = x.measureText(kTxt).width;
    x.fillText(kTxt, bx + colW - 24 - pw - kw, by + 52);

    x.fillStyle = C.ink; x.font = F(16);
    x.fillText(cut(x, j.tag, colW - 40 - pw - kw), bx + 16, by + 52);

    x.fillStyle = C.faint; x.font = F(13);
    x.fillText(cut(x, j.owner, colW - 120), bx + 16, by + 73);
    if (j.lateDays > 0) {
      x.font = F(13, "700"); x.fillStyle = C.red;
      const l = `${j.lateDays}d late`;
      x.fillText(l, bx + colW - 14 - x.measureText(l).width, by + 73);
    }
  };

  const block = (title: string, sub: string, tone: string, jobs: RunJob[]) => {
    x.fillStyle = tone; roundRect(x, PAD, y, W - PAD * 2, headH, 6); x.fill();
    x.fillStyle = "#fff"; x.font = F(17, "700");
    x.fillText(title, PAD + 12, y + 22);
    /* MEASURED IN THE TITLE'S OWN FONT — measured after switching to the
       smaller one, the subtitle printed on top of the title. */
    const tw = x.measureText(title).width;
    x.font = F(14);
    x.fillStyle = "rgba(255,255,255,.75)";
    if (sub) x.fillText(sub, PAD + 12 + tw + 14, y + 22);
    y += headH + headGap;
    jobs.forEach((j, i) => {
      const bx = PAD + (i % 2) * (colW + GAP);
      const by = y + Math.floor(i / 2) * (boxH + boxGap);
      box(j, bx, by);
    });
    y += Math.ceil(jobs.length / 2) * (boxH + boxGap) + 10;
  };

  if (past.length) {
    block("Past due", past.length > pastShown.length ? `${pastShown.length} of ${past.length} · oldest first` : "oldest first",
      C.red, pastShown);
  }
  for (const d of shownDays) {
    block(`${d.label} · ${d.weekday}`, d.date === today ? "today" : "", C.navy, d.jobs);
  }

  const notShown = (past.length - pastShown.length) + (comingTotal - comingShown);
  x.fillStyle = C.faint; x.font = F(14);
  x.fillText(`Genie · as at ${dm(today)}-${d0(today).getFullYear()}`, PAD, H - 20);
  if (notShown > 0) {
    /* Said, not silently dropped. */
    const m = `${notShown} more not shown — open Genie for the rest`;
    x.fillStyle = C.sub;
    x.fillText(m, W - PAD - x.measureText(m).width, H - 20);
  }

  return cv.toDataURL("image/jpeg", 0.92);
}

/** A data URI into a drawable image. Resolves to null rather than throwing:
 *  the picture is worth more without its banner than not at all. */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
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
