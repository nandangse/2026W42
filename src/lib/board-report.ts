import { esc } from "@/lib/fmt";
import { LOGO } from "@/lib/logo";
import type { BoardData, BoardJobRow } from "@/lib/board-report-data";

/**
 * THE MANAGEMENT REPORT TO THE BOARD — eleven A4 pages, page-numbered.
 *
 * Dr Raghu, 30 Sep 2026: "the report is basically from MD to the board.
 * Please make it top class."
 *
 * PAGES ARE FIXED BOXES, NOT FLOW. Each section is 210 x 297mm with its own
 * footer carrying its own number, so the page count is decided here and not
 * by whatever the browser's print dialog feels like doing. A board paper
 * whose page numbers depend on the printer is not a board paper.
 *
 * WHAT IT REFUSES TO DO is state a figure the books cannot support. Where the
 * stock is undated, it says the margin is indicative; where a month is only
 * half posted, that column is marked and the ratios are struck without it.
 * A report that quietly averages over a hole is worse than one that points
 * at it.
 */

const CR = 1e7, LAKH = 1e5;
const cr = (n: number) => (n / CR).toFixed(2);
const crs = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n / CR).toFixed(2)}`;
const pc = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : "—");
const dmy = (s: string | null | undefined) => (s ? String(s).split("-").reverse().join("-") : "—");
const ageOf = (d: string | null, on: string) =>
  d ? Math.round((Date.parse(on) - Date.parse(d)) / 86400000) : null;

export function boardReportHtml(d: BoardData): string {
  const M = d.months;
  const sum = (o: Record<string, number>) => M.reduce((a, x) => a + (o[x.key] || 0), 0);
  const posted = M.filter((x) => !x.partPosted);
  const sumP = (o: Record<string, number>) => posted.reduce((a, x) => a + (o[x.key] || 0), 0);
  const partMonths = M.filter((x) => x.partPosted);

  const T = { sb: sum(d.salesBasic), sg: sum(d.salesGst), p: sum(d.purch), mf: sum(d.manuf), ix: sum(d.indirect) };
  const P = { sb: sumP(d.salesBasic), p: sumP(d.purch), mf: sumP(d.manuf), ix: sumP(d.indirect) };
  const spendP = P.p + P.mf + P.ix;
  const gapP = P.sb - spendP;
  const stockMove = d.stock.closing - d.stock.opening;

  /* ---- the book ---- */
  const live = d.jobs;
  const bookVal = live.reduce((a, j) => a + j.val, 0);
  const bookTp = live.reduce((a, j) => a + j.tp, 0);
  const nextKey = (() => {
    const t = new Date(`${d.on}T00:00:00`);
    const n = new Date(t.getFullYear(), t.getMonth() + 1, 1);
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  })();
  const nextLabel = new Date(`${nextKey}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const byMonth: Record<string, { n: number; v: number; t: number; fams: Set<string>; custs: Set<string> }> = {};
  for (const j of live) {
    const k = j.tdd ? j.tdd.slice(0, 7) : "(none)";
    (byMonth[k] ||= { n: 0, v: 0, t: 0, fams: new Set(), custs: new Set() });
    const b = byMonth[k]; b.n++; b.v += j.val; b.t += j.tp;
    if (j.fam) b.fams.add(j.fam); if (j.cust) b.custs.add(j.cust);
  }
  const next = live.filter((j) => (j.tdd || "").slice(0, 7) === nextKey)
    .sort((a, b) => String(a.tdd).localeCompare(String(b.tdd)) || a.id.localeCompare(b.id));
  const nextVal = next.reduce((a, j) => a + j.val, 0);
  const nextTp = next.reduce((a, j) => a + j.tp, 0);
  const nextCust: Record<string, { n: number; v: number; t: number; fams: Set<string> }> = {};
  const nextFam: Record<string, { n: number; v: number }> = {};
  for (const j of next) {
    const c = (nextCust[j.cust || "(not named)"] ||= { n: 0, v: 0, t: 0, fams: new Set() });
    c.n++; c.v += j.val; c.t += j.tp; if (j.fam) c.fams.add(j.fam);
    const f = (nextFam[j.fam || "(not named)"] ||= { n: 0, v: 0 });
    f.n++; f.v += j.val;
  }
  const nextCustRows = Object.entries(nextCust).sort((a, b) => b[1].v - a[1].v);

  /* ---- the promise against the plan ---- */
  const gap = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const both = live.filter((j) => j.tdd && j.otd);
  const slipped = both.filter((j) => j.tdd! > j.otd!).sort((a, b) => gap(b.otd!, b.tdd!) - gap(a.otd!, a.tdd!));
  const held = both.filter((j) => j.tdd! <= j.otd!);
  const slipDays = slipped.map((j) => gap(j.otd!, j.tdd!)).sort((a, b) => a - b);
  const median = slipDays.length ? slipDays[Math.floor(slipDays.length / 2)] : 0;
  const otdPast = both.filter((j) => j.otd! < d.on);
  const bucket = (lo: number, hi: number | null) =>
    slipped.filter((j) => { const g = gap(j.otd!, j.tdd!); return g >= lo && (hi == null || g <= hi); });

  /* ---- money ---- */
  const rec = d.bills.filter((b) => b.kind === "receivable");
  const pay = d.bills.filter((b) => b.kind === "payable");
  const gross = (r: typeof rec) => r.reduce((a, x) => a + x.gross, 0);
  const advs = (r: typeof rec) => r.reduce((a, x) => a + Math.abs(x.adv), 0);
  const net = (r: typeof rec) => r.reduce((a, x) => a + x.net, 0);
  const recPos = rec.filter((r) => r.net > 0).sort((a, b) => b.net - a.net);
  const recNeg = rec.filter((r) => r.net < 0).sort((a, b) => a.net - b.net);
  const payPos = pay.filter((r) => r.net > 0).sort((a, b) => b.net - a.net);
  const payNeg = pay.filter((r) => r.net < 0).sort((a, b) => a.net - b.net);
  const bothSidesR = rec.filter((r) => r.gross > 0 && r.adv < 0).length;
  const bothSidesP = pay.filter((r) => r.gross > 0 && r.adv < 0).length;

  /* ================= pages ================= */
  let n = 0;
  const pages: string[] = [];
  const page = (title: string, body: string, note = "") => {
    n++;
    pages.push(`<section class="pg">
  <header class="ph"><span class="pt">${esc(title)}</span><span class="pm">NANDAN GSE &middot; Board Report &middot; FY ${esc(d.fyLabel)}</span></header>
  <div class="pb">${body}</div>
  <footer class="pf"><span>${note ? esc(note) : "Computed by Genie from the Tally books and the live job register."}</span><span class="pn">Page ${n}</span></footer>
</section>`);
  };

  const partNote = partMonths.length
    ? `<b>${partMonths.map((x) => x.label).join(" and ")} ${partMonths.length > 1 ? "are" : "is"} only half posted.</b>
       Sales are in; purchase bills are not. ${partMonths.length > 1 ? "Those columns understate" : "That column understates"}
       every cost line, so every ratio here is struck on the months where both sides are posted.`
    : "";

  // ---------- 1. summary ----------
  page("Executive summary", `
<div class="hero">
  <img class="logo" src="${LOGO}" alt="Nandan GSE">
  <div>
    <h1>Management Report to the Board</h1>
    <div class="sub">Nandan GSE &middot; Financial year ${esc(d.fyLabel)} &middot; ${M.length} month${M.length === 1 ? "" : "s"} to ${esc(M[M.length - 1]?.label || "")}</div>
    <div class="sub2">Books read to <b>${dmy(d.booksTo)}</b> &middot; job register read to <b>${dmy(d.on)}</b></div>
  </div>
</div>

<div class="warn">
  ${partNote}
  ${d.stock.dated
    ? `<b>Stock is valued to ${dmy(d.stock.closingAt)}</b> &mdash; &#8377;${cr(d.stock.opening)} Cr opening, &#8377;${cr(d.stock.closing)} Cr closing.`
    : `<b>The gross profit rests on a stock figure with no date.</b> Tally carries no stock value at all. Genie holds a typed
       pair &mdash; &#8377;${cr(d.stock.opening)} Cr opening, &#8377;${cr(d.stock.closing)} Cr closing &mdash; and it is those two
       numbers, not the books, that turn purchases into a cost of sales. Being undated, the same closing is applied to every
       period. <b>Treat the margin as indicative until the month-end stock register is filled.</b>`}
</div>

<div class="kpis">
  <div class="k"><span>Sales, ${M.length} months</span><b>&#8377;${cr(T.sb)} Cr</b><i>basic; &#8377;${cr(T.sb + T.sg)} Cr billed with GST</i></div>
  <div class="k"><span>Purchases${posted.length < M.length ? ", posted months" : ""}</span><b>&#8377;${cr(P.p)} Cr</b><i>${pc(P.p, P.sb)} of sales</i></div>
  <div class="k"><span>Overheads${posted.length < M.length ? ", posted months" : ""}</span><b>&#8377;${cr(P.ix)} Cr</b><i>${pc(P.ix, P.sb)} of sales</i></div>
  <div class="k"><span>Manufacturing${posted.length < M.length ? ", posted" : ""}</span><b>&#8377;${cr(P.mf)} Cr</b><i>${pc(P.mf, P.sb)} of sales</i></div>
</div>

<div class="kpis">
  <div class="k b"><span>Order book</span><b>${live.length} jobs</b><i>&#8377;${cr(bookVal)} Cr &middot; throughput &#8377;${cr(bookTp)} Cr</i></div>
  <div class="k b"><span>Due ${esc(nextLabel)}</span><b>${next.length} jobs</b><i>&#8377;${cr(nextVal)} Cr &middot; ${nextCustRows.length} customers</i></div>
  <div class="k b"><span>Owed to us, net</span><b>&#8377;${cr(net(rec))} Cr</b><i>&#8377;${cr(gross(rec))} Cr billed, less &#8377;${cr(advs(rec))} Cr advances held</i></div>
  <div class="k b"><span>Owed by us, net</span><b>&#8377;${cr(net(pay))} Cr</b><i>&#8377;${cr(gross(pay))} Cr billed, less &#8377;${cr(advs(pay))} Cr paid ahead</i></div>
</div>

<h2>What the year so far says</h2>
<ul class="pts">
  <li><b>Sales run &#8377;${cr(M.length ? d.salesBasic[M[0].key] : 0)} Cr in ${esc(M[0]?.short || "")} to &#8377;${cr(M.length ? d.salesBasic[M[M.length - 1].key] : 0)} Cr in ${esc(M[M.length - 1]?.short || "")}</b>,
      with the last three months carrying <b>${pc(M.slice(-3).reduce((a, x) => a + d.salesBasic[x.key], 0), T.sb)} of everything billed this year</b>.</li>
  <li><b>Overheads are close to flat in rupees while sales climb</b> &mdash; that is the operating story of the year. As a
      share of sales they fall from <b>${pc(d.indirect[M[0]?.key] || 0, d.salesBasic[M[0]?.key] || 0)}</b> in ${esc(M[0]?.short || "")} to
      <b>${pc(d.indirect[posted[posted.length - 1]?.key] || 0, d.salesBasic[posted[posted.length - 1]?.key] || 0)}</b> in ${esc(posted[posted.length - 1]?.short || "")}.
      ${d.overheadByHead[0] ? `<b>${esc(d.overheadByHead[0].head)}</b> at &#8377;${cr(d.overheadByHead[0].total)} Cr is the largest single head, ${pc(d.overheadByHead[0].total, T.sb)} of sales.` : ""}</li>
  <li><b>Buying runs ahead of billing, and should.</b> &#8377;${cr(P.p)} Cr of purchases against &#8377;${cr(P.sb)} Cr of sales is
      ${pc(P.p, P.sb)} &mdash; but the steel for a machine shipping in six months is bought now. <b>The gap is inventory, not
      loss</b>: stock moved ${stockMove >= 0 ? "+" : "−"}&#8377;${cr(Math.abs(stockMove))} Cr over the period.</li>
  <li><b>&#8377;${cr(gross(rec))} Cr of bills are out to customers and &#8377;${cr(advs(rec))} Cr of advances are held against them</b> &mdash;
      a net of <b>&#8377;${cr(net(rec))} Cr</b>. ${bothSidesR} customers carry both at once, which is why the net and not the gross is
      the collectable figure.</li>
  <li><b>The book ahead is ${live.length} jobs worth &#8377;${cr(bookVal)} Cr</b>, of which <b>${next.length} are dated into ${esc(nextLabel)}</b> &mdash;
      ${pc(nextVal, bookVal)} of the book by value, in ${Object.keys(nextFam).length} product families, for ${nextCustRows.length} customers.</li>
</ul>

<h2>What the Board should press on</h2>
<ul class="pts">
  ${!d.stock.dated ? `<li><b>Value the stock every month, and have it signed.</b> One undated pair of numbers is carrying the entire
      gross profit of the company. The stock register takes one figure a month; until those rows are filled, no period's
      margin can be defended.</li>` : ""}
  ${partMonths.length ? `<li><b>Post ${partMonths.map((x) => x.short).join(" and ")}'s purchases.</b> The quarter cannot close on a month
      with its sales in and its bills out.</li>` : ""}
  <li><b>${slipped.length > 0 ? "Nothing on the board is past due, and that is the finding &mdash; not the comfort." : "Delivery against the original commitment."}</b>
      Every target date has been moved: <b>${slipped.length} of the ${both.length} live jobs</b> carrying <b>&#8377;${cr(slipped.reduce((a, j) => a + j.val, 0))} Cr</b>
      now sit beyond the date the customer was given; median slip <b>${median} days</b>, worst ${slipDays[slipDays.length - 1] ?? 0}.
      <b>${otdPast.length} jobs worth &#8377;${cr(otdPast.reduce((a, j) => a + j.val, 0))} Cr are past their original date today.</b></li>
  ${recPos[0] ? `<li><b>${esc(recPos[0].party)} at &#8377;${cr(recPos[0].net)} Cr net</b> &mdash; ${ageOf(recPos[0].oldest, d.on)} days past its oldest
      due date, ${pc(recPos[0].net, net(recPos))} of everything owed to us.</li>` : ""}
</ul>
`, "Figures in Indian crore. Sales are exclusive of GST unless stated.");

  // ---------- 2. trading ----------
  const th = (extra = "&#8377; crore") => `<thead><tr><th class="l">${extra}</th>${M.map((x) =>
    `<th class="${x.partPosted ? "part" : ""}">${esc(x.short)}${x.partPosted ? "*" : ""}</th>`).join("")}<th class="tot">Total</th><th class="pcx">% sales</th></tr></thead>`;
  const row = (label: string, o: Record<string, number>, bold = false) => `<tr class="${bold ? "b" : ""}">
    <td class="l">${label}</td>
    ${M.map((x) => `<td class="${x.partPosted ? "part" : ""}">${crs(o[x.key] || 0)}</td>`).join("")}
    <td class="tot">${crs(sum(o))}</td><td class="pcx">${pc(sum(o), T.sb)}</td></tr>`;
  const derived = (label: string, fn: (k: string) => number, bold = false) =>
    row(label, Object.fromEntries(M.map((x) => [x.key, fn(x.key)])), bold);

  page("Sales, purchases and overheads, month by month", `
<p class="lead">Every figure is added up from the Tally vouchers themselves, not taken from a summary. Proforma invoices are
excluded throughout &mdash; <b>&#8377;${cr(d.proformaBasic)} Cr of them</b> &mdash; because a proforma is an intention, not a booking,
and Tally's own statements skip them. Percentages are against that month's basic sales.</p>
<table class="t">${th()}
<tbody>
${row("Sales — basic", d.salesBasic, true)}
${row("Output GST", d.salesGst)}
${derived("Sales — total billed", (k) => d.salesBasic[k] + d.salesGst[k], true)}
<tr class="gap"><td colspan="${M.length + 3}"></td></tr>
${row("Purchases", d.purch)}
${row("Manufacturing expenses", d.manuf)}
${row("Overheads — indirect", d.indirect)}
${derived("Total spent", (k) => d.purch[k] + d.manuf[k] + d.indirect[k], true)}
<tr class="gap"><td colspan="${M.length + 3}"></td></tr>
${row("Other income", d.indInc)}
${derived("Billed less spent — NOT profit", (k) => d.salesBasic[k] - d.purch[k] - d.manuf[k] - d.indirect[k] + d.indInc[k], true)}
</tbody></table>
${partMonths.length ? `<p class="star">* ${partMonths.map((x) => x.label).join(" and ")} part-posted — sales complete, purchase bills not.</p>` : ""}

<div class="warn sm">
  <b>The last line is not a profit.</b> It is billing less spending, on a cash-and-commitment basis. What turns it into a
  margin is the change in stock &mdash; ${stockMove >= 0 ? "+" : "−"}<b>&#8377;${cr(Math.abs(stockMove))} Cr</b> over this period.
  ${d.stock.dated ? "Valued to " + dmy(d.stock.closingAt) + "." : "Those two figures carry no date, so the conversion is shown on the P&amp;L screen and not restated here as a period figure."}
</div>

<div class="sbs">
  <div>
    <h3>${posted.length < M.length ? "The posted months" : "The year to date"}</h3>
    <table class="t sm">
      <tr><td class="l">Sales, basic</td><td class="r">&#8377;${cr(P.sb)} Cr</td><td class="r">100.0%</td></tr>
      <tr><td class="l">Purchases</td><td class="r">&#8377;${cr(P.p)} Cr</td><td class="r">${pc(P.p, P.sb)}</td></tr>
      <tr><td class="l">Manufacturing expenses</td><td class="r">&#8377;${cr(P.mf)} Cr</td><td class="r">${pc(P.mf, P.sb)}</td></tr>
      <tr><td class="l">Overheads</td><td class="r">&#8377;${cr(P.ix)} Cr</td><td class="r">${pc(P.ix, P.sb)}</td></tr>
      <tr class="b"><td class="l">Total spent</td><td class="r">&#8377;${cr(spendP)} Cr</td><td class="r">${pc(spendP, P.sb)}</td></tr>
      <tr class="b"><td class="l">Billed less spent</td><td class="r">&#8377;${crs(gapP)} Cr</td><td class="r">${pc(gapP, P.sb)}</td></tr>
    </table>
  </div>
  <div>
    <h3>Why a heavy buying month is not a loss</h3>
    <p class="fine">A calendar month is not a matching period in a business that builds to order over four to six months.
    The steel for a machine shipping in September is bought in April and sits as work in progress until it ships. Read the
    monthly columns as <b>what was spent and what was billed</b>, and the trend across them, not as ${M.length} little profit
    statements.</p>
    <h3>The shape of the year</h3>
    <p class="fine">Sales of &#8377;${cr(T.sb)} Cr basic, &#8377;${cr(T.sb + T.sg)} Cr with tax, against an order book of
    &#8377;${cr(bookVal)} Cr still to deliver &mdash; ${pc(bookVal, T.sb)} of everything billed this year, still ahead.</p>
  </div>
</div>
`, "Credits positive, debits negative, as Tally records them.");

  // ---------- 3. overheads ----------
  page("Overheads, by head", `
<p class="lead">Indirect expenses only &mdash; manufacturing expenses sit above the throughput line. Ranked by the
year-to-date total; the percentage is against basic sales of &#8377;${cr(T.sb)} Cr.</p>
<table class="t">${th("Head")}
<tbody>
${d.overheadByHead.slice(0, 22).map((r) => row(esc(r.head), r.per)).join("")}
<tr class="b tl"><td class="l">Total overheads</td>${M.map((x) => `<td class="${x.partPosted ? "part" : ""}">${crs(d.indirect[x.key])}</td>`).join("")}<td class="tot">${crs(T.ix)}</td><td class="pcx">${pc(T.ix, T.sb)}</td></tr>
</tbody></table>
<p class="fine">Heads under &#8377;0.02 Cr for the year are omitted from the listing but are included in the total line.</p>
`);

  // ---------- 4. the book ----------
  page("The order book, by month of delivery", `
<p class="lead">${live.length} live jobs carrying &#8377;${cr(bookVal)} Cr of value and &#8377;${cr(bookTp)} Cr of throughput, placed
in the month their current target delivery date falls.</p>
<table class="t">
<thead><tr><th class="l">Delivery month</th><th>Jobs</th><th>Value &#8377; Cr</th><th>Throughput &#8377; Cr</th><th>T %</th><th>Families</th><th>Customers</th><th>Avg job &#8377; L</th></tr></thead>
<tbody>
${Object.keys(byMonth).sort().map((k) => { const b = byMonth[k];
  const label = k === "(none)" ? "No date set" : new Date(`${k}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const past = k !== "(none)" && k < d.on.slice(0, 7);
  const now = k === d.on.slice(0, 7);
  return `<tr class="${past ? "late" : now ? "now" : ""}"><td class="l">${esc(label)}${past ? ' <i class="tag">past due</i>' : now ? ' <i class="tag n">this month</i>' : ""}</td>
  <td>${b.n}</td><td>${cr(b.v)}</td><td>${cr(b.t)}</td><td>${pc(b.t, b.v)}</td><td>${b.fams.size}</td><td>${b.custs.size}</td><td>${(b.v / b.n / LAKH).toFixed(1)}</td></tr>`; }).join("")}
<tr class="b tl"><td class="l">Total book</td><td>${live.length}</td><td>${cr(bookVal)}</td><td>${cr(bookTp)}</td><td>${pc(bookTp, bookVal)}</td>
  <td>${new Set(live.map((j) => j.fam).filter(Boolean)).size}</td><td>${new Set(live.map((j) => j.cust).filter(Boolean)).size}</td><td>${live.length ? (bookVal / live.length / LAKH).toFixed(1) : "—"}</td></tr>
</tbody></table>

<h2>${esc(nextLabel)} &mdash; the product families due</h2>
<table class="t">
<thead><tr><th class="l">Product family</th><th>Jobs</th><th>Value &#8377; Cr</th><th>Share of the month</th></tr></thead>
<tbody>
${Object.entries(nextFam).sort((a, b) => b[1].v - a[1].v).map(([f, v]) =>
  `<tr><td class="l">${esc(f)}</td><td>${v.n}</td><td>${cr(v.v)}</td><td>${pc(v.v, nextVal)}</td></tr>`).join("")}
</tbody></table>
<p class="fine">${Object.keys(nextFam).length} different families in one month is the operational point: ${esc(nextLabel)} is not one
production run repeated, it is ${Object.keys(nextFam).length} kinds of machine leaving the same gate.</p>
`);

  // ---------- 5. commitment ----------
  page("Delivery commitment — the promise against the plan", `
<p class="lead">The delivery board shows nothing past due. That is true of the <b>target</b> date, which planning moves. It
is not true of the <b>OTD</b> &mdash; the date the customer was originally given, which does not move. Setting the two side by
side is the only honest measure of delivery performance this company has.</p>

<div class="kpis">
  <div class="k b"><span>Past their original date</span><b>${otdPast.length} of ${both.length}</b><i>&#8377;${cr(otdPast.reduce((a, j) => a + j.val, 0))} Cr of the book</i></div>
  <div class="k b"><span>Target moved beyond the OTD</span><b>${slipped.length} jobs</b><i>&#8377;${cr(slipped.reduce((a, j) => a + j.val, 0))} Cr &middot; ${pc(slipped.reduce((a, j) => a + j.val, 0), bookVal)} of the book</i></div>
  <div class="k b"><span>Median slip</span><b>${median} days</b><i>worst ${slipDays[slipDays.length - 1] ?? 0}</i></div>
  <div class="k b"><span>Still inside the promise</span><b>${held.length} jobs</b><i>&#8377;${cr(held.reduce((a, j) => a + j.val, 0))} Cr</i></div>
</div>

<h2>How far the dates have moved</h2>
<table class="t">
<thead><tr><th class="l">Slip from the original committed date</th><th>Jobs</th><th>Value &#8377; Cr</th><th>Share of the book</th></tr></thead>
<tbody>
<tr><td class="l">Still on or inside the OTD</td><td>${held.length}</td><td>${cr(held.reduce((a, j) => a + j.val, 0))}</td><td>${pc(held.reduce((a, j) => a + j.val, 0), bookVal)}</td></tr>
${([[1, 30, "1 to 30 days"], [31, 90, "31 to 90 days"], [91, 180, "91 to 180 days"], [181, null, "more than 180 days"]] as [number, number | null, string][])
  .map(([lo, hi, label]) => { const g = bucket(lo, hi); const v = g.reduce((a, j) => a + j.val, 0);
    return `<tr class="${lo >= 181 ? "late" : lo >= 91 ? "now" : ""}"><td class="l">${label}</td><td>${g.length}</td><td>${cr(v)}</td><td>${pc(v, bookVal)}</td></tr>`; }).join("")}
<tr class="b tl"><td class="l">Live book</td><td>${both.length}</td><td>${cr(bookVal)}</td><td>100.0%</td></tr>
</tbody></table>

<h2>The ten that have moved furthest</h2>
<table class="t jt">
<thead><tr><th class="l">Job</th><th class="l">Customer tag</th><th>Original OTD</th><th>Target now</th><th>Slip</th><th>Value &#8377;L</th><th>Kit</th><th>Prod</th></tr></thead>
<tbody>
${slipped.slice(0, 10).map((j) => `<tr><td class="l mono">${esc(j.id.slice(-4))}</td>
<td class="l">${esc(j.tag.slice(0, 40))}</td><td>${dmy(j.otd)}</td><td>${dmy(j.tdd)}</td>
<td class="rd">${gap(j.otd!, j.tdd!)}d</td><td>${(j.val / LAKH).toFixed(1)}</td><td>${j.kit}%</td><td>${j.pct}%</td></tr>`).join("")}
</tbody></table>
<p class="fine">Slip is measured between the ERP's OTD Date and its current Target Delivery Date, on live jobs only.
Delivered work is not in this table; this is the promise still outstanding.</p>
`, "OTD is the committed date. TDD is what the plant is working to.");

  // ---------- 6. next month by customer ----------
  page(`Next month — ${nextLabel}, by customer`, `
<p class="lead"><b>${next.length} jobs &middot; &#8377;${cr(nextVal)} Cr &middot; throughput &#8377;${cr(nextTp)} Cr &middot; ${nextCustRows.length} customers.</b>
Ranked by value. The last column is what that customer already owes us net, so the delivery and the collection read together.</p>
<table class="t">
<thead><tr><th class="l">Customer</th><th>Jobs</th><th>Value &#8377; Cr</th><th>Throughput &#8377; Cr</th><th>T %</th><th>Families</th><th class="pcx">Owed now &#8377; Cr</th></tr></thead>
<tbody>
${nextCustRows.map(([name, c]) => {
  const key = String(name).toLowerCase().slice(0, 12);
  const owed = rec.filter((r) => r.party.toLowerCase().includes(key)).reduce((a, r) => a + r.net, 0);
  return `<tr><td class="l">${esc(name)}</td><td>${c.n}</td><td>${cr(c.v)}</td><td>${cr(c.t)}</td><td>${pc(c.t, c.v)}</td><td>${c.fams.size}</td><td class="pcx">${owed ? crs(owed) : "&mdash;"}</td></tr>`;
}).join("")}
<tr class="b tl"><td class="l">Total</td><td>${next.length}</td><td>${cr(nextVal)}</td><td>${cr(nextTp)}</td><td>${pc(nextTp, nextVal)}</td><td>${Object.keys(nextFam).length}</td><td class="pcx"></td></tr>
</tbody></table>
<p class="fine">"Owed now" is that customer's net position &mdash; their bills less their own advances &mdash; matched on the name
as the books spell it. A dash means nothing outstanding.</p>
`);

  // ---------- 7+. next month by job ----------
  const jobRow = (j: BoardJobRow) => `<tr><td class="l mono">${esc(j.id.slice(-4))}</td>
<td class="l">${esc(j.tag.slice(0, 44))}</td><td class="l">${esc(j.fam.slice(0, 26))}</td>
<td>${dmy(j.tdd)}</td><td>${j.val / LAKH >= 0.01 ? (j.val / LAKH).toFixed(1) : "&mdash;"}</td>
<td>${j.tp / LAKH >= 0.01 ? (j.tp / LAKH).toFixed(1) : "&mdash;"}</td><td>${j.kit}%</td><td>${j.pct}%</td></tr>`;
  const jobHead = `<thead><tr><th class="l">Job</th><th class="l">Customer tag</th><th class="l">Product family</th><th>TDD</th><th>Value &#8377;L</th><th>T &#8377;L</th><th>Kit</th><th>Prod</th></tr></thead>`;
  const CHUNK = 34;
  for (let i = 0; i < next.length; i += CHUNK) {
    const part = next.slice(i, i + CHUNK);
    page(`Next month — ${nextLabel}, by job${next.length > CHUNK ? ` (${Math.floor(i / CHUNK) + 1} of ${Math.ceil(next.length / CHUNK)})` : ""}`, `
${i === 0 ? `<p class="lead">All ${next.length} jobs dated into ${esc(nextLabel)}, in delivery order. Values in lakh. <b>Kit</b> is material
kitted, <b>Prod</b> is production complete &mdash; together they say whether a date is a plan or a hope.</p>` : ""}
<table class="t jt">${jobHead}<tbody>${part.map(jobRow).join("")}</tbody></table>
${i + CHUNK >= next.length ? `<p class="fine">A job showing 0% kitted with days to run is the one to ask about: the material has not
been called, so the date rests on nothing yet.</p>` : ""}
`);
  }

  // ---------- receivables ----------
  const ageCell = (r: { oldest: string | null }) => {
    const a = ageOf(r.oldest, d.on);
    return `<td class="${a && a > 180 ? "rd" : a && a > 90 ? "am" : ""}">${a == null ? "&mdash;" : a > 0 ? a : "current"}</td>`;
  };
  const moneyPage = (title: string, who: string, rows: typeof recPos, all: typeof rec, bothSides: number, lead: string, foot: string) => {
    const top = rows.slice(0, 30);
    let run = 0; const tot = net(rows);
    page(title, `
<p class="lead">${lead}</p>
<table class="t">
<thead><tr><th class="l">${who}</th><th>Bills</th><th>Billed &#8377; Cr</th><th>Advance &#8377; Cr</th><th>Net &#8377; Cr</th><th>Oldest due</th><th>Days</th><th class="pcx">Cum %</th></tr></thead>
<tbody>
${top.map((r) => { run += r.net; return `<tr><td class="l">${esc(r.party.slice(0, 44))}</td><td>${r.n}</td>
<td>${cr(r.gross)}</td><td>${r.adv ? cr(Math.abs(r.adv)) : "&mdash;"}</td><td class="b2">${cr(r.net)}</td>
<td>${dmy(r.oldest)}</td>${ageCell(r)}<td class="pcx">${pc(run, tot)}</td></tr>`; }).join("")}
<tr class="b tl"><td class="l">Top ${top.length} of ${rows.length}</td><td>${top.reduce((a, r) => a + r.n, 0)}</td>
  <td>${cr(top.reduce((a, r) => a + r.gross, 0))}</td><td>${cr(Math.abs(top.reduce((a, r) => a + r.adv, 0)))}</td>
  <td class="b2">${cr(top.reduce((a, r) => a + r.net, 0))}</td><td colspan="2"></td>
  <td class="pcx">${pc(top.reduce((a, r) => a + r.net, 0), tot)}</td></tr>
</tbody></table>
<p class="fine">${foot}</p>
`);
  };

  moneyPage("Owed to us — customers, highest first", "Customer", recPos, rec, bothSidesR,
    `<b>&#8377;${cr(gross(rec))} Cr</b> of bills are out to customers; <b>&#8377;${cr(advs(rec))} Cr</b> of advances are held against them;
     the <b>net is &#8377;${cr(net(rec))} Cr</b>. Each line is that customer's OWN balance, bills less their own advance &mdash; an advance is
     never applied to a different customer's debt. <b>${bothSidesR} customers carry both at once.</b> Proforma invoices are excluded.`,
    `"Days" is measured from the oldest unpaid bill's due date to ${dmy(d.on)}. A party with hundreds of open bills is a
     reconciliation matter rather than a collection one.`);

  moneyPage("Owed by us — suppliers, highest first", "Supplier", payPos, pay, bothSidesP,
    `<b>&#8377;${cr(gross(pay))} Cr</b> of supplier bills stand against <b>&#8377;${cr(advs(pay))} Cr</b> we have already paid ahead,
     a <b>net of &#8377;${cr(net(pay))} Cr</b>. <b>${bothSidesP} suppliers carry both at once.</b>`,
    `Working capital, net of every advance on both sides: <b>&#8377;${cr(net(rec))} Cr</b> due in against <b>&#8377;${cr(net(pay))} Cr</b>
     due out &mdash; a gap of <b>&#8377;${cr(net(rec) - net(pay))} Cr</b> in our favour.`);

  // ---------- advances + basis ----------
  page("Advances held and advances paid", `
<p class="lead">The two sides a single net figure hides. A customer's advance is netted against <b>that customer's</b> bills
and no one else's, so these are shown whole.</p>
<div class="sbs">
<div>
<h3>Customer advances we hold &mdash; &#8377;${cr(advs(rec))} Cr</h3>
<table class="t sm"><thead><tr><th class="l">Customer</th><th>&#8377; Cr</th></tr></thead><tbody>
${recNeg.slice(0, 16).map((r) => `<tr><td class="l">${esc(r.party.slice(0, 32))}</td><td>${cr(Math.abs(r.net))}</td></tr>`).join("")}
<tr class="b tl"><td class="l">${recNeg.length} in credit overall</td><td>${cr(Math.abs(recNeg.reduce((a, r) => a + r.net, 0)))}</td></tr>
</tbody></table>
<p class="fine">Money received against work not yet billed. It funds the build &mdash; and it is a liability until the machine ships.</p>
</div>
<div>
<h3>Advances we have paid suppliers &mdash; &#8377;${cr(advs(pay))} Cr</h3>
<table class="t sm"><thead><tr><th class="l">Supplier</th><th>&#8377; Cr</th></tr></thead><tbody>
${payNeg.slice(0, 16).map((r) => `<tr><td class="l">${esc(r.party.slice(0, 32))}</td><td>${cr(Math.abs(r.net))}</td></tr>`).join("")}
<tr class="b tl"><td class="l">${payNeg.length} in credit overall</td><td>${cr(Math.abs(payNeg.reduce((a, r) => a + r.net, 0)))}</td></tr>
</tbody></table>
<p class="fine">Our cash sitting with somebody else. Where it is old and the material has arrived, it is an unadjusted entry
in Tally rather than a real advance &mdash; and should be cleared.</p>
</div>
</div>

<h2>Basis of preparation</h2>
<ul class="pts">
<li><b>Source.</b> The Tally day book as uploaded to Kuber: ${d.vouchers.toLocaleString("en-IN")} vouchers and
${d.lines.toLocaleString("en-IN")} ledger lines, to ${dmy(d.booksTo)}. Nothing is taken from a summary sheet; every figure is
added up from the entries.</li>
<li><b>Proformas excluded</b> &mdash; &#8377;${cr(d.proformaBasic)} Cr from sales, and from the bills as well. A proforma is an
intention, not a booking.</li>
<li><b>Classification</b> follows the groups in the books themselves &mdash; Sales Accounts, Purchase Accounts, Manufacturing
Expenses, Indirect Expenses &mdash; not a mapping invented for this report.</li>
<li><b>Advances are netted per party and never across parties</b>, so the collectable figure is each name's own balance.</li>
<li><b>The job register</b> is Genie's, synced from the ERP Jobmaster, read at ${dmy(d.on)}. "Live" means the ERP's own status of
Jobs in Process. Value and throughput are the Jobmaster's figures.</li>
${d.stock.dated
  ? `<li><b>Stock</b> is read from the month-end register: &#8377;${cr(d.stock.opening)} Cr at ${dmy(d.stock.openingAt)} and
     &#8377;${cr(d.stock.closing)} Cr at ${dmy(d.stock.closingAt)}.</li>`
  : `<li><b>Stock is not dated.</b> Tally carries no stock value; the two figures used are typed in Genie and belong to no
     particular day, which is why no period margin is stated.</li>`}
</ul>
`, "Prepared for the Board of Nandan GSE. Figures in Indian crore unless marked lakh.");

  return shell(pages);
}

function shell(pages: string[]): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Nandan GSE — Board Report</title>
<style>
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; }
body { margin:0; font-family: Georgia, "Times New Roman", serif; color:#1A1A1A; background:#E9E7E0;
       -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.pg { width:210mm; height:297mm; background:#fff; padding:14mm 15mm 12mm; position:relative;
      page-break-after: always; display:flex; flex-direction:column; }
.pg:last-child { page-break-after: auto; }
.ph { display:flex; justify-content:space-between; align-items:baseline; border-bottom:.6mm solid #12386B;
      padding-bottom:2mm; margin-bottom:4mm; gap:6mm; }
.pt { font-size:12.5pt; font-weight:bold; color:#12386B; letter-spacing:-.01em; }
.pm { font-size:7.5pt; color:#7A7A72; letter-spacing:.06em; text-transform:uppercase;
      font-family:Helvetica,Arial,sans-serif; white-space:nowrap; }
.pb { flex:1; min-height:0; overflow:hidden; }
.pf { border-top:.3mm solid #D8D5CC; padding-top:2mm; margin-top:3mm; display:flex; justify-content:space-between;
      font-size:7pt; color:#8B8F87; font-family:Helvetica,Arial,sans-serif; }
.pn { font-weight:bold; color:#12386B; }
.hero { display:flex; gap:6mm; align-items:center; margin-bottom:4mm; }
.logo { height:16mm; }
h1 { font-size:20pt; margin:0; color:#12386B; letter-spacing:-.02em; }
.sub { font-size:10pt; color:#46545F; margin-top:1mm; }
.sub2 { font-size:8.5pt; color:#7A7A72; margin-top:.8mm; }
h2 { font-size:11pt; color:#12386B; margin:5mm 0 2mm; padding-bottom:1mm; border-bottom:.2mm solid #D8D5CC; }
h3 { font-size:9.5pt; color:#12386B; margin:3mm 0 1.5mm; }
.lead { font-size:9pt; line-height:1.5; margin:0 0 3mm; color:#33383D; }
.fine { font-size:7.6pt; line-height:1.45; color:#6B6B63; margin:2mm 0 0; font-style:italic; }
.warn { border-left:1.2mm solid #B3392E; background:#FBF3F2; padding:3mm 4mm; font-size:8.6pt; line-height:1.5;
        margin-bottom:4mm; color:#5E2A24; }
.warn.sm { font-size:8pt; padding:2.5mm 3.5mm; margin:3mm 0 0; }
.kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:2.5mm; margin-bottom:3mm; }
.k { border:.25mm solid #D8D5CC; border-top:.9mm solid #12386B; border-radius:1mm; padding:2.5mm 3mm; }
.k.b { border-top-color:#E4610F; }
.k span { display:block; font-size:7pt; letter-spacing:.06em; text-transform:uppercase; color:#7A7A72;
          font-family:Helvetica,Arial,sans-serif; }
.k b { display:block; font-size:14pt; color:#12386B; margin:.8mm 0 .3mm; letter-spacing:-.02em; }
.k.b b { color:#16232F; }
.k i { display:block; font-size:7.4pt; color:#6B6B63; font-style:normal; }
ul.pts { margin:0; padding-left:5mm; }
ul.pts li { font-size:8.8pt; line-height:1.5; margin-bottom:2mm; color:#33383D; }
table.t { width:100%; border-collapse:collapse; font-family:Helvetica,Arial,sans-serif; font-size:7.8pt; }
table.t th { background:#12386B; color:#fff; font-weight:bold; padding:1.6mm 1.2mm; text-align:right; font-size:7pt; }
table.t th.l { text-align:left; }
table.t td { padding:1.35mm 1.2mm; text-align:right; border-bottom:.2mm solid #EDEBE4; font-variant-numeric:tabular-nums; }
table.t td.l { text-align:left; }
table.t tr:nth-child(even) td { background:#FAF9F6; }
table.t tr.b td { font-weight:bold; background:#F1F0EA !important; }
table.t tr.tl td { border-top:.4mm solid #12386B; }
table.t tr.gap td { height:1.6mm; border:none; background:#fff !important; }
table.t td.tot { font-weight:bold; border-left:.2mm solid #D8D5CC; }
table.t td.b2 { font-weight:bold; }
table.t td.pcx, table.t th.pcx { color:#6B6B63; border-left:.2mm solid #D8D5CC; }
table.t tr.b td.pcx { color:#1A1A1A; }
table.t tr.late td { background:#FDF4F3 !important; }
table.t tr.now td { background:#FFF9EC !important; }
table.t th.part { background:#8A5B00; }
table.t td.part { background:#FFFBF0 !important; color:#7A5B00; }
table.t tr.b td.part { background:#FCF4E2 !important; }
table.t.sm { font-size:7.4pt; }
table.t.jt { font-size:7pt; }
table.t.jt td { padding:1.05mm 1mm; }
.star { font-size:7.4pt; color:#7A5B00; margin:1.5mm 0 0; font-family:Helvetica,Arial,sans-serif; }
.mono { font-family:"SF Mono",Menlo,Consolas,monospace; font-weight:bold; color:#12386B; }
.rd { color:#B3392E; font-weight:bold; }
.am { color:#B45309; font-weight:bold; }
.r { text-align:right; }
i.tag { font-style:normal; font-size:6.2pt; background:#B3392E; color:#fff; padding:.3mm 1.2mm; border-radius:.6mm;
        vertical-align:middle; margin-left:1.5mm; }
i.tag.n { background:#B45309; }
.sbs { display:grid; grid-template-columns:1fr 1fr; gap:6mm; margin-top:4mm; }
</style></head><body>
${pages.join("\n")}
</body></html>`;
}
