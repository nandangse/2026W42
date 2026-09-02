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

const CR = 1e7;
const cr = (n: number) => `₹${((Number(n) || 0) / CR).toFixed(2)} Cr`;
const esc = (x: unknown) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const dmy = (iso: unknown) => {
  const s = String(iso || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split("-").reverse().join("-") : "—";
};

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

export function planPdfHtml(i: PlanPdfInput): string {
  const state: PlanState = i.state ?? "draft";
  const band =
    state === "approved" ? { text: "PLAN APPROVED", bg: "#0D7A3F" }
    : state === "frozen" ? { text: "FROZEN — MONTH PLAN", bg: "#1B3A5C" }
    : { text: "DRAFT — NOT YET SUBMITTED", bg: "#B26A00" };

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

  /** Counts by product family and by customer, in his own shorthand. */
  const tally = (key: string) => {
    const m = new Map<string, { n: number; v: number; t: number }>();
    for (const r of i.snapshot || []) {
      const k = String(r[key] || "").trim() || "—";
      const c = m.get(k) || { n: 0, v: 0, t: 0 };
      c.n++; c.v += Number(r.val) || 0; c.t += Number(r.tp) || 0;
      m.set(k, c);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]));
  };
  /** Count, value and THROUGHPUT — the two moneys rank a family differently. */
  const chips = (list: [string, { n: number; v: number; t: number }][]) =>
    list.map(([k, c]) =>
      `<span class="chip"><b>${c.n}</b> ${esc(k)}${money ? ` · ${cr(c.v)} · <span style="color:#0D7A3F">${cr(c.t)}</span>` : ""}</span>`,
    ).join("");

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

<div class="tallies">
  <div class="tlabel">BY PRODUCT FAMILY</div>
  <div>${chips(tally("fam")) || '<span class="faint">—</span>'}</div>
  <div class="tlabel" style="margin-top:2mm">BY CUSTOMER</div>
  <div>${chips(tally("cust")) || '<span class="faint">—</span>'}</div>
</div>

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

<div class="tot">
<div>The plan as it stands: <b>${i.plan.jobs} jobs</b>${money ? ` · ${M(i.plan.value)} · ${M(i.plan.throughput)} throughput` : ""}</div>
<div>The realistic read, on my dates and my belief: <b>${i.real.jobs} jobs at 50% belief or better</b>${money ? ` · ${M(i.real.value)} · ${M(i.real.throughput)} throughput` : ""}</div>
${i.done ? `<div style="color:#5A6672">Done so far this period: ${i.done.nos} nos${money ? ` · ${M(i.done.value)} · ${M(i.done.throughput)}` : ""}</div>` : ""}
</div>

${sigBlock}
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
