
import { esc } from "@/lib/fmt";/**
 * The review deck — eight 16:9 pages, rendered as HTML and printed by the
 * browser.
 *
 * This is the renderer only: it takes a finished `Deck` and returns a page.
 * Everything on it is a figure that was queried (see /api/deck), never typed,
 * so the deck cannot quietly drift from the boards it summarises.
 *
 * Why HTML and not a .pptx: a deck nobody can open to check is worse than one
 * that can be read back page by page. This renders in the browser, prints to
 * PDF from the same layout, and can be looked at before it is presented.
 */

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

export interface Money {
  sales: number;
  tp: number;
}
export interface MonthRow {
  k: string;
  n: number;
  v: number;
  t: number;
}
export interface FamRow {
  f: string;
  n: number;
  v: number;
  t: number;
}
export interface DeckJob {
  id: string;
  tag: string;
  kit: number;
  pct: number;
  tp: number;
  val?: number;
  tdd?: string | null;
  cust?: string | null;
  fam?: string | null;
  /** Days past the TDD as at the report date; 0 when it is not late yet. */
  delay?: number;
  tasks?: number;
  esc?: boolean;
}
export interface DeckTask {
  job: string;
  cat: string;
  who: string;
  due: string | null;
  esc: string | null;
  title: string;
  lvl?: string;
}

export interface Deck {
  /** dd-mm-yyyy, as the report is dated. */
  asOf: string;
  /** The same day written out for a human — "18 August 2026". */
  asOfLong: string;
  fy: string;
  day: number;
  total: number;
  left: number;
  target: Money;
  delivered: Money & { n: number };
  /** Delivered month by month since 1 April. */
  done: MonthRow[];
  book: Money & { n: number };
  anticipated: Money;
  paceBy: number;
  behind: number;
  pacePct: number;
  required: Money;
  /** The order book by delivery month. */
  months: MonthRow[];
  /** Product families, biggest throughput first, trimmed to what fits. */
  fams: FamRow[];
  famCount: number;
  famTop: number;
  famRest: { n: number; t: number };
  ready: { n: number; tp: number; jobs: DeckJob[] };
  stuck: { n: number; tp: number; jobs: DeckJob[] };
  readyTasks: DeckTask[];
  escJobs: number;
  escTasks: number;
  escLevels: Record<string, number>;
  escTop: DeckTask[];
  escQuotes: { id: string; tp: number; text: string }[];
  /**
   * THE YEAR IN ONE PICTURE, month by month (Dr Raghu, 28 Sep 2026: "show a
   * graph of month wise jobs, value, throughput as a bar graph").
   *
   * Delivered and still-on-the-board are kept APART inside each month rather
   * than added into one bar. A month that is half gone out and half promised
   * is not the same month as one that has already shipped the lot, and a
   * single bar would say it was.
   */
  year: { k: string; done: MonthRow; book: MonthRow }[];
  /** Every customer with something still on the board, most jobs first. */
  byCustomer: { cust: string; n: number; tp: number; jobs: DeckJob[] }[];
  /** Every escalated task, kept in its level. L3 is Management. */
  escByLevel: { lvl: string; tasks: DeckTask[] }[];
  /** One product family, looked at on its own. */
  focus: Focus;
}

export interface Focus {
  /** What the page is about — "Hi Lifts". */
  name: string;
  n: number;
  sales: number;
  tp: number;
  jobs: DeckJob[];
  /** Customers, biggest first. */
  custs: { c: string; n: number; tp: number }[];
  /** The order book for this family, by delivery month. */
  months: MonthRow[];
  /** Delivered this financial year. */
  done: { n: number; sales: number; tp: number };
  escJobs: number;
  /** Jobs whose value has not been entered — never counted as zero. */
  novalue: string[];
  kitted: number;
  built: number;
  tasks: DeckTask[];
}

// ---------------------------------------------------------------------------
// Ink
// ---------------------------------------------------------------------------

const P = {
  ink: "#16232F", slate: "#22303C", sub: "#5A6672", mute: "#8A94A0", faint: "#B8B5AC",
  line: "#E2E0DA", panel: "#F4F2EC", accent: "#E8600A", navy: "#1B3A5C",
  green: "#0D7A3F", amber: "#D97706", red: "#B3261E", gold: "#F5B32B",
};

const cr = (v: number) => "₹" + Number(v).toFixed(2) + " Cr";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON = (k: string) => {
  const [y, m] = k.split("-");
  return MONTHS[+m - 1] + " " + y.slice(2);
};
/** "November" — spelled out, for a sentence rather than an axis. */
const MONTH_FULL = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const MONF = (k: string) => MONTH_FULL[+k.split("-")[1] - 1] || "";

const dd = (s: string | null | undefined) => (s ? s.slice(8) + "-" + s.slice(5, 7) : "—");
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** "the 3 jobs" / "the job" — a count that reads as English. */
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// Charts, drawn as inline SVG so they print as vector rather than as pixels
// ---------------------------------------------------------------------------

/** Grouped bars: sales and throughput, month by month. */
function bars(rows: MonthRow[], max: number): string {
  const W = 760, H = 430, L = 44, R = 14, T = 26, B = 46;
  const bw = (W - L - R) / rows.length;
  const y = (v: number) => H - B - ((H - T - B) * v) / max;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">
    ${[0, .25, .5, .75, 1].map((f) => `<line x1="${L}" y1="${y(max * f)}" x2="${W - R}" y2="${y(max * f)}" stroke="${P.line}"/>
      <text x="${L - 6}" y="${y(max * f) + 3}" text-anchor="end" font-size="9" fill="${P.faint}">${(max * f).toFixed(0)}</text>`).join("")}
    ${rows.map((r, i) => {
      const x = L + i * bw, w = bw * 0.30;
      return `<rect x="${x + bw * 0.14}" y="${y(r.v)}" width="${w}" height="${H - B - y(r.v)}" fill="${P.accent}" rx="2"/>
        <rect x="${x + bw * 0.50}" y="${y(r.t)}" width="${w}" height="${H - B - y(r.t)}" fill="${P.green}" rx="2"/>
        <text x="${x + bw * 0.29}" y="${y(r.v) - 5}" text-anchor="middle" font-size="11" font-weight="700" fill="${P.accent}">${r.v.toFixed(2)}</text>
        <text x="${x + bw * 0.65}" y="${y(r.t) - 5}" text-anchor="middle" font-size="11" font-weight="700" fill="${P.green}">${r.t.toFixed(2)}</text>
        <text x="${x + bw / 2}" y="${H - B + 16}" text-anchor="middle" font-size="12" fill="${P.sub}">${MON(r.k)}</text>
        <text x="${x + bw / 2}" y="${H - B + 31}" text-anchor="middle" font-size="11" fill="${P.faint}">${plural(r.n, "job")}</text>`;
    }).join("")}
    <text x="${L}" y="14" font-size="10" fill="${P.accent}" font-weight="700">&#9632; Sales &#8377; Cr</text>
    <text x="${L + 95}" y="14" font-size="10" fill="${P.green}" font-weight="700">&#9632; Throughput &#8377; Cr</text>
  </svg>`;
}

/**
 * THE YEAR IN THREE ROWS — jobs, value, throughput, month by month.
 *
 * Dr Raghu, 28 Sep 2026: "show a graph of month wise jobs, value,
 * throughput as a bar graph. This should be page 1."
 *
 * THREE ROWS AND NOT ONE CHART, because a count of jobs and a figure in
 * crores cannot share an axis: nine jobs and nine crore are the same height
 * only by accident, and one of the two bars is always invisible. Each row
 * keeps its own scale and they share the months underneath, so the shapes
 * can be compared without the numbers being pretended equal.
 *
 * DELIVERED IS SOLID, THE BOARD IS OUTLINED. What has gone out is earned;
 * what is on the board is a promise, and a report that adds them into one
 * bar has told its most important lie in its first picture.
 */
function yearChart(rows: { k: string; done: MonthRow; book: MonthRow }[]): string {
  if (!rows.length) return "";
  const W = 1160, L = 46, R = 12, GAP = 16;
  const ROW = 150, LBL = 34;
  const bw = (W - L - R) / rows.length;
  const metrics: { key: "n" | "v" | "t"; label: string; colour: string; fmt: (v: number) => string }[] = [
    { key: "n", label: "JOBS", colour: P.navy, fmt: (v) => String(Math.round(v)) },
    { key: "v", label: "VALUE \u20b9 Cr", colour: P.accent, fmt: (v) => v.toFixed(2) },
    { key: "t", label: "THROUGHPUT \u20b9 Cr", colour: P.green, fmt: (v) => v.toFixed(2) },
  ];
  const H = metrics.length * (ROW + GAP) + LBL;
  let out = "";
  metrics.forEach((m, mi) => {
    const top = mi * (ROW + GAP);
    const base = top + ROW - 22;
    const max = Math.max(0.01, ...rows.map((r) => r.done[m.key] + r.book[m.key])) * 1.2;
    const h = (v: number) => ((ROW - 40) * v) / max;
    out += `<text x="0" y="${top + 11}" font-size="10" font-weight="700" fill="${m.colour}">${m.label}</text>
      <line x1="${L}" y1="${base}" x2="${W - R}" y2="${base}" stroke="${P.line}"/>`;
    rows.forEach((r, i) => {
      const x = L + i * bw + bw * 0.22, w = bw * 0.56;
      const hd = h(r.done[m.key]), hb = h(r.book[m.key]);
      const total = r.done[m.key] + r.book[m.key];
      /* Delivered sits on the floor; the board is stacked on top of it,
         outlined, so the eye reads earned-then-promised in that order. */
      out += hd > 0 ? `<rect x="${x}" y="${base - hd}" width="${w}" height="${hd}" fill="${m.colour}" rx="2"/>` : "";
      out += hb > 0 ? `<rect x="${x}" y="${base - hd - hb}" width="${w}" height="${hb}" fill="${m.colour}" fill-opacity="0.18" stroke="${m.colour}" stroke-dasharray="3 2" rx="2"/>` : "";
      out += total > 0 ? `<text x="${x + w / 2}" y="${base - hd - hb - 5}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${m.colour}">${m.fmt(total)}</text>` : "";
    });
  });
  out += rows.map((r, i) => `<text x="${L + i * bw + bw / 2}" y="${H - 12}" text-anchor="middle" font-size="11.5" fill="${P.sub}">${MON(r.k)}</text>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${out}
    <text x="${W - R - 232}" y="12" font-size="10" fill="${P.sub}">&#9632; delivered</text>
    <text x="${W - R - 160}" y="12" font-size="10" fill="${P.sub}">&#9633; still on the board</text>
  </svg>`;
}

/**
 * What went out each month, against what has to go out from here.
 *
 * The dashed line is the required rate, not a target line drawn for effect:
 * every bar sitting under it is the gap, month by month. The current month is
 * drawn faded and marked — a month that is eighteen days old must never read
 * as a bad month.
 */
function doneChart(rows: MonthRow[], req: number, partialK: string): string {
  const W = 1160, H = 206, L = 40, R = 150, T = 16, B = 38;
  const max = Math.max(req, ...rows.map((r) => r.v)) * 1.16;
  const bw = (W - L - R) / rows.length;
  const y = (v: number) => H - B - ((H - T - B) * v) / max;
  const ry = y(req);
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">
    ${rows.map((r, i) => {
      const x = L + i * bw, w = bw * 0.26, part = r.k === partialK;
      const fade = part ? ' opacity="0.55"' : "";
      return `<rect x="${x + bw * 0.16}" y="${y(r.v)}" width="${w}" height="${H - B - y(r.v)}" fill="${P.accent}" rx="2"${fade}/>
        <rect x="${x + bw * 0.48}" y="${y(r.t)}" width="${w}" height="${H - B - y(r.t)}" fill="${P.green}" rx="2"${fade}/>
        <text x="${x + bw * 0.29}" y="${y(r.v) - 5}" text-anchor="middle" font-size="11" font-weight="700" fill="${P.accent}">${r.v.toFixed(2)}</text>
        <text x="${x + bw * 0.61}" y="${y(r.t) - 5}" text-anchor="middle" font-size="11" font-weight="700" fill="${P.green}">${r.t.toFixed(2)}</text>
        <text x="${x + bw / 2}" y="${H - B + 16}" text-anchor="middle" font-size="11.5" fill="${P.sub}">${MON(r.k)}${part ? " *" : ""}</text>
        <text x="${x + bw / 2}" y="${H - B + 30}" text-anchor="middle" font-size="10" fill="${P.faint}">${plural(r.n, "job")}</text>`;
    }).join("")}
    <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="${P.line}"/>
    <line x1="${L}" y1="${ry}" x2="${W - R + 8}" y2="${ry}" stroke="${P.red}" stroke-width="1.6" stroke-dasharray="7 5"/>
    <text x="${W - R + 14}" y="${ry - 4}" font-size="11" font-weight="700" fill="${P.red}">Required from here</text>
    <text x="${W - R + 14}" y="${ry + 12}" font-size="11" fill="${P.red}">&#8377;${req.toFixed(2)} Cr every month</text>
    <text x="${L}" y="12" font-size="10" fill="${P.accent}" font-weight="700">&#9632; Sales &#8377; Cr</text>
    <text x="${L + 95}" y="12" font-size="10" fill="${P.green}" font-weight="700">&#9632; Throughput &#8377; Cr</text>
  </svg>`;
}

/** Horizontal bars for the family split. */
function hbars(fams: FamRow[]): string {
  const max = Math.max(...fams.map((f) => f.t), 0.01);
  return fams.map((f) => `<div class="hb">
      <span class="hbn">${esc(f.f)}</span>
      <span class="hbt"><span style="width:${((f.t / max) * 100).toFixed(1)}%"></span></span>
      <span class="hbj">${f.n}</span><span class="hbv">${f.t.toFixed(2)}</span>
    </div>`).join("");
}

/**
 * Kitting against production, one dot per job.
 *
 * The diagonal is where kitting and production agree. Everything far below it
 * is material bought and not yet turned into anything — which is the whole
 * argument of the focus page, made in one picture.
 */
function scatter(jobs: DeckJob[]): string {
  const W = 470, H = 300, L = 40, R = 16, T = 10, B = 40;
  const x = (v: number) => L + ((W - L - R) * v) / 100;
  const y = (v: number) => H - B - ((H - T - B) * v) / 100;
  const maxTp = Math.max(...jobs.map((j) => j.tp), 0.01);
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">
    ${[0, 25, 50, 75, 100].map((v) => `<line x1="${x(v)}" y1="${T}" x2="${x(v)}" y2="${H - B}" stroke="${P.line}"/>
      <line x1="${L}" y1="${y(v)}" x2="${W - R}" y2="${y(v)}" stroke="${P.line}"/>
      <text x="${x(v)}" y="${H - B + 14}" text-anchor="middle" font-size="9" fill="${P.faint}">${v}</text>
      <text x="${L - 5}" y="${y(v) + 3}" text-anchor="end" font-size="9" fill="${P.faint}">${v}</text>`).join("")}
    <line x1="${x(0)}" y1="${y(0)}" x2="${x(100)}" y2="${y(100)}" stroke="${P.mute}" stroke-dasharray="4 4"/>
    ${jobs.map((j) => {
      const r = 4 + 7 * Math.sqrt(Math.max(j.tp, 0) / maxTp);
      return `<circle cx="${x(j.kit)}" cy="${y(j.pct)}" r="${r.toFixed(1)}" fill="${j.esc ? P.red : P.navy}" fill-opacity="0.55" stroke="${j.esc ? P.red : P.navy}"/>`;
    }).join("")}
    <text x="${L}" y="${H - 3}" font-size="9.5" fill="${P.sub}">Kitted %  &#8594;</text>
    <text x="11" y="${(T + H - B) / 2}" font-size="9.5" fill="${P.sub}" text-anchor="middle" transform="rotate(-90 11 ${(T + H - B) / 2})">Built %  &#8594;</text>
    <text x="${W - R}" y="${H - 3}" text-anchor="end" font-size="9" fill="${P.mute}">dot size = throughput &#183; red = escalated</text>
  </svg>`;
}

// ---------------------------------------------------------------------------
// The pages
// ---------------------------------------------------------------------------

function hd(D: Deck, kick: string, title: string, colour: string): string {
  return `<div class="kick" style="color:${colour}">${esc(kick.toUpperCase())}</div>
    <h2>${esc(title)}</h2><div class="asof">Genie · as at ${esc(D.asOf)}</div>`;
}
function st(label: string, value: string, note: string, colour: string): string {
  return `<div class="stat"><div class="sl">${esc(label.toUpperCase())}</div>
    <div class="sv" style="color:${colour}">${value}</div><div class="sn">${note}</div></div>`;
}

export function deckHtml(D: Deck): string {
  const s: string[] = [];
  const nJobs = D.book.n;

  /**
   * 1 — THE YEAR IN ONE PICTURE (Dr Raghu, 28 Sep 2026: "This page 1 should
   * show a graph of month wise jobs, value, throughput as a bar graph. This
   * should be page 1... Put the projections on page 2").
   *
   * The projections were opening the report, and a projection is an argument
   * — it asks to be believed before anything has been shown. The months are
   * the evidence, so they go first and the argument follows them.
   */
  s.push(`<section>
  ${hd(D, `Nandan GSE · ${esc(D.fy)}`, "The year, month by month", P.navy)}
  <div class="repdate" style="color:${P.sub}">Date of Report &nbsp;<b>${esc(D.asOfLong)}</b> &nbsp;·&nbsp; day ${D.day} of ${D.total}</div>
  ${D.year.length
    ? `<div class="donewrap">${yearChart(D.year)}</div>
       <p class="close">Solid is what has gone out of the door and is earned. Outlined is what is still on the board — dated, not delivered. ${plural(D.delivered.n, "job")} delivered so far; ${plural(D.book.n, "job")} still to build.</p>`
    : `<p class="close">Nothing is dated this financial year.</p>`}
</section>`);

  /* 2 — the year, and the date this report was run */
  s.push(`<section class="dark">
  <div class="kick gold">NANDAN GSE · ${esc(D.fy)}</div>
  <h1>The year, as the book stands today</h1>
  <div class="repdate">Date of Report &nbsp;<b>${esc(D.asOfLong)}</b></div>
  <p class="lede">Day ${D.day} of ${D.total}. Everything delivered so far, plus every job on the board, comes to just over half the year's target.</p>
  <div class="cards">
    ${([["Sales — anticipated", D.anticipated.sales, D.target.sales, P.gold],
        ["Throughput — anticipated", D.anticipated.tp, D.target.tp, "#7BC67E"]] as [string, number, number, string][])
      .map(([l, v, t, c]) => {
        // A target of nothing is not a 0% year, it is an unset target.
        const p = t > 0 ? Math.round((v / t) * 100) : null;
        return `<div class="card" style="border-color:${c}">
        <div class="cl">${esc(l.toUpperCase())}</div>
        <div class="cv" style="color:${c}">${cr(v)}</div>
        <div class="cs">${t > 0 ? `of ${cr(t)} target` : "no target set for this year"}</div>
        <div class="bar"><span style="width:${Math.min(p ?? 0, 100)}%;background:${c}"></span></div>
        <div class="cp" style="color:${c}">${p === null ? "—" : p + "% of target"}</div></div>`;
      }).join("")}
  </div>
  <div class="agenda">
    <div class="ag"><b>The book runs out in ${esc(MONF(D.months[D.months.length - 1]?.k || ""))}.</b> ${plural(nJobs, "job")} on the board, none of them dated after it.</div>
    <div class="ag"><b>${cr(D.stuck.tp)} is kitted and not moving.</b> Material bought, sitting on the floor, nothing earned against it.</div>
    <div class="ag"><b>${D.escJobs} of ${nJobs} jobs are escalated</b> — and it is the same cause on job after job.</div>
  </div>
  <div class="foot">delivered since 1 April&nbsp; +&nbsp; every job still on the board</div>
</section>`);

  /* 3 — what has actually been billed */
  const last = D.done[D.done.length - 1];
  const best = [...D.done].sort((a, b) => b.v - a.v)[0];
  s.push(`<section>
  ${hd(D, "Since 1 April", "What has actually gone out of the door", P.accent)}
  <div class="stats">
    ${st("Delivered", cr(D.delivered.sales), `${plural(D.delivered.n, "job")} · ${cr(D.delivered.tp)} throughput`, P.accent)}
    ${st("Pace says by today", cr(D.paceBy), `${D.day} of ${D.total} days elapsed`, P.sub)}
    ${st("Behind by", cr(D.behind), `running at ${D.pacePct}% of the pace needed`, P.red)}
  </div>
  <div class="band">
    <div class="bl">REQUIRED RUN RATE FOR THE REST OF THE YEAR</div>
    <div class="bt"><b style="color:${P.gold}">${cr(D.required.sales)}</b> per month in sales, with a throughput of <b style="color:#7BC67E">${cr(D.required.tp)}</b> per month</div>
    <div class="bn">across the ${D.left} days that remain</div>
  </div>
  ${D.done.length ? `<div class="donewrap">${doneChart(D.done, D.required.sales, last.k)}</div>
  <p class="close">No month this year has reached the rate now required; the best of them, ${esc(MONF(best.k))}, came to ${cr(best.v)}. <span class="fn">* ${esc(MON(last.k))} is ${+D.asOf.slice(0, 2)} days old, not a full month.</span></p>`
    : `<p class="close">Nothing has been delivered against a date this financial year.</p>`}
</section>`);

  /* 4 — the order book, and where it stops */
  const lastMon = D.months[D.months.length - 1];
  const span = D.months.length ? `${MONF(D.months[0].k)}–${MONF(lastMon.k)}` : "—";
  s.push(`<section>
  ${hd(D, "The order book", `Everything on the board runs out in ${MONF(lastMon?.k || "")}`, P.red)}
  <div class="split">
    <div class="chart">${bars(D.months, Math.max(14, ...D.months.map((m) => m.v)))}</div>
    <div class="side">
      <div class="box"><div class="bxl">ON THE BOARD</div>
        <div class="bxv" style="color:${P.navy}">${plural(D.book.n, "job")}</div>
        <div class="bxs">${cr(D.book.sales)} · ${cr(D.book.tp)} throughput</div>
        <div class="bxi">all of it dated ${esc(span)}</div></div>
      <div class="box red"><div class="bxl" style="color:${P.red}">AFTER THAT</div>
        <div class="bxv" style="color:${P.red}">Nothing</div>
        <div class="bxs" style="color:#8A3D2E">Not one job on the book carries a delivery date beyond ${esc(MONF(lastMon?.k || ""))}.</div></div>
    </div>
  </div>
  <p class="close b">This is not a delivery problem. Even built perfectly and on time, the current book cannot reach the target — the shortfall is orders, not output.</p>
</section>`);

  /* 5 — what the book is made of */
  s.push(`<section>
  ${hd(D, "The book by product", `What the ${nJobs} jobs actually are`, P.navy)}
  <div class="hbwrap"><div class="hb hbhead"><span class="hbn"></span><span class="hbt bare"></span><span class="hbj">Jobs</span><span class="hbv">&#8377; Cr TP</span></div>${hbars(D.fams)}</div>
  <p class="close">Ordered by throughput — what the company actually earns on a job, rather than what it invoices. The top ${D.famTop} of ${D.famCount} families carry four-fifths of it.${D.famCount > D.fams.length ? ` ${D.fams.length} are shown; the ${D.famCount - D.fams.length} left off come to ${plural(D.famRest.n, "job")} and ${cr(D.famRest.t)} between them.` : ""}</p>
</section>`);

  /* 6 — kitting against production */
  s.push(`<section>
  ${hd(D, "Kitting against production", "Where the money is sitting on the floor", P.amber)}
  <div class="two">
    <div class="half" style="background:#E6F4EA;border-color:${P.green}">
      <div class="hl" style="color:${P.green}">READY TO FINISH — ${plural(D.ready.n, "JOB")}</div>
      <div class="hv" style="color:${P.green}">${cr(D.ready.tp)}</div>
      <div class="hs">60%+ kitted and 60%+ built</div>
      <p>Bought, made, nearly out. This is the throughput closest to being earned — and the smaller of the two piles.</p></div>
    <div class="half" style="background:#FFF7E6;border-color:${P.amber}">
      <div class="hl" style="color:${P.amber}">KITTED, NOT MOVING — ${plural(D.stuck.n, "JOB")}</div>
      <div class="hv" style="color:${P.amber}">${cr(D.stuck.tp)}</div>
      <div class="hs">60%+ kitted, under 40% built</div>
      <p>The material is bought and sitting on the floor. Nothing is being earned against it, and it is worth ${(D.stuck.tp / (D.ready.tp || 1)).toFixed(1)} times the ready pile.</p></div>
  </div>
  <div class="panel"><div class="pl">THE BIGGEST STALLED JOBS</div>
    ${D.stuck.jobs.slice(0, 10).map((j) => `<div class="pr"><b>${esc(j.id)}</b> ${esc(j.tag)} <span class="dim">· kit ${j.kit}% / built ${j.pct}% ·</span> <b style="color:${P.amber}">${j.tp.toFixed(2)} Cr</b></div>`).join("")}
    ${(() => {
      const rest = D.stuck.jobs.slice(10);
      if (!rest.length) return "";
      const t = rest.reduce((a, j) => a + j.tp, 0);
      return `<div class="pr dim" style="margin-top:5px">and ${rest.length} more, ${t.toFixed(2)} Cr between them</div>`;
    })()}
  </div>
</section>`);

  /* 7 — the jobs closest to going out */
  s.push(`<section>
  ${hd(D, "The near side of the line", `The ${plural(D.ready.n, "job")} closest to going out`, P.green)}
  <table class="t"><thead><tr><th>Job</th><th>What it is</th><th class="c">Kit</th><th class="c">Built</th><th class="c">₹ Cr</th><th class="c">Due</th><th class="c">Open tasks</th></tr></thead><tbody>
  ${D.ready.jobs.map((j) => `<tr><td class="jn">${esc(j.id)}</td><td>${esc(j.tag)}</td><td class="c">${j.kit}%</td><td class="c">${j.pct}%</td>
    <td class="c" style="color:${P.green};font-weight:700">${j.tp.toFixed(2)}</td><td class="c">${dd(j.tdd)}</td>
    <td class="c" style="${j.tasks ? `color:${P.red};font-weight:700` : `color:${P.faint}`}">${j.tasks || "—"}</td></tr>`).join("")}
  </tbody></table>
  ${D.readyTasks.length ? `<div class="pl" style="margin-top:10px">WHAT IS STILL OPEN ON THEM</div>
  ${D.readyTasks.slice(0, 8).map((t) => `<div class="pr tight"><b>${esc(t.job)}</b> · ${esc(t.cat)} · ${esc(t.who)} · due ${dd(t.due)}${t.esc ? ` · <b style="color:${P.red}">ESCALATED ${esc(t.esc)}</b>` : ""} — ${esc(t.title)}</div>`).join("")}
  <p class="close b tightc">${plural(D.readyTasks.length, "open task")} stand between these ${plural(D.ready.n, "job")} and the door${(() => {
    const c: Record<string, number> = {};
    for (const t of D.readyTasks) c[t.job] = (c[t.job] || 0) + 1;
    const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    return top && top[1] > 1 ? ` — ${top[1]} of them on job ${top[0]} alone` : "";
  })()}.</p>` : `<p class="close b">Nothing is open on any of them.</p>`}
</section>`);

  /* 8 — the focus family, looked at on its own */
  s.push(focusSlide(D));

  /* 9 — what is being escalated */
  s.push(`<section class="dark">
  <div class="kick gold">WHAT IS BEING ESCALATED</div>
  <h1 class="sm">The same problem, on job after job</h1>
  <div class="kpis">
    ${([[D.escJobs, `of ${nJobs} jobs carry a project escalation`, P.gold],
        [D.escTasks, "open tasks are escalated", "#FF8A80"],
        [D.escLevels.L3 || 0, "of those sit at L3 — Management", "#FF8A80"]] as [number, string, string][])
      .map(([n, l, c]) => `<div class="kpi"><div class="kn" style="color:${c}">${n}</div><div class="kl">${esc(l)}</div></div>`).join("")}
  </div>
  <div class="pl light">THE OLDEST ESCALATED TASKS</div>
  ${D.escTop.slice(0, 6).map((t) => `<div class="pr light tight"><b>${esc(t.job)}</b> · ${esc(t.lvl)} · ${esc(t.who)} · due ${dd(t.due)} — ${esc(t.title)}</div>`).join("")}
  <div class="pl light">AND WHAT THE JOBS THEMSELVES SAY</div>
  ${D.escQuotes.slice(0, 3).map((q) => `<div class="quote"><b>${esc(q.id)}</b> <span class="qv">${q.tp.toFixed(2)} Cr</span> — &ldquo;${esc(q.text)}&rdquo;</div>`).join("")}
  <div class="callout">Read the escalation text and it is the same theme on job after job: drawings not signed off, design not released, components not frozen. The constraint is upstream of the shop floor.</div>
</section>`);

  /**
   * 10 ONWARDS — DELIVERY BY CLIENT, two to a page.
   *
   * Dr Raghu, 28 Sep 2026: "Page no 9 onwards have a graph of Delivery by
   * client. Divide the page into two first. Customer: <name> {pending jobs}.
   * Make table below: Job No - TDD - Product Family - Customer Tag - Delay
   * days. Show for all clients from highest to lowest by nos."
   *
   * ORDERED BY NUMBER OF JOBS, not by value. A customer with nine machines
   * outstanding is nine dates and nine conversations whatever they are
   * worth, and this is the page somebody reads before picking up the phone.
   *
   * EVERY CUSTOMER, not a top ten. The long tail is where a forgotten single
   * job sits, and a report that stops at ten is the reason it stays
   * forgotten.
   */
  for (let i = 0; i < D.byCustomer.length; i += 2) {
    const pair = D.byCustomer.slice(i, i + 2);
    s.push(`<section>
  ${hd(D, "Delivery by client", i === 0 ? "Who is waiting, and for how many" : "Who is waiting, continued", P.navy)}
  <div class="custpair">
    ${pair.map((c) => `<div class="custcol">
      <div class="custhd">
        <div class="custname">${esc(cut(c.cust, 44))}</div>
        <div class="custn">${plural(c.n, "job")} pending${c.tp ? ` · ${cr(c.tp)} throughput` : ""}</div>
      </div>
      <table class="t small"><thead><tr><th>Job</th><th class="c">TDD</th><th>Family</th><th>Customer tag</th><th class="c">Delay</th></tr></thead><tbody>
      ${c.jobs.map((j) => `<tr>
        <td class="jn">${esc(j.id)}</td>
        <td class="c">${dd(j.tdd)}</td>
        <td>${esc(cut(j.fam || "—", 22))}</td>
        <td>${esc(cut(j.tag, 30))}</td>
        <td class="c" style="${j.delay ? `color:${P.red};font-weight:700` : `color:${P.faint}`}">${j.delay ? `${j.delay}d` : "—"}</td>
      </tr>`).join("")}
      </tbody></table>
    </div>`).join("")}
    ${pair.length === 1 ? `<div class="custcol"></div>` : ""}
  </div>
</section>`);
  }

  /**
   * THEN ONE PAGE PER ESCALATION LEVEL, WORST FIRST.
   *
   * Dr Raghu, 28 Sep 2026: "then show Escalations L3, Next Page Escalations
   * L2, Next Escalations L1."
   *
   * A page each because the levels are different audiences: L3 is
   * Management's to answer and L1 is not. Put on one page, somebody has to
   * sort them by eye every time they read it — and that sorting is the whole
   * decision the page exists to make.
   */
  const LEVEL_TONE: Record<string, string> = { L3: P.red, L2: P.amber, L1: P.navy };
  const LEVEL_WHOSE: Record<string, string> = {
    L3: "Management — these are the ones that have run out of other people to escalate to.",
    L2: "Head of department.",
    L1: "The first raise — still inside the team that owns the work.",
  };
  for (const g of D.escByLevel) {
    const tone = LEVEL_TONE[g.lvl] || P.navy;
    s.push(`<section>
  ${hd(D, `Escalations · ${esc(g.lvl)}`, `${plural(g.tasks.length, "task")} sitting at ${esc(g.lvl)}`, tone)}
  <p class="close" style="margin-top:0">${esc(LEVEL_WHOSE[g.lvl] || "")}</p>
  <table class="t"><thead><tr><th>Job</th><th>What is open</th><th>Category</th><th>Who</th><th class="c">Due</th><th class="c">Late by</th></tr></thead><tbody>
  ${g.tasks.map((t) => {
    const late = t.due && t.due < D.asOf
      ? Math.round((Date.parse(`${D.asOf}T00:00:00Z`) - Date.parse(`${t.due}T00:00:00Z`)) / 86400000) : 0;
    return `<tr>
      <td class="jn">${esc(t.job)}</td>
      <td>${esc(cut(t.title, 64))}</td>
      <td>${esc(cut(t.cat, 22))}</td>
      <td>${esc(cut(t.who, 20))}</td>
      <td class="c">${dd(t.due)}</td>
      <td class="c" style="${late ? `color:${P.red};font-weight:700` : `color:${P.faint}`}">${late ? `${late}d` : "—"}</td>
    </tr>`;
  }).join("")}
  </tbody></table>
</section>`);
  }

  return page(D, s.join(""));
}

/**
 * One family, looked at properly.
 *
 * Half the page is the job list, because at this level the argument is made by
 * naming jobs rather than summarising them; the other half is the kitting
 * scatter, which shows in one glance that almost none of them are being built.
 */
function focusSlide(D: Deck): string {
  const F = D.focus;
  const shown = F.jobs.slice(0, 14);
  const rest = F.jobs.slice(14);
  return `<section>
  ${hd(D, `A closer look · ${F.name}`, `${plural(F.n, "job")}, ${cr(F.tp)} of throughput, and almost none of it built`, P.navy)}
  <div class="fx">
    <div class="fxl">
      <table class="t"><thead><tr><th>Job</th><th>Customer</th><th class="c">Kit</th><th class="c">Built</th><th class="c">₹ Cr</th><th class="c">Due</th><th class="c">Esc</th></tr></thead><tbody>
      ${shown.map((j) => `<tr><td class="jn">${esc(j.id)}</td><td>${esc(cut(String(j.cust || "—"), 26))}</td>
        <td class="c">${j.kit}%</td><td class="c" style="${j.pct === 0 ? `color:${P.red};font-weight:700` : ""}">${j.pct}%</td>
        <td class="c" style="font-weight:700;color:${P.navy}">${j.tp > 0 ? j.tp.toFixed(2) : "<span style=\"color:" + P.faint + ';font-weight:400">not set</span>'}</td>
        <td class="c">${dd(j.tdd)}</td>
        <td class="c" style="color:${P.red};font-weight:700">${j.esc ? "•" : ""}</td></tr>`).join("")}
      </tbody></table>
      ${rest.length ? `<div class="pr dim" style="margin-top:4px">and ${plural(rest.length, "more job")}, ${rest.reduce((a, j) => a + j.tp, 0).toFixed(2)} Cr between them</div>` : ""}
    </div>
    <div class="fxr">
      <div class="fxstats">
        ${[[plural(F.kitted, "job"), "at 50%+ kitted", P.navy],
           [plural(F.built, "job"), "at 50%+ built", F.built === 0 ? P.red : P.green],
           [`${F.escJobs} of ${F.n}`, "escalated", P.red]]
          .map(([v, l, c]) => `<div class="fxs"><div class="fxv" style="color:${c}">${esc(v)}</div><div class="fxl2">${esc(l)}</div></div>`).join("")}
      </div>
      ${scatter(F.jobs)}
      <div class="fxcust"><span class="pl">WHO IS WAITING</span>
        ${F.custs.slice(0, 5).map((c) => `<div class="pr tight"><b>${esc(cut(c.c, 30))}</b> <span class="dim">· ${plural(c.n, "job")} ·</span> ${c.tp.toFixed(2)} Cr</div>`).join("")}
      </div>
    </div>
  </div>
  <p class="close b tightc">${F.done.n > 0 ? `${F.done.n} ${esc(F.name)} went out this year, worth ${cr(F.done.sales)}. ` : ""}The ${F.n} still on the board are ${cr(F.tp)} of throughput sitting almost entirely un-built${F.novalue.length ? `, and ${plural(F.novalue.length, "job")} (${F.novalue.join(", ")}) carry no order value yet — they are counted as jobs here but not as money` : ""}.</p>
</section>`;
}

// ---------------------------------------------------------------------------
// The page itself
// ---------------------------------------------------------------------------

/**
 * The wrapper: the print rules, and a toolbar that is not printed.
 *
 * `@page` at 13.333in x 7.5in gives a true 16:9 page, so what is on screen is
 * what comes out of Save as PDF — no scaling, no letterbox.
 */
function page(D: Deck, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Nandan GSE · ${esc(D.fy)} · ${esc(D.asOf)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@page { size: 13.333in 7.5in; margin: 0; }
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:Calibri,"Helvetica Neue",Arial,sans-serif;color:${P.ink};background:#6B7280}
section{width:13.333in;height:7.5in;padding:.52in .6in;page-break-after:always;position:relative;overflow:hidden;background:#fff;margin:0 auto}
section:last-child{page-break-after:auto}
section.dark{background:${P.ink};color:#fff}
.kick{font-size:12pt;font-weight:700;letter-spacing:2.2px;margin-bottom:6px}
.gold{color:${P.gold}}
h1{font-family:Cambria,Georgia,serif;font-size:38pt;margin:0 0 8px;line-height:1.1}
h1.sm{font-size:31pt}
h2{font-family:Cambria,Georgia,serif;font-size:27pt;margin:0 0 16px;line-height:1.15}
.repdate{font-size:11.5pt;letter-spacing:1.1px;color:#8FA1B3;margin:0 0 14px}
.repdate b{color:#fff;letter-spacing:0;font-size:13pt}
.asof{position:absolute;top:.55in;right:.6in;font-size:9.5pt;color:${P.faint}}
.lede{font-size:14pt;color:#9FB0C0;margin:0 0 22px;max-width:9.6in;line-height:1.45}
.cards{display:flex;gap:.42in}.card{flex:1;background:#22303C;border:1.5px solid;border-radius:8px;padding:18px 22px}
.cl{font-size:10.5pt;font-weight:700;letter-spacing:1.4px;color:#8FA1B3}
.cv{font-family:Cambria,Georgia,serif;font-size:44pt;font-weight:700;line-height:1.15;margin:2px 0}
.cs{font-size:12pt;color:#8FA1B3;margin-bottom:12px}
.bar{height:11px;background:#33414F;border-radius:3px;overflow:hidden}.bar span{display:block;height:11px}
.cp{font-size:11.5pt;font-weight:700;margin-top:6px}
.agenda{margin-top:.30in;display:flex;flex-direction:column;gap:11px;max-width:11.6in}
.ag{font-size:13pt;color:#9FB0C0;line-height:1.4;padding-left:16px;border-left:2px solid #33414F}
.ag b{color:#fff}
.foot{position:absolute;bottom:.5in;left:.6in;font-size:10.5pt;font-style:italic;color:#6B7C8C}
.stats{display:flex;gap:.3in;margin-bottom:.26in}
.stat{flex:1;background:${P.panel};border:1px solid ${P.line};border-radius:8px;padding:14px 18px}
.sl{font-size:9.5pt;font-weight:700;letter-spacing:1.1px;color:${P.mute}}
.sv{font-family:Cambria,Georgia,serif;font-size:31pt;font-weight:700;line-height:1.2}
.sn{font-size:10pt;color:${P.sub}}
.band{background:${P.ink};border-radius:8px;padding:16px 22px;color:#fff}
.bl{font-size:10pt;font-weight:700;letter-spacing:1.4px;color:#8FA1B3}
.bt{font-size:14pt;color:#9FB0C0;margin:6px 0 2px;line-height:1.45}
.bt b{font-family:Cambria,Georgia,serif;font-size:25pt}
.bn{font-size:10pt;font-style:italic;color:#6B7C8C}
.close{font-size:13.5pt;color:${P.sub};line-height:1.5;margin:.24in 0 0;max-width:12.1in}
.close.b{color:${P.ink};font-weight:700}
.close.tightc{margin-top:.12in;font-size:12.5pt}
.close .fn{color:${P.faint};font-style:italic;font-size:.86em}
.split{display:flex;gap:.34in;align-items:flex-start}.chart{flex:1.9}.side{flex:1;display:flex;flex-direction:column;gap:.2in}
.box{background:${P.panel};border:1px solid ${P.line};border-radius:8px;padding:14px 18px}
.box.red{background:#FBEDEA;border-color:${P.red}}
.bxl{font-size:9.5pt;font-weight:700;letter-spacing:1.1px;color:${P.mute}}
.bxv{font-family:Cambria,Georgia,serif;font-size:26pt;font-weight:700;line-height:1.2}
.bxs{font-size:11.5pt;color:${P.sub};line-height:1.4}
.bxi{font-size:10.5pt;font-style:italic;color:${P.faint};margin-top:4px}
.hbwrap{display:flex;flex-direction:column;gap:9px}
.hb{display:flex;align-items:center;gap:12px;font-size:12pt}
.hbn{width:2.9in;color:${P.slate}}
.hbt{flex:1;height:17px;background:#EFEDE7;border-radius:3px;overflow:hidden}
.hbt span{display:block;height:17px;background:${P.navy}}
.hbt.bare{background:none}
.hbj{width:.5in;text-align:right;color:${P.sub}}
.hbv{width:.75in;text-align:right;font-weight:700;color:${P.navy}}
.hbhead{font-size:9.5pt;letter-spacing:.06em;text-transform:uppercase;color:${P.sub};margin-bottom:-2px}
.hbhead .hbv,.hbhead .hbj{font-weight:700;color:${P.sub}}
.donewrap{margin-top:.10in}
.two{display:flex;gap:.34in;margin-bottom:.22in}
.half{flex:1;border:1.5px solid;border-radius:8px;padding:16px 20px}
.hl{font-size:11pt;font-weight:700;letter-spacing:1.3px}
.hv{font-family:Cambria,Georgia,serif;font-size:36pt;font-weight:700;line-height:1.15}
.hs{font-size:13pt;font-weight:700;color:${P.slate};margin-bottom:6px}
.half p{font-size:12pt;color:${P.sub};line-height:1.45;margin:0}
.panel{background:${P.panel};border:1px solid ${P.line};border-radius:8px;padding:12px 18px}
.pl{font-size:9.5pt;font-weight:700;letter-spacing:1.2px;color:${P.mute};margin-bottom:5px;display:block}
.pl.light{color:#8FA1B3;margin-top:14px}
.pr{font-size:11.5pt;color:${P.slate};line-height:1.62}
.pr.tight{font-size:10.5pt;line-height:1.5}
.pr.light{color:#CFDAE4}
.dim{color:${P.faint}}
.t{width:100%;border-collapse:collapse;font-size:10.5pt}
.t th{background:${P.ink};color:#fff;text-align:left;padding:5px 9px;font-weight:700}
.t th.c,.t td.c{text-align:center}
.t td{padding:3px 9px;border-bottom:1px solid ${P.line};color:${P.slate}}
.t .jn{font-weight:700;color:${P.navy}}
/* Two clients to a page, side by side, each with its own list under it.
   A column rather than one long table because the name is the heading a
   reader looks for, and one table of four hundred rows has no headings. */
.custpair{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
.custcol{min-width:0}
.custhd{border-bottom:2px solid ${P.navy};padding-bottom:4px;margin-bottom:6px}
.custname{font-size:13.5pt;font-weight:700;color:${P.navy};line-height:1.2}
.custn{font-size:9.5pt;color:${P.sub};margin-top:1px}
.t.small{font-size:9pt}
.t.small th,.t.small td{padding:2.5px 4px}
.fx{display:flex;gap:.3in;align-items:flex-start}
.fxl{flex:1.32}.fxr{flex:1;display:flex;flex-direction:column;gap:8px}
.fxstats{display:flex;gap:9px}
.fxs{flex:1;background:${P.panel};border:1px solid ${P.line};border-radius:6px;padding:7px 11px}
.fxv{font-family:Cambria,Georgia,serif;font-size:17pt;font-weight:700;line-height:1.15}
.fxl2{font-size:9.5pt;color:${P.sub};line-height:1.25}
.fxcust .pr{margin-left:2px}
.kpis{display:flex;gap:.34in;margin:.2in 0 .12in}
.kpi{flex:1;background:#22303C;border:1px solid #33414F;border-radius:8px;padding:14px 18px}
.kn{font-family:Cambria,Georgia,serif;font-size:38pt;font-weight:700;line-height:1.1}
.kl{font-size:11.5pt;color:#8FA1B3;line-height:1.35}
.quote{font-size:11.5pt;color:#AFC0CE;line-height:1.5;margin-bottom:3px}
.quote b{color:#fff}.qv{color:${P.gold}}
.callout{position:absolute;left:.6in;right:.6in;bottom:.5in;background:#3A2318;border:1px solid ${P.accent};border-radius:8px;padding:13px 20px;font-size:13pt;font-weight:700;color:#FFD9C2;line-height:1.45}

/* The toolbar exists on screen only. Nothing here reaches the PDF. */
#bar{position:fixed;top:0;left:0;right:0;z-index:9;display:flex;align-items:center;gap:14px;
  padding:10px 18px;background:${P.ink};color:#fff;font-size:14px;box-shadow:0 2px 10px rgba(0,0,0,.3)}
#bar b{font-size:15px}
#bar span{color:#9FB0C0}
#bar button{margin-left:auto;background:${P.accent};color:#fff;border:0;border-radius:6px;
  padding:9px 20px;font-size:14px;font-weight:700;cursor:pointer}
#pages{padding:56px 0 30px;display:flex;flex-direction:column;gap:18px}
@media print{
  body{background:#fff}
  #bar{display:none}
  #pages{padding:0;gap:0;display:block}
  section{margin:0}
}
</style></head><body>
<div id="bar"><b>Nandan GSE · ${esc(D.fy)}</b>
  <span>Date of Report ${esc(D.asOfLong)} · ${s8(body)} pages</span>
  <button onclick="window.print()">Save as PDF</button></div>
<div id="pages">${body}</div>
<script>
  // Arriving with ?print=1 (the Admin button) goes straight to the dialog.
  if (new URLSearchParams(location.search).get("print") === "1")
    window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 350); });
</script>
</body></html>`;
}

/** How many pages the body came to — counted, never assumed. */
const s8 = (body: string) => (body.match(/<section/g) || []).length;
