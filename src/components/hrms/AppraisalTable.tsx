"use client";
/**
 * The Appraisal Table — everybody on one row, and where each one stands.
 *
 * The row is deliberately numbers and stages only: previous gross, new gross,
 * the increment both ways, and how far the IDP has travelled — Started,
 * Completed, Manager Completed, Final. The words live behind the click:
 * the EmployeeID or the name opens that person's Individual Report Card,
 * which is where the discussion actually happens.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import DataTable, { type Column } from "./DataTable";
import { Pane } from "./Pane";
import { announce, onHrmsChange } from "@/lib/hrms-bus";
import { splitGross, perDayOf, payDaysFor } from "@/lib/salary";
import { C } from "./RecordFields";

interface Row {
  id: string; name: string; department: string | null; designation: string | null; type: string | null; manager: string | null; growth?: boolean;
  age: number | null; exp: number | null;
  prevGross: number | null; newGross: number | null; inc: number | null; incPct: number | null;
  stage: string; released?: string | null;
  /** The agreed new structure — what was saved, or Genie's own split. */
  newParts?: { basic_da: number; hra: number; fixed: number; conveyance: number; medical: number; site: number; agreed: boolean } | null;
  newDesignation?: string | null; siteAllowance?: number | null; payDays?: number | null;
  oldParts?: { basic_da: number; hra: number; fixed: number; conveyance: number; medical: number; site: number } | null;
  location?: string | null; mobile?: string | null; personalEmail?: string | null;
}

const inr = (n: number | null) => (n == null ? "" : Math.round(n).toLocaleString("en-IN"));

const AGE_BANDS: [string, (n: number) => boolean][] = [
  ["under 30", (n) => n < 30], ["30 – 40", (n) => n >= 30 && n < 40],
  ["40 – 50", (n) => n >= 40 && n < 50], ["50+", (n) => n >= 50],
];
const EXP_BANDS: [string, (n: number) => boolean][] = [
  ["under 2 yrs", (n) => n < 2], ["2 – 5 yrs", (n) => n >= 2 && n < 5],
  ["5 – 10 yrs", (n) => n >= 5 && n < 10], ["10 – 20 yrs", (n) => n >= 10 && n < 20], ["20+ yrs", (n) => n >= 20],
];

/**
 * The download itself is built on the server — src/lib/appraisal-xlsx.ts —
 * because a coloured workbook needs ExcelJS and ExcelJS wants Node's
 * streams. What goes up is what the filters have left on the screen.
 */

const STAGE_STYLE: Record<string, { bg: string; fg: string }> = {
  "Released": { bg: "#0D7A3F", fg: "#fff" },
  "Appraisal Finalised": { bg: "#E6F4EA", fg: "var(--green)" },
  "Awaiting RJ": { bg: "#FFF7E6", fg: "#8A5B00" },
  "Manager IDP completed": { bg: "#DCE8F5", fg: "var(--blue)" },
  "IDP Done": { bg: "#FFF3E8", fg: "#8A5B00" },
  "Started": { bg: "#F4F2EC", fg: "var(--muted)" },
  "Not Done": { bg: "#F4F2EC", fg: "#C9C6BD" },
};

export default function AppraisalTable({ who, onOpenPerson, isOwner }: { who: string; onOpenPerson: (id: string) => void; isOwner: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [band, setBand] = useState("");   // the four Staff/Workers × released bands
  const [dept, setDept] = useState("");
  const [age, setAge] = useState("");
  const [exp, setExp] = useState("");
  /**
   * SALARY RANGE (Dr Raghu, 2 Sep 2026: "in this also please put a filter for
   * salary range Min and Max"). Typed rather than banded, because the question
   * behind it is never the same twice -- "who is under 25,000", "who is
   * between 40 and 60" -- and a fixed set of bands would answer only the ones
   * somebody guessed in advance.
   */
  // Dr Raghu, 7 Sep 2026: "add filter for reporting manager. multiple tickbox".
  const [mgrs, setMgrs] = useState<Set<string>>(new Set());
  const [mgrOpen, setMgrOpen] = useState(false);
  const [mgrQ, setMgrQ] = useState("");
  // the mass run of growth notes (Dr Raghu, 7 Sep 2026: "it will be generated
  // for all in mass at the end together")
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [run, setRun] = useState<{ done: number; of: number; now: string; fail: number } | null>(null);
  const stop = useState<{ v: boolean }>({ v: false })[0];
  const [minPay, setMinPay] = useState("");
  const [maxPay, setMaxPay] = useState("");

  const reload = useCallback(() => {
    api.get("/api/hrms/idp?table=1").then((j) => setRows(j.rows || []))
      .catch((e) => { setMsg(e instanceof Error ? e.message : String(e)); setRows([]); });
  }, []);
  useEffect(() => { reload(); }, [reload]);

  /**
   * THE COUNTS FOLLOW THE WORK (Dr Raghu, 7 Sep 2026: "this is not updating
   * automatically. Once the change of status is done it should update!").
   *
   * Since the discussions open in their own tabs, this table sits in a tab
   * that would otherwise never hear what happened in them. It listens now —
   * for a finalise or a release announced by another tab, and for being
   * looked at again, which catches anything the message missed.
   */
  useEffect(() => onHrmsChange(reload), [reload]);

  const types = useMemo(() => [...new Set((rows || []).map((r) => r.type).filter(Boolean))].sort() as string[], [rows]);
  const depts = useMemo(() => [...new Set((rows || []).map((r) => r.department).filter(Boolean))].sort() as string[], [rows]);
  /** Every reporting manager on the roll, with how many report to them; nobody's manager is its own line. */
  const managers = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of rows || []) { const k = (r.manager || "").trim() || "— none named —"; n.set(k, (n.get(k) || 0) + 1); }
    return [...n.entries()].sort((a, b) => (a[0] === "— none named —" ? 1 : b[0] === "— none named —" ? -1 : b[1] - a[1] || a[0].localeCompare(b[0])));
  }, [rows]);

  /**
 * THE FOUR BANDS (Dr Raghu, 7 Sep 2026: "show dropdown of the chosen type —
 * Staff IDP not released, Staff IDP released, Worker IDP released, Workers
 * IDP not released. Staff means both staff and contractors, workers means
 * both labour and labour contract").
 *
 * One dropdown answers the only question being asked at this stage of the
 * round: who is still waiting to be told. The two families are his, not the
 * record's — the record knows four types, he thinks in two.
 */
const STAFF_TYPES = new Set(["Staff", "Contractor", "Consultant", "Intern", "Management"]);
const WORKER_TYPES = new Set(["Labour", "Labour - Contract"]);
/** Finalised = the number is agreed. Released is a later act, and its own stage. */
const isFinal = (stage: string) => stage === "Appraisal Finalised" || stage === "Released";
const BANDS: [string, (t: string, released: boolean, stage: string) => boolean][] = [
  ["Staff, IDP not released", (t, rel) => STAFF_TYPES.has(t) && !rel],
  ["Staff, IDP released", (t, rel) => STAFF_TYPES.has(t) && rel],
  ["Staff, not finalised", (t, _r, st) => STAFF_TYPES.has(t) && !isFinal(st)],
  ["Staff, finalised but not released", (t, rel, st) => STAFF_TYPES.has(t) && isFinal(st) && !rel],
  ["Workers, IDP not released", (t, rel) => WORKER_TYPES.has(t) && !rel],
  ["Workers, IDP released", (t, rel) => WORKER_TYPES.has(t) && rel],
  ["Workers, not finalised", (t, _r, st) => WORKER_TYPES.has(t) && !isFinal(st)],
  ["Workers, finalised but not released", (t, rel, st) => WORKER_TYPES.has(t) && isFinal(st) && !rel],
];

const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    const ageF = AGE_BANDS.find(([l]) => l === age)?.[1];
    const expF = EXP_BANDS.find(([l]) => l === exp)?.[1];
    const bandF = BANDS.find(([l]) => l === band)?.[1];
    return (rows || []).filter((r) => {
      if (bandF && !bandF(String(r.type || ""), !!r.released, String(r.stage || ""))) return false;
      if (type && r.type !== type) return false;
      if (dept && r.department !== dept) return false;
      if (mgrs.size && !mgrs.has((r.manager || "").trim() || "— none named —")) return false;
      if (ageF && (r.age == null || !ageF(r.age))) return false;
      if (expF && (r.exp == null || !expF(r.exp))) return false;
      /**
       * Filtered on PREVIOUS GROSS -- what they are paid now, which is what a
       * salary question is actually about before an appraisal decides the
       * new one. Somebody with NO previous gross recorded drops out the
       * moment either bound is set: a blank is not a zero, and letting it
       * pass as one would put every unrecorded person in the "under 25,000"
       * answer.
       */
      const lo = minPay.trim() === "" ? null : Number(minPay);
      const hi = maxPay.trim() === "" ? null : Number(maxPay);
      if (lo != null || hi != null) {
        if (r.prevGross == null) return false;
        const g = Number(r.prevGross);
        if (lo != null && Number.isFinite(lo) && g < lo) return false;
        if (hi != null && Number.isFinite(hi) && g > hi) return false;
      }
      if (n && !`${r.id} ${r.name} ${r.designation || ""}`.toLowerCase().includes(n)) return false;
      return true;
    });
  }, [rows, q, band, type, dept, mgrs, age, exp, minPay, maxPay]);

  /**
   * THE APPRAISAL TABLE ON PAPER.
   *
   * It prints WHAT IS ON SCREEN -- the filters are the point of this table,
   * and a PDF that quietly reverts to all 202 people is not the document the
   * person asked for. The heading says which filters were on, so a printout
   * found on a desk in a fortnight can still be placed.
   *
   * Built as its own page rather than by asking the app's layout to become
   * one: the frozen columns, the scroller and the flex heights all have to be
   * undone by a print stylesheet, and that trick has produced blank sheets
   * three times now.
   */
  const pressPaper = () => {
    if (!shown.length) { window.alert("Nothing to print — no row matches these filters."); return; }
    const esc = (v: unknown) => String(v ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const on: string[] = [];
    if (type) on.push(type);
    if (dept) on.push(dept);
    if (mgrs.size) on.push(`under ${[...mgrs].join(", ")}`);
    if (age) on.push(`age ${age}`);
    if (exp) on.push(`experience ${exp}`);
    if (minPay || maxPay) on.push(`gross ${minPay || "any"}–${maxPay || "any"}`);
    if (q.trim()) on.push(`"${q.trim()}"`);
    const num = (v: number | null | undefined) => v == null ? "—" : inr(v);
    const head = ["ID", "Name", "Department", "Designation", "Age", "Nandan Exp",
      "Previous Gross", "New Gross", "Increase", "Increase %", "IDP Status"];
    const body = shown.map((r) => `<tr>
      <td class="n">${esc(r.id)}</td><td>${esc(r.name)}</td>
      <td>${esc(r.department || "")}</td><td>${esc(r.designation || "")}</td>
      <td class="r">${r.age == null ? "—" : r.age}</td>
      <td class="r">${r.exp == null ? "—" : r.exp}</td>
      <td class="r">${num(r.prevGross)}</td>
      <td class="r b">${num(r.newGross)}</td>
      <td class="r">${r.inc == null ? "—" : (r.inc >= 0 ? "+" : "−") + inr(Math.abs(r.inc))}</td>
      <td class="r">${r.incPct == null ? "—" : (r.incPct >= 0 ? "+" : "") + r.incPct + "%"}</td>
      <td>${esc(r.stage)}</td></tr>`).join("");
    // Only the money that is actually on the page is totalled -- a blank
    // gross adds nothing rather than a zero, and the count says how many.
    const withPrev = shown.filter((r) => r.prevGross != null);
    const withNew = shown.filter((r) => r.newGross != null);
    const sumOf = (rs: Row[], k: "prevGross" | "newGross") => rs.reduce((a, r) => a + Number(r[k] || 0), 0);
    const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
    const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Appraisal Table — Nandan GSE</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font: 9pt -apple-system, Arial, sans-serif; color: #16232F; margin: 0; }
  h1 { font-size: 14pt; margin: 0 0 2px; }
  .sub { color: #6A737D; font-size: 8.5pt; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { background: #22303C; color: #fff; text-align: left; padding: 5px 6px; font-size: 8pt; }
  td { padding: 4px 6px; border-bottom: 1px solid #EFEDE7; }
  tr { page-break-inside: avoid; }
  tbody tr:nth-child(even) td { background: #FAF9F5; }
  .r { text-align: right; } .n { font-weight: 700; color: #1B3A5C; } .b { font-weight: 700; }
  tfoot td { border-top: 2px solid #22303C; font-weight: 700; padding-top: 6px; }
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
</style></head><body>
<h1>Appraisal Table</h1>
<div class="sub">Nandan GSE &middot; ${esc(when)} IST &middot; ${shown.length} of ${(rows || []).length} on the roll${on.length ? " &middot; " + esc(on.join(" &middot; ")) : ""}</div>
<table className="genie-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
<tbody>${body}</tbody>
<tfoot><tr>
  <td colspan="6">TOTAL &middot; ${shown.length} shown</td>
  <td class="r">${inr(sumOf(withPrev, "prevGross"))}</td>
  <td class="r">${inr(sumOf(withNew, "newGross"))}</td>
  <td colspan="3">${withPrev.length} with a previous gross &middot; ${withNew.length} with a new one</td>
</tr></tfoot></table>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) { window.alert("Your browser blocked the print window. Allow pop-ups for this site and press PDF again."); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    // Let the page lay out before the dialogue opens, or Chrome measures an
    // empty document and offers a blank sheet -- the very fault being fixed.
    w.setTimeout(() => w.print(), 350);
  };

  /**
   * A REAL LINK, OPENING IN A NEW TAB (Dr Raghu, 7 Sep 2026: "in this table
   * open the appraisal discussion with them in new tab"). The table is the
   * index and one keeps one's place in it while the discussions open beside
   * it. Being an anchor rather than a button, it also middle-clicks, copies
   * and sends to somebody as a link.
   */
  const link = (r: Row, text: string, bold = false) => (
    <a href={`/hrms#appraisal.card:${encodeURIComponent(r.id)}`} target="_blank" rel="noopener noreferrer"
      className={`text-left ${bold ? "font-bold" : "font-semibold"}`}
      style={{ color: "var(--blue)", textDecoration: "underline", textUnderlineOffset: 2 }}
      title="Open the appraisal discussion in a new tab">
      {text}
    </a>
  );

  const columns: Column<Row>[] = useMemo(() => [
    ...(isOwner ? [{
      key: "pick", label: "✓", width: 40, value: (r: Row) => (picked.has(r.id) ? 1 : 0),
      render: (r: Row) => <input type="checkbox" checked={picked.has(r.id)} onChange={() => setPicked((s2) => { const n = new Set(s2); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />,
      title: "Tick rows, then act on all of them at once",
    }] : []),
    { key: "id", label: "EmployeeID", width: 110, value: (r) => r.id, render: (r) => link(r, r.id, true) },
    { key: "name", label: "Name", width: 200, value: (r) => r.name, render: (r) => link(r, r.name) },
    { key: "department", label: "Department", width: 140, value: (r) => r.department },
    { key: "designation", label: "Designation", width: 180, value: (r) => r.designation },
    { key: "age", label: "Age", width: 70, align: "right", numeric: true, value: (r) => r.age },
    { key: "exp", label: "Nandan Exp", width: 100, align: "right", numeric: true, value: (r) => r.exp, title: "Years since joining" },
    { key: "prevGross", label: "Previous Gross", width: 120, align: "right", numeric: true, value: (r) => r.prevGross, render: (r) => <span className="tnum">{inr(r.prevGross)}</span> },
    { key: "newGross", label: "New Gross", width: 110, align: "right", numeric: true, value: (r) => r.newGross, render: (r) => <b className="tnum" style={{ color: r.newGross != null ? C.green : undefined }}>{inr(r.newGross)}</b> },
    { key: "inc", label: "Increase", width: 100, align: "right", numeric: true, value: (r) => r.inc, render: (r) => r.inc == null ? null : <span className="tnum" style={{ color: r.inc >= 0 ? C.green : C.red }}>{r.inc >= 0 ? "+" : "−"}{inr(Math.abs(r.inc))}</span> },
    { key: "incPct", label: "Increase %", width: 100, align: "right", numeric: true, value: (r) => r.incPct, render: (r) => r.incPct == null ? null : <span className="tnum" style={{ color: r.incPct >= 0 ? C.green : C.red }}>{r.incPct >= 0 ? "+" : ""}{r.incPct}%</span> },
    {
      key: "stage", label: "IDP Status", width: 150, value: (r) => r.stage,
      render: (r) => {
        const st = STAGE_STYLE[r.stage] || STAGE_STYLE["—"];
        return <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: st.bg, color: st.fg }}>{r.stage}</span>;
      },
      title: "Not Done → IDP Done (they submitted) → Manager IDP completed (the review is in) → Appraisal Finalised (the new gross is decided) → Released (they have been told)",
    },
    {
      key: "released", label: "Released", width: 120, value: (r) => (r.released ? String(r.released).slice(0, 10) : ""),
      title: "The day the person was told. Finalise first; then release — one row, or many at once.",
      render: (r) => {
        const on = !!r.released;
        if (!isOwner) return on ? <span className="tnum" style={{ color: C.green, fontWeight: 700 }}>{String(r.released).slice(8, 10)}-{String(r.released).slice(5, 7)}</span> : <span style={{ color: "#C9C6BD" }}>·</span>;
        const ready = r.stage === "Appraisal Finalised" || on;
        return (
          <button onClick={() => ready && release([r.id], !on)} disabled={!ready}
            className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: on ? "var(--green)" : ready ? "#fff" : "transparent", color: on ? "#fff" : ready ? "var(--dim)" : "#C9C6BD", border: `1px solid ${on ? "var(--green)" : ready ? C.line : "transparent"}`, cursor: ready ? "pointer" : "default" }}
            title={on ? `Released ${String(r.released).slice(0, 10)} — click to take it back` : ready ? "Mark as released to the person" : "Finalise the appraisal first"}>
            {on ? `✓ ${String(r.released).slice(8, 10)}-${String(r.released).slice(5, 7)}` : ready ? "release" : "·"}
          </button>
        );
      },
    },
    // the tick and the release cell read state, so the columns rebuild with it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [isOwner, picked, rows]);

  const done = (rows || []).filter((r) => r.stage === "Appraisal Finalised" || r.stage === "Released").length;
  const mgr = (rows || []).filter((r) => r.stage === "Manager IDP completed").length;
  const sub = (rows || []).filter((r) => r.stage === "IDP Done").length;
  const released = (rows || []).filter((r) => r.stage === "Released").length;
  // Dr Raghu, 7 Sep 2026: "also in this put pending" — everybody not yet finalised.
  const pending = (rows || []).filter((r) => r.stage !== "Appraisal Finalised" && r.stage !== "Released").length;

  /** Approve the proposed gross for everybody ticked — the step before releasing. */
  const finalise = async (ids: string[]) => {
    if (!ids.length) return;
    if (!window.confirm(`Finalise ${ids.length} ${ids.length === 1 ? "appraisal" : "appraisals"}?\n\nThis approves the new gross that is proposed on each. Releasing is a separate step.`)) return;
    setMsg("");
    try {
      const r = await api.post("/api/hrms/idp", { action: "approve-appraisal", ids });
      setMsg(`${r.approved} finalised${r.approved < ids.length ? ` · ${ids.length - r.approved} skipped, nothing proposed on them` : ""} ✓`);
      const j = await api.get("/api/hrms/idp?table=1"); setRows(j.rows || []); setPicked(new Set());
      announce("released");
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  /** The shown rows, in his column order, as a real .xlsx. */
  const downloadExcel = async () => {
    /**
     * The sheet is built on the server, where ExcelJS can colour it — the
     * rows go up exactly as they are filtered and sorted here, so what
     * downloads is what he is looking at (Dr Raghu, 7 Sep 2026: "from the
     * button").
     */
    const payload = shown.map((r) => ({
      id: r.id, name: r.name, type: r.type, exp: r.exp, age: r.age,
      department: r.department, designation: r.designation, manager: r.manager,
      location: r.location ?? null, mobile: r.mobile ?? null, personalEmail: r.personalEmail ?? null,
      payDays: r.payDays ?? payDaysFor(String(r.type || "")),
      oldParts: r.oldParts ?? null, prevGross: r.prevGross,
      newParts: r.newParts ?? (r.newGross == null ? null : (() => {
        const sp = splitGross(r.newGross, undefined, String(r.type || ""));
        return { basic_da: sp.basic_da, hra: sp.hra, fixed: sp.fixed_allowance, conveyance: sp.conveyance, medical: sp.medical_allowance, site: 0, agreed: false };
      })()),
      newGross: r.newGross, newDesignation: r.newDesignation ?? null,
      stage: r.stage, released: r.released ?? null,
    }));
    setMsg("building the sheet…");
    try {
      const res = await fetch("/api/hrms/appraisal-export", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: payload, title: band || "Appraisal" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `The sheet could not be built (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Employee master - ${band || "all"} - ${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setMsg(`${payload.length} ${payload.length === 1 ? "person" : "people"} downloaded ✓`);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  /** Mark one or many as released — or take it back. */
  const release = async (ids: string[], on: boolean) => {
    setMsg("");
    try {
      const r = await api.post("/api/hrms/idp", { action: "release", employee_ids: ids, on });
      setMsg(`${r.n} ${on ? "released" : "un-released"}${r.skipped ? ` · ${r.skipped} skipped, not finalised yet` : ""} ✓`);
      const j = await api.get("/api/hrms/idp?table=1"); setRows(j.rows || []);
      setPicked(new Set());
      announce("appraisal");
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  /** How many of the rows on screen still have no growth note. */
  const missingNotes = useMemo(() => shown.filter((r) => !r.growth).length, [shown]);

  /**
   * One at a time, three in flight: each note is a full Claude read of the
   * role, the IDP and the manager's words, so this is minutes not seconds.
   * Anyone who already has one is skipped, so stopping and starting again
   * simply carries on.
   */
  /**
   * REWRITING, not only filling the gaps (Dr Raghu, 7 Sep 2026: "run the
   * growth notes for all — yes"). Skipping anyone who already had a note
   * meant a change to the letter itself could never reach the 199 written
   * before it — his standard opening among them. So a rewrite is now a
   * deliberate choice, asked for once and warned about, because it replaces
   * words he may already have read and approved.
   */
  const massGrowth = async (only?: string[], rewrite = false) => {
    const pool = only ? shown.filter((r) => only.includes(r.id)) : shown;
    const todo = rewrite ? pool : pool.filter((r) => !r.growth);
    if (!todo.length) { window.alert(only ? "Every ticked person already has a growth note." : "Every row on screen already has a growth note."); return; }
    const had = todo.filter((r) => r.growth).length;
    if (!window.confirm(
      rewrite && had
        ? `REWRITE the growth note for ${todo.length} ${todo.length === 1 ? "person" : "people"}?\n\n${had} of them already have one, and it will be REPLACED — the words change, including any you have already read.\n\nEach is written on its own, so this takes several minutes. You can stop it.`
        : `Write the growth note for ${todo.length} ${todo.length === 1 ? "person" : "people"}?\n\nEach one is read and written on its own, so this takes a few minutes. You can stop it, and starting again carries on from where it left off.`
    )) return;
    stop.v = false;
    setRun({ done: 0, of: todo.length, now: todo[0]?.name || "", fail: 0 });
    let done = 0, fail = 0;
    const queue = [...todo];
    const worker = async () => {
      while (queue.length && !stop.v) {
        const r = queue.shift()!;
        setRun({ done, of: todo.length, now: r.name, fail });
        try { await api.post("/api/hrms/idp", { action: "growth-note", employee_id: r.id }); }
        catch { fail += 1; }
        done += 1;
        setRun({ done, of: todo.length, now: r.name, fail });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setRun(null);
    setMsg(`${done - fail} growth note${done - fail === 1 ? "" : "s"} written${fail ? `, ${fail} failed` : ""}${stop.v ? " — stopped" : ""} ✓`);
    api.get("/api/hrms/idp?table=1").then((j) => setRows(j.rows || [])).catch(() => null);
  };

  return (
    <Pane title="Appraisal Table" who={who} print onPrint={pressPaper}
      blurb="Everybody on one row: the money and where their appraisal stands. Click the EmployeeID or the name to open that person's Report Card.">
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: C.red }}>{msg}</div>}

      <div className="flex gap-2 flex-wrap mb-3">
        <Stat n={(rows || []).length} l="On the roll" />
        <Stat n={sub} l="IDP completed" />
        <Stat n={mgr} l="Manager completed" />
        <Stat n={done} l="Appraisal Finalised" green />
        <Stat n={released} l="Released" green />
        <Stat n={pending} l="Pending" />
      </div>

      <div className="flex gap-1.5 flex-wrap items-center mb-2 no-print">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID, name, designation…"
          className="text-xs rounded px-2.5 py-1.5" style={{ border: `1px solid ${C.line}`, width: 230 }} />
        <select value={band} onChange={(e) => setBand(e.target.value)} className="text-xs rounded px-2 py-1.5 bg-white font-semibold"
          style={{ border: `1px solid ${band ? C.ink : C.line}`, color: band ? C.ink : undefined }}
          title="Staff means staff and contractors; workers means labour and labour on contract">
          <option value="">Everyone</option>
          {BANDS.map(([l]) => (<option key={l} value={l}>{l} ({(rows || []).filter((r) => BANDS.find(([k]) => k === l)![1](String(r.type || ""), !!r.released, String(r.stage || ""))).length})</option>))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} className="text-xs rounded px-2 py-1.5 bg-white" style={{ border: `1px solid ${C.line}` }}>
          <option value="">All types</option>
          {types.map((t) => (<option key={t} value={t}>{t}</option>))}
        </select>
        <select value={dept} onChange={(e) => setDept(e.target.value)} className="text-xs rounded px-2 py-1.5 bg-white" style={{ border: `1px solid ${C.line}` }}>
          <option value="">All departments</option>
          {depts.map((t) => (<option key={t} value={t}>{t}</option>))}
        </select>
        {/* Reporting manager — several at once (Dr Raghu, 7 Sep 2026) */}
        <span className="relative">
          <button onClick={() => setMgrOpen((o) => !o)} className="text-xs rounded px-2 py-1.5 bg-white font-semibold"
            style={{ border: `1px solid ${mgrs.size ? C.ink : C.line}`, color: mgrs.size ? C.ink : undefined, whiteSpace: "nowrap" }}
            title="Tick one manager or several; the table keeps only their people">
            {mgrs.size ? `${mgrs.size} manager${mgrs.size === 1 ? "" : "s"}` : "Reporting manager"} ▾
          </button>
          {mgrOpen && (
            <>
              <span className="fixed inset-0" style={{ zIndex: 58 }} onClick={() => setMgrOpen(false)} />
              <div className="absolute rounded-lg border bg-white" style={{ top: "calc(100% + 4px)", left: 0, width: 290, maxHeight: 340, overflowY: "auto", borderColor: C.line, boxShadow: "0 12px 30px rgba(0,0,0,.2)", zIndex: 59 }}>
                <div className="p-2" style={{ borderBottom: `1px solid ${C.line}`, position: "sticky", top: 0, background: "#fff" }}>
                  <input value={mgrQ} onChange={(e) => setMgrQ(e.target.value)} placeholder="find a manager…" className="text-xs rounded px-2 py-1 w-full" style={{ border: `1px solid ${C.line}` }} />
                  <div className="flex gap-2 mt-1 text-xs">
                    <button onClick={() => setMgrs(new Set(managers.map(([m]) => m)))} className="font-semibold" style={{ color: "var(--blue)" }}>all</button>
                    <button onClick={() => setMgrs(new Set())} className="font-semibold" style={{ color: C.faint }}>none</button>
                    <span className="ml-auto" style={{ color: C.faint }}>{managers.length} in all</span>
                  </div>
                </div>
                {managers.filter(([m]) => !mgrQ.trim() || m.toLowerCase().includes(mgrQ.trim().toLowerCase())).map(([m, n]) => (
                  <label key={m} className="flex items-center gap-2 px-2 py-1 text-xs" style={{ cursor: "pointer" }}>
                    <input type="checkbox" checked={mgrs.has(m)} onChange={(e) => setMgrs((s2) => { const x = new Set(s2); if (e.target.checked) x.add(m); else x.delete(m); return x; })} />
                    <span className="flex-1 truncate" style={{ color: m.startsWith("—") ? C.faint : undefined }}>{m}</span>
                    <span className="tnum" style={{ color: C.faint }}>{n}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </span>
        <select value={age} onChange={(e) => setAge(e.target.value)} className="text-xs rounded px-2 py-1.5 bg-white" style={{ border: `1px solid ${C.line}` }}>
          <option value="">Any age</option>
          {AGE_BANDS.map(([l]) => (<option key={l} value={l}>{l}</option>))}
        </select>
        <select value={exp} onChange={(e) => setExp(e.target.value)} className="text-xs rounded px-2 py-1.5 bg-white" style={{ border: `1px solid ${C.line}` }}>
          <option value="">Any experience</option>
          {EXP_BANDS.map(([l]) => (<option key={l} value={l}>{l}</option>))}
        </select>
        {isOwner && (
          <button onClick={() => setImporting(true)} className="text-xs font-bold rounded px-2.5 py-1.5 text-white"
            style={{ background: "var(--blue)", whiteSpace: "nowrap" }}
            title="Load the Salary Revision Master — the workers' new rates, straight onto their appraisals">
            ⬆ Load the revision sheet
          </button>
        )}
        <button onClick={downloadExcel} className="text-xs font-bold rounded px-2.5 py-1.5"
          style={{ border: `1px solid ${C.line}`, background: "#fff", color: C.dim, whiteSpace: "nowrap" }}
          title="The shown rows, in the revision sheet's own column order — paste straight into the roster">
          ⤓ Download as Excel
        </button>
        {/* THE MASS RUN (Dr Raghu, 7 Sep 2026) — writes the growth note for
            everybody the filters have left on screen who has none yet. */}
        {isOwner && (
          <button onClick={() => (run ? (stop.v = true) : massGrowth())}
            className="text-xs font-bold rounded px-2.5 py-1.5 text-white"
            style={{ background: run ? "#B3261E" : "#0D7A3F", whiteSpace: "nowrap" }}
            title="Writes the growth note — the one the person is handed — for every row shown that has none yet">
            {run ? `Stop · ${run.done}/${run.of}` : `✨ Growth notes${missingNotes ? ` (${missingNotes})` : ""}`}
          </button>
        )}
        {/* and the same run, deliberately over everybody — the only way a
            change to the letter reaches the ones already written */}
        {isOwner && !run && (
          <button onClick={() => massGrowth(undefined, true)}
            className="text-xs font-bold rounded px-2.5 py-1.5"
            style={{ border: "1px solid #0D7A3F", background: "#fff", color: "#0D7A3F", whiteSpace: "nowrap" }}
            title="Write every shown person's growth note again, replacing the one they have">
            ↻ Rewrite all ({shown.length})
          </button>
        )}
        {/* Dr Raghu, 2 Sep 2026: "put a filter for salary range Min and Max". */}
        <span className="text-xs flex items-center gap-1" style={{ color: C.faint }}>
          <span style={{ whiteSpace: "nowrap" }}>Gross ₹</span>
          <input value={minPay} onChange={(e) => setMinPay(e.target.value)} type="number" placeholder="min"
            className="text-xs rounded px-2 py-1.5 bg-white" style={{ border: `1px solid ${C.line}`, width: 84 }} />
          <span>–</span>
          <input value={maxPay} onChange={(e) => setMaxPay(e.target.value)} type="number" placeholder="max"
            className="text-xs rounded px-2 py-1.5 bg-white" style={{ border: `1px solid ${C.line}`, width: 84 }} />
          {(minPay || maxPay) && (
            <button onClick={() => { setMinPay(""); setMaxPay(""); }} title="Clear the salary range"
              style={{ color: "var(--red)", fontWeight: 700 }}>×</button>
          )}
        </span>
        <span className="text-xs" style={{ color: C.faint }}>
          {rows === null ? "loading…" : `${shown.length} shown`}
          {/* When a salary bound is on, say how many were dropped for having
              no figure at all — otherwise the count quietly under-reports. */}
          {rows !== null && (minPay || maxPay) && (() => {
            const blank = rows.filter((r) => r.prevGross == null).length;
            return blank ? <span style={{ color: "#B26A00" }}> · {blank} with no gross recorded are not counted</span> : null;
          })()}
        </span>
      </div>

      {isOwner && (
        <div className="flex items-center gap-2 flex-wrap mb-2 text-xs rounded px-3 py-1.5"
          style={{ background: picked.size ? "#FFF7E6" : "#FBFAF7", border: `1px solid ${picked.size ? "#F5B32B" : C.line}` }}>
          <button onClick={() => setPicked(new Set(shown.map((r) => r.id)))} className="font-semibold rounded border px-2 py-1 bg-white" style={{ borderColor: C.line, color: "var(--blue)" }}>Select all shown ({shown.length})</button>
          <button onClick={() => setPicked(new Set())} className="font-semibold rounded border px-2 py-1 bg-white" style={{ borderColor: C.line, color: C.faint }}>Deselect</button>
          {picked.size > 0 && <b>{picked.size} ticked →</b>}
          {picked.size > 0 && (
            <>
              <button onClick={() => massGrowth([...picked])} disabled={!!run} className="font-bold rounded px-2.5 py-1 text-white" style={{ background: run ? "#B9BEC4" : "#0D7A3F" }}>✨ Write their growth notes</button>
              <button onClick={() => finalise([...picked])} className="font-bold rounded px-2.5 py-1 text-white" style={{ background: "var(--blue)" }} title="Approve the new gross for everybody ticked — the step before releasing">✓ Finalise</button>
              <button onClick={() => release([...picked], true)} className="font-bold rounded px-2.5 py-1 text-white" style={{ background: "var(--green)" }}>✓ Mark released</button>
              <button onClick={() => release([...picked], false)} className="font-semibold rounded px-2.5 py-1 bg-white" style={{ border: `1px solid ${C.line}`, color: "var(--red)" }}>take release back</button>
            </>
          )}
        </div>
      )}
      {importing && <RevisionImport onClose={() => setImporting(false)} onDone={async () => { const j = await api.get("/api/hrms/idp?table=1"); setRows(j.rows || []); }} />}
      <DataTable columns={columns} rows={shown} rowKey={(r) => r.id} initialFrozen={2}
        empty={rows === null ? "loading…" : "Nobody matches those filters."} />
    </Pane>
  );
}

function Stat({ n, l, green }: { n: number | string; l: string; green?: boolean }) {
  return (
    <div className="bg-white rounded-lg border px-3 py-2" style={{ borderColor: C.line, minWidth: 120 }}>
      <div className="font-bold tnum" style={{ fontSize: 21, lineHeight: 1.1, color: green && n ? C.green : C.ink }}>{n}</div>
      <div style={{ fontSize: 11, color: C.faint }}>{l}</div>
    </div>
  );
}

/* ─────────────────── the workers' revision, loaded in one go ───────────────────
   Dr Raghu, 7 Sep 2026: the Salary Revision Master carries each person twice —
   what they are on today, then a blank column, then the new structure. This
   reads the SECOND block against the EmployeeID, shows what it would do, and
   writes each worker's appraisal as proposed. Staff and the rest he does in
   the HRMS itself, so anybody who is not Labour or Labour - Contract is
   skipped and named. */
type Took = { id: string; name: string; type: string; prev: number; next: number; diff: number; moved?: boolean };
type Skip = { id: string; name: string; why: string };

function RevisionImport({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<void> }) {
  const [rows, setRows] = useState<Record<string, string | number>[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [eff, setEff] = useState("2026-08-01");
  const [note, setNote] = useState("Rate revised from 1 August 2026. Everything before that date was paid as interim bonus, not arrears.");
  const [pre, setPre] = useState<{ totals: Record<string, number>; took: Took[]; skipped: Skip[] } | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState("");

  /** The CSV, read here. The new block is the SECOND time each header appears. */
  const parse = (text: string) => {
    const out: string[][] = []; let cur = ""; let row: string[] = []; let inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch; }
      else if (ch === '"') inQ = true;
      else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); out.push(row); row = []; cur = ""; }
      else cur += ch;
    }
    if (cur || row.length) { row.push(cur); out.push(row); }
    const head = (out.shift() || []).map((h) => h.trim().toLowerCase());
    const last = (name: string) => head.lastIndexOf(name);      // the NEW block
    const first = (name: string) => head.indexOf(name);          // the OLD block
    const C = {
      id: first("id"), type: first("type"),
      basic: last("basic and da"), hra: last("hra"), fixed: last("fixed allowance"),
      conv: last("conveyance"), med: last("medical allowance"), gross: last("gross salary"),
      desig: last("designation"),
      oldGross: first("gross salary"),   // the rate before the revision — this is what 2025-26 keeps
    };
    if (C.id < 0 || C.basic < 0) throw new Error("That file has no ID column, or no second Basic and DA — is it the Salary Revision Master?");
    if (C.basic === first("basic and da")) throw new Error("Only one salary block in that file — the revision sheet carries the old one and then the new one.");
    const n = (v: string) => Number(String(v || "").replace(/[₹,\s]/g, "")) || 0;
    const g = (r: string[], i: number) => (i >= 0 ? (r[i] || "").trim() : "");
    return out.filter((r) => g(r, C.id)).map((r) => ({
      employee_id: g(r, C.id), type: g(r, C.type),
      basic_da: n(g(r, C.basic)), hra: n(g(r, C.hra)), fixed_allowance: n(g(r, C.fixed)),
      conveyance: n(g(r, C.conv)), medical_allowance: n(g(r, C.med)), gross: n(g(r, C.gross)),
      prev_gross: n(g(r, C.oldGross)),
      designation: g(r, C.desig),
    }));
  };

  const pick = async (file: File | null) => {
    if (!file) return;
    setMsg(""); setPre(null); setDone(""); setFileName(file.name);
    try { setRows(parse(await file.text())); } catch (e) { setRows(null); setMsg(e instanceof Error ? e.message : String(e)); }
  };
  const run = async (preview: boolean) => {
    if (!rows?.length) return;
    setBusy(preview ? "preview" : "load"); setMsg("");
    try {
      if (preview) {
        const r = await api.post("/api/hrms/appraisal-import", { rows, effective_from: eff, note, preview: true });
        setPre({ totals: r.totals, took: r.took || [], skipped: r.skipped || [] });
      } else {
        const r = await api.post("/api/hrms/appraisal-import", { rows, effective_from: eff, note });
        setDone(`${r.totals.people} appraisals written, proposed and waiting to be finalised${r.totals.skipped ? ` · ${r.totals.skipped} skipped` : ""} ✓`);
        await onDone();
      }
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };

  const T = pre?.totals;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(22,35,47,.55)", zIndex: 70, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "28px 12px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg genie-modal" style={{ width: "min(940px, 100%)", maxHeight: "92vh", overflowY: "auto" }}>
        <div className="px-4 py-3 flex items-center gap-3" style={{ background: "var(--navy)", color: "#fff", position: "sticky", top: 0, zIndex: 2 }}>
          <div className="font-bold flex-1" style={{ fontSize: 16 }}>Load the salary revision — Labour and Labour - Contract</div>
          <button onClick={onClose} style={{ color: "#8FA1B3", fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>
        <div className="p-4">
          <p className="text-sm mb-3" style={{ color: C.dim, lineHeight: 1.6 }}>
            The Salary Revision Master carries every person twice: the rate before the revision, then the new structure. Both are read —
            the <b>old</b> column becomes the previous gross and the <b>new</b> one the proposal — so a record somebody has already moved by
            hand does not swallow its own increase. Everything lands as <b>proposed</b>; nothing is finalised or released here. Staff and
            the rest are skipped and named; you do those in the HRMS.
          </p>
          <div className="flex gap-3 flex-wrap items-end mb-3">
            <label className="text-xs font-bold" style={{ color: C.dim }}>THE FILE
              <input type="file" accept=".csv,text/csv" onChange={(e) => { pick(e.target.files?.[0] ?? null); e.target.value = ""; }} className="block mt-1 text-xs" /></label>
            <label className="text-xs font-bold" style={{ color: C.dim }}>NEW RATE STARTS
              <input type="date" value={eff} onChange={(e) => setEff(e.target.value)} className="block mt-1 px-2 py-1.5 rounded border tnum" style={{ borderColor: C.line }} /></label>
            <label className="text-xs font-bold flex-1" style={{ color: C.dim, minWidth: 260 }}>NOTE ON EVERY ROW
              <input value={note} onChange={(e) => setNote(e.target.value)} className="block w-full mt-1 px-2 py-1.5 rounded border font-normal" style={{ borderColor: C.line }} /></label>
          </div>
          {rows && <div className="text-sm mb-2"><b>{rows.length}</b> rows read from {fileName}</div>}
          {msg && <div className="text-xs font-bold mb-2" style={{ color: "var(--red)" }}>{msg}</div>}
          {done && <div className="text-sm font-bold mb-2" style={{ color: "var(--green)" }}>{done}</div>}
          <div className="flex gap-2 mb-3">
            <button onClick={() => run(true)} disabled={!rows || !!busy} className="rounded px-3 py-1.5 text-xs font-bold text-white" style={{ background: rows && !busy ? "var(--navy)" : "#B9BEC4" }}>
              {busy === "preview" ? "checking…" : "1 · Check it first"}
            </button>
            <button onClick={() => run(false)} disabled={!pre || !!busy || !!done} className="rounded px-3 py-1.5 text-xs font-bold text-white" style={{ background: pre && !busy && !done ? C.orange : "#B9BEC4" }}>
              {busy === "load" ? "writing…" : `2 · Write ${T ? T.people : ""} appraisals`}
            </button>
          </div>
          {T && (
            <>
              <div className="flex gap-2 flex-wrap mb-2">
                <Stat n={T.people} l="workers matched" />
                <Stat n={`₹${inr(T.next - T.prev)}`} l="more each month" green />
                <Stat n={`₹${inr((T.next - T.prev) * 12)}`} l="a full year" green />
                <Stat n={T.skipped} l="skipped" />
                {T.moved > 0 && <Stat n={T.moved} l="record already moved" />}
              </div>
              {(T.down > 0 || T.unchanged > 0) && (
                <div className="text-xs mb-2" style={{ color: "#8A5B00" }}>
                  {T.unchanged > 0 && <>{T.unchanged} unchanged. </>}{T.down > 0 && <b>{T.down} would go DOWN — look before you write.</b>}
                </div>
              )}
              {pre.skipped.length > 0 && (
                <div className="rounded border p-2 mb-2" style={{ borderColor: C.line, background: "#FBFAF7", maxHeight: 150, overflowY: "auto" }}>
                  <div className="text-xs font-bold mb-1" style={{ color: C.faint }}>SKIPPED</div>
                  {pre.skipped.map((s) => <div key={s.id} className="text-xs" style={{ color: C.dim }}><b>{s.id}</b> {s.name} — {s.why}</div>)}
                </div>
              )}
              <div className="genie-scroll" style={{ maxHeight: 300 }}>
                <table className="genie-table">
                  <thead><tr><th>ID</th><th>Name</th><th>Type</th><th className="num">Now</th><th className="num">New</th><th className="num">Change</th></tr></thead>
                  <tbody>
                    {pre.took.map((t) => (
                      <tr key={t.id}>
                        <td className="tnum">{t.id}</td><td>{t.name}{t.moved && <span className="ml-1 rounded px-1" style={{ fontSize: 9, background: "#FFF3E8", color: "#8A5B00" }} title="the record was already moved to the new rate by hand">record moved</span>}</td><td>{t.type}</td>
                        <td className="num tnum">{inr(t.prev)}</td><td className="num tnum"><b>{inr(t.next)}</b></td>
                        <td className="num tnum" style={{ color: t.diff > 0 ? "var(--green)" : t.diff < 0 ? "var(--red)" : C.faint, fontWeight: 700 }} title={t.moved ? "This person's record was already moved to the new rate by hand — the previous gross here is the sheet's old column" : undefined}>
                          {t.diff > 0 ? "+" : ""}{inr(t.diff)}{t.prev ? ` (${((t.diff / t.prev) * 100).toFixed(1)}%)` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
