"use client";
/**
 * Appraisal Summary Data Analytics — the CHRO's wall.
 *
 * Everything here is computed live from the same rows the Appraisal Table
 * shows; nothing is typed in. Where a decision is Final it uses the decided
 * gross; where only the manager has spoken it uses the manager's proposal
 * and says so — indicative, never presented as settled money.
 *
 * The PIP list is a SCREEN, not a verdict: it names the people whose
 * manager scores and increments both came out at the bottom, so the
 * conversation happens on purpose instead of by accident.
 */
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Pane } from "./Pane";
import { C } from "./RecordFields";
import { inr } from "@/lib/fmt";

interface Row {
  id: string; name: string; department: string | null; designation: string | null; type: string | null;
  age: number | null; exp: number | null;
  prevGross: number | null; newGross: number | null; inc: number | null; incPct: number | null;
  stage: string; selfAvg: number | null; mgrAvg: number | null; askGross: number | null; mgrProposed: number | null;
  /** 26 for the types paid by the day, 31 for the rest — the API's own rule. */
  payDays?: number | null;
}


const lakh = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${inr(n)}`);
const pct = (n: number | null | undefined, sign = true) => (n == null ? "—" : `${sign && n > 0 ? "+" : ""}${n.toFixed(1)}%`);

/** decided money first; the manager's proposal as the indicative fallback */
function eff(r: Row): { gross: number | null; pct: number | null; indicative: boolean } {
  if (r.newGross != null) return { gross: r.newGross, pct: r.incPct, indicative: false };
  if (r.mgrProposed != null && r.prevGross) {
    return { gross: r.mgrProposed, pct: Math.round(((r.mgrProposed - r.prevGross) / r.prevGross) * 1000) / 10, indicative: true };
  }
  return { gross: null, pct: null, indicative: false };
}

export default function AppraisalAnalytics({ who, onOpenPerson }: { who: string; onOpenPerson: (id: string) => void }) {
  const [rawRows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api.get("/api/hrms/idp?table=1").then((j) => setRows(j.rows || []))
      .catch((e) => { setMsg(e instanceof Error ? e.message : String(e)); setRows([]); });
  }, []);

  /**
   * "have a drop down... show the types of the employees. I will of course
   * keep management off" (Dr Raghu, 4 Sep 2026). Every number on the wall is
   * computed from the ticked types only; all are ticked to begin with.
   */
  const allTypes = useMemo(() => [...new Set((rawRows || []).map((r) => r.type || "(no type)"))].sort(), [rawRows]);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [typesOpen, setTypesOpen] = useState(false);
  const rows = useMemo(() => rawRows === null ? null : rawRows.filter((r) => !off.has(r.type || "(no type)")), [rawRows, off]);
  const typeCount = (t: string) => (rawRows || []).filter((r) => (r.type || "(no type)") === t).length;
  const typeLabel = off.size === 0 ? "All employee types" : `${allTypes.length - off.size} of ${allTypes.length} types`;

  const P = ({ r, bold }: { r: Row; bold?: boolean }) => (
    <a href={`/hrms#appraisal.card:${encodeURIComponent(r.id)}`} target="_blank" rel="noopener noreferrer" className={`text-left ${bold ? "font-bold" : "font-semibold"}`}
      style={{ color: "var(--blue)", textDecoration: "underline", textUnderlineOffset: 2 }} title={`${r.id} · open the appraisal discussion in a new tab`}>
      {r.name}
    </a>
  );

  const S = useMemo(() => {
    const all = rows || [];
    const decided = all.filter((r) => r.newGross != null && r.prevGross != null);
    const spoken = all.map((r) => ({ r, e: eff(r) })).filter((x) => x.e.pct != null && x.r.prevGross != null);
    const payNow = all.reduce((a, r) => a + (r.prevGross || 0), 0);
    const payNew = all.reduce((a, r) => a + (eff(r).gross ?? r.prevGross ?? 0), 0);
    const pcts = spoken.map((x) => x.e.pct as number);
    const mean = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0;
    const sd = pcts.length > 1 ? Math.sqrt(pcts.reduce((a, b) => a + (b - mean) ** 2, 0) / (pcts.length - 1)) : 0;
    const median = pcts.length ? [...pcts].sort((a, b) => a - b)[Math.floor(pcts.length / 2)] : 0;
    /**
     * THE SAME CURVE IN RUPEES (Dr Raghu, 7 Sep 2026: "show bell curve on the
     * % as well as the absolute").
     *
     * A percentage and an amount are two different pictures of one decision,
     * and they disagree in a way worth seeing: 18% to a man on 15,000 is
     * 2,700, and 18% to a man on 1,50,000 is 27,000. The percentage curve
     * says whether people were rated; the rupee curve says what it costs and
     * who actually gained.
     */
    /**
     * THE CURVES LEAVE MANAGEMENT OUT (Dr Raghu, 8 Sep 2026: "mention the
     * curve without the management. the management is skewing the chart").
     *
     * He is right, and the rupee curve showed it plainly: 198 people in the
     * first bucket and a single line out at 2.5 lakh, which is not a
     * distribution, it is one man and everybody else. Three managing salaries
     * among two hundred set the scale for all of them and the shape of the
     * other 199 disappeared.
     *
     * They are left out of the CURVES only. Every total, every department
     * figure and the pay bill itself still count everybody — what is being
     * asked here is whether people were really rated against one another, and
     * for that question the board is not a comparable population.
     */
    const rated = spoken.filter((x) => !/^management$/i.test(String(x.r.type || "").trim()));
    const mgmt = spoken.length - rated.length;
    const cPcts = rated.map((x) => x.e.pct as number);
    const cMean = cPcts.length ? cPcts.reduce((a, b) => a + b, 0) / cPcts.length : 0;
    const cSd = cPcts.length > 1 ? Math.sqrt(cPcts.reduce((a, b) => a + (b - cMean) ** 2, 0) / (cPcts.length - 1)) : 0;
    const amts = rated.map((x) => (x.e.gross ?? 0) - (x.r.prevGross ?? 0)).filter((v) => Number.isFinite(v));
    const aMean = amts.length ? amts.reduce((a, b) => a + b, 0) / amts.length : 0;
    const aSd = amts.length > 1 ? Math.sqrt(amts.reduce((a, b) => a + (b - aMean) ** 2, 0) / (amts.length - 1)) : 0;
    return { all, decided, spoken, payNow, payNew, pcts, mean, sd, median, amts, aMean, aSd, cPcts, cMean, cSd, mgmt };
  }, [rows]);

  const depts = useMemo(() => {
    const m = new Map<string, { n: number; now: number; next: number; rated: number[]; pcts: number[] }>();
    for (const r of S.all) {
      const k = r.department || "(no department)";
      if (!m.has(k)) m.set(k, { n: 0, now: 0, next: 0, rated: [], pcts: [] });
      const d = m.get(k)!;
      d.n++; d.now += r.prevGross || 0;
      const e = eff(r);
      d.next += e.gross ?? r.prevGross ?? 0;
      if (e.pct != null) d.pcts.push(e.pct);
      if (r.mgrAvg != null) d.rated.push(r.mgrAvg);
    }
    return [...m.entries()].map(([k, d]) => ({
      dept: k, n: d.n, now: d.now, next: d.next, cost: d.next - d.now,
      avgPct: d.pcts.length ? d.pcts.reduce((a, b) => a + b, 0) / d.pcts.length : null,
      avgRating: d.rated.length ? d.rated.reduce((a, b) => a + b, 0) / d.rated.length : null,
    })).sort((a, b) => b.cost - a.cost);
  }, [S]);

  const pip = useMemo(() => S.all
    .filter((r) => r.mgrAvg != null && (r.mgrAvg <= 4 || (r.mgrAvg <= 5 && (eff(r).pct ?? 99) <= 2)))
    .sort((a, b) => (a.mgrAvg ?? 9) - (b.mgrAvg ?? 9)), [S]);

  const gaps = useMemo(() => S.all
    .filter((r) => r.selfAvg != null && r.mgrAvg != null)
    .map((r) => ({ r, gap: (r.selfAvg as number) - (r.mgrAvg as number) }))
    .sort((a, b) => b.gap - a.gap), [S]);

  const asks = useMemo(() => S.all
    .filter((r) => r.askGross != null && r.prevGross)
    .map((r) => {
      const e = eff(r);
      return { r, askPct: ((r.askGross as number) - (r.prevGross as number)) / (r.prevGross as number) * 100, gotPct: e.pct, indicative: e.indicative };
    })
    .sort((a, b) => (b.askPct - (b.gotPct ?? 0)) - (a.askPct - (a.gotPct ?? 0))), [S]);

  const bands = useMemo(() => {
    const B: [string, (r: Row) => boolean][] = [
      ["< 2 yrs", (r) => (r.exp ?? -1) >= 0 && (r.exp as number) < 2],
      ["2 – 5 yrs", (r) => (r.exp ?? -1) >= 2 && (r.exp as number) < 5],
      ["5 – 10 yrs", (r) => (r.exp ?? -1) >= 5 && (r.exp as number) < 10],
      ["10 – 20 yrs", (r) => (r.exp ?? -1) >= 10 && (r.exp as number) < 20],
      ["20+ yrs", (r) => (r.exp ?? -1) >= 20],
    ];
    return B.map(([l, f]) => {
      const g = S.all.filter(f);
      const p = g.map((r) => eff(r).pct).filter((x): x is number => x != null);
      return { band: l, n: g.length, avg: p.length ? p.reduce((a, b) => a + b, 0) / p.length : null };
    });
  }, [S]);

  const indicativeN = S.spoken.filter((x) => x.e.indicative).length;

  /**
   * THE APPRAISAL DOCUMENT (Dr Raghu, 10 Sep 2026).
   *
   * Not a printout of the screen — a signed paper. He set out its parts:
   * the summary, the curve WITHOUT management, the pay bill monthly and
   * annual with a ten per cent allowance for overtime, what that bill costs
   * as a share of sales at five levels, the outliers, then every person by
   * employee type, and three signatures at the end.
   *
   * WHY IT BUILDS ITS OWN PAGE. The pane asked for a print button and handed
   * over no document, so it fell back to window.print() — and the file he
   * sent proved the result: four pages carrying nothing but the browser's
   * date header. This wall is nested scrollers, flex heights and SVG sized
   * to the viewport; none of it survives being asked to become paper.
   *
   * EVERY FIGURE IS FINAL (Dr Raghu, 10 Sep 2026: "it is now final, there is
   * no indicative"). The decided gross is the only money used; nothing here
   * falls back to a manager's proposal, and the word indicative does not
   * appear on the paper.
   *
   * THE CURVE LEAVES MANAGEMENT OUT and the totals do not. Three managing
   * salaries among two hundred set the scale for everybody and the shape of
   * the other 199 disappears — but the pay bill is the pay bill. Both facts
   * are printed beside their own tables so a reader is never left guessing
   * which population a number covers.
   */
  const printPaper = () => {
    const esc = (v: unknown) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
    const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const rupee = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : `₹${Math.round(n).toLocaleString("en-IN")}`);
    /** His rule: the types paid by the day divide by 26, the rest by 31. */
    const perDay = (g: number | null | undefined, r: Row) => (g == null ? null : g / (r.payDays || 31));

    const card = (v: string, l: string, sub?: string) =>
      `<div class="card"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ""}</div>`;

    // ── the curve, management excluded ──────────────────────────────────
    const curve = (() => {
      const xs = S.cPcts;
      if (!xs.length) return "<p class='muted'>No decided increases to draw.</p>";
      const lo = Math.floor(Math.min(...xs) / 5) * 5;
      const hi = Math.ceil(Math.max(...xs) / 5) * 5;
      const step = 5;
      const buckets: { from: number; n: number }[] = [];
      for (let a = lo; a < hi; a += step) buckets.push({ from: a, n: xs.filter((x) => x >= a && x < a + step).length });
      if (buckets.length) buckets[buckets.length - 1].n += xs.filter((x) => x >= hi).length;
      const peak = Math.max(1, ...buckets.map((b) => b.n));
      const W = 700, H = 190, pad = 26, bw = (W - pad * 2) / buckets.length;
      const bars = buckets.map((b, i) => {
        const h = (b.n / peak) * (H - 54);
        const x = pad + i * bw, y = H - 26 - h;
        return `<rect x="${(x + 2).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${h.toFixed(1)}" fill="#1B2D6B"/>`
          + (b.n ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}" font-size="8" text-anchor="middle" fill="#16203A">${b.n}</text>` : "")
          + `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 12}" font-size="7.5" text-anchor="middle" fill="#666">${b.from}%</text>`;
      }).join("");
      const mx = pad + ((S.cMean - lo) / (hi - lo)) * (W - pad * 2);
      return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">
        <line x1="${pad}" y1="${H - 26}" x2="${W - pad}" y2="${H - 26}" stroke="#CFCBC0"/>
        ${bars}
        <line x1="${mx.toFixed(1)}" y1="18" x2="${mx.toFixed(1)}" y2="${H - 26}" stroke="#B4460D" stroke-dasharray="3 3"/>
        <text x="${Math.min(W - pad - 2, mx + 4).toFixed(1)}" y="14" font-size="8" fill="#B4460D">mean ${S.cMean.toFixed(1)}%</text>
      </svg>`;
    })();

    // ── the pay bill, and what it costs against sales ───────────────────
    const monthNow = S.payNow, monthNew = S.payNew;
    const annualNow = monthNow * 12, annualNew = monthNew * 12;
    const withOtNew = annualNew * 1.1;
    /**
     * SALARY AS A SHARE OF TURNOVER (Dr Raghu, 10 Sep 2026: "I want to know
     * at what turnover how much is the % of salary").
     *
     * One question, asked at five levels of sales: what does the wage bill
     * come to as a percentage of what we sell. The salary is the ANNUAL bill
     * AFTER this appraisal — the number the company will actually carry —
     * and the second column adds the ten per cent for overtime, because the
     * first is what is committed and the second is what it really costs.
     */
    const SALES: number[] = [56, 65, 75, 85, 100];
    const breakEven = SALES.map((cr) => {
      const sale = cr * 1e7;
      return `<tr><td class="n">₹${cr} Cr</td>
        <td class="n"><b>${((annualNew / sale) * 100).toFixed(2)}%</b></td>
        <td class="n">${((withOtNew / sale) * 100).toFixed(2)}%</td></tr>`;
    }).join("");

    // ── every person, by employee type ──────────────────────────────────
    const ORDER = ["Staff", "Contractor", "Labour", "Labour - Contract"];
    const present = [...new Set(S.all.map((r) => (r.type || "(no type)").trim()))];
    const ordered = [...ORDER.filter((t) => present.includes(t)), ...present.filter((t) => !ORDER.includes(t)).sort()];

    const peopleTable = (t: string) => {
      const list = S.all.filter((r) => (r.type || "(no type)").trim() === t)
        .sort((a, b) => (a.department || "").localeCompare(b.department || "") || a.name.localeCompare(b.name));
      if (!list.length) return "";
      const byDay = list.some((r) => (r.payDays || 31) === 26);
      const head = byDay
        ? `<tr><th>ID</th><th>Name</th><th>Dept</th><th>Designation</th><th class="n">Yrs</th><th class="n">Age</th><th class="n">Prev gross</th><th class="n">Prev / day</th><th class="n">New gross</th><th class="n">New / day</th><th class="n">Increase</th><th class="n">Inc %</th><th class="n">Inc / day</th></tr>`
        : `<tr><th>ID</th><th>Name</th><th>Dept</th><th>Designation</th><th class="n">Yrs</th><th class="n">Age</th><th class="n">Prev gross</th><th class="n">New gross</th><th class="n">Increase</th><th class="n">Inc %</th></tr>`;
      const body = list.map((r) => {
        const pd0 = perDay(r.prevGross, r), pd1 = perDay(r.newGross, r);
        const cells = [
          `<td class="mono">${esc(r.id)}</td>`,
          `<td>${esc(r.name)}</td>`,
          `<td>${esc(r.department || "—")}</td>`,
          `<td>${esc(r.designation || "—")}</td>`,
          `<td class="n">${r.exp == null ? "—" : r.exp.toFixed(1)}</td>`,
          `<td class="n">${r.age == null ? "—" : Math.round(r.age)}</td>`,
          `<td class="n">${rupee(r.prevGross)}</td>`,
          ...(byDay ? [`<td class="n">${rupee(pd0)}</td>`] : []),
          `<td class="n">${rupee(r.newGross)}</td>`,
          ...(byDay ? [`<td class="n">${rupee(pd1)}</td>`] : []),
          `<td class="n">${rupee(r.inc)}</td>`,
          `<td class="n">${r.incPct == null ? "—" : pct(r.incPct)}</td>`,
          ...(byDay ? [`<td class="n">${pd0 != null && pd1 != null ? rupee(pd1 - pd0) : "—"}</td>`] : []),
        ].join("");
        return `<tr>${cells}</tr>`;
      }).join("");
      const sub = list.reduce((a, r) => a + (r.inc ?? 0), 0);
      const cols = byDay ? 13 : 10;
      return `<h2 class="break">${esc(t)} <span class="muted">— ${list.length} ${list.length === 1 ? "person" : "people"}</span></h2>
        <table class="people-t"><thead>${head}</thead><tbody>${body}
        <tr class="tot"><td colspan="${cols - 4}">Total</td><td class="n">${rupee(list.reduce((a, r) => a + (r.prevGross ?? 0), 0))}</td>${byDay ? '<td></td>' : ''}<td class="n">${rupee(list.reduce((a, r) => a + (r.newGross ?? r.prevGross ?? 0), 0))}</td>${byDay ? '<td></td>' : ''}<td class="n">${rupee(sub)}</td><td></td>${byDay ? '<td></td>' : ''}</tr>
        </tbody></table>`;
    };

    const deptRows = depts.map((d) => `<tr>
      <td>${esc(d.dept)}</td><td class="n">${d.n}</td>
      <td class="n">${esc(lakh(d.now))}</td><td class="n">${esc(lakh(d.next))}</td>
      <td class="n">${esc(lakh(d.cost))}</td>
      <td class="n">${d.avgPct == null ? "—" : esc(pct(d.avgPct))}</td>
      <td class="n">${d.avgRating == null ? "—" : d.avgRating.toFixed(1)}</td></tr>`).join("");

    const bandRows = bands.map((b) => `<tr><td>${esc(b.band)}</td><td class="n">${b.n}</td><td class="n">${b.avg == null ? "—" : esc(pct(b.avg))}</td></tr>`).join("");

    const list = (title: string, note: string, items: string[]) =>
      items.length
        ? `<h2>${esc(title)} <span class="muted">— ${esc(note)}</span></h2><ol class="people">${items.map((x) => `<li>${x}</li>`).join("")}</ol>`
        : `<h2>${esc(title)}</h2><p class="muted">Nobody.</p>`;

    const pipItems = pip.map((r) => `<b>${esc(r.name)}</b> <span class="muted">${esc(r.department || "—")} · manager ${r.mgrAvg?.toFixed(1) ?? "—"} · ${esc(pct(r.incPct))}</span>`);
    const gapItems = gaps.slice(0, 15).map((g) => `<b>${esc(g.r.name)}</b> <span class="muted">self ${g.r.selfAvg?.toFixed(1)} vs manager ${g.r.mgrAvg?.toFixed(1)} · gap ${g.gap.toFixed(1)}</span>`);
    const askItems = asks.slice(0, 15).map((a) => `<b>${esc(a.r.name)}</b> <span class="muted">asked ${esc(pct(a.askPct))} · got ${esc(pct(a.gotPct))}</span>`);

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Appraisal Summary — Nandan GSE</title>
<style>
  @page { size: A4 landscape; margin: 10mm 8mm; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color:#16203A; font-size:9.5pt; line-height:1.4; margin:0; }
  .head { border-bottom:2px solid #16203A; padding-bottom:6px; margin-bottom:11px; }
  .head h1 { font-size:15pt; margin:0 0 2px; }
  .head .sub { font-size:8.5pt; color:#555; }
  .cards { display:flex; flex-wrap:wrap; gap:7px; margin-bottom:12px; }
  .card { border:1px solid #CFCBC0; border-radius:5px; padding:6px 10px; min-width:112px; }
  .card .v { font-size:13pt; font-weight:700; }
  .card .l { font-size:7.5pt; color:#555; }
  .card .s { font-size:7pt; color:#888; }
  h2 { font-size:11pt; margin:13px 0 5px; border-bottom:1px solid #CFCBC0; padding-bottom:3px; }
  h2.break { break-before: page; }
  table { width:100%; border-collapse:collapse; font-size:8.5pt; }
  th { text-align:left; background:#F2EFE8; padding:3.5px 5px; border-bottom:1px solid #CFCBC0; font-size:7.5pt; text-transform:uppercase; letter-spacing:.03em; }
  td { padding:3px 5px; border-bottom:1px solid #EDEAE2; }
  td.n, th.n { text-align:right; }
  td.mono { font-family: ui-monospace, Menlo, monospace; font-size:7.5pt; color:#555; }
  tr.tot td { font-weight:700; background:#F7F5F0; border-top:1px solid #CFCBC0; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  ol.people { font-size:8.5pt; margin:4px 0 0; padding-left:18px; column-count:2; column-gap:22px; }
  ol.people li { margin-bottom:2px; break-inside:avoid; }
  .muted { color:#666; font-weight:400; }
  .note { font-size:8pt; color:#666; margin-top:8px; }
  .two { display:flex; gap:14px; align-items:flex-start; }
  .two > * { flex:1 1 0; min-width:0; }
  .sign { break-before: page; margin-top:26px; }
  .sign .row { display:flex; gap:30px; margin-top:52px; }
  .sign .box { flex:1 1 0; border-top:1px solid #16203A; padding-top:5px; font-size:9.5pt; font-weight:700; }
  .sign .box span { display:block; font-weight:400; font-size:8pt; color:#666; }
</style></head><body>
  <div class="head">
    <h1>Nandan GSE — Appraisal ${esc(new Date().getFullYear())} — Summary and Full Results</h1>
    <div class="sub">Printed by ${esc(who)} on ${esc(when)} · ${esc(typeLabel)} · CONFIDENTIAL — personnel record</div>
  </div>

  <h2>Summary</h2>
  <div class="cards">
    ${card(String(S.all.length), "On the roll")}
    ${card(String(S.spoken.length), "Increments decided")}
    ${card(lakh(monthNow), "Payroll today / month")}
    ${card(lakh(monthNew), "Payroll after / month")}
    ${card(lakh(monthNew - monthNow), "Increase / month", monthNow ? `+${(((monthNew - monthNow) / monthNow) * 100).toFixed(1)}% of today's payroll` : "")}
    ${card(lakh((monthNew - monthNow) * 12), "Cost of the cycle / year")}
    ${card(pct(S.mean), "Average increase", `median ${pct(S.median)}`)}
  </div>

  <h2>The curve — without management</h2>
  ${curve}
  <div class="note">
    ${S.cPcts.length} people, mean <b>${pct(S.cMean)}</b>, standard deviation <b>${S.cSd.toFixed(1)}</b>.
    ${S.mgmt} management ${S.mgmt === 1 ? "salary is" : "salaries are"} left out of this chart on purpose — three managing salaries among two hundred set the scale for everybody and the shape of the rest disappears.
    <b>Every total elsewhere on this paper counts everybody.</b>
  </div>

  <div class="two">
    <div>
      <h2>The pay bill</h2>
      <table><thead><tr><th>&nbsp;</th><th class="n">Per month</th><th class="n">Annual</th></tr></thead><tbody>
        <tr><td>Before this cycle</td><td class="n">${rupee(monthNow)}</td><td class="n">${rupee(annualNow)}</td></tr>
        <tr><td>After this cycle</td><td class="n">${rupee(monthNew)}</td><td class="n">${rupee(annualNew)}</td></tr>
        <tr><td>Increase</td><td class="n">${rupee(monthNew - monthNow)}</td><td class="n">${rupee(annualNew - annualNow)}</td></tr>
        <tr class="tot"><td>With overtime and the rest, +10%</td><td class="n">${rupee(monthNew * 1.1)}</td><td class="n">${rupee(withOtNew)}</td></tr>
      </tbody></table>
      <div class="note">The ten per cent is a stated allowance for overtime and what rides with it, not a measured figure.</div>
    </div>
    <div>
      <h2>Salary as a share of turnover</h2>
      <table><thead><tr><th>Turnover for the year</th><th class="n">Salary %</th><th class="n">Salary +10% (OT etc)</th></tr></thead>
      <tbody>${breakEven}</tbody></table>
      <div class="note">
        The annual wage bill after this appraisal — <b>${rupee(annualNew)}</b>, or <b>${rupee(withOtNew)}</b> with the ten per cent —
        divided by the year's sales. Salary alone: no material, no overhead, no other cost.
      </div>
    </div>
  </div>

  <h2>By department</h2>
  <table><thead><tr><th>Department</th><th class="n">People</th><th class="n">Now / month</th><th class="n">After / month</th><th class="n">Cost / month</th><th class="n">Avg %</th><th class="n">Avg rating</th></tr></thead>
  <tbody>${deptRows}</tbody></table>

  <h2>By experience</h2>
  <table><thead><tr><th>Band</th><th class="n">People</th><th class="n">Average increase</th></tr></thead>
  <tbody>${bandRows}</tbody></table>

  ${list("Conversations that must not be skipped", "lowest manager scores, or scored low with almost no increment", pipItems)}
  ${list("Widest self vs manager gaps", "top 15 — where the two readings disagree most", gapItems)}
  ${list("Asked against given", "top 15 by the size of the gap", askItems)}

  ${ordered.map(peopleTable).join("")}

  <div class="sign">
    <h2>Approved</h2>
    <div class="row">
      <div class="box">Chairman<span>Signature and date</span></div>
      <div class="box">MD &amp; CEO<span>Signature and date</span></div>
      <div class="box">COO<span>Signature and date</span></div>
    </div>
  </div>
</body></html>`;

    const w = window.open("", "_blank");
    if (!w) { setMsg("Your browser blocked the print window. Allow pop-ups for this site and press PDF / Print again."); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };


  return (
    <Pane title="Appraisal Summary Data Analytics" who={who} print onPrint={printPaper}
      blurb="The whole cycle on one wall: the money, the curve, the departments, the outliers — and the conversations that must not be skipped. Every name opens the Report Card.">
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: C.red }}>{msg}</div>}
      {rows === null && <div className="text-sm py-6 text-center" style={{ color: C.faint }}>reading the cycle…</div>}
      {rows !== null && (
        <>
          {/* ── who is on the wall ── */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <div style={{ position: "relative" }}>
              <button onClick={() => setTypesOpen((v) => !v)} className="text-xs font-semibold rounded border px-2.5 py-1.5 bg-white"
                style={{ borderColor: off.size ? C.orange ?? "var(--accent)" : C.line, color: "var(--blue)" }} title="Tick the employee types the wall should count">
                👥 {typeLabel} {typesOpen ? "▴" : "▾"}
              </button>
              {typesOpen && (
                <div className="rounded border bg-white shadow-lg p-2" style={{ position: "absolute", top: "110%", left: 0, zIndex: 30, minWidth: 240, borderColor: C.line }}>
                  {allTypes.map((t) => (
                    <label key={t} className="flex items-center gap-2 text-xs py-1 px-1 rounded" style={{ cursor: "pointer" }}>
                      <input type="checkbox" checked={!off.has(t)} style={{ accentColor: "var(--blue)" }}
                        onChange={(e) => setOff((o) => { const n = new Set(o); if (e.target.checked) n.delete(t); else n.add(t); return n; })} />
                      <span className="flex-1" style={{ color: off.has(t) ? C.faint : "var(--navy)" }}>{t}</span>
                      <span className="tnum" style={{ color: C.faint }}>{typeCount(t)}</span>
                    </label>
                  ))}
                  <div className="flex gap-2 mt-1 pt-1" style={{ borderTop: `1px solid ${C.line}` }}>
                    <button onClick={() => setOff(new Set())} className="text-xs font-semibold" style={{ color: "var(--blue)" }}>All</button>
                    <button onClick={() => setOff(new Set(allTypes))} className="text-xs font-semibold" style={{ color: C.faint }}>None</button>
                  </div>
                </div>
              )}
            </div>
            {off.size > 0 && <span className="text-xs" style={{ color: C.faint }}>leaving out {[...off].join(", ")}</span>}
          </div>

          {/* ── the money, first ── */}
          <div className="flex gap-2 flex-wrap mb-3">
            <Big n={String(S.all.length)} l="On the roll" />
            <Big n={String(S.spoken.length)} l="Increments on the table" sub={indicativeN ? `${indicativeN} still manager-indicative` : "all Final"} />
            <Big n={lakh(S.payNow)} l="Payroll today / month" />
            <Big n={lakh(S.payNew)} l="Payroll after / month" green />
            <Big n={lakh(S.payNew - S.payNow)} l="Increase / month" sub={`${pct(S.payNow ? (S.payNew - S.payNow) / S.payNow * 100 : 0)} of today's payroll`} green />
            <Big n={lakh((S.payNew - S.payNow) * 12)} l="Cost of the cycle / year" />
            <Big n={pct(S.mean)} l="Average increase" sub={`median ${pct(S.median)} · 2026 was +13.25%`} green />
          </div>

          <BellCurve values={S.cPcts} mean={S.cMean} sd={S.cSd} step={2.5} unit="pct"
            title="The bell curve — increase %, Management left out"
            note={`n=${S.cPcts.length}${S.mgmt ? ` (${S.mgmt} in Management left out)` : ""} · mean ${pct(S.cMean)} · spread ±${S.cSd.toFixed(1)}. A healthy curve has a middle and two honest tails — everyone bunched at one number means nobody was really rated.`} />
          <BellCurve values={S.amts} mean={S.aMean} sd={S.aSd} unit="inr"
            title="The bell curve — increase in rupees a month, Management left out"
            note={`n=${S.amts.length}${S.mgmt ? ` (${S.mgmt} in Management left out)` : ""} · mean ₹${inr(Math.round(S.aMean))} a month · spread ±₹${inr(Math.round(S.aSd))}. The same decision in money: a percentage treats a man on 15,000 and a man on 1,50,000 alike, and this does not. Three managing salaries set the scale for two hundred and the shape of the rest disappeared, so they stand outside the curve — the totals still count everybody.`} />

          {/* ── departments ── */}
          <Card title="Department wise" note="Decided money where Final; the manager's proposal where not — that part can still move.">
            <table className="w-full genie-table" style={{ fontSize: 12.5, borderCollapse: "collapse" }}>
              <thead><tr style={{ color: C.faint, fontSize: 11 }}>
                {["Department", "People", "Payroll now", "Payroll after", "Cost / month", "Avg increase", "Avg manager rating", ""].map((h, i) => (
                  <th key={h + i} className="text-left px-1.5 py-1" style={{ borderBottom: `1px solid ${C.line}`, textAlign: i > 1 ? "right" : "left" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {depts.map((d) => (
                  <tr key={d.dept} style={{ borderBottom: "1px solid #F2F0EA" }}>
                    <td className="px-1.5 py-1 font-semibold">{d.dept}</td>
                    <td className="px-1.5 py-1 text-right tnum">{d.n}</td>
                    <td className="px-1.5 py-1 text-right tnum">{lakh(d.now)}</td>
                    <td className="px-1.5 py-1 text-right tnum">{lakh(d.next)}</td>
                    <td className="px-1.5 py-1 text-right tnum font-semibold" style={{ color: d.cost > 0 ? C.green : C.faint }}>{d.cost ? lakh(d.cost) : "—"}</td>
                    <td className="px-1.5 py-1 text-right tnum font-semibold">{pct(d.avgPct)}</td>
                    <td className="px-1.5 py-1 text-right tnum">{d.avgRating != null ? `${d.avgRating.toFixed(1)} / 10` : "—"}</td>
                    <td className="px-1.5 py-1" style={{ width: 130 }}>
                      {d.avgPct != null && <div style={{ height: 7, background: "#F2F0EA", borderRadius: 4 }}>
                        <div style={{ height: 7, width: `${Math.min(100, Math.max(2, d.avgPct * 4))}%`, background: "var(--green)", borderRadius: 4 }} />
                      </div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* ── leaderboards ── */}
          <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))" }}>
            <Board title="Top increase (%)" rows={S.spoken.filter((x) => x.e.pct != null).sort((a, b) => (b.e.pct as number) - (a.e.pct as number)).slice(0, 8)}
              right={(x) => <b style={{ color: C.green }}>{pct(x.e.pct)}{x.e.indicative ? "*" : ""}</b>} P={P} />
            <Board title="Top absolute increase (₹/mo)" rows={S.spoken.filter((x) => x.e.gross != null && x.r.prevGross != null).sort((a, b) => ((b.e.gross as number) - (b.r.prevGross as number)) - ((a.e.gross as number) - (a.r.prevGross as number))).slice(0, 8)}
              right={(x) => <b style={{ color: C.green }}>+₹{inr((x.e.gross as number) - (x.r.prevGross as number))}{x.e.indicative ? "*" : ""}</b>} P={P} />
            <Board title="Highest salaries (gross/mo, after)" rows={[...S.all].map((r) => ({ r, e: eff(r) })).sort((a, b) => ((b.e.gross ?? b.r.prevGross ?? 0)) - ((a.e.gross ?? a.r.prevGross ?? 0))).slice(0, 8)}
              right={(x) => <b>₹{inr(x.e.gross ?? x.r.prevGross)}</b>} P={P} />
            <Board title="Least increase (of those decided)" rows={S.spoken.filter((x) => x.e.pct != null).sort((a, b) => (a.e.pct as number) - (b.e.pct as number)).slice(0, 8)}
              right={(x) => <b style={{ color: (x.e.pct as number) <= 0 ? C.red : C.ink }}>{pct(x.e.pct)}{x.e.indicative ? "*" : ""}</b>} P={P} />
          </div>
          <div className="text-xs mb-3" style={{ color: C.faint }}>* manager's proposal — not Final yet.</div>

          {/* ── the PIP screen ── */}
          <Card title={`People to sit down with — the PIP screen (${pip.length})`} tone="#B3392E"
            note="Screened, not sentenced: manager rating ≤ 4/10, or ≤ 5/10 with an increment of 2% or less. Each of these deserves a deliberate conversation — improvement plan, role change, or exit — decided in the room, not by this list.">
            {!pip.length ? <div className="text-sm" style={{ color: C.faint }}>Nobody screens in yet — the list fills as managers submit.</div> : (
              <table className="w-full genie-table" style={{ fontSize: 12.5, borderCollapse: "collapse" }}>
                <thead><tr style={{ color: C.faint, fontSize: 11 }}>
                  {["Name", "Department", "Manager rating", "Self rating", "Increase", "Why on this list"].map((h) => (
                    <th key={h} className="text-left px-1.5 py-1" style={{ borderBottom: `1px solid ${C.line}` }}>{h}</th>))}
                </tr></thead>
                <tbody>{pip.map((r) => {
                  const e = eff(r);
                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid #F2F0EA" }}>
                      <td className="px-1.5 py-1"><P r={r} bold /></td>
                      <td className="px-1.5 py-1">{r.department}</td>
                      <td className="px-1.5 py-1 tnum font-bold" style={{ color: C.red }}>{r.mgrAvg?.toFixed(1)} / 10</td>
                      <td className="px-1.5 py-1 tnum">{r.selfAvg != null ? `${r.selfAvg.toFixed(1)} / 10` : "—"}</td>
                      <td className="px-1.5 py-1 tnum">{pct(e.pct)}{e.indicative ? "*" : ""}</td>
                      <td className="px-1.5 py-1" style={{ color: C.dim, fontSize: 11.5 }}>
                        {(r.mgrAvg as number) <= 4 ? "manager scored at the bottom of the scale" : "low score and near-zero increment together"}
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            )}
          </Card>

          {/* ── perception gap ── */}
          <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))" }}>
            <Card title="Sees themselves higher than the manager does" note="The biggest self-minus-manager gaps — where the appraisal conversation has the most explaining to do." flush>
              <MiniGap rows={gaps.filter((g) => g.gap >= 2).slice(0, 6)} P={P} color={C.orange} />
            </Card>
            <Card title="Rated higher by the manager than by themselves" note="Possible hidden gems — people underselling themselves. Worth telling them so." flush>
              <MiniGap rows={[...gaps].reverse().filter((g) => g.gap <= -1.5).slice(0, 6)} P={P} color={C.green} flip />
            </Card>
          </div>

          {/* ── ask vs give + tenure ── */}
          <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))" }}>
            <Card title="Asked vs getting" note="What each person asked for on the green line, against where the company is landing. The biggest unmet asks are the retention conversations." flush>
              {!asks.length ? <div className="text-sm px-3 pb-3" style={{ color: C.faint }}>Nobody has asked yet.</div> : (
                <div className="px-3 pb-3">
                  {asks.slice(0, 6).map(({ r, askPct, gotPct, indicative }) => (
                    <div key={r.id} className="flex items-center justify-between py-1" style={{ borderBottom: "1px solid #F2F0EA", fontSize: 12.5 }}>
                      <P r={r} />
                      <span className="tnum">asked <b style={{ color: C.orange }}>{pct(askPct)}</b> · getting <b>{gotPct != null ? pct(gotPct) : "—"}{indicative ? "*" : ""}</b></span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card title="Increase by tenure" note="Are we rewarding the years or the work? A flat line here is a choice — make it consciously." flush>
              <div className="px-3 pb-3">
                {bands.map((b) => (
                  <div key={b.band} className="flex items-center gap-2 py-1" style={{ fontSize: 12.5 }}>
                    <span style={{ width: 84, color: C.dim }}>{b.band}</span>
                    <span className="tnum" style={{ width: 34, color: C.faint }}>{b.n}</span>
                    <div style={{ flex: 1, height: 8, background: "#F2F0EA", borderRadius: 4 }}>
                      {b.avg != null && <div style={{ height: 8, width: `${Math.min(100, Math.max(2, b.avg * 4))}%`, background: "var(--blue)", borderRadius: 4 }} />}
                    </div>
                    <b className="tnum" style={{ width: 52, textAlign: "right" }}>{pct(b.avg)}</b>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </Pane>
  );
}

/* ── the bell curve ── */
function BellCurve({ values, mean, sd, title, note, unit, step }: {
  values: number[]; mean: number; sd: number; title: string; note: string; unit: "pct" | "inr"; step?: number;
}) {
  if (values.length < 3) {
    return <Card title={title} note="Appears once at least a few increments are on the table."><div className="text-sm" style={{ color: C.faint }}>{values.length} so far — too few to draw honestly.</div></Card>;
  }
  /* In rupees the range is not known in advance, so the bucket is chosen to
     give about twenty of them and then rounded to a figure a person would
     actually say out loud — 500, 1,000, 2,500, 5,000 — never 1,873. */
  const span = Math.max(...values) - Math.min(0, ...values);
  const nice = [250, 500, 1000, 2000, 2500, 5000, 10000, 25000, 50000];
  const st = step ?? (nice.find((v) => span / v <= 20) ?? 100000);
  const lo = Math.floor(Math.min(0, ...values) / st) * st;
  const hi = Math.ceil(Math.max(...values) / st) * st + st;
  const buckets: { x0: number; n: number }[] = [];
  for (let x = lo; x < hi; x += st) buckets.push({ x0: x, n: values.filter((p) => p >= x && p < x + st).length });
  const maxN = Math.max(...buckets.map((b) => b.n), 1);
  const W = 680, H = 190, padL = 26, padB = 24;
  const bw = (W - padL - 8) / buckets.length;
  const X = (v: number) => padL + ((v - lo) / (hi - lo)) * (W - padL - 8);
  // the ideal normal with this mean and spread, drawn over the real bars
  const curve = sd > 0 ? Array.from({ length: 81 }, (_, i) => {
    const v = lo + (i / 80) * (hi - lo);
    const y = Math.exp(-((v - mean) ** 2) / (2 * sd * sd));
    return `${i ? "L" : "M"}${X(v).toFixed(1)},${(H - padB - y * (H - padB - 14)).toFixed(1)}`;
  }).join(" ") : "";
  /* EVERY LABEL PRINTED IS EVERY LABEL UNREADABLE (7 Sep 2026): at 34
     buckets they ran into one another and the axis said nothing. One in
     every nth, chosen so they never touch. */
  const every = Math.max(1, Math.ceil(34 / bw));
  const lbl = (v: number) => (unit === "pct" ? `${v}%` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v));
  return (
    <Card title={title} note={note}>
      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 480, display: "block" }}>
          {buckets.map((b, i) => {
            const h = (b.n / maxN) * (H - padB - 14);
            return (
              <g key={i}>
                <rect x={X(b.x0) + 1.5} y={H - padB - h} width={bw - 3} height={h} rx={3}
                  fill={b.x0 < 0 ? "#D9838B" : b.x0 < mean - sd ? "#C9C6BD" : b.x0 > mean + sd ? "#7FB89A" : "var(--blue)"} opacity={0.85} />
                {b.n > 0 && <text x={X(b.x0) + bw / 2} y={H - padB - h - 4} textAnchor="middle" fontSize="9.5" fill="#5A6572">{b.n}</text>}
                {i % every === 0 && <text x={X(b.x0) + bw / 2} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--muted)">{lbl(b.x0)}</text>}
              </g>
            );
          })}
          {curve && <path d={curve} fill="none" stroke="#B3392E" strokeWidth={1.7} strokeDasharray="5 3" opacity={0.8} />}
          <line x1={X(mean)} y1={12} x2={X(mean)} y2={H - padB} stroke="#B3392E" strokeWidth={1.3} />
          <text x={X(mean) + 4} y={20} fontSize="10" fontWeight="bold" fill="#B3392E">mean {unit === "pct" ? pct(mean) : `₹${inr(Math.round(mean))}`}</text>
        </svg>
      </div>
    </Card>
  );
}

/* ── small parts ── */
function Big({ n, l, sub, green }: { n: string; l: string; sub?: string; green?: boolean }) {
  return (
    <div className="bg-white rounded-lg border px-3 py-2" style={{ borderColor: C.line, minWidth: 140 }}>
      <div className="font-bold tnum" style={{ fontSize: 19, lineHeight: 1.15, color: green ? C.green : C.ink }}>{n}</div>
      <div style={{ fontSize: 11, color: C.faint }}>{l}</div>
      {sub && <div style={{ fontSize: 10, color: "#A8A395" }}>{sub}</div>}
    </div>
  );
}

function Card({ title, note, tone, flush, children }: { title: string; note?: string; tone?: string; flush?: boolean; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border mb-3" style={{ borderColor: C.line, borderTop: `3px solid ${tone || "var(--navy)"}` }}>
      <div className="px-3 pt-2.5 pb-1.5">
        <div className="font-bold" style={{ fontSize: 13.5, color: tone || C.ink }}>{title}</div>
        {note && <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.5 }}>{note}</div>}
      </div>
      {flush ? children : <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function Board({ title, rows, right, P }: {
  title: string;
  rows: { r: Row; e: { gross: number | null; pct: number | null; indicative: boolean } }[];
  right: (x: { r: Row; e: { gross: number | null; pct: number | null; indicative: boolean } }) => React.ReactNode;
  P: (p: { r: Row; bold?: boolean }) => React.ReactNode;
}) {
  return (
    <Card title={title} flush>
      <div className="px-3 pb-3">
        {!rows.length && <div className="text-sm" style={{ color: C.faint }}>Nothing yet.</div>}
        {rows.map((x, i) => (
          <div key={x.r.id} className="flex items-center justify-between py-1" style={{ borderBottom: "1px solid #F2F0EA", fontSize: 12.5 }}>
            <span className="flex items-center gap-1.5">
              <span className="tnum" style={{ width: 16, color: "#C9C6BD", fontSize: 10.5 }}>{i + 1}</span>
              {P({ r: x.r })}
              <span style={{ color: C.faint, fontSize: 10.5 }}>{x.r.department || ""}</span>
            </span>
            <span className="tnum">{right(x)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MiniGap({ rows, P, color, flip }: { rows: { r: Row; gap: number }[]; P: (p: { r: Row }) => React.ReactNode; color: string; flip?: boolean }) {
  if (!rows.length) return <div className="text-sm px-3 pb-3" style={{ color: C.faint }}>No wide gaps — self and manager broadly agree.</div>;
  return (
    <div className="px-3 pb-3">
      {rows.map(({ r, gap }) => (
        <div key={r.id} className="flex items-center justify-between py-1" style={{ borderBottom: "1px solid #F2F0EA", fontSize: 12.5 }}>
          {P({ r })}
          <span className="tnum">self <b>{r.selfAvg?.toFixed(1)}</b> · mgr <b>{r.mgrAvg?.toFixed(1)}</b> <b style={{ color }}>({flip ? "" : "+"}{gap.toFixed(1)})</b></span>
        </div>
      ))}
    </div>
  );
}
