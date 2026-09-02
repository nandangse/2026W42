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
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import DataTable, { type Column } from "./DataTable";
import { Pane } from "./Pane";
import { C } from "./RecordFields";

interface Row {
  id: string; name: string; department: string | null; designation: string | null; type: string | null;
  age: number | null; exp: number | null;
  prevGross: number | null; newGross: number | null; inc: number | null; incPct: number | null;
  stage: string;
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

const STAGE_STYLE: Record<string, { bg: string; fg: string }> = {
  "Final": { bg: "#E6F4EA", fg: "#0D7A3F" },
  "Manager Completed": { bg: "#DCE8F5", fg: "#1B3A5C" },
  "Completed": { bg: "#FFF3E8", fg: "#8A5B00" },
  "Started": { bg: "#F4F2EC", fg: "#8A94A0" },
  "—": { bg: "#F4F2EC", fg: "#C9C6BD" },
};

export default function AppraisalTable({ who, onOpenPerson }: { who: string; onOpenPerson: (id: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
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
  const [minPay, setMinPay] = useState("");
  const [maxPay, setMaxPay] = useState("");

  useEffect(() => {
    api.get("/api/hrms/idp?table=1").then((j) => setRows(j.rows || []))
      .catch((e) => { setMsg(e instanceof Error ? e.message : String(e)); setRows([]); });
  }, []);

  const types = useMemo(() => [...new Set((rows || []).map((r) => r.type).filter(Boolean))].sort() as string[], [rows]);
  const depts = useMemo(() => [...new Set((rows || []).map((r) => r.department).filter(Boolean))].sort() as string[], [rows]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    const ageF = AGE_BANDS.find(([l]) => l === age)?.[1];
    const expF = EXP_BANDS.find(([l]) => l === exp)?.[1];
    return (rows || []).filter((r) => {
      if (type && r.type !== type) return false;
      if (dept && r.department !== dept) return false;
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
  }, [rows, q, type, dept, age, exp, minPay, maxPay]);

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
<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
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

  const link = (r: Row, text: string, bold = false) => (
    <button onClick={() => onOpenPerson(r.id)} className={`text-left ${bold ? "font-bold" : "font-semibold"}`}
      style={{ color: "#1B3A5C", textDecoration: "underline", textUnderlineOffset: 2 }}
      title="Open the Individual Report Card for Appraisal">
      {text}
    </button>
  );

  const columns: Column<Row>[] = useMemo(() => [
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
      title: "Started → Completed (person submitted) → Manager Completed (review submitted) → Final (new gross decided)",
    },
  ], []);

  const done = (rows || []).filter((r) => r.stage === "Final").length;
  const mgr = (rows || []).filter((r) => r.stage === "Manager Completed").length;
  const sub = (rows || []).filter((r) => r.stage === "Completed").length;

  return (
    <Pane title="Appraisal Table" who={who} print onPrint={pressPaper}
      blurb="Everybody on one row: the money and where their appraisal stands. Click the EmployeeID or the name to open that person's Report Card.">
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: C.red }}>{msg}</div>}

      <div className="flex gap-2 flex-wrap mb-3">
        <Stat n={(rows || []).length} l="On the roll" />
        <Stat n={sub} l="IDP completed" />
        <Stat n={mgr} l="Manager completed" />
        <Stat n={done} l="Final" green />
      </div>

      <div className="flex gap-1.5 flex-wrap items-center mb-2 no-print">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID, name, designation…"
          className="text-xs rounded px-2.5 py-1.5" style={{ border: `1px solid ${C.line}`, width: 230 }} />
        <select value={type} onChange={(e) => setType(e.target.value)} className="text-xs rounded px-2 py-1.5 bg-white" style={{ border: `1px solid ${C.line}` }}>
          <option value="">All types</option>
          {types.map((t) => (<option key={t} value={t}>{t}</option>))}
        </select>
        <select value={dept} onChange={(e) => setDept(e.target.value)} className="text-xs rounded px-2 py-1.5 bg-white" style={{ border: `1px solid ${C.line}` }}>
          <option value="">All departments</option>
          {depts.map((t) => (<option key={t} value={t}>{t}</option>))}
        </select>
        <select value={age} onChange={(e) => setAge(e.target.value)} className="text-xs rounded px-2 py-1.5 bg-white" style={{ border: `1px solid ${C.line}` }}>
          <option value="">Any age</option>
          {AGE_BANDS.map(([l]) => (<option key={l} value={l}>{l}</option>))}
        </select>
        <select value={exp} onChange={(e) => setExp(e.target.value)} className="text-xs rounded px-2 py-1.5 bg-white" style={{ border: `1px solid ${C.line}` }}>
          <option value="">Any experience</option>
          {EXP_BANDS.map(([l]) => (<option key={l} value={l}>{l}</option>))}
        </select>
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
              style={{ color: "#B3261E", fontWeight: 700 }}>×</button>
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

      <DataTable columns={columns} rows={shown} rowKey={(r) => r.id} initialFrozen={2}
        empty={rows === null ? "loading…" : "Nobody matches those filters."} />
    </Pane>
  );
}

function Stat({ n, l, green }: { n: number; l: string; green?: boolean }) {
  return (
    <div className="bg-white rounded-lg border px-3 py-2" style={{ borderColor: C.line, minWidth: 120 }}>
      <div className="font-bold tnum" style={{ fontSize: 21, lineHeight: 1.1, color: green && n ? C.green : C.ink }}>{n}</div>
      <div style={{ fontSize: 11, color: C.faint }}>{l}</div>
    </div>
  );
}
