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
export function clocks(today: string): { label: string; done: number; total: number }[] {
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
  return [
    { label: "Year", done: span(fyStart, t), total: span(fyStart, fyEnd) },
    { label: "Quarter", done: span(qStart, t), total: span(qStart, qEnd) },
    { label: "Month", done: span(mStart, t), total: span(mStart, mEnd) },
  ];
}

const LONG_DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LONG_MON = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export function runJpg(today: string, past: RunJob[], week: RunDay[], heldCr: number): string {
  const W = 1080, PAD = 34;
  /* Height is measured before a pixel is drawn — a canvas sized by guess
     either clips the last column or pads the picture with white. */
  const rowH = 58;
  const headH = 300;
  const colTitle = 34;
  const listH = (n: number) => colTitle + Math.max(1, n) * rowH + 14;
  const H = headH + listH(Math.min(past.length, 10))
    + week.reduce((a, d) => a + (d.jobs.length ? listH(d.jobs.length) : 0), 0) + 70;

  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const x = cv.getContext("2d");
  if (!x) return "";
  const F = (px: number, w = "400") => `${w} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

  x.fillStyle = C.paper; x.fillRect(0, 0, W, H);

  // ---- the header band -----------------------------------------------
  x.fillStyle = C.navy; x.fillRect(0, 0, W, 226);
  const t = d0(today);
  x.fillStyle = "#8FA1B3"; x.font = F(19, "700");
  x.fillText("NANDAN GSE · DELIVERY RUN", PAD, 46);
  x.fillStyle = "#fff"; x.font = F(40, "700");
  x.fillText(`${LONG_DAY[t.getDay()]}, ${t.getDate()} ${LONG_MON[t.getMonth()]} ${t.getFullYear()}`, PAD, 92);

  // the three clocks
  const cl = clocks(today);
  const cw = (W - PAD * 2 - 24) / 3;
  cl.forEach((c, i) => {
    const cx = PAD + i * (cw + 12), cy = 116;
    const left = c.total - c.done;
    x.fillStyle = "rgba(255,255,255,.08)"; roundRect(x, cx, cy, cw, 88, 8); x.fill();
    x.fillStyle = "#8FA1B3"; x.font = F(15, "700");
    x.fillText(c.label.toUpperCase(), cx + 14, cy + 24);
    x.fillStyle = "#fff"; x.font = F(26, "700");
    x.fillText(`${c.done}`, cx + 14, cy + 54);
    x.fillStyle = "#8FA1B3"; x.font = F(15);
    const dw = x.measureText(`${c.done}`).width;
    x.fillText(` done  ·  ${left} left`, cx + 18 + dw, cy + 54);
    // the bar
    x.fillStyle = "rgba(255,255,255,.16)"; roundRect(x, cx + 14, cy + 66, cw - 28, 7, 4); x.fill();
    x.fillStyle = "#F0A02A"; roundRect(x, cx + 14, cy + 66, (cw - 28) * (c.done / c.total), 7, 4); x.fill();
  });

  // ---- the headline number --------------------------------------------
  let y = 262;
  x.fillStyle = past.length ? C.red : C.green;
  x.font = F(34, "700");
  x.fillText(`${past.length}`, PAD, y);
  const nw = x.measureText(`${past.length}`).width;
  x.fillStyle = C.ink; x.font = F(20);
  x.fillText(past.length ? "  past due" : "  nothing past due", PAD + nw, y);
  if (heldCr > 0) {
    x.fillStyle = C.sub; x.font = F(17);
    const s = `₹${heldCr.toFixed(2)} Cr held up`;
    x.fillText(s, W - PAD - x.measureText(s).width, y);
  }
  y += 22;

  // ---- one list per block ---------------------------------------------
  const block = (title: string, sub: string, tone: string, jobs: RunJob[]) => {
    x.fillStyle = tone; roundRect(x, PAD, y, W - PAD * 2, 30, 6); x.fill();
    x.fillStyle = "#fff"; x.font = F(17, "700");
    x.fillText(title, PAD + 12, y + 21);
    x.font = F(14);
    x.fillStyle = "rgba(255,255,255,.75)";
    x.fillText(sub, PAD + 16 + x.measureText(title).width + 8, y + 21);
    y += 30 + 6;
    if (!jobs.length) {
      x.fillStyle = C.faint; x.font = F(15);
      x.fillText("—", PAD + 14, y + 18); y += 30;
      return;
    }
    for (const j of jobs) {
      x.fillStyle = j.colour + "14"; roundRect(x, PAD, y, W - PAD * 2, rowH - 6, 6); x.fill();
      x.fillStyle = j.colour; roundRect(x, PAD, y, 5, rowH - 6, 3); x.fill();
      x.fillStyle = j.colour; x.font = F(20, "700");
      x.fillText(j.id, PAD + 16, y + 24);
      x.fillStyle = C.ink; x.font = F(17);
      x.fillText(cut(x, j.tag, W - PAD * 2 - 320), PAD + 86, y + 24);
      x.fillStyle = C.sub; x.font = F(14);
      const otd = j.otd
        ? (days(today, j.otd) < 0 ? `OTD ${dm(j.otd)} · ${-days(today, j.otd)}d over` : `OTD ${dm(j.otd)} · in ${days(today, j.otd)}d`)
        : "no OTD set";
      x.fillStyle = j.otd && days(today, j.otd) < 0 ? C.red : C.sub;
      x.fillText(otd, PAD + 86, y + 44);
      x.fillStyle = C.faint; x.font = F(14);
      x.fillText(j.owner, PAD + 320, y + 44);
      // per cent, right-aligned
      x.font = F(20, "700");
      x.fillStyle = j.pct >= 100 ? C.green : j.pct >= 60 ? C.amber : C.red;
      const p = `${j.pct}%`;
      x.fillText(p, W - PAD - 16 - x.measureText(p).width, y + 24);
      if (j.lateDays > 0) {
        x.font = F(14, "700"); x.fillStyle = C.red;
        const l = `${j.lateDays}d late`;
        x.fillText(l, W - PAD - 16 - x.measureText(l).width, y + 44);
      }
      y += rowH;
    }
    y += 8;
  };

  block("Past due", past.length > 10 ? `showing 10 of ${past.length} · oldest first` : "oldest first",
    past.length ? C.red : C.green, past.slice(0, 10));
  for (const d of week) {
    if (!d.jobs.length) continue;
    block(`${d.label} · ${d.weekday}`, d.date === today ? "today" : "", C.navy, d.jobs);
  }

  x.fillStyle = C.faint; x.font = F(14);
  x.fillText(`Genie · as at ${dm(today)}-${d0(today).getFullYear()}`, PAD, H - 22);

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
