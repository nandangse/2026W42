import { fmtFull, jobNo } from "@/lib/schedule";

/**
 * THE FOR-UPDATING TABLE AS A PRINTED SHEET (Dr Raghu, 15 Oct 2026: "help me
 * see a pdf of this"). A4 landscape, the same columns in the same order as the
 * screen, the head repeated on every page and a row never split. Opened in a
 * new window and handed to the print dialog, where Save as PDF is a
 * destination — the pattern of the pending-tasks pack.
 */
export interface UpdRow {
  id: string; tag: string; cust: string; tdd: string | null; owner: string | null; pct: number; kit: number;
  tpv: number; tpp: number; note: string; updated_at: string | null; stat: string;
  tasks: number; late: number; escalation: string | null; esc: { t: string; esc: string }[];
}
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export function updatingSheetHtml(rows: UpdRow[], today: string, V: (v: number) => string): string {
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }) : "");
  const tr = rows.map((r, i) => `<tr>
    <td class="n">${i + 1}</td>
    <td class="job">${esc(jobNo(r.id))}</td>
    <td class="tag"><b>${esc(r.tag)}</b><div class="sub">${esc(r.cust)}</div></td>
    <td class="c ${r.tdd && r.tdd < today ? "od" : ""}">${esc(fmtFull(r.tdd))}</td>
    <td class="c">${esc(r.owner || "—")}</td>
    <td class="c">${r.pct}%</td>
    <td class="c">${r.kit}%</td>
    <td class="r">${esc(V(r.tpv || 0))}</td>
    <td class="c">${r.tpp || 0}%</td>
    <td class="upd">${esc(r.note) || "<i>—</i>"}${r.updated_at ? `<div class="sub">${esc(when(r.updated_at))}</div>` : ""}</td>
    <td class="st">${esc(r.stat)}</td>
    <td class="c">${r.tasks ? `<b>${r.tasks}</b>${r.late ? `<div class="od">${r.late} late</div>` : ""}` : "—"}</td>
    <td class="esc">${r.escalation ? `<div class="od">${esc(r.escalation)}</div>` : ""}${r.esc.slice(0, 3).map((e) => `<div><b>${esc(e.esc.split(" ")[0])}</b> ${esc(e.t)}</div>`).join("")}${r.esc.length > 3 ? `<div class="sub">+${r.esc.length - 3} more</div>` : ""}${!r.escalation && !r.esc.length ? "—" : ""}</td>
  </tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Job delivery board — for updating · ${esc(fmtFull(today))}</title>
<style>
@page { size: A4 landscape; margin: 9mm 10mm 10mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #16232F; font-size: 7.6pt; }
h1 { font-size: 13pt; margin: 0 0 1mm; }
.meta { font-size: 7.5pt; color: #6B7280; margin-bottom: 3mm; }
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
th { background: #16232F; color: #fff; text-align: left; padding: 1.4mm 1.4mm; font-size: 6.6pt; letter-spacing: .05em; text-transform: uppercase; }
td { padding: 1.2mm 1.4mm; border-bottom: .2mm solid #E6E3DB; vertical-align: top; line-height: 1.3; }
tr:nth-child(even) td { background: #FAF9F5; }
.n { width: 6mm; color: #8B8F87; } .job { width: 11mm; font-weight: 700; color: #12386B; }
.tag { width: 42mm; } .sub { color: #8B8F87; font-size: 6.5pt; }
.c { text-align: center; white-space: nowrap; } .r { text-align: right; white-space: nowrap; color: #B45309; }
.upd { min-width: 70mm; } .st { width: 30mm; } .esc { width: 42mm; }
.od { color: #B3261E; font-weight: 700; }
th.c, th.r { text-align: center; }
.ft { margin-top: 3mm; font-size: 6.5pt; color: #8B8F87; display: flex; justify-content: space-between; }
</style></head><body>
<h1>Job Delivery Board — for updating</h1>
<div class="meta">${rows.length} jobs in the Priority List's order · as at ${esc(fmtFull(today))} · Nandan GSE</div>
<table>
<thead><tr><th>#</th><th>Job</th><th>Customer tag</th><th class="c">Target delivery</th><th class="c">Owner</th><th class="c">Prod %</th><th class="c">Kit %</th><th class="r">Throughput</th><th class="c">T%</th><th>Current update</th><th>Status</th><th class="c">Tasks pending</th><th>Escalations</th></tr></thead>
<tbody>${tr}</tbody>
</table>
<div class="ft"><span>Nandan GSE · Genie · job delivery board, for updating</span><span>${esc(fmtFull(today))}</span></div>
</body></html>`;
}
