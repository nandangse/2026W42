/**
 * THE PLAN, AS A DOCUMENT.
 *
 * One template for both the mail sent on signing and the ↓ PDF button that
 * stays on the desk. Two renderers would drift, and the day they disagreed
 * nobody could say which one the signer had actually signed.
 *
 * Drawn from the SNAPSHOT the signature stored, never from live data: a plan
 * is a statement made on a date, and a document that quietly re-rendered
 * itself from today's table would be a different plan wearing the same
 * signature.
 */
import { LOGO } from "@/lib/logo";
import { esc, dmy } from "@/lib/fmt";

const CR = 1e7;
const cr = (n: number) => `₹${((Number(n) || 0) / CR).toFixed(2)} Cr`;



export type PlanState = "draft" | "frozen" | "approved";

export interface PlanVoice { initials: string; belief: number; comment: string }
export interface PlanPerson {
  name: string; email: string;
  jobs?: number; value?: number; throughput?: number;
  at?: string | null;
}

export interface PlanPdfInput {
  title: string;
  state?: PlanState;
  window: { from: string; end: string; key: string; label: string };
  snapshot: Record<string, unknown>[];
  plan: { jobs: number; value: number; throughput: number };
  real: { jobs: number; value: number; throughput: number };
  signedOn: string;
  done?: { nos: number; value: number; throughput: number };
  voices?: Record<string, PlanVoice[]>;
  /** Money is hidden from anyone not cleared for it — see the note below. */
  showValue?: boolean;
  /**
   * THE PLAN'S DOCUMENT NUMBER (Dr Raghu, 2 Sep 2026: "Number this plan also
   * as per the Software number too"): NGSE/PLAN/SEP26/0209/Rev0, and the
   * Genie version that pressed it. A signed plan that circulates on paper and
   * in inboxes needs a handle -- without one, "the plan" means whichever copy
   * the reader happens to be holding.
   */
  docNo?: string;
  appVersion?: string;
  /** Who signed, who is still drafting, and who has not looked at all. */
  signed?: PlanPerson[];
  drafts?: PlanPerson[];
  notViewed?: PlanPerson[];
}

/** "September 26", "Q2 26", "FY26-27" — the period as a person says it. */
export function periodWords(key: string, label: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (m) {
    const names = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"];
    return `${names[Number(m[2]) - 1]} ${m[1].slice(2)}`;
  }
  const q = /^(\d{4})-Q(\d)$/.exec(key);
  if (q) return `Q${q[2]} ${q[1].slice(2)}`;
  return key || label;
}

/* ------------------------------------------------------------------ weeks --
   THE PLAN AS A CALENDAR, AND WEEK BY WEEK (Dr Raghu, 5 Oct 2026: "start the
   jobs as a calendar, show the job no and the customer tag in the cell, show
   2 lines at least ... Also show a table Product Week wise delivery nos and
   values ... Client Week wise delivery nos and values").
   Weeks are ISO weeks, Monday to Sunday, the same weeks the Tasking calendar
   and the floor speak in. A job lands on its target delivery date. */
const DAY = 864e5;
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const atUtc = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
/** The Monday on or before a date. */
const mondayOf = (iso: string) => { const d = atUtc(iso); const wd = (d.getUTCDay() + 6) % 7; return isoOf(new Date(d.getTime() - wd * DAY)); };
function isoWeekNo(iso: string): number {
  /* the ISO rule: a week belongs to the year its Thursday falls in */
  const d = atUtc(iso); const wd = (d.getUTCDay() + 6) % 7;
  const th = new Date(d.getTime() + (3 - wd) * DAY);
  const jan1 = Date.UTC(th.getUTCFullYear(), 0, 1);
  return 1 + Math.floor((th.getTime() - jan1) / DAY / 7);
}
const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dShort = (iso: string) => `${Number(iso.slice(8, 10))} ${MON3[Number(iso.slice(5, 7)) - 1]}`;

interface WeekCol { key: string; label: string; sub: string }
/**
 * The columns: every week of the window for a month or a quarter; for a
 * year, only the weeks that carry a delivery, or the page would be 52 wide.
 * A job dated before the window ("carried in") or after it gets its own
 * column, never a quiet move into the nearest week.
 */
function weekCols(rows: Record<string, unknown>[], from: string, end: string): { cols: WeekCol[]; colOf: (tdd: string) => string } {
  const first = mondayOf(from), last = mondayOf(end);
  const spanWeeks = Math.round((atUtc(last).getTime() - atUtc(first).getTime()) / DAY / 7) + 1;
  const all: string[] = [];
  for (let t = atUtc(first).getTime(); t <= atUtc(last).getTime(); t += 7 * DAY) all.push(isoOf(new Date(t)));
  const colOf = (tdd: string) => (!tdd ? "none" : tdd < from ? "before" : tdd > end ? "after" : mondayOf(tdd));
  const used = new Set(rows.map((r) => colOf(String(r.tdd || "").slice(0, 10))));
  const weeks = spanWeeks > 16 ? all.filter((w) => used.has(w)) : all;
  const cols: WeekCol[] = [];
  if (used.has("before")) cols.push({ key: "before", label: "Carried in", sub: `before ${dShort(from)}` });
  for (const w of weeks) cols.push({ key: w, label: `W${isoWeekNo(w)}`, sub: `${dShort(w < from ? from : w)}–${dShort(isoOf(new Date(Math.min(atUtc(w).getTime() + 6 * DAY, atUtc(end).getTime()))))}` });
  if (used.has("after")) cols.push({ key: "after", label: "Later", sub: `after ${dShort(end)}` });
  if (used.has("none")) cols.push({ key: "none", label: "No date", sub: "" });
  return { cols, colOf };
}

/** Rows = product family or client; columns = weeks; each cell: nos, and value when cleared. */
function weekTable(title: string, key: string, rows: Record<string, unknown>[], from: string, end: string, money: boolean): string {
  if (!rows.length) return "";
  const { cols, colOf } = weekCols(rows, from, end);
  type Cell = { n: number; v: number };
  const grid = new Map<string, Map<string, Cell>>();
  const colTot = new Map<string, Cell>();
  for (const r of rows) {
    const k = String(r[key] || "").trim() || "—";
    const c = colOf(String(r.tdd || "").slice(0, 10));
    const g = grid.get(k) ?? grid.set(k, new Map()).get(k)!;
    const cell = g.get(c) ?? g.set(c, { n: 0, v: 0 }).get(c)!;
    cell.n++; cell.v += Number(r.val) || 0;
    const t = colTot.get(c) ?? colTot.set(c, { n: 0, v: 0 }).get(c)!;
    t.n++; t.v += Number(r.val) || 0;
  }
  const rowTot = (g: Map<string, Cell>) => [...g.values()].reduce((a, c) => ({ n: a.n + c.n, v: a.v + c.v }), { n: 0, v: 0 });
  const ordered = [...grid.entries()].sort((a, b) => rowTot(b[1]).n - rowTot(a[1]).n || rowTot(b[1]).v - rowTot(a[1]).v || a[0].localeCompare(b[0]));
  const fmtCell = (c?: Cell) => !c || !c.n ? '<span class="faint">·</span>' : `<b>${c.n}</b>${money ? `<div class="wv">${cr(c.v)}</div>` : ""}`;
  const grand = { n: rows.length, v: rows.reduce((a, r) => a + (Number(r.val) || 0), 0) };
  return `
<div class="wk">
  <div class="tlabel">${esc(title)}</div>
  <table class="wt">
    <thead><tr><th class="wk1">${esc(key === "fam" ? "Product" : "Client")}</th>${cols.map((c) => `<th class="wc">${esc(c.label)}<div class="ws">${esc(c.sub)}</div></th>`).join("")}<th class="wc tot1">Total</th></tr></thead>
    <tbody>${ordered.map(([k, g]) => `<tr><td class="wk1">${esc(k)}</td>${cols.map((c) => `<td class="wc">${fmtCell(g.get(c.key))}</td>`).join("")}<td class="wc tot1">${fmtCell(rowTot(g))}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td class="wk1"><b>Total</b></td>${cols.map((c) => `<td class="wc">${fmtCell(colTot.get(c.key))}</td>`).join("")}<td class="wc tot1">${fmtCell(grand)}</td></tr></tfoot>
  </table>
</div>`;
}

/**
 * The calendar: a row per ISO week, Monday to Sunday, each job on its target
 * delivery date — the job number and the customer tag, the tag allowed two
 * lines and more rather than cut to one. A thin left rule says the team's
 * belief: green at 50% or better, amber below.
 */
function calendar(rows: Record<string, unknown>[], from: string, end: string, money: boolean): string {
  if (!rows.length) return "";
  const byDay = new Map<string, Record<string, unknown>[]>();
  const outside: Record<string, unknown>[] = [];
  for (const r of rows) {
    const d = String(r.tdd || "").slice(0, 10);
    if (!d || d < from || d > end) { outside.push(r); continue; }
    (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(r);
  }
  const chip = (r: Record<string, unknown>) => {
    const b = Number(r.belief) || 0;
    return `<div class="cj" style="border-left-color:${b >= 50 ? "#0D7A3F" : "#B26A00"}"><b>${esc(String(r.id ?? "").slice(-4))}</b> ${esc(r.tag)}${money ? `<span class="cv"> · ${cr(Number(r.val) || 0)}</span>` : ""}</div>`;
  };
  const first = mondayOf(from), last = mondayOf(end);
  const weeks: string[] = [];
  for (let t = atUtc(first).getTime(); t <= atUtc(last).getTime(); t += 7 * DAY) weeks.push(isoOf(new Date(t)));
  /* a year is too long to draw whole — only the weeks that carry a delivery */
  const show = weeks.length > 16 ? weeks.filter((w) => [0, 1, 2, 3, 4, 5, 6].some((k) => byDay.has(isoOf(new Date(atUtc(w).getTime() + k * DAY))))) : weeks;
  const head = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const body = show.map((w) => {
    const days = [0, 1, 2, 3, 4, 5, 6].map((k) => isoOf(new Date(atUtc(w).getTime() + k * DAY)));
    const n = days.reduce((a, d) => a + (byDay.get(d)?.length || 0), 0);
    return `<tr><td class="cwk"><b>W${isoWeekNo(w)}</b><div class="ws">${n ? `${n} job${n === 1 ? "" : "s"}` : ""}</div></td>${days.map((d, k) => {
      const inside = d >= from && d <= end;
      const js = byDay.get(d) || [];
      return `<td class="cd${inside ? "" : " out"}${k === 6 ? " sun" : ""}"><div class="dn">${Number(d.slice(8, 10))}${d.slice(8, 10) === "01" || d === from ? ` ${MON3[Number(d.slice(5, 7)) - 1]}` : ""}</div>${js.map(chip).join("")}</td>`;
    }).join("")}</tr>`;
  }).join("");
  const before = outside.filter((r) => String(r.tdd || "") && String(r.tdd) < from);
  const after = outside.filter((r) => String(r.tdd || "") > end);
  const none = outside.filter((r) => !String(r.tdd || ""));
  const strip = (label: string, list: Record<string, unknown>[]) => list.length
    ? `<div class="cstrip"><span class="tlabel">${esc(label)} · ${list.length}</span><div class="cflow">${list.map((r) => `<div class="cflowi">${chip(r)}<span class="ws">${esc(dmy(r.tdd))}</span></div>`).join("")}</div></div>` : "";
  return `
<div class="cal">
  <div class="tlabel">THE JOBS ON THEIR TARGET DELIVERY DATES</div>
  ${strip(`CARRIED IN — DUE BEFORE ${dShort(from).toUpperCase()}`, before)}
  <table class="ct">
    <thead><tr><th class="cwk">Week</th>${head.map((h, k) => `<th class="${k === 6 ? "sun" : ""}">${h}</th>`).join("")}</tr></thead>
    <tbody>${body}</tbody>
  </table>
  ${strip(`LATER — DUE AFTER ${dShort(end).toUpperCase()}`, after)}
  ${strip("NO TARGET DATE", none)}
</div>`;
}

export function planPdfHtml(i: PlanPdfInput): string {
  const state: PlanState = i.state ?? "draft";

  /**
   * THE DOCUMENT KNOWS WHICH PLAN IT IS (Dr Raghu, 2 Sep 2026: "when the
   * Months plan is chosen, it will show the Months plan. When the Quarter
   * plan is chosen, it will create a Quarter plan").
   *
   * The band read "FROZEN — MONTH PLAN" whatever window pressed it, so a
   * frozen QUARTER came out of the press calling itself a month. This month
   * that is merely wrong; from October, when the month and the quarter are
   * both frozen and both released, it would be two documents that look like
   * the same one -- and the wrong one gets acted on.
   */
  const KIND = i.window.label === "QTD" ? "QUARTER PLAN"
    : i.window.label === "YTD" ? "YEAR PLAN"
    : "MONTH PLAN";
  const period = periodWords(i.window.key, i.window.label);
  const band =
    state === "approved" ? { text: `${KIND} APPROVED · ${period}`, bg: "#0D7A3F" }
    : state === "frozen" ? { text: `FROZEN — ${KIND} · ${period}`, bg: "#1B3A5C" }
    : { text: `DRAFT ${KIND} — NOT YET SUBMITTED`, bg: "#B26A00" };

  /**
   * MONEY IS A PERMISSION (Dr Raghu, 2 Sep 2026: "If the person is not
   * authorized for value he cant see the value!").
   *
   * The column is not merely blanked — it is not rendered at all, and neither
   * are the money totals. A dotted-out cell still tells the reader there is a
   * number they are not allowed, which invites the asking around that the
   * permission exists to prevent.
   */
  const money = i.showValue !== false;
  const M = (n: number) => (money ? cr(n) : "—");

  const rows = (i.snapshot || []).map((r) => {
    const b = Number(r.belief) || 0;
    const mine = String(r.comment || "").trim();
    const others = (i.voices || {})[String(r.id ?? "")] || [];
    const lines = [
      ...(mine ? [`<div><b>MINE</b> ${b}% · ${esc(mine)}</div>`] : []),
      ...others.map((v) => `<div><b>${esc(v.initials)}</b> ${v.belief}% · ${esc(v.comment)}</div>`),
    ];
    return `<tr>
<td class="c">${esc(String(r.id ?? "").slice(-4))}</td>
<td class="tag">${esc(r.tag)}${r.cust ? `<div class="sub">${esc(r.cust)}</div>` : ""}</td>
${money ? `<td class="n">${cr(Number(r.val) || 0)}</td><td class="n">${cr(Number(r.tp) || 0)}</td>` : ""}
<td class="c tdd">${esc(dmy(r.tdd))}</td>
<td class="team">${lines.length ? lines.join("") : '<span class="faint">—</span>'}</td>
</tr>`;
  }).join("");

  const person = (p: PlanPerson, kind: "signed" | "draft" | "none") => `
<div class="sig ${kind}">
  <div class="nm">${esc(p.name)}</div>
  ${kind === "none"
    ? '<div class="sub">has not opened the plan</div>'
    : `<div class="num">${p.jobs ?? 0} jobs${money ? ` · ${cr(Number(p.value) || 0)} · ${cr(Number(p.throughput) || 0)}` : ""}</div>
       <div class="sub">${kind === "signed" ? "signed" : "draft"}${p.at ? ` · ${dmy(p.at)}` : ""}</div>`}
</div>`;

  const sigBlock = `
<div class="sigwrap">
  <div class="sighead">SIGNED OFF</div>
  <div class="sigrow">${(i.signed || []).length ? (i.signed || []).map((p) => person(p, "signed")).join("") : '<span class="faint">nobody yet</span>'}</div>

  <div class="sighead">STILL IN DRAFT</div>
  <div class="sigrow">${(i.drafts || []).length ? (i.drafts || []).map((p) => person(p, "draft")).join("") : '<span class="faint">nobody</span>'}</div>

  <div class="sighead">OTHERS WHO HAD NOT VIEWED YET</div>
  <div class="sigrow">${(i.notViewed || []).length ? (i.notViewed || []).map((p) => person(p, "none")).join("") : '<span class="faint">everybody named on the work has looked</span>'}</div>
  <div class="foot">Named on the work — they carry tasks on these jobs — but have neither drafted nor signed. They are bound by this plan all the same.</div>
</div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4 landscape; margin: 10mm 10mm 14mm; }
body { font: 9.5pt/1.4 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #16232F; }
.head { display: flex; align-items: center; gap: 5mm; margin-bottom: 3mm; }
.logo { height: 13mm; }
h1 { font-size: 14.5pt; margin: 1mm 0 0; }
.docno { font: 8.5pt "SF Mono", Menlo, Consolas, monospace; letter-spacing: .4px;
         color: #1B3A5C; font-weight: 700; margin: 1mm 0 0 0; }
.band { display: inline-block; color: #fff; font-size: 8.5pt; font-weight: 800;
        letter-spacing: .09em; padding: 1mm 3mm; border-radius: 2mm; }
.sub2 { color: #5A6672; font-size: 8.5pt; margin-bottom: 3mm; }

.tallies { margin: 0 0 3mm; }
.tlabel { font-size: 7.5pt; font-weight: 800; letter-spacing: .08em; color: #8A94A0; margin-bottom: 1mm; }
.chip { display: inline-block; border: 1px solid #E2E0DA; border-radius: 2mm;
        padding: 0.6mm 2mm; margin: 0 1.5mm 1.5mm 0; font-size: 8pt; background: #FAF9F5; }
.chip b { color: #1B3A5C; }

/* the grid the job board wears — every cell ruled, so a long tag cannot be
   read against the wrong row (Dr Raghu, 2 Sep 2026) */
table { border-collapse: collapse; width: 100%; font-size: 8.5pt; }
th { background: #22303C; color: #fff; text-align: left; padding: 1.8mm 2mm; border: 1px solid #22303C; }
td { border: 1px solid #D9D6CE; padding: 1.4mm 2mm; vertical-align: top; }
tr:nth-child(even) td { background: #FAF9F5; }
/**
 * A JOB'S ROW IS NOT SPLIT ACROSS A PAGE (found on Raghu's own signed
 * September plan, 2 Sep 2026): page 2 opened with a customer name, five
 * people's comments and NO JOB NUMBER, NO TAG, NO VALUE AND NO DATE -- the
 * identity of the job had stayed behind on page 1. A comment you cannot
 * attach to a job is worse than a comment nobody wrote, because it is read
 * as belonging to the job above it.
 *
 * thead repeats on every page for the same reason: a column of dates with
 * no header is a column of numbers.
 */
tr { break-inside: avoid; page-break-inside: avoid; }
thead { display: table-header-group; }
tfoot { display: table-footer-group; }
td.n { text-align: right; white-space: nowrap; }
td.c { text-align: center; white-space: nowrap; }
td.tdd { font-size: 11.5pt; font-weight: 800; }        /* bigger, as asked */
td.tag { width: 18%; }                                  /* half of what it was */
td.team { font-size: 8pt; }
.sub { color: #8A94A0; font-size: 7.5pt; }
.faint { color: #B8B5AC; }

.tot { margin-top: 4mm; font-size: 9.5pt; }
.tot b { color: #E8600A; }

/* THE GAP (Dr Raghu, 2 Sep 2026: "why this gap in pdf?").
   The whole signature block carried page-break-inside: avoid, so the moment
   it no longer fitted in what was left of the page Chromium moved ALL of it
   to the next one — leaving the half page of white he was looking at. The
   rule belongs on the individual cards, which must not be sliced through a
   person's name; the block itself is free to start where it lands and carry
   on overleaf. */
.sigwrap { margin-top: 6mm; border-top: 2px solid #22303C; padding-top: 3mm; }
.sighead, .sigrow { break-inside: avoid; page-break-inside: avoid; }
.sighead { font-size: 7.5pt; font-weight: 800; letter-spacing: .08em; color: #8A94A0; margin: 2.5mm 0 1.5mm; }
.sigrow { display: flex; flex-wrap: wrap; gap: 3mm; }
.sig { break-inside: avoid; page-break-inside: avoid; border: 1px solid #E2E0DA; border-radius: 2mm; padding: 2mm 3mm; min-width: 46mm; }
.sig.signed { background: #E8F3EC; border-color: #B7DFC8; }
.sig.draft  { background: #F4F2EC; }
.sig.none   { background: #fff; border-style: dashed; }
.sig .nm { font-family: "Segoe Script", "Bradley Hand", "Snell Roundhand", cursive;
           font-size: 13pt; font-weight: 600; color: #0D7A3F; }
.sig.draft .nm { color: #5A6672; font-size: 11.5pt; }
.sig.none .nm  { color: #8A94A0; font-size: 11pt; font-family: inherit; font-weight: 700; }
.sig .num { font-size: 8.5pt; font-weight: 700; }
.foot { margin-top: 3mm; color: #8A94A0; font-size: 7.5pt; }

/* page one is the signatures; the calendar opens page two */
.p2 { break-before: page; page-break-before: always; }
.sigwrap.first { margin-top: 3mm; }

/* the calendar */
.cal { margin-bottom: 5mm; }
table.ct { table-layout: fixed; font-size: 7.4pt; }
table.ct th { text-align: center; padding: 1.2mm 1mm; }
table.ct th.cwk, table.ct td.cwk { width: 12mm; text-align: center; }
table.ct th.sun, table.ct td.sun { width: 9%; }
table.ct td { padding: 1mm; height: 16mm; }
table.ct tr:nth-child(even) td { background: transparent; }
td.cd.out { background: #F4F2EC !important; }
td.cd.out .dn { color: #C9C5BB; }
.dn { font-size: 7pt; font-weight: 800; color: #8A94A0; margin-bottom: .6mm; }
.cj { border-left: 1mm solid #0D7A3F; background: #F7F5EF; padding: .6mm 1mm .6mm 1.2mm; margin-bottom: .8mm;
      line-height: 1.25; min-height: 2.5em; word-break: break-word; break-inside: avoid; }
.cj b { color: #12386B; }
.cv { color: #5A6672; }
.cstrip { margin: 1.5mm 0 2mm; break-inside: avoid; }
.cflow { display: flex; flex-wrap: wrap; gap: 1.5mm; margin-top: 1mm; }
.cflowi { width: 46mm; font-size: 7.4pt; }
.cflowi .ws { display: block; margin-top: -.4mm; }
.ws { font-size: 6.5pt; color: #8A94A0; font-weight: 400; }

/* week-wise tables */
.wk { margin: 4mm 0 5mm; break-inside: avoid; }
table.wt { font-size: 7.6pt; }
table.wt th.wc, table.wt td.wc { text-align: center; white-space: nowrap; }
table.wt th.wk1, table.wt td.wk1 { width: 40mm; }
table.wt td.tot1, table.wt th.tot1 { background: #EEF2F6 !important; }
table.wt th.tot1 { color: #16232F; }
table.wt tfoot td { border-top: 2px solid #22303C; background: #F4F2EC; font-weight: 700; }
.wv { font-size: 6.6pt; color: #5A6672; }

</style></head><body>

<div class="head">
  <img class="logo" src="${LOGO}" alt="Nandan GSE" />
  <div>
    <div class="band" style="background:${band.bg}">${band.text}</div>
    <h1>${esc(i.title)}</h1>
  </div>
</div>
${i.docNo ? `<div class="docno">${esc(i.docNo)}${i.appVersion ? ` &middot; Genie ${esc(i.appVersion)}` : ""}</div>` : ""}
<div class="sub2">${esc(i.window.label)} · ${esc(i.window.key)} · ${esc(dmy(i.window.from))} to ${esc(dmy(i.window.end))} · ${esc(i.signedOn)} (IST)</div>

<div class="tot" style="margin:0 0 2mm">
<div>The plan as it stands: <b>${i.plan.jobs} jobs</b>${money ? ` · ${M(i.plan.value)} · ${M(i.plan.throughput)} throughput` : ""}</div>
<div>The realistic read, on my dates and my belief: <b>${i.real.jobs} jobs at 50% belief or better</b>${money ? ` · ${M(i.real.value)} · ${M(i.real.throughput)} throughput` : ""}</div>
${i.done ? `<div style="color:#5A6672">Done so far this period: ${i.done.nos} nos${money ? ` · ${M(i.done.value)} · ${M(i.done.throughput)}` : ""}</div>` : ""}
</div>

${sigBlock.replace('class="sigwrap"', 'class="sigwrap first"')}

<div class="p2">
${calendar(i.snapshot || [], i.window.from, i.window.end, money)}
${weekTable("PRODUCT — WEEK-WISE DELIVERIES" + (money ? ", NOS AND VALUE" : ", NOS"), "fam", i.snapshot || [], i.window.from, i.window.end, money)}
${weekTable("CLIENT — WEEK-WISE DELIVERIES" + (money ? ", NOS AND VALUE" : ", NOS"), "cust", i.snapshot || [], i.window.from, i.window.end, money)}
</div>

<div class="p2">
<div class="tlabel">EVERY JOB, WITH THE TEAM'S BELIEF</div>
<table>
<thead><tr>
<th style="width:6%">Job</th>
<th style="width:18%">Tag</th>
${money ? '<th style="width:8%">Value</th><th style="width:8%">TP</th>' : ""}
<th style="width:9%">TDD</th>
<th>Team belief — what has to happen</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
</div>
</body></html>`;
}

/** The footer Chromium draws on every page — it will not read the page's CSS. */
export const PLAN_FOOTER = planFooter();

/**
 * The document number rides on EVERY page, not just the first. A signed plan
 * gets photocopied, forwarded and pulled apart; a loose page with no number on
 * it is a page nobody can place.
 */
export function planFooter(docNo?: string): string {
  return `
<div style="width:100%;font:7.5pt -apple-system,Arial,sans-serif;color:#8A94A0;padding:0 10mm;
            display:flex;justify-content:space-between;">
  <span>${docNo ? esc(docNo) + " &middot; " : ""}Nandan GSE &middot; the living version is on the Month, Quarter &amp; Year Plan desk in Genie</span>
  <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
</div>`;
}
