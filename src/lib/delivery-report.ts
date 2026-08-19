/**
 * The delivery report — a printable A4 landscape pack, built from the board.
 *
 * Pure on purpose. The previous version lived inside the React component and
 * shipped with a blank first page, because there was no way to render it and
 * look at it without a signed-in browser. This can be called from a script,
 * written to a file and screenshotted (see scratchpad/report/), so the pack
 * that is checked is the pack that prints.
 *
 * Laid out as EXPLICIT fixed-height pages rather than letting the printer
 * paginate. Chrome ignores the CSS that would number pages for us (`@page`
 * margin boxes) and its own footer is a checkbox in the print dialog, not
 * something a document can set — so the pages are cut here, and each one is
 * stamped. The same decision is what stops a table row being sliced in half.
 */
import { LOGO as DEFAULT_LOGO } from "./logo";
import { jobNo } from "./schedule";

/** Only what the report actually reads — not the whole board Job. */
export interface ReportJob {
  id: string;
  tag: string;
  fam?: string | null;
  tdd: string | null;
  val: number;
  tpv?: number | null;
  tpp?: number | null;
  kit?: number | null;
  pct?: number | null;
  escalation?: string | null;
}

export interface ReportInput {
  /** Today, ISO. The pack is dated from this. */
  today: string;
  /** Pending jobs keyed by target delivery date. */
  byDay: Record<string, ReportJob[]>;
  jobs: ReportJob[];
  /** What actually went out, for the green chips. */
  shipped: { id: string; tag: string; on: string }[];
  /** Delivered since 1 April. Null when the run-rate route is unavailable. */
  ytd: { n: number; sales: number; tp: number } | null;
  logo?: string;
  /** Rupee formatter — the same one the screen uses, so the two agree. */
  V: (n: number) => string;
}

/** Throughput in rupees, the field the board's own total sums. */
const tpOf = (j: ReportJob) => j.tpv || 0;

const parseISO = (s: string) => new Date(s + "T00:00:00Z");

/** dd-mm-yyyy, as every date in the suite is written. */
const fmtFull = (s: string | null | undefined) =>
  s ? `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}` : "—";

export function deliveryReportHtml(I: ReportInput): string {
  const { byDay, jobs, shipped, ytd, V } = I;
  const TODAY = I.today;
  const LOGO = I.logo ?? DEFAULT_LOGO;
  const days = Object.keys(byDay).sort();

  const esc = (t: unknown) => String(t ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const monthName = (m: string) => parseISO(m + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const pages: string[] = [];

  // ---- the figures the whole pack is built on ----
  const totVal = jobs.reduce((s2, j) => s2 + (j.val || 0), 0);
  const totTp = jobs.reduce((s2, j) => s2 + tpOf(j), 0);
  const dated = jobs.filter((j) => j.tdd);
  const undated = jobs.length - dated.length;
  const overdue = dated.filter((j) => (j.tdd as string) < TODAY);
  const months = [...new Set(dated.map((j) => (j.tdd as string).slice(0, 7)))].sort();
  const lastMonth = months[months.length - 1];
  const kitNum = jobs.reduce((s2, j) => s2 + (j.val || 0) * (1 - (j.tpp || 0) / 100) * ((j.kit || 0) / 100), 0);
  const kitDen = jobs.reduce((s2, j) => s2 + (j.val || 0) * (1 - (j.tpp || 0) / 100), 0);
  const kitPct = kitDen ? Math.round((kitNum / kitDen) * 100) : 0;
  const ready = jobs.filter((j) => (j.kit || 0) >= 60 && (j.pct || 0) >= 60);
  const stuck = jobs.filter((j) => (j.kit || 0) >= 60 && (j.pct || 0) < 40);
  const escJobs = jobs.filter((j) => (j.escalation || "").trim()).length;

  /**
   * The brief.
   *
   * Composed from the figures rather than written, so it cannot describe a
   * book it is not printed beside. Every sentence names its own number, and
   * anything that would read as a nil -- no overdue, no undated -- is left out
   * rather than printed as a zero somebody has to interpret.
   */
  const brief: string[] = [
    `<b>${jobs.length} jobs</b> are on the board, worth <b>${esc(V(totVal))}</b> and <b>${esc(V(totTp))}</b> of throughput. The book is <b>${kitPct}% kitted</b> by value.`,
    lastMonth
      ? `Everything on it is dated between <b>${esc(monthName(months[0]))}</b> and <b>${esc(monthName(lastMonth))}</b>. Nothing carries a delivery date after that — whatever is to be delivered beyond it has not been sold yet.`
      : "",
    overdue.length
      ? `<b>${overdue.length} jobs</b> are already past their target delivery date, carrying <b>${esc(V(overdue.reduce((s2, j) => s2 + (j.val || 0), 0)))}</b>.`
      : "",
    `<b>${esc(V(stuck.reduce((s2, j) => s2 + tpOf(j), 0)))}</b> of throughput sits on <b>${stuck.length} jobs</b> that are 60%+ kitted and under 40% built — material bought, nothing being earned against it. Against that, <b>${ready.length} jobs</b> worth <b>${esc(V(ready.reduce((s2, j) => s2 + tpOf(j), 0)))}</b> are 60%+ on both and close to going out.`,
    escJobs ? `<b>${escJobs} of ${jobs.length} jobs</b> carry a project escalation.` : "",
    ytd && ytd.n
      ? `Since 1 April, <b>${ytd.n} jobs</b> have gone out — <b>${esc(V(ytd.sales))}</b> billed and <b>${esc(V(ytd.tp))}</b> of throughput earned.`
      : "",
    undated ? `<b>${undated} jobs</b> carry no target delivery date and appear nowhere on the calendar that follows.` : "",
  ].filter(Boolean);

  const box = (l: string, v: string, sub = "", c = "#1B3A5C") =>
    `<div class="box"><div class="bl">${esc(l)}</div><div class="bv" style="color:${c}">${esc(v)}</div>${sub ? `<div class="bs">${esc(sub)}</div>` : ""}</div>`;

  // ---- 1. cover ----
  pages.push(`<div class="cover">
    <div class="left">
      <img src="${LOGO}" alt="Nandan GSE" class="logo"/>
      <h1>Delivery Report</h1>
      <div class="sub">As at ${esc(fmtFull(TODAY))}</div>
      <div class="brief">
        <div class="bh">THE BRIEF</div>
        ${brief.map((b) => `<p>${b}</p>`).join("")}
      </div>
    </div>
    <div class="right">
      ${box("JOBS PENDING", String(jobs.length), `${dated.length} dated${undated ? ` · ${undated} with no date` : ""}`, "#16232F")}
      ${box("TOTAL VALUE", V(totVal), "order value on the board", "#1B3A5C")}
      ${box("TOTAL THROUGHPUT", V(totTp), totVal ? `${Math.round((totTp / totVal) * 100)}% of value` : "", "#E8600A")}
      ${ytd
        ? box("DELIVERED SO FAR", `${ytd.n} jobs`, `${V(ytd.sales)} billed · ${V(ytd.tp)} throughput`, "#0D7A3F")
        : box("DELIVERED SO FAR", "—", "figures not available", "#8A94A0")}
      ${box("KITTING", `${kitPct}%`, "of the book, by value", "#0D9488")}
      ${overdue.length ? box("PAST TARGET DATE", String(overdue.length), "jobs already overdue", "#B3261E") : ""}
    </div>
  </div>`);

  // ---- 2. the jobs, chunked so a row is never split across a page ----
  const ROWS = 26;
  const sorted = [...jobs].sort((a, b) => String(a.tdd || "9999").localeCompare(String(b.tdd || "9999")));
  for (let i = 0; i < sorted.length; i += ROWS) {
    const chunk = sorted.slice(i, i + ROWS);
    pages.push(`<h2>Jobs on the board <small>by target delivery date · ${i + 1}–${Math.min(i + ROWS, sorted.length)} of ${sorted.length}</small></h2>
      <table class="grid"><thead><tr>
        <th>Job</th><th>Customer tag</th><th>Product family</th><th>TDD</th><th>Kit</th><th>Built</th><th class="r">Value</th><th class="r">Throughput</th>
      </tr></thead><tbody>
      ${chunk.map((j) => `<tr>
        <td class="b">${esc(jobNo(j.id))}</td>
        <td>${esc(j.tag)}</td>
        <td class="dim">${esc(j.fam || "")}</td>
        <td class="c${j.tdd && j.tdd < TODAY ? " late" : ""}">${esc(fmtFull(j.tdd))}</td>
        <td class="c">${j.kit || 0}%</td>
        <td class="c">${j.pct || 0}%</td>
        <td class="r">${esc(V(j.val || 0))}</td>
        <td class="r g">${esc(V(tpOf(j)))}</td></tr>`).join("")}
      </tbody></table>`);
  }

  // ---- 3. by product ----
  const fams = new Map<string, { n: number; v: number; t: number }>();
  for (const j of jobs) {
    const k = j.fam || "Unassigned";
    const r = fams.get(k) || { n: 0, v: 0, t: 0 };
    r.n++; r.v += j.val || 0; r.t += tpOf(j);
    fams.set(k, r);
  }
  const famRows = [...fams.entries()].sort((a, b) => b[1].t - a[1].t);
  const famMax = Math.max(...famRows.map(([, r]) => r.t), 1);
  pages.push(`<h2>By product family <small>ordered by throughput — what the company actually earns, rather than what it invoices</small></h2>
    <table class="grid"><thead><tr><th>Product family</th><th class="c">Jobs</th><th class="r">Value</th><th class="r">Throughput</th><th>Share of throughput</th></tr></thead><tbody>
    ${famRows.map(([f, r]) => `<tr>
      <td class="b">${esc(f)}</td><td class="c">${r.n}</td>
      <td class="r">${esc(V(r.v))}</td><td class="r g">${esc(V(r.t))}</td>
      <td><div class="bar"><span style="width:${((r.t / famMax) * 100).toFixed(1)}%"></span></div></td></tr>`).join("")}
    <tr class="tot"><td>TOTAL</td><td class="c">${jobs.length}</td><td class="r">${esc(V(totVal))}</td><td class="r">${esc(V(totTp))}</td><td></td></tr>
    </tbody></table>`);

  // ---- 4. kitting against production ----
  const W = 900, H = 460, L = 54, R = 22, T = 18, B = 46;
  const px = (v: number) => L + ((W - L - R) * v) / 100;
  const py = (v: number) => H - B - ((H - T - B) * v) / 100;
  const tpMax = Math.max(...jobs.map((j) => tpOf(j)), 1);
  pages.push(`<h2>Kitting against production <small>one dot per job · size = throughput · red = escalated · the dashed line is where kitting and building agree</small></h2>
    <svg viewBox="0 0 ${W} ${H}" class="scatter">
      ${[0, 25, 50, 75, 100].map((v) => `<line x1="${px(v)}" y1="${T}" x2="${px(v)}" y2="${H - B}" stroke="#E2E0DA"/>
        <line x1="${L}" y1="${py(v)}" x2="${W - R}" y2="${py(v)}" stroke="#E2E0DA"/>
        <text x="${px(v)}" y="${H - B + 15}" text-anchor="middle" font-size="11" fill="#8A94A0">${v}</text>
        <text x="${L - 8}" y="${py(v) + 4}" text-anchor="end" font-size="11" fill="#8A94A0">${v}</text>`).join("")}
      <line x1="${px(0)}" y1="${py(0)}" x2="${px(100)}" y2="${py(100)}" stroke="#8A94A0" stroke-dasharray="5 5"/>
      <rect x="${px(60)}" y="${py(40)}" width="${px(100) - px(60)}" height="${py(0) - py(40)}" fill="#D97706" fill-opacity="0.08"/>
      <text x="${px(80)}" y="${py(20)}" text-anchor="middle" font-size="12" fill="#D97706">kitted, not moving — ${stuck.length} jobs</text>
      ${jobs.map((j) => {
        const r = 4 + 9 * Math.sqrt(Math.max(tpOf(j), 0) / tpMax);
        const bad = !!(j.escalation || "").trim();
        return `<circle cx="${px(j.kit || 0)}" cy="${py(j.pct || 0)}" r="${r.toFixed(1)}" fill="${bad ? "#B3261E" : "#1B3A5C"}" fill-opacity="0.5" stroke="${bad ? "#B3261E" : "#1B3A5C"}"/>`;
      }).join("")}
      <text x="${L}" y="${H - 6}" font-size="12" fill="#5A6672">Kitted %  &#8594;</text>
      <text x="14" y="${(T + H - B) / 2}" font-size="12" fill="#5A6672" text-anchor="middle" transform="rotate(-90 14 ${(T + H - B) / 2})">Built %  &#8594;</text>
    </svg>`);

  // ---- 5. the calendar, a month to a page ----
  const allMonths: string[] = [];
  if (days.length) {
    for (let m = days[0].slice(0, 7); m <= days[days.length - 1].slice(0, 7); ) {
      allMonths.push(m);
      const d = parseISO(m + "-01");
      d.setUTCMonth(d.getUTCMonth() + 1);
      m = d.toISOString().slice(0, 7);
    }
  }
  const doneDay: Record<string, { id: string; tag: string; on: string }[]> = {};
  shipped.forEach((d) => { (doneDay[d.on] = doneDay[d.on] || []).push(d); });

  for (const m of allMonths) {
    const first = parseISO(m + "-01");
    const lead = (first.getUTCDay() + 6) % 7;            // Monday-first, as the board is
    const dim = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    const cells: string[] = [];
    for (let i = 0; i < lead; i++) cells.push('<td class="off"></td>');
    let mJobs = 0, mVal = 0;
    for (let d = 1; d <= dim; d++) {
      const iso = `${m}-${String(d).padStart(2, "0")}`;
      const list = byDay[iso] || [];
      const out = doneDay[iso] || [];
      mJobs += list.length;
      mVal += list.reduce((x, j) => x + (j.val || 0), 0);
      /**
       * A cell shows two jobs, then counts the rest.
       *
       * A day with five jobs used to push its row past the bottom of the page
       * and straight through the footer. Cells are a fixed height on paper,
       * so what does not fit is COUNTED rather than allowed to spill -- and a
       * named remainder is honest in a way a silently clipped one is not.
       */
      const SHOWN = 2;
      const chips = [
        ...list.map((j) => `<div class="chip${j.tdd && j.tdd < TODAY ? " late" : ""}"><b>${esc(jobNo(j.id))}</b><span>${esc(j.tag)}</span></div>`),
        ...out.map((o) => `<div class="chip done"><b>&#10003; ${esc(jobNo(o.id))}</b><span>${esc(o.tag)}</span></div>`),
      ];
      const more = chips.length - SHOWN;
      cells.push(`<td${iso === TODAY ? ' class="today"' : ""}>
        <div class="cell">
          <div class="dn">${d}${list.length > 1 ? ` <span class="cnt">(${list.length})</span>` : ""}</div>
          ${chips.slice(0, SHOWN).join("")}
          ${more > 0 ? `<div class="more">+${more} more — see the job table</div>` : ""}
        </div>
      </td>`);
    }
    while (cells.length % 7) cells.push('<td class="off"></td>');
    const rows: string[] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(`<tr>${cells.slice(i, i + 7).join("")}</tr>`);
    pages.push(`<h2>${esc(monthName(m))} <small>${mJobs} job${mJobs === 1 ? "" : "s"} due · ${esc(V(mVal))} · green = delivered</small></h2>
      <table class="cal"><thead><tr>${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<th>${d}</th>`).join("")}</tr></thead>
      <tbody>${rows.join("")}</tbody></table>`);
  }

  /**
   * Page numbers.
   *
   * Chrome ignores the CSS that would number pages for us (`@page` margin
   * boxes), and its own print footer is a checkbox in the dialog rather than
   * something a page can set. So the document is laid out as explicit
   * fixed-height pages and each one is stamped -- which is also what stops a
   * table row being cut in half by a page break.
   */
  const total = pages.length;
  const body = pages.map((p2, i) => `<div class="page">
    <div class="pbody">${p2}</div>
    <div class="pfoot"><span>Nandan GSE · Delivery Report · ${esc(fmtFull(TODAY))}</span><span>Page ${i + 1} of ${total}</span></div>
  </div>`).join("");

  return `<!doctype html><html><head><meta charset="utf-8">
<title>Nandan GSE · Delivery Report · ${esc(fmtFull(TODAY))}</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{margin:0;font-family:Calibri,Arial,sans-serif;color:#16232F;background:#8A94A0}
  .page{width:281mm;height:194mm;background:#fff;margin:0 auto 6mm;padding:0;position:relative;page-break-after:always;overflow:hidden}
  .page:last-child{page-break-after:auto}
  .pbody{padding:6mm 7mm 0}
  .pfoot{position:absolute;left:7mm;right:7mm;bottom:3mm;display:flex;justify-content:space-between;
    font-size:8pt;color:#8A94A0;border-top:1px solid #E2E0DA;padding-top:2mm}
  h2{font-size:13pt;margin:0 0 3mm;color:#16232F}
  h2 small{font-weight:400;color:#8A94A0;font-size:8.5pt}

  .cover{display:flex;gap:8mm;height:176mm}
  .cover .left{flex:1.15;display:flex;flex-direction:column}
  .cover .right{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:4mm;align-content:start;padding-top:4mm}
  .logo{height:22mm;object-fit:contain;object-position:left;margin-bottom:5mm}
  h1{font-size:26pt;margin:0;color:#16232F}
  .sub{font-size:11pt;color:#5A6672;margin-bottom:6mm}
  .brief{border-left:3px solid #E8600A;padding-left:5mm}
  .bh{font-size:8.5pt;font-weight:700;letter-spacing:1.5px;color:#8A94A0;margin-bottom:2mm}
  .brief p{font-size:10.5pt;line-height:1.5;margin:0 0 3mm;color:#22303C}
  .box{border:1px solid #E2E0DA;border-top:3px solid #1B3A5C;border-radius:3px;padding:3mm 4mm;background:#FAF9F5}
  .bl{font-size:8pt;font-weight:700;color:#8A94A0;letter-spacing:.5px}
  .bv{font-size:20pt;font-weight:700;line-height:1.15}
  .bs{font-size:8pt;color:#5A6672}

  table{width:100%;border-collapse:collapse}
  .grid{font-size:8.5pt}
  .grid th{background:#22303C;color:#fff;padding:1.6mm 2mm;text-align:left;font-size:8pt}
  .grid td{border-bottom:1px solid #EFEDE7;padding:1.3mm 2mm}
  .grid tr:nth-child(even) td{background:#FAF9F5}
  .grid .b{font-weight:700;color:#1B3A5C}
  .grid .c,.grid th.c{text-align:center}
  .grid .r,.grid th.r{text-align:right}
  .grid .g{color:#0D7A3F;font-weight:700}
  .grid .dim{color:#8A94A0}
  .grid .late{color:#B3261E;font-weight:700}
  .grid .tot td{background:#16232F;color:#F5B32B;font-weight:700}
  .bar{height:7px;background:#EFEDE7;border-radius:2px;overflow:hidden}
  .bar span{display:block;height:7px;background:#1B3A5C}

  .scatter{width:100%;height:auto;max-height:165mm}

  .cal{table-layout:fixed}
  .cal th{background:#22303C;color:#fff;font-size:8pt;padding:1.2mm;text-align:center}
  .cal td{border:1px solid #E2E0DA;vertical-align:top;height:25mm;padding:0;width:14.28%;overflow:hidden}
  .cal .cell{height:25mm;overflow:hidden;padding:1mm}
  .more{font-size:6pt;color:#5A6672;margin-top:.5mm;font-weight:700}
  .cal td.off{background:#F7F6F2}
  .cal td.today{background:#FFF3E8}
  .dn{font-size:8pt;font-weight:700;color:#8A94A0}
  .cnt{color:#1B3A5C}
  .chip{background:#DCE8F5;color:#1B3A5C;border-radius:2px;padding:.6mm 1mm;margin-top:.7mm;font-size:6.4pt;line-height:1.2;overflow:hidden}
  .chip.late{background:#B3261E;color:#fff}
  .chip.done{background:#0D7A3F;color:#fff}
  .chip b{display:block}
  .chip span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

  button{position:fixed;top:8px;right:8px;z-index:9;background:#E8600A;color:#fff;border:0;border-radius:5px;
    padding:9px 18px;font-weight:700;cursor:pointer;font-size:13px}
  @media print{ button{display:none} body{background:#fff} .page{margin:0} }
</style></head><body>
<button onclick="window.print()">Save as PDF</button>
${body}
<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},400);});</script>
</body></html>`;
}
