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
import { esc, dmy } from "@/lib/fmt";
import { BREAKTHROUGH } from "@/lib/breakthrough-logo";
import { ownerColour, sectorOf, SECTORS } from "@/lib/owner-colour";

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
  /**
   * THE LAST SIX MONTHS, DELIVERED (Dr Raghu, 6 Oct 2026: "show the last 6
   * months results as a graph - Jobs, value, Throughput"). From the bank of
   * delivered jobs, a month at a time, oldest first.
   */
  history?: { key: string; label: string; jobs: number; value: number; throughput: number }[];
  /** Each job's planning owner, by job id — the calendar's colours. */
  owners?: Record<string, string>;
  /**
   * THE YEAR SO FAR (Dr Raghu, 6 Oct 2026: "YTD Upto 30th September : Jobs |
   * Values | Throughput, Oct Plan : …, if all Delivered by Oct end : …").
   * Delivered from 1 April to the day before the plan opens.
   */
  ytd?: { from: string; upto: string; jobs: number; value: number; throughput: number };
  /**
   * WHOSE COPY THIS IS, faint across every page (6 Oct 2026). A screenshot
   * cannot be stopped from inside a document; a screenshot that names the
   * person it came from is one people think twice about taking.
   */
  watermark?: string;
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
function weekTable(title: string, key: string, rows: Record<string, unknown>[], from: string, end: string, money: boolean, dense = 0): string {
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
  /* PRODUCTS WEAR THEIR SECTOR (Dr Raghu, 6 Oct 2026: "the product should
     have the colour of the Sector of GSE, MHE, DEF") — grouped in that order,
     busiest first inside each. Clients keep the busiest-first order. */
  const isProduct = key === "fam";
  const sIdx = (k: string) => SECTORS.findIndex((x) => x.key === sectorOf(k).key);
  const ordered = [...grid.entries()].sort((a, b) =>
    (isProduct ? sIdx(a[0]) - sIdx(b[0]) : 0) || rowTot(b[1]).n - rowTot(a[1]).n || rowTot(b[1]).v - rowTot(a[1]).v || a[0].localeCompare(b[0]));
  const nameCell = (k: string) => {
    if (!isProduct) return `<td class="wk1"><span class="nm1" title="${esc(k)}">${esc(k)}</span></td>`;
    const sc = sectorOf(k);
    return `<td class="wk1" style="border-left:2.2mm solid ${sc.ink};background:${sc.tint}"><span class="nm1"><span class="sec" style="background:${sc.ink}">${esc(sc.label)}</span> <b style="color:${sc.ink}">${esc(k)}</b></span></td>`;
  };
  const used = isProduct ? SECTORS.filter((x) => ordered.some(([k]) => sectorOf(k).key === x.key)) : [];
  const secLegend = used.length ? `<div class="legend" style="margin:0">${used.map((x) => `<span class="lk"><i style="background:${x.ink}"></i>${esc(x.label)}</span>`).join("")}</div>` : "";
  /* NUMBER OF JOBS (VALUE), ON ONE LINE (Dr Raghu, 6 Oct 2026: "try to fit
     the client and product week wise in one page! You may put the number of
     jobs (value)") — half the height of a cell that stacked them. */
  const fmtCell = (c?: Cell) => !c || !c.n ? '<span class="faint">·</span>' : `<b>${c.n}</b>${money ? ` <span class="wv">(${cr(c.v)})</span>` : ""}`;
  const grand = { n: rows.length, v: rows.reduce((a, r) => a + (Number(r.val) || 0), 0) };
  return `
<div class="wk">
  <div class="wkh"><span class="tlabel">${esc(title)}</span>${secLegend}</div>
  <table class="wt d${dense}">
    <thead><tr><th class="wk1"${isProduct ? ' style="border-left:2.2mm solid #22303C"' : ""}>${esc(key === "fam" ? "Product" : "Client")}</th>${cols.map((c) => `<th class="wc">${esc(c.label)}${c.sub ? ` <span class="ws">${esc(c.sub)}</span>` : ""}</th>`).join("")}<th class="wc tot1">Total</th></tr></thead>
    <tbody>${ordered.map(([k, g]) => `<tr>${nameCell(k)}${cols.map((c) => `<td class="wc">${fmtCell(g.get(c.key))}</td>`).join("")}<td class="wc tot1">${fmtCell(rowTot(g))}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td class="wk1"${isProduct ? ' style="border-left:2.2mm solid #22303C"' : ""}><b>Total</b></td>${cols.map((c) => `<td class="wc">${fmtCell(colTot.get(c.key))}</td>`).join("")}<td class="wc tot1">${fmtCell(grand)}</td></tr></tfoot>
  </table>
</div>`;
}

/**
 * The calendar: a row per ISO week, Monday to Sunday, each job on its target
 * delivery date — the job number and the customer tag, the tag allowed two
 * lines and more rather than cut to one. A thin left rule says the team's
 * belief: green at 50% or better, amber below.
 */
function calendar(rows: Record<string, unknown>[], from: string, end: string, money: boolean, owners: Record<string, string> = {}): string {
  if (!rows.length) return "";
  const byDay = new Map<string, Record<string, unknown>[]>();
  const outside: Record<string, unknown>[] = [];
  for (const r of rows) {
    const d = String(r.tdd || "").slice(0, 10);
    if (!d || d < from || d > end) { outside.push(r); continue; }
    (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(r);
  }
  /* COLOUR IS THE PLANNING OWNER (Dr Raghu, 6 Oct 2026) — the same colour
     the person wears on My Week, so the calendar answers "whose week is
     this" before a word is read. A key under the calendar names them. */
  const ownerOfRow = (r: Record<string, unknown>) => String(owners[String(r.id ?? "")] || "").trim();
  const chip = (r: Record<string, unknown>) => {
    const o = ownerOfRow(r); const c = ownerColour(o);
    return `<div class="cj" style="border-left-color:${c};background:${c}14"><b style="color:${c}">${esc(String(r.id ?? "").slice(-4))}</b> ${esc(r.tag)}${money ? `<span class="cv"> · ${cr(Number(r.val) || 0)}</span>` : ""}</div>`;
  };
  const keyCount = new Map<string, number>();
  for (const r of rows) { const o = ownerOfRow(r) || "No planning owner"; keyCount.set(o, (keyCount.get(o) || 0) + 1); }
  const legend = [...keyCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([o, n]) => `<span class="lk"><i style="background:${o === "No planning owner" ? "#8B8F87" : ownerColour(o)}"></i>${esc(o)} · ${n}</span>`).join("");
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
  <div class="legend"><span class="tlabel">PLANNING OWNER</span>${legend}</div>
</div>`;
}

/**
 * The last six months as three small bar charts — jobs, value, throughput —
 * with the period's plan beside them as an outlined bar, so the month ahead
 * is read against the months behind it. Inline SVG: the press has no
 * network and no chart library.
 */
function historyCharts(h: NonNullable<PlanPdfInput["history"]>, plan: { jobs: number; value: number; throughput: number }, planLabel: string | null, money: boolean): string {
  if (!h.length) return "";
  const W = 300, H = 128, padB = 18, padT = 14;
  const panel = (title: string, pick: (x: { jobs: number; value: number; throughput: number }) => number, fmtv: (n: number) => string, fill: string) => {
    const vals = h.map(pick);
    const planV = planLabel ? pick(plan) : null;
    const max = Math.max(1, ...vals, planV ?? 0);
    const n = h.length + (planLabel ? 1 : 0);
    const slot = W / n, bw = Math.min(30, slot * 0.62);
    const bar = (i: number, v: number, label: string, isPlan: boolean) => {
      const x = i * slot + (slot - bw) / 2;
      const bh = ((H - padB - padT) * v) / max;
      const y = H - padB - bh;
      return `${isPlan
        ? `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(bh, .5)}" fill="#FFF3E8" stroke="#E8600A" stroke-width="1.4" stroke-dasharray="3 2"/>`
        : `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(bh, .5)}" fill="${fill}" rx="1.5"/>`}
<text x="${x + bw / 2}" y="${y - 3}" text-anchor="middle" font-size="8.5" font-weight="700" fill="${isPlan ? "#E8600A" : "#16232F"}">${esc(fmtv(v))}</text>
<text x="${x + bw / 2}" y="${H - 5}" text-anchor="middle" font-size="8" fill="${isPlan ? "#E8600A" : "#5A6672"}" font-weight="${isPlan ? 800 : 400}">${esc(label)}</text>`;
    };
    const bars = h.map((m, i) => bar(i, pick(m), m.label, false)).join("") + (planLabel && planV != null ? bar(h.length, planV, planLabel, true) : "");
    return `<div class="chart"><div class="ct1">${esc(title)}</div><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="0" y1="${H - padB}" x2="${W}" y2="${H - padB}" stroke="#D9D6CE"/>${bars}</svg></div>`;
  };
  const crs = (n: number) => (n / CR).toFixed(2);
  return `<div class="charts">
${panel("JOBS DELIVERED — LAST SIX MONTHS", (x) => x.jobs, (n) => String(Math.round(n)), "#1B3A5C")}
${money ? panel("VALUE DELIVERED, ₹ CR", (x) => x.value, crs, "#3B6EA8") : ""}
${money ? panel("THROUGHPUT DELIVERED, ₹ CR", (x) => x.throughput, crs, "#0D7A3F") : ""}
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
  /* Both week-wise tables share one page: the more products and clients
     there are, the tighter the rows — comfortable while they fit, closer only
     when they would not. */
  /* The year so far, the plan, and the two added together — "if all
     delivered by the end of the period". Shown only when the period does
     not itself open the financial year (there is no year so far then). */
  const ytdBlock = () => {
    const y = i.ytd;
    if (!y || y.upto < y.from) return "";
    const upto = new Date(`${y.upto}T00:00:00Z`);
    const uptoWords = `${upto.getUTCDate()}${[, "st", "nd", "rd"][upto.getUTCDate() % 10 > 3 || Math.floor(upto.getUTCDate() / 10) === 1 ? 0 : upto.getUTCDate() % 10] || "th"} ${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][upto.getUTCMonth()]}`;
    const per = period.split(" ")[0];
    const endWords = (() => { const e = new Date(`${i.window.end}T00:00:00Z`); return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][e.getUTCMonth()]} end`; })();
    const row = (label: string, j: number, v: number, t: number, cls = "") => `<tr class="${cls}"><td class="yl">${label}</td><td class="yn"><b>${j}</b> jobs</td>${money ? `<td class="yn"><b>${M(v)}</b> value</td><td class="yn"><b>${M(t)}</b> throughput</td>` : ""}</tr>`;
    return `<table class="ytd">
${row(`YTD up to ${esc(uptoWords)}`, y.jobs, y.value, y.throughput)}
${row(`${esc(per)} plan`, i.plan.jobs, i.plan.value, i.plan.throughput)}
${row(`If all delivered by ${esc(endWords)}`, y.jobs + i.plan.jobs, y.value + i.plan.value, y.throughput + i.plan.throughput, "yall")}
</table>`;
  };
  const distinct = (k: string) => new Set((i.snapshot || []).map((r) => String(r[k] || "").trim() || "—")).size;
  const tableRows = distinct("fam") + distinct("cust");
  /* ~170 mm of page for both tables and their four header/total rows */
  const dense = tableRows <= 20 ? 0 : tableRows <= 27 ? 1 : tableRows <= 34 ? 2 : 3;

  const rows = (i.snapshot || []).map((r) => {
    const b = Number(r.belief) || 0;
    const mine = String(r.comment || "").trim();
    const others = (i.voices || {})[String(r.id ?? "")] || [];
    /* ANYTHING SHORT OF 100% IS HIGHLIGHTED, FLUORESCENT YELLOW (Dr Raghu,
       6 Oct 2026: "highlight those which are not 100%") — the doubt is the
       part of the plan worth reading first. */
    const line = (who: string, pct: number, text: string) =>
      pct < 100 ? `<div><mark class="hl"><b>${esc(who)}</b> ${pct}% · ${esc(text)}</mark></div>` : `<div><b>${esc(who)}</b> ${pct}% · ${esc(text)}</div>`;
    const lines = [
      ...(mine ? [line("MINE", b, mine)] : []),
      ...others.map((v) => line(v.initials, Number(v.belief) || 0, v.comment)),
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
.sighead { font-size: 7pt; font-weight: 800; letter-spacing: .08em; color: #8A94A0; margin: 1.6mm 0 1mm; }
.sigrow { display: flex; flex-wrap: wrap; gap: 2mm; }
.sig { break-inside: avoid; page-break-inside: avoid; border: 1px solid #E2E0DA; border-radius: 1.6mm; padding: 1.2mm 2.2mm; min-width: 40mm; }
.sig.signed { background: #E8F3EC; border-color: #B7DFC8; }
.sig.draft  { background: #F4F2EC; }
.sig.none   { background: #fff; border-style: dashed; }
.sig .nm { font-family: "Segoe Script", "Bradley Hand", "Snell Roundhand", cursive;
           font-size: 10.5pt; font-weight: 600; color: #0D7A3F; line-height: 1.2; }
.sig.draft .nm { color: #5A6672; font-size: 11.5pt; }
.sig.none .nm  { color: #8A94A0; font-size: 11pt; font-family: inherit; font-weight: 700; }
.sig .num { font-size: 7.4pt; font-weight: 700; }
.sig .sub { font-size: 6.6pt; }
.foot { margin-top: 3mm; color: #8A94A0; font-size: 7.5pt; }


mark.hl { background: #FFF200; color: #16232F; padding: 0 .6mm; border-radius: .6mm; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.legend { display: flex; flex-wrap: wrap; gap: 1.5mm 4mm; align-items: center; margin-top: 2mm; font-size: 7.2pt; color: #46545F; }
.legend .tlabel { margin: 0 1mm 0 0; }
.lk { display: inline-flex; align-items: center; gap: 1.2mm; }
.lk i { display: inline-block; width: 3mm; height: 3mm; border-radius: .6mm; }
.sec { display: inline-block; color: #fff; font-size: 6pt; font-weight: 800; letter-spacing: .06em; padding: .2mm 1.2mm; border-radius: .6mm; vertical-align: 1px; }

/* the reader's name across every page — position: fixed repeats on each printed page */
.wm { position: fixed; inset: 0; z-index: 50; pointer-events: none; display: flex; flex-direction: column; justify-content: space-around; align-items: center; overflow: hidden; }
.wm div { transform: rotate(-24deg); font-size: 15pt; font-weight: 700; letter-spacing: .06em; color: rgba(22, 35, 47, .075); white-space: nowrap; }

/* page one: the year's banner, six months delivered, the plan in large letters */
.hero { display: flex; align-items: center; gap: 6mm; margin-bottom: 1mm; }
.bt { height: 24mm; }
.hero .t { flex: 1; min-width: 0; }
.charts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin: 1mm 0 2mm; }
.chart { border: 1px solid #E2E0DA; border-radius: 2mm; padding: 1.4mm 2.5mm .6mm; }
.chart .ct1 { font-size: 7.2pt; font-weight: 800; letter-spacing: .08em; color: #8A94A0; }
.chart svg { display: block; width: 100%; height: 25mm; }
.big { display: flex; align-items: stretch; gap: 4mm; margin: 0 0 1.5mm; border-top: 2px solid #22303C; border-bottom: 2px solid #22303C; padding: 1.2mm 0; }
.big .bl { font-size: 7.4pt; font-weight: 800; letter-spacing: .1em; color: #E8600A; align-self: center; width: 30mm; line-height: 1.3; }
.big .bn { flex: 1; }
.big .bn b { display: block; font-size: 21pt; font-weight: 800; color: #12386B; line-height: 1.05; letter-spacing: -.01em; }
.big .bn span { font-size: 7.4pt; color: #5A6672; font-weight: 700; letter-spacing: .08em; }
table.ytd { width: auto; border-collapse: collapse; margin: 0 0 1.2mm; font-size: 8.4pt; }
table.ytd td { border: none; padding: .3mm 6mm .3mm 0; background: transparent !important; }
table.ytd td.yl { color: #5A6672; font-weight: 700; min-width: 52mm; }
table.ytd td.yn b { color: #16232F; font-size: 9.6pt; }
table.ytd tr.yall td { border-top: 1.5px solid #22303C; padding-top: .8mm; }
table.ytd tr.yall td.yl { color: #E8600A; }
table.ytd tr.yall td.yn b { color: #E8600A; font-size: 11pt; }
.real { font-size: 8.6pt; color: #46545F; margin-bottom: 1mm; }
.real b { color: #E8600A; }

/* page one is the signatures; the calendar opens page two */
.p2 { break-before: page; page-break-before: always; }
.sigwrap.first { margin-top: 1.5mm; padding-top: 1.5mm; }

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

/* week-wise tables — both on one page */
.wkpage { break-inside: avoid; page-break-inside: avoid; }
.wk { margin: 0 0 4mm; }
.wkh { display: flex; align-items: center; justify-content: space-between; gap: 4mm; margin-bottom: 1.2mm; }
.wkh .tlabel { margin: 0; }
table.wt { font-size: 7.8pt; line-height: 1.3; }
table.wt th { padding: 1.4mm 1.6mm; }
table.wt td { padding: 1.3mm 1.6mm; vertical-align: middle; }
table.wt.d1 { font-size: 7.4pt; }
table.wt.d1 th, table.wt.d1 td { padding: .85mm 1.4mm; }
table.wt.d2 { font-size: 7pt; line-height: 1.25; }
table.wt.d2 th, table.wt.d2 td { padding: .5mm 1.3mm; }
table.wt.d3 { font-size: 6.4pt; line-height: 1.2; }
table.wt.d3 th, table.wt.d3 td { padding: .3mm 1.2mm; }
.nm1 { display: block; max-width: 64mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
table.wt th.wc, table.wt td.wc { text-align: center; white-space: nowrap; }
table.wt th.wk1, table.wt td.wk1 { width: 66mm; }
table.wt td.tot1, table.wt th.tot1 { background: #EEF2F6 !important; }
table.wt th.tot1 { color: #16232F; }
table.wt tfoot td { border-top: 2px solid #22303C; background: #F4F2EC; font-weight: 700; }
table.wt th .ws { color: #B8C2CC; font-weight: 400; }
.wv { font-size: .86em; color: #5A6672; font-weight: 400; }

</style></head><body>

${i.watermark ? `<div class="wm" aria-hidden="true">${Array.from({ length: 6 }, () => `<div>${esc(i.watermark)}</div>`).join("")}</div>` : ""}
<div class="hero">
  <img class="bt" src="${BREAKTHROUGH}" alt="Nandan GSE — Breakthrough 2027" />
  <div class="t">
    <div class="band" style="background:${band.bg}">${band.text}</div>
    <h1>${esc(i.title)}</h1>
    ${i.docNo ? `<div class="docno">${esc(i.docNo)}${i.appVersion ? ` &middot; Genie ${esc(i.appVersion)}` : ""}</div>` : ""}
    <div class="sub2" style="margin:0">${esc(i.window.label)} · ${esc(i.window.key)} · ${esc(dmy(i.window.from))} to ${esc(dmy(i.window.end))} · ${esc(i.signedOn)} (IST)</div>
  </div>
</div>

${historyCharts(i.history || [], i.plan, KIND === "MONTH PLAN" ? `${period.split(" ")[0].slice(0, 3)} plan` : null, money)}

<div class="big">
  <div class="bl">PLANNED FOR<br>${esc(period.toUpperCase())}</div>
  <div class="bn"><b>${i.plan.jobs}</b><span>JOBS</span></div>
  ${money ? `<div class="bn"><b>${M(i.plan.value)}</b><span>VALUE</span></div>
  <div class="bn"><b>${M(i.plan.throughput)}</b><span>THROUGHPUT</span></div>` : ""}
</div>
${ytdBlock()}
<div class="real">The realistic read, on my dates and my belief: <b>${i.real.jobs} jobs at 50% belief or better</b>${money ? ` · ${M(i.real.value)} · ${M(i.real.throughput)} throughput` : ""}${i.done ? ` &nbsp;·&nbsp; done so far this period: ${i.done.nos} nos${money ? ` · ${M(i.done.value)} · ${M(i.done.throughput)}` : ""}` : ""}</div>

${sigBlock.replace('class="sigwrap"', 'class="sigwrap first"')}

<div class="p2">
${calendar(i.snapshot || [], i.window.from, i.window.end, money, i.owners || {})}
</div>

<div class="p2 wkpage">
${weekTable("PRODUCT — WEEK-WISE DELIVERIES" + (money ? ", NOS (VALUE)" : ", NOS"), "fam", i.snapshot || [], i.window.from, i.window.end, money, dense)}
${weekTable("CLIENT — WEEK-WISE DELIVERIES" + (money ? ", NOS (VALUE)" : ", NOS"), "cust", i.snapshot || [], i.window.from, i.window.end, money, dense)}
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

/** "05-10-2026 18:42 IST" — the moment, as it was on the clock in India. */
export function istStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute} IST`;
}

/**
 * The document number rides on EVERY page, not just the first. A signed plan
 * gets photocopied, forwarded and pulled apart; a loose page with no number on
 * it is a page nobody can place.
 *
 * So does the moment Dr Raghu froze the plan (6 Oct 2026: "On every page in
 * the footer also mention - Signed by Raghu <date> <time>"). A loose page
 * then says not only which plan it is but whether it had been approved —
 * and until he has signed, it says that instead.
 */
export function planFooter(docNo?: string, raghuAt?: string | null): string {
  const signed = raghuAt ? `Signed by Raghu ${esc(istStamp(raghuAt))}` : "Not yet signed by Raghu";
  return `
<div style="width:100%;font:7.5pt -apple-system,Arial,sans-serif;color:#8A94A0;padding:0 10mm;
            display:flex;justify-content:space-between;gap:6mm;">
  <span>${docNo ? esc(docNo) + " &middot; " : ""}<b style="color:${raghuAt ? "#0D7A3F" : "#B26A00"}">${signed}</b> &middot; Nandan GSE &middot; the living version is on the Month, Quarter &amp; Year Plan desk in Genie</span>
  <span style="white-space:nowrap">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
</div>`;
}
