import { esc } from "@/lib/fmt";
import { LOGO } from "@/lib/logo";
import type { CfoData, Line, Section, AgeRow } from "@/lib/cfo-report-data";

/**
 * THE CFO MONTHLY REPORT — A4, page-numbered, one month, from the books.
 *
 * Dr Raghu, 30 Sep 2026: "This is level 1. Now make it Level 10. Make a
 * beautiful report."
 *
 * What "level 10" means here, concretely: every figure has the same month a
 * year ago beside it and the year to date under it, so nothing is read
 * without its comparison; every ratio prints its own arithmetic; every head
 * opens to the ledgers that made it; and the last page says plainly what the
 * XML could not supply, instead of leaving a blank the reader has to guess
 * about. The sheet had numbers. This has numbers with their reasons.
 *
 * PAGES ARE FIXED BOXES, NOT FLOW — 210 x 297mm each with its own footer, so
 * the page count is decided here and never by a print dialog.
 */

const CR = 1e7, LK = 1e5;
const cr = (n: number) => `${n < 0 ? "−" : ""}${(Math.abs(n) / CR).toFixed(2)}`;
const lk = (n: number) => `${n < 0 ? "−" : ""}${(Math.abs(n) / LK).toFixed(2)}`;
const pct = (v: number | null | undefined) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(Math.abs(v) >= 10 ? 0 : Math.abs(v) >= 2 ? 1 : 2)}%`);
const dmy = (s: string | null | undefined) => (s ? String(s).split("-").reverse().join("-") : "—");
const dot = (n: number, f: (x: number) => string) => (Math.abs(n) < 0.5 ? '<span class="dot">·</span>' : f(n));
const arrow = (now: number | null | undefined, before: number | null | undefined, goodUp: boolean) => {
  if (now == null || before == null || !isFinite(now) || !isFinite(before) || Math.abs(now - before) < 1e-9) return "";
  const up = now > before;
  return `<span class="${up === goodUp ? "good" : "bad"}">${up ? "▲" : "▼"}</span>`;
};

export function cfoReportHtml(d: CfoData): string {
  const pages: string[] = [];
  const lyLabel = new Date(`${d.lyMonth}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  const mLabel = new Date(`${d.month}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  const ytdLabel = `Apr ${d.fyStart.slice(2, 4)} – ${mLabel}`;
  const ytdLyLabel = `Apr ${String(Number(d.fyStart.slice(0, 4)) - 1).slice(2)} – ${lyLabel}`;

  /* ---------- page 1: cover + the dashboard ---------- */
  const GOOD_UP = new Set(["revenue", "gm", "gm_pct", "np", "np_pct", "wc_turn", "inv_turn", "current_ratio", "quick_ratio", "roi", "rowc"]);
  const kpiCell = (k: CfoData["kpi"][number]) => {
    const v = k.value;
    const show = v == null ? "—" : k.unit === "rs" ? `₹${cr(v)} Cr` : k.unit === "%" ? pct(v) : k.unit === "days" ? `${Math.round(v)} days` : v.toFixed(2);
    const goodUp = GOOD_UP.has(k.key);
    return `<div class="kpi"><div class="kl">${esc(k.label)}</div><div class="kv">${show}${arrow(v, k.ly, goodUp)}</div>
      <div class="kf">${esc(k.formula)}${k.ly != null && k.unit === "rs" ? ` · ${lyLabel} ₹${cr(k.ly)} Cr` : k.ly != null && k.unit === "%" ? ` · ${lyLabel} ${pct(k.ly)}` : ""}</div></div>`;
  };
  pages.push(`
    <div class="cover">
      <img class="logo" src="${LOGO}" alt="" />
      <div class="co">Nandan Ground Support Equipment Private Limited</div>
      <h1>CFO Monthly Report</h1>
      <div class="for">${esc(d.monthLabel)}</div>
      <div class="meta">Financial year ${esc(d.fy)} · books to ${dmy(d.booksTo)} · ${d.vouchers.toLocaleString("en-IN")} vouchers</div>
      ${d.monthPosted.partPosted ? `<div class="warn">This month carries ${d.monthPosted.purchaseVouchers} purchase vouchers against a norm of ${d.monthPosted.norm} — it is part-posted, and every ratio on these pages is flattered until the rest is entered.</div>` : ""}
    </div>
    <h2>Management summary</h2>
    <div class="kpis">${d.kpi.map(kpiCell).join("")}</div>
    <p class="note">Arrows read against ${esc(lyLabel)}; green means the movement is the good direction for that figure. Every ratio states its own arithmetic. Figures in ₹ crores.</p>`);

  /* ---------- page 2–3: the detailed P&L ---------- */
  const lineRow = (l: Line, cls = "", indent = 0) => `
    <tr class="${cls}"><td style="padding-left:${6 + indent * 14}px">${esc(l.label)}</td>
      <td class="n">${dot(l.cur, cr)}</td><td class="n muted">${dot(l.ly, cr)}</td>
      <td class="n">${dot(l.ytd, cr)}</td><td class="n muted">${dot(l.ytdLy, cr)}</td>
      <td class="n pc">${pct(l.pct)}</td><td class="n pc muted">${pct(l.pctLy)}</td></tr>`;
  const secRows = (s: Section, cls = "head", showKids = true, limit = 14) => {
    const kids = showKids ? s.lines.slice(0, limit) : [];
    const rest = s.lines.length - kids.length;
    return lineRow(s.total, cls) + kids.map((l) => lineRow(l, "kid", 1)).join("") +
      (rest > 0 ? `<tr class="kid"><td style="padding-left:20px" class="muted">… and ${rest} smaller ledgers, inside the total above</td><td colspan="6"></td></tr>` : "");
  };
  const pnlHead = `<thead><tr><th>Particulars</th><th class="n">${esc(mLabel)}</th><th class="n muted">${esc(lyLabel)}</th><th class="n">${esc(ytdLabel)}</th><th class="n muted">${esc(ytdLyLabel)}</th><th class="n">% sales</th><th class="n muted">% LY</th></tr></thead>`;
  const P = d.pnl;
  pages.push(`
    <h2>Profit &amp; Loss — trading account</h2>
    <p class="note">This month beside the same month last year; the year to date beside last year to the same date. Percentages are of the year's revenue. ₹ crores.</p>
    <table class="t">${pnlHead}<tbody>
      ${secRows(P.sales, "total")}
      <tr class="gap"><td colspan="7"></td></tr>
      ${lineRow(P.cogs.opening, "kid")}${lineRow(P.cogs.purchases, "kid")}${lineRow(P.cogs.closing, "kid")}
      ${lineRow(P.cogs.total, "total")}
      ${secRows(P.manuf, "head", true, 10)}
      ${lineRow(P.grossProfit, "grand")}
    </tbody></table>
    <p class="note">${esc(P.cogs.stockNote)}</p>`);
  pages.push(`
    <h2>Profit &amp; Loss — income statement</h2>
    <table class="t">${pnlHead}<tbody>
      ${secRows(P.otherIncome, "head", true, 6)}
      <tr class="gap"><td colspan="7"></td></tr>
      ${secRows(P.indirect.admin, "head", true, 10)}
      ${secRows(P.indirect.finance, "head", true, 5)}
      ${secRows(P.indirect.employee, "head", true, 8)}
      ${secRows(P.indirect.selling, "head", true, 5)}
      ${lineRow(P.indirect.total, "total")}
      ${lineRow(P.depreciation, "kid")}
      ${lineRow(P.netProfit, "grand")}
    </tbody></table>
    <p class="note">The four indirect heads are the sheet's own — Administrative, Finance, Employee Benefit, Selling &amp; Distribution — mapped from Genie's twelve operating-expense heads by one rule, so the same ledger cannot land in two of them. Depreciation is struck monthly on WDV (next page) rather than waiting for the year-end journal, so no month reads flattered.</p>`);

  /* ---------- page 4: depreciation ---------- */
  const dep = d.dep;
  pages.push(`
    <h2>Depreciation schedule — property, plant &amp; equipment</h2>
    <p class="note">${esc(dep.note)} ₹ lakhs.</p>
    <table class="t small"><thead><tr><th>Class</th><th class="n">Rate %</th><th class="n">Gross 1 Apr</th><th class="n">Additions</th><th class="n">Deductions</th><th class="n">Gross ${esc(dmy(d.monthEnd))}</th><th class="n">Acc. dep 1 Apr</th><th class="n">Charge to date</th><th class="n">Acc. dep now</th><th class="n">Net block</th></tr></thead><tbody>
      ${dep.rows.map((r) => `<tr><td>${esc(r.label)} <span class="muted">· ${r.ledgers}</span></td><td class="n">${r.rate == null ? "—" : r.rate.toFixed(2)}</td><td class="n">${lk(r.grossOpen)}</td><td class="n">${dot(r.additions, lk)}</td><td class="n">${dot(r.deductions, lk)}</td><td class="n">${lk(r.grossClose)}</td><td class="n">${lk(r.accOpen)}</td><td class="n">${dot(r.charge, lk)}</td><td class="n">${lk(r.accClose)}</td><td class="n b">${lk(r.netClose)}</td></tr>`).join("")}
      <tr class="total"><td>Total</td><td></td><td class="n">${lk(dep.rows.reduce((a, r) => a + r.grossOpen, 0))}</td><td class="n">${lk(dep.rows.reduce((a, r) => a + r.additions, 0))}</td><td class="n">${lk(dep.rows.reduce((a, r) => a + r.deductions, 0))}</td><td class="n">${lk(dep.rows.reduce((a, r) => a + r.grossClose, 0))}</td><td class="n">${lk(dep.rows.reduce((a, r) => a + r.accOpen, 0))}</td><td class="n">${lk(dep.rows.reduce((a, r) => a + r.charge, 0))}</td><td class="n">${lk(dep.rows.reduce((a, r) => a + r.accClose, 0))}</td><td class="n b">${lk(dep.rows.reduce((a, r) => a + r.netClose, 0))}</td></tr>
    </tbody></table>
    <div class="box">
      <b>Why this table exists.</b> Tally carries one depreciation journal a year — ${dep.posted ? `₹${lk(dep.posted)} L this year` : "none yet this year"}${dep.postedOn ? `, last on ${dmy(dep.postedOn)}` : ""}. A monthly P&amp;L that waits for it reads eleven months of profit that is not there. The charge above is struck from the asset ledgers the XML does carry, at the rate typed per class, ${dep.monthsElapsed} of 12 months; additions in the year are charged for half the elapsed period, the convention for assets whose date in the year is not known. When Suresh books the monthly journal in Tally the two figures will meet.
    </div>`);

  /* ---------- page 5: twelve months ---------- */
  const M = d.monthly;
  pages.push(`
    <h2>Monthly Profit &amp; Loss — the last twelve months</h2>
    <p class="note">₹ lakhs. Gross profit and net profit are struck the same way as the pages before; the depreciation row is the monthly WDV charge.</p>
    <table class="t tiny"><thead><tr><th>Particulars</th>${M.cols.map((c) => `<th class="n">${esc(c.label)}</th>`).join("")}</tr></thead><tbody>
      ${M.rows.map((r) => `<tr class="${r.bold ? "total" : ""}"><td>${esc(r.label)}</td>${r.vals.map((v) => `<td class="n ${v < 0 && /gp|np/.test(r.key) ? "neg" : ""}">${dot(v, lk)}</td>`).join("")}</tr>`).join("")}
    </tbody></table>`);

  /* ---------- page 6: variance ---------- */
  const Vr = d.variance;
  const vRow = (r: CfoData["variance"]["rows"][number]) => {
    const vb = r.actual - r.budget, vp = r.actual - r.py;
    return `<tr><td>${esc(r.label)}</td><td class="n">${cr(r.actual)}</td><td class="n muted">${cr(r.budget)}</td><td class="n muted">${cr(r.py)}</td>
      <td class="n ${vb < 0 ? "neg" : ""}">${cr(vb)}</td><td class="n pc">${r.budget ? pct((vb / Math.abs(r.budget)) * 100) : "—"}</td>
      <td class="n ${vp < 0 ? "neg" : ""}">${cr(vp)}</td><td class="n pc">${r.py ? pct((vp / Math.abs(r.py)) * 100) : "—"}</td></tr>`;
  };
  pages.push(`
    <h2>Variance — actual against ${Vr.basis === "budget" ? "budget" : "break-even"} and against last year</h2>
    <p class="note">${esc(Vr.note)} Year to date, ₹ crores.</p>
    <table class="t"><thead><tr><th>Particulars</th><th class="n">Actual YTD</th><th class="n muted">${Vr.basis === "budget" ? "Budget YTD" : "Break-even"}</th><th class="n muted">PY YTD</th><th class="n">vs ${Vr.basis === "budget" ? "budget" : "B/E"}</th><th class="n">%</th><th class="n">vs PY</th><th class="n">%</th></tr></thead><tbody>
      ${Vr.rows.map(vRow).join("")}
    </tbody></table>
    ${Vr.basis === "breakeven" ? `<div class="box"><b>To read this against a real budget</b>, nine figures need typing once for ${esc(d.fy)} — revenue, other income, COGS, manufacturing, and the four indirect heads, plus depreciation. The XML will never carry them; they are a decision, not a record. The column then switches from break-even to budget on its own.</div>` : ""}`);

  /* ---------- page 7: balance sheet ---------- */
  const bsSide = (title: string, list: CfoData["bs"]["sources"], total: number) => `
    <table class="t half"><thead><tr><th>${esc(title)}</th><th class="n">₹ Cr</th><th class="n">%</th></tr></thead><tbody>
      ${list.map((r) => `<tr class="head"><td>${esc(r.root)}</td><td class="n">${cr(r.total)}</td><td class="n pc">${total ? pct((r.total / total) * 100) : "—"}</td></tr>` +
        r.groups.slice(0, 6).map((g) => `<tr class="kid"><td style="padding-left:18px">${esc(g.name)}</td><td class="n muted">${cr(g.amount)}</td><td></td></tr>`).join("")).join("")}
    </tbody></table>`;
  const bs = d.bs;
  pages.push(`
    <h2>Balance sheet as at ${dmy(d.monthEnd)}</h2>
    <div class="two">
      <div>${bsSide("Sources of funds", [...bs.sources, { root: "Profit & Loss A/c", total: bs.pnlToDate, groups: [{ name: "Opening balance", amount: bs.pnlOpening }, { name: "Current period", amount: bs.pnlToDate - bs.pnlOpening }] }], bs.totalS)}
        <div class="tot">Total ₹${cr(bs.totalS)} Cr</div></div>
      <div>${bsSide("Application of funds", bs.applications, bs.totalA)}
        <div class="tot">Total ₹${cr(bs.totalA)} Cr</div></div>
    </div>
    <p class="note">Every ledger's closing at the month end — the one opening Tally exported, walked forward. ${Math.abs(bs.totalS - bs.totalA) > 1e5 ? `<b>The two sides differ by ₹${cr(bs.totalS - bs.totalA)} Cr</b> — the difference is the P&amp;L of the year not yet closed into reserves plus any ledger whose group sits outside the two sides; it is reported, not hidden.` : "The two sides agree."}</p>`);

  /* ---------- page 8: receipts and payments ---------- */
  const C = d.cash;
  const cashSide = (title: string, list: CfoData["cash"]["receipts"], total: number) => `
    <table class="t half"><thead><tr><th>${esc(title)}</th><th class="n">₹ L</th></tr></thead><tbody>
      ${list.map((r) => `<tr class="head"><td>${esc(r.root)}</td><td class="n">${lk(r.total)}</td></tr>` + r.groups.slice(0, 6).map((g) => `<tr class="kid"><td style="padding-left:18px">${esc(g.name)}</td><td class="n muted">${lk(g.amount)}</td></tr>`).join("")).join("")}
      <tr class="total"><td>${title === "Receipts" ? "Nett receipts" : "Nett payments"}</td><td class="n">${lk(total)}</td></tr>
    </tbody></table>`;
  const bal = (b: { bank: number; cash: number; od: number }) => `Bank ₹${lk(b.bank)} L · Cash ₹${lk(b.cash)} L · OD drawn ₹${lk(Math.abs(b.od))} L → <b>net ₹${lk(b.bank + b.cash + b.od)} L</b>`;
  pages.push(`
    <h2>Receipts and payments — ${esc(d.monthLabel)}</h2>
    <p class="note">Opening: ${bal(C.opening)}</p>
    <div class="two"><div>${cashSide("Receipts", C.receipts, C.totalIn)}</div><div>${cashSide("Payments", C.payments, C.totalOut)}</div></div>
    <p class="note">Closing: ${bal(C.closing)}. The non-bank side of every Receipt and Payment voucher, grouped as the sheet groups it. An overdraft is borrowing, shown apart from cash.</p>`);

  /* ---------- page 9–10: ageing ---------- */
  const ageTable = (title: string, a: { rows: AgeRow[]; totDr: number; totCr: number; days: number | null; caveat: string | null }, limit: number) => `
    <h2>${esc(title)}</h2>
    <p class="note">Days since the bill, at ${dmy(d.monthEnd)}. Debit is what is owed; credit is an advance held, kept beside it and never netted across parties. ₹ lakhs. ${a.days != null ? `<b>${Math.round(a.days)} days</b> on the year's per-day figure.` : ""} ${a.caveat ? esc(a.caveat) : ""}</p>
    <table class="t small"><thead><tr><th>Party</th><th class="n">Debit</th><th class="n">Credit</th><th class="n">&lt; 60 d</th><th class="n">60–90</th><th class="n">90–120</th><th class="n">&gt; 120 d</th><th class="n">Oldest</th></tr></thead><tbody>
      ${a.rows.slice(0, limit).map((r) => `<tr><td>${esc(r.party)}</td><td class="n">${dot(r.dr, lk)}</td><td class="n muted">${dot(r.cr, lk)}</td><td class="n">${dot(r.b1, lk)}</td><td class="n">${dot(r.b2, lk)}</td><td class="n">${dot(r.b3, lk)}</td><td class="n ${r.b4 ? "neg" : ""}">${dot(r.b4, lk)}</td><td class="n muted">${dmy(r.oldest)}</td></tr>`).join("")}
      ${a.rows.length > limit ? `<tr class="kid"><td class="muted">… and ${a.rows.length - limit} more parties, inside the totals</td><td colspan="7"></td></tr>` : ""}
      <tr class="total"><td>Total · ${a.rows.length} parties</td><td class="n">${lk(a.totDr)}</td><td class="n">${lk(a.totCr)}</td><td class="n">${lk(a.rows.reduce((x, r) => x + r.b1, 0))}</td><td class="n">${lk(a.rows.reduce((x, r) => x + r.b2, 0))}</td><td class="n">${lk(a.rows.reduce((x, r) => x + r.b3, 0))}</td><td class="n">${lk(a.rows.reduce((x, r) => x + r.b4, 0))}</td><td></td></tr>
    </tbody></table>`;
  pages.push(ageTable("Debtors ageing", d.debtors, 34));
  pages.push(ageTable("Creditors ageing", d.creditors, 26) + `
    <h3>Creditors with debit balances — expenses yet to be booked, or advances paid</h3>
    <p class="note">A supplier we have paid more than he has billed: either his bill has not been entered, or it is an advance. Either way it is money out with nothing yet against it. ₹ lakhs.</p>
    <table class="t small"><tbody>${d.creditorDr.slice(0, 12).map((r) => `<tr><td>${esc(r.party)}</td><td class="n">${lk(r.amount)}</td></tr>`).join("")}
      <tr class="total"><td>Total · ${d.creditorDr.length} parties</td><td class="n">${lk(d.creditorDr.reduce((a, r) => a + r.amount, 0))}</td></tr></tbody></table>`);

  /* ---------- page 11: inventory + working capital ---------- */
  const I = d.inventory, W = d.wcc;
  pages.push(`
    <h2>Inventory and the working-capital cycle</h2>
    <div class="kpis four">
      <div class="kpi"><div class="kl">Closing stock</div><div class="kv">₹${cr(I.stock)} Cr</div><div class="kf">register, ${dmy(I.stockAt)}</div></div>
      <div class="kpi"><div class="kl">Debtor days</div><div class="kv">${W.debtorDays == null ? "—" : Math.round(W.debtorDays)}</div><div class="kf">net debtors ÷ per-day revenue</div></div>
      <div class="kpi"><div class="kl">Inventory days</div><div class="kv">${W.inventoryDays == null ? "—" : Math.round(W.inventoryDays)}</div><div class="kf">closing stock ÷ per-day cost of sales</div></div>
      <div class="kpi"><div class="kl">Creditor days</div><div class="kv">${W.creditorDays == null ? "—" : Math.round(W.creditorDays)}</div><div class="kf">net creditors ÷ per-day purchases</div></div>
    </div>
    <div class="box"><b>Working capital cycle: ${W.cycle == null ? "—" : `${Math.round(W.cycle)} days`}</b> — debtor + inventory − creditor days. Working capital ₹${cr(W.workingCapital)} Cr at book closings.</div>
    <h3>What was bought this year, by item — the top ${I.byItem.length}</h3>
    <p class="note">${esc(I.note)} ₹ lakhs.</p>
    <table class="t small"><tbody>${I.byItem.slice(0, 22).map((r) => `<tr><td>${esc(r.item)}</td><td class="n muted">${esc(r.qty)}</td><td class="n">${lk(r.amount)}</td></tr>`).join("")}</tbody></table>`);

  /* ---------- page 12: loans, and what the XML cannot say ---------- */
  const Ln = d.loans;
  pages.push(`
    <h2>Loans — the books against the statement</h2>
    <p class="note">${esc(Ln.note)} ₹ lakhs.</p>
    <table class="t small"><thead><tr><th>Loan</th><th>Group</th><th class="n">Books</th><th class="n">Statement</th><th class="n">Difference</th><th>Status</th></tr></thead><tbody>
      ${Ln.rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="muted">${esc(r.group)}</td><td class="n">${lk(r.books)}</td><td class="n">${r.statement == null ? "—" : lk(r.statement)}</td><td class="n ${r.diff && Math.abs(r.diff) >= 1000 ? "neg" : ""}">${r.diff == null ? "—" : lk(r.diff)}</td><td><span class="chip ${r.status}">${r.status}</span></td></tr>`).join("")}
      <tr class="total"><td>Total borrowings</td><td></td><td class="n">${lk(Ln.total)}</td><td colspan="3" class="muted">${Ln.verified} of ${Ln.rows.length} verified</td></tr>
    </tbody></table>
    <h3>What this report could not take from the XML</h3>
    <div class="box">
      <p><b>Depreciation rates</b> — Tally carries the assets and the accumulated depreciation, never the rate. Seven rates are typed once in the register and used above.</p>
      <p><b>The budget</b> — a decision, not a record. Until nine figures are typed for ${esc(d.fy)} the variance page reads against break-even, struck from the books.</p>
      <p><b>Item-wise stock</b> — the sheet's inventory tab comes from Tally's stock summary, which the export does not carry. The month-end valuation is typed in the Stock register; the item table above shows the year's purchases instead, and says so.</p>
      <p><b>Bank reconciliation</b> — ${esc(d.bankReco.note)}</p>
      <p><b>Loan statements</b> — the Bank Loan Register holds the statement balance; where it is empty the loan reads "unverified" rather than "match".</p>
      <p>Everything else on these pages — the P&amp;L, the balance sheet, receipts and payments, both ageings, the debit-balance creditors, the working-capital cycle and every ratio — is the XML, read by the same rules as the rest of Kuber. Uploading it is enough for twelve of the sheet's sixteen tabs.</p>
    </div>`);

  return shell(pages, d);
}

function shell(pages: string[], d: CfoData): string {
  const n = pages.length;
  const body = pages.map((p, i) => `
    <section class="pg">
      <div class="hdr"><span>CFO Monthly Report · ${esc(d.monthLabel)}</span><span>Nandan GSE · FY ${esc(d.fy)}</span></div>
      <div class="content">${p}</div>
      <div class="ftr"><span>Drawn from the books to ${dmy(d.booksTo)} · confidential</span><span>Page ${i + 1} of ${n}</span></div>
    </section>`).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>CFO Monthly Report — ${esc(d.monthLabel)}</title>
<style>
  @page { size: A4 portrait; margin: 0 }
  * { box-sizing: border-box }
  body { margin: 0; background: #E9E7E1; font: 10.5px/1.45 "Inter", system-ui, -apple-system, "Segoe UI", sans-serif; color: #16232F }
  .pg { width: 210mm; height: 297mm; background: #fff; position: relative; overflow: hidden; page-break-after: always; padding: 14mm 14mm 16mm; display: flex; flex-direction: column }
  .pg:last-child { page-break-after: auto }
  .hdr, .ftr { position: absolute; left: 14mm; right: 14mm; display: flex; justify-content: space-between; font-size: 8.5px; color: #8A93A0; letter-spacing: .3px }
  .hdr { top: 6mm; border-bottom: 1px solid #E2E0DA; padding-bottom: 3px } .ftr { bottom: 6mm; border-top: 1px solid #E2E0DA; padding-top: 3px }
  .content { flex: 1; min-height: 0 }
  h1 { font-size: 30px; margin: 10px 0 2px; letter-spacing: -.5px } h2 { font-size: 15px; margin: 0 0 6px; color: #16232F; border-left: 4px solid #C9A227; padding-left: 8px }
  h3 { font-size: 11.5px; margin: 12px 0 4px; color: #3D4A5C; text-transform: uppercase; letter-spacing: .6px }
  .cover { border-bottom: 2px solid #16232F; padding-bottom: 12px; margin-bottom: 14px }
  .logo { height: 34px; display: block; margin-bottom: 10px } .co { font-size: 10px; color: #6B7783; letter-spacing: 1px; text-transform: uppercase }
  .for { font-size: 18px; color: #C9A227; font-weight: 700 } .meta { font-size: 9.5px; color: #6B7783; margin-top: 4px }
  .warn { margin-top: 8px; background: #FBEAE8; color: #B3392E; padding: 6px 8px; border-radius: 4px; font-size: 9.5px }
  .note { font-size: 8.8px; color: #6B7783; margin: 4px 0 8px; line-height: 1.5 }
  .box { background: #F7F5EF; border: 1px solid #E2E0DA; border-radius: 4px; padding: 8px 10px; font-size: 9.2px; line-height: 1.55; margin-top: 8px } .box p { margin: 3px 0 }
  .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px } .kpis.four { grid-template-columns: repeat(4, 1fr) }
  .kpi { border: 1px solid #E2E0DA; border-radius: 4px; padding: 6px 8px } .kl { font-size: 8px; color: #6B7783; text-transform: uppercase; letter-spacing: .5px }
  .kv { font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; margin: 1px 0 } .kf { font-size: 7.8px; color: #8A93A0; line-height: 1.35 }
  .good { color: #1B7A43; margin-left: 4px; font-size: 11px } .bad { color: #B3392E; margin-left: 4px; font-size: 11px }
  table.t { width: 100%; border-collapse: collapse; font-size: 9.6px } table.t.small { font-size: 8.8px } table.t.tiny { font-size: 7.6px }
  .t th { text-align: left; background: #16232F; color: #fff; padding: 4px 6px; font-weight: 600; font-size: 8.4px } .t th.n { text-align: right }
  .t td { padding: 2.6px 6px; border-bottom: 1px solid #EEECE6; vertical-align: top } .t td.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap }
  .t tr.head td { font-weight: 700 } .t tr.kid td { color: #46545F } .t tr.total td { font-weight: 800; background: #F3F1EB; border-top: 1px solid #C9C6BE }
  .t tr.grand td { font-weight: 800; background: #E6F4EA; border-top: 2px solid #16232F; font-size: 10.4px } .t tr.gap td { border: 0; height: 4px; padding: 0 }
  .muted { color: #8A93A0 } .neg { color: #B3392E } .b { font-weight: 700 } .pc { font-size: 8.6px } .dot { color: #D5D2C8 }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px } .half { font-size: 8.8px } .tot { text-align: right; font-weight: 800; padding: 4px 6px; font-size: 10px }
  .chip { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 8px; font-weight: 700 }
  .chip.match { background: #E6F4EA; color: #0D7A3F } .chip.mismatch { background: #FBEAE8; color: #B3392E } .chip.unverified { background: #F2F2EE; color: #6B7783 }
  @media print { body { background: #fff } }
</style></head><body>${body}</body></html>`;
}
