/**
 * THE SIGNED PLAN, AS A DOCUMENT.
 *
 * One template, used by both the mail that goes out on signing and the ↓ PDF
 * button that stays on the desk afterwards (Dr Raghu, 1 Sep 2026: "Also
 * attach the PDF" … "let the pdf be available on top after they submit the
 * plan too"). Two renderers would drift, and the day they disagreed nobody
 * could say which one the signer had actually signed.
 *
 * It is drawn from the SNAPSHOT the signature stored, never from live data:
 * a plan is a statement made on a date, and a document that quietly
 * re-rendered itself from today's table would be a different plan wearing
 * the same signature.
 */
const CR = 1e7;
const cr = (n: number) => `₹${((Number(n) || 0) / CR).toFixed(2)} Cr`;
const esc = (x: unknown) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const dmy = (iso: unknown) => {
  const s = String(iso || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split("-").reverse().join("-") : "—";
};

export interface PlanPdfInput {
  title: string;
  window: { from: string; end: string; key: string; label: string };
  snapshot: Record<string, unknown>[];
  plan: { jobs: number; value: number; throughput: number };
  real: { jobs: number; value: number; throughput: number };
  signedOn: string;
  done?: { nos: number; value: number; throughput: number };
}

export function planPdfHtml(i: PlanPdfInput): string {
  const rows = (i.snapshot || []).map((r) => {
    const b = Number(r.belief) || 0;
    return `<tr>
<td>${esc(String(r.id ?? "").slice(-4))}</td>
<td>${esc(r.tag)}</td>
<td class="n">${cr(Number(r.val) || 0)}</td>
<td class="n">${cr(Number(r.tp) || 0)}</td>
<td class="c">${esc(dmy(r.tdd))}</td>
<td class="c"><b>${esc(dmy(r.best_estimate))}</b></td>
<td class="c" style="color:${b >= 75 ? "#0D7A3F" : b >= 50 ? "#B26A00" : "#B3261E"}"><b>${b}%</b></td>
<td>${esc(r.comment || "")}</td>
</tr>`;
  }).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4 landscape; margin: 12mm; }
body { font: 10pt/1.45 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #16232F; }
h1 { font-size: 15pt; margin: 0 0 2mm; }
.sub { color: #5A6672; font-size: 9pt; margin-bottom: 4mm; }
table { border-collapse: collapse; width: 100%; font-size: 8.5pt; }
th { background: #22303C; color: #fff; text-align: left; padding: 2mm; }
td { border-bottom: 1px solid #E2E0DA; padding: 1.6mm 2mm; vertical-align: top; }
td.n { text-align: right; white-space: nowrap; }
td.c { text-align: center; white-space: nowrap; }
.tot { margin-top: 4mm; font-size: 9.5pt; }
.tot b { color: #E8600A; }
.foot { margin-top: 5mm; color: #8A94A0; font-size: 8pt; }
</style></head><body>
<h1>${esc(i.title)}</h1>
<div class="sub">${esc(i.window.label)} · ${esc(i.window.key)} · ${esc(dmy(i.window.from))} to ${esc(dmy(i.window.end))} · signed in Genie on ${esc(i.signedOn)} (IST)</div>
<table>
<thead><tr><th>Job</th><th>Tag</th><th>Value</th><th>TP</th><th>TDD</th><th>My date</th><th>Belief</th><th>What I believe needs to HAPPEN</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<div class="tot">
<div>The plan as it stands: <b>${i.plan.jobs} jobs</b> · ${cr(i.plan.value)} · ${cr(i.plan.throughput)} throughput</div>
<div>The realistic read, on my dates and my belief: <b>${i.real.jobs} jobs at 50% belief or better</b> · ${cr(i.real.value)} · ${cr(i.real.throughput)} throughput</div>
${i.done ? `<div style="color:#5A6672">Done so far this period: ${i.done.nos} nos · ${cr(i.done.value)} · ${cr(i.done.throughput)}</div>` : ""}
</div>
<div class="foot">Belief-weighted, on the planner's own best-estimate dates. Signed in Genie — the living version is on the Month, Quarter &amp; Year Plan desk.</div>
</body></html>`;
}
