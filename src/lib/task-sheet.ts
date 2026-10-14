import { catColour, jobNo, fmtFull, TASK_CATS } from "@/lib/schedule";

/**
 * PENDING TASKS, ONE JOB TO A PAGE.
 *
 * Dr Raghu, 30 Sep 2026: "have a provision to have pending tasks for every job
 * in an A4 portrait ... sorted by the assigned person ... the due date seen
 * ... columns properly eg material, quality ... it has to fit into one A4 ...
 * a page break for every job and also sort by the TDD of the job. Be creative."
 *
 * WHY ONE JOB TO A PAGE AND NOT A LIST. A list of four hundred open tasks is
 * a document nobody finishes. A single page for a single job is a thing you
 * can hand to the man running it, pin beside the machine, or send to a
 * supplier — and when it is done, it is visibly done. The page break is the
 * whole point rather than a formatting choice.
 *
 * SORTED BY PERSON, BECAUSE A SHEET IS READ BY A PERSON LOOKING FOR THEIR OWN
 * NAME. Within a name, by date, so the top line is the next thing to do. The
 * category rides as a coloured chip rather than a sort key: a man does not
 * work through all his material tasks and then all his quality ones, he works
 * through them in the order they are due.
 *
 * THE BAND ACROSS THE TOP IS THE ANSWER TO "WHERE IS THIS JOB STUCK" — the
 * count per category, biggest first. Twelve material tasks and one quality
 * task is a different problem from the reverse, and it should be legible
 * before a single row is read.
 */

export interface SheetTask {
  t: string; who: string | null; due: string | null; cat: string | null;
  esc?: string | null; original_due?: string | null; push_count?: number | null;
}
export interface SheetJob {
  id: string; tag: string; fam: string; cust: string;
  tdd: string | null; otd: string | null; owner: string | null;
  kit: number; pct: number; stat: string | null;
  tasks: SheetTask[];
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const dmy = (s: string | null | undefined) =>
  s ? `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(2, 4)}` : "—";
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/** Unassigned sorts last: it is a gap, and a gap belongs at the bottom where it looks like one. */
const personKey = (w: string | null) => (w && w.trim() ? w.trim().toLowerCase() : "￿");

export function sortTasks(tasks: SheetTask[]): SheetTask[] {
  return [...tasks].sort((a, b) =>
    personKey(a.who).localeCompare(personKey(b.who))
    || String(a.due || "9999").localeCompare(String(b.due || "9999"))
    || String(a.cat || "").localeCompare(String(b.cat || "")));
}

/** How many of each category, biggest first — the "where is it stuck" line. */
export function catCounts(tasks: SheetTask[]): { cat: string; n: number }[] {
  const m = new Map<string, number>();
  for (const t of tasks) {
    const c = (t.cat || "").trim() || "General";
    m.set(c, (m.get(c) || 0) + 1);
  }
  return [...m.entries()]
    .map(([cat, n]) => ({ cat, n }))
    .sort((a, b) => b.n - a.n || TASK_CATS.indexOf(a.cat) - TASK_CATS.indexOf(b.cat));
}

/**
 * EVERY OPEN TASK IS PRINTED (Dr Raghu, 5 Oct 2026: "theres some break in
 * the pdf"). The sheet used to be a fixed 297 mm box holding 34 rows; when
 * the rows wrapped to two lines the table ran past the bottom of the box and
 * printed over the next job's page. A job now flows onto as many pages as it
 * needs, the column heads repeat on each, and a row never splits.
 */
function sheet(j: SheetJob, on: string): string {
  const open = sortTasks(j.tasks);
  const shown = open;
  const cats = catCounts(open);
  const late = j.tdd && j.tdd < on ? days(j.tdd, on) : 0;

  /* A name is printed once and then left blank down its own run, so the eye
     sees blocks of work per person rather than the same word forty times. */
  let lastWho = "\u0000";
  const rows = shown.map((t) => {
    const who = (t.who || "").trim() || "unassigned";
    const first = who !== lastWho;
    lastWho = who;
    const c = catColour(t.cat);
    const over = t.due ? days(t.due, on) : null;
    const moved = (t.push_count || 0) > 0;
    return `<tr class="${first ? "newwho" : ""}">
      <td class="who">${first ? `<b>${esc(who)}</b>` : ""}</td>
      <td class="task">${esc(t.t)}${moved ? `<i class="moved" title="the date has moved">&#8635;${t.push_count}</i>` : ""}</td>
      <td class="cat"><span style="background:${c.bg};color:${c.ink};border-color:${c.edge}">${esc((t.cat || "General").slice(0, 11))}</span></td>
      <td class="due ${over != null && over > 0 ? "od" : ""}">${dmy(t.due)}</td>
      <td class="age ${over != null && over > 0 ? "od" : ""}">${over == null ? "—" : over > 0 ? `${over}d` : over === 0 ? "today" : `in ${-over}d`}</td>
    </tr>`;
  }).join("");

  return `<article class="job">
  <header class="hd">
    <div class="jno">${esc(jobNo(j.id))}</div>
    <div class="who1">
      <div class="tag">${esc(j.tag)}</div>
      <div class="meta">${esc(j.fam || "")}${j.cust ? ` &middot; ${esc(j.cust)}` : ""}</div>
    </div>
    <div class="dates">
      <div class="d1">TARGET DELIVERY</div>
      <div class="d2 ${late ? "od" : ""}">${dmy(j.tdd)}${late ? ` &middot; ${late}d over` : ""}</div>
      <div class="d3">${j.owner ? esc(j.owner) : ""}${j.stat ? ` &middot; ${esc(j.stat)}` : ""}</div>
    </div>
  </header>

  <div class="strip">
    <div class="big"><b>${open.length}</b><span>open</span></div>
    ${cats.map((c) => { const k = catColour(c.cat);
      return `<div class="cc" style="background:${k.bg};color:${k.ink};border-color:${k.edge}"><b>${c.n}</b> ${esc(c.cat)}</div>`; }).join("")}
    <div class="pc">KIT <b>${j.kit}%</b> &nbsp; PROD <b>${j.pct}%</b></div>
  </div>

  ${open.length === 0
    ? `<div class="none">Nothing open on this job.</div>`
    : `<table class="t">
    <thead><tr><th class="who">Assigned to</th><th class="task">What is pending</th><th class="cat">Category</th><th class="due">Due</th><th class="age">Late</th></tr></thead>
    <tbody>${rows}</tbody></table>`}

  <footer class="ft">
    <span>Nandan GSE &middot; pending tasks as at ${fmtFull(on)}</span>
    <span>JOB ${esc(jobNo(j.id))}</span>
  </footer>
</article>`;
}

/**
 * TWO TO A PAGE WHEN THEY FIT (Dr Raghu, 14 Oct 2026: "check if two pages
 * back to back can fit on half the page, then make it that way; if not it
 * will have a page break"). Every job is laid out on its own page first; then,
 * in the browser that prints it, each job is measured at the printed width
 * (186 mm, the A4 page less its margins) and a job joins the one before it
 * when both together fit the 276 mm the page can hold. Never more than two to
 * a sheet, never a job split to make room — a job that does not fit starts a
 * fresh page as before. If the script cannot run, the pack is one job a page.
 */
const PAIR_SCRIPT = `(function(){try{
  var MM = 96 / 25.4, ROOM = 276 - 11 - 3;   /* the page, less the dashed gap, less a margin of safety */
  var pages = Array.prototype.slice.call(document.querySelectorAll("section.pg"));
  var open = null;
  pages.forEach(function (pg) {
    var job = pg.querySelector("article.job"); if (!job) return;
    var h = job.getBoundingClientRect().height / MM;
    if (open && open.n === 1 && open.h + h <= ROOM) { open.pg.appendChild(job); pg.parentNode.removeChild(pg); open.n = 2; open = null; return; }
    open = { pg: pg, h: h, n: 1 };
  });
}catch(e){}})();`;

export function taskSheetHtml(jobs: SheetJob[], on: string, title: string): string {
  /* SORTED BY THE JOB'S TARGET DELIVERY (his instruction) — the pack comes out
     in the order the work has to leave the gate. */
  const ordered = [...jobs].sort((a, b) =>
    String(a.tdd || "9999").localeCompare(String(b.tdd || "9999")) || a.id.localeCompare(b.id));
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
@page { size: A4 portrait; margin: 11mm 12mm 10mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color:#16232F; background:#E9E7E0; }
/* a job starts on a fresh page and takes as many as it needs — never a fixed box */
.pg { background:#fff; break-after: page; page-break-after: always; }
.pg:last-child { break-after: auto; page-break-after: auto; }
@media print { body { background:#fff; } }
@media screen { .pg { width:210mm; min-height:297mm; margin:6mm auto; padding:11mm 12mm 10mm; box-shadow:0 1px 6px rgba(0,0,0,.15); } }
.hd, .strip { break-inside: avoid; break-after: avoid; }
/* two short jobs share a sheet, the second below a dashed line */
.job + .job { margin-top:6mm; padding-top:5mm; border-top:.4mm dashed #C9C5BA; }
table.t thead { display: table-header-group; }
table.t tr { break-inside: avoid; page-break-inside: avoid; }

.hd { display:flex; align-items:center; gap:5mm; border-bottom:.8mm solid #16232F; padding-bottom:3mm; }
.jno { font-size:30pt; font-weight:800; letter-spacing:-.03em; color:#12386B; line-height:1; }
.who1 { flex:1; min-width:0; }
.tag { font-size:12pt; font-weight:700; line-height:1.2; }
.meta { font-size:8.5pt; color:#6B7280; margin-top:.8mm; }
.dates { text-align:right; }
.d1 { font-size:6.5pt; letter-spacing:.12em; color:#8B8F87; }
.d2 { font-size:13pt; font-weight:800; }
.d2.od { color:#B3261E; }
.d3 { font-size:8pt; color:#6B7280; margin-top:.5mm; }

.strip { display:flex; gap:2mm; align-items:center; flex-wrap:wrap; margin:3.5mm 0; }
.big { display:flex; align-items:baseline; gap:1.5mm; margin-right:1mm; }
.big b { font-size:19pt; font-weight:800; color:#B45309; line-height:1; }
.big span { font-size:8pt; color:#6B7280; }
.cc { font-size:8pt; padding:1mm 2.4mm; border-radius:1.2mm; border:.25mm solid; font-weight:600; }
.cc b { font-weight:800; }
.pc { margin-left:auto; font-size:8.5pt; color:#46545F; }
.pc b { color:#16232F; }

table.t { width:100%; border-collapse:collapse; font-size:8.4pt; }
table.t th { background:#16232F; color:#fff; text-align:left; padding:1.6mm 1.6mm; font-size:7pt;
             letter-spacing:.06em; text-transform:uppercase; }
table.t td { padding:1.35mm 1.6mm; border-bottom:.2mm solid #EFEDE7; vertical-align:top; }
tr.newwho td { border-top:.35mm solid #D8D5CC; }
td.who, th.who { width:26mm; }
td.who b { font-size:8.6pt; }
td.task { line-height:1.3; }
td.cat, th.cat { width:22mm; }
td.cat span { display:inline-block; font-size:6.8pt; padding:.5mm 1.6mm; border-radius:1mm; border:.2mm solid; font-weight:700; }
td.due, th.due { width:19mm; text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
td.age, th.age { width:14mm; text-align:right; font-variant-numeric:tabular-nums; color:#6B7280; white-space:nowrap; }
td.cat { white-space:nowrap; }
.od { color:#B3261E; font-weight:700; }
i.moved { font-style:normal; font-size:6.8pt; color:#B45309; margin-left:1.5mm; font-weight:700; }
.more { font-size:8pt; color:#B45309; margin-top:2mm; font-style:italic; }
.none { font-size:11pt; color:#0D7A3F; font-weight:700; padding:8mm 0; }

.ft { margin-top:4mm; border-top:.2mm solid #D8D5CC; padding-top:2mm; display:flex; justify-content:space-between;
      font-size:7pt; color:#8B8F87; break-inside: avoid; }
</style></head><body>
${ordered.map((j) => `<section class="pg">${sheet(j, on)}</section>`).join("\n")}
<script>${PAIR_SCRIPT}</script>
</body></html>`;
}
