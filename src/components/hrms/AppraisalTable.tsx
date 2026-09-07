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
  id: string; name: string; department: string | null; designation: string | null; type: string | null; manager: string | null; growth?: boolean;
  age: number | null; exp: number | null;
  prevGross: number | null; newGross: number | null; inc: number | null; incPct: number | null;
  stage: string; released?: string | null;
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
  const [run, setRun] = useState<{ done: number; of: number; now: string; fail: number } | null>(null);
  const stop = useState<{ v: boolean }>({ v: false })[0];
  const [minPay, setMinPay] = useState("");
  const [maxPay, setMaxPay] = useState("");

  useEffect(() => {
    api.get("/api/hrms/idp?table=1").then((j) => setRows(j.rows || []))
      .catch((e) => { setMsg(e instanceof Error ? e.message : String(e)); setRows([]); });
  }, []);

  const types = useMemo(() => [...new Set((rows || []).map((r) => r.type).filter(Boolean))].sort() as string[], [rows]);
  const depts = useMemo(() => [...new Set((rows || []).map((r) => r.department).filter(Boolean))].sort() as string[], [rows]);
  /** Every reporting manager on the roll, with how many report to them; nobody's manager is its own line. */
  const managers = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of rows || []) { const k = (r.manager || "").trim() || "— none named —"; n.set(k, (n.get(k) || 0) + 1); }
    return [...n.entries()].sort((a, b) => (a[0] === "— none named —" ? 1 : b[0] === "— none named —" ? -1 : b[1] - a[1] || a[0].localeCompare(b[0])));
  }, [rows]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    const ageF = AGE_BANDS.find(([l]) => l === age)?.[1];
    const expF = EXP_BANDS.find(([l]) => l === exp)?.[1];
    return (rows || []).filter((r) => {
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
  }, [rows, q, type, dept, mgrs, age, exp, minPay, maxPay]);

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

  const link = (r: Row, text: string, bold = false) => (
    <button onClick={() => onOpenPerson(r.id)} className={`text-left ${bold ? "font-bold" : "font-semibold"}`}
      style={{ color: "var(--blue)", textDecoration: "underline", textUnderlineOffset: 2 }}
      title="Open the Individual Report Card for Appraisal">
      {text}
    </button>
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

  /** Mark one or many as released — or take it back. */
  const release = async (ids: string[], on: boolean) => {
    setMsg("");
    try {
      const r = await api.post("/api/hrms/idp", { action: "release", employee_ids: ids, on });
      setMsg(`${r.n} ${on ? "released" : "un-released"}${r.skipped ? ` · ${r.skipped} skipped, not finalised yet` : ""} ✓`);
      const j = await api.get("/api/hrms/idp?table=1"); setRows(j.rows || []);
      setPicked(new Set());
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
  const massGrowth = async (only?: string[]) => {
    const pool = only ? shown.filter((r) => only.includes(r.id)) : shown;
    const todo = pool.filter((r) => !r.growth);
    if (!todo.length) { window.alert(only ? "Every ticked person already has a growth note." : "Every row on screen already has a growth note."); return; }
    if (!window.confirm(`Write the growth note for ${todo.length} ${todo.length === 1 ? "person" : "people"}?\n\nEach one is read and written on its own, so this takes a few minutes. You can stop it, and starting again carries on from where it left off.`)) return;
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
              <button onClick={() => release([...picked], true)} className="font-bold rounded px-2.5 py-1 text-white" style={{ background: "var(--green)" }}>✓ Mark released</button>
              <button onClick={() => release([...picked], false)} className="font-semibold rounded px-2.5 py-1 bg-white" style={{ border: `1px solid ${C.line}`, color: "var(--red)" }}>take release back</button>
            </>
          )}
        </div>
      )}
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
