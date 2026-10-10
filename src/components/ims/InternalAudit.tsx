"use client";
/**
 * INTERNAL AUDIT (Dr Raghu, 10 Oct 2026): "a place to add the standard, date
 * start, target completion date, people, department, status … when you meet
 * a certain department all the clauses of that should come up … post that
 * there should be an internal audit file created with the NC and also the
 * action plan."
 *
 * Three screens: the audits; one audit by department (its checklist lines,
 * answered on the spot — a Minor or Major NC is numbered the moment it is
 * marked); and the audit file — NCs with their action plan, and the report
 * Genie writes from everything recorded, printable.
 */
import { useEffect, useMemo, useState } from "react";
import { Area, Btn, Chip, Empty, Label, Modal, Note, Screen, Select, Text, post, BORDER, INK, MUTED, NAVY_SOFT, GREEN, AMBER, RED, ORANGE } from "./ui";
import type { Boot, StandardRow } from "./types";

interface Audit { id: string; audit_no: string; title: string; standard_ids: string[]; date_start: string | null; target_end: string | null; status: string; lead_auditor: string | null; auditors: string[]; auditees: string[]; departments: string[]; report_html: string | null; report_at: string | null; answered?: number; major?: number; minor?: number; ofi?: number; open?: number }
interface Item { id: string; standard_id: string | null; ref_no: string; sec: string | null; clause_no: string; clause_title: string | null; question: string; aero: boolean; evidence_to_verify: string | null; process_owner: string | null; departments: string[]; method: string | null; sort: number }
interface Answer { id: string; audit_id: string; item_id: string; department: string | null; status: string; finding: string | null; evidence_ref: string | null; remarks: string | null; nc_id: string | null; auditor: string | null; audited_at: string | null }
interface NC { id: string; nc_no: string; description: string; severity: string; department: string; status: string; clause_no: string | null; evidence_ref: string | null; created_at: string }
interface Capa { id: string; nc_id: string; correction: string; corrective_action: string; owner_name: string; support: string; due_date: string | null; status: string; effectiveness_result: string }
interface One { audit: Audit; standards: StandardRow[]; items: Item[]; answers: Answer[]; ncs: NC[]; capas: Capa[]; departments: string[]; mayAudit: boolean; mayPlan: boolean; me: string; meName: string }
interface List { installed: boolean; standards: StandardRow[]; audits: Audit[]; mayAudit: boolean; mayPlan: boolean }

const ANSWER = ["Not audited", "C", "OFI", "Minor NC", "Major NC", "N/A"];
const A_COLOUR: Record<string, string> = { C: GREEN, OFI: AMBER, "Minor NC": "#C2410C", "Major NC": RED, "N/A": MUTED, "Not audited": "#9CA3AF" };
const SEV_LABEL: Record<string, string> = { observation: "OFI", minor: "Minor NC", major: "Major NC", critical: "Major NC" };
const DEPTS = ["Management", "Sales", "Design", "Planning", "Purchase", "Stores", "Production", "Quality", "Maintenance", "HR", "Service", "IT"];
const fmtD = (d?: string | null) => d ? new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function InternalAudit({ boot }: { boot: Boot }) {
  const [list, setList] = useState<List | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [plan, setPlan] = useState<Audit | "new" | null>(null);
  const load = async () => { try { const r = await fetch("/api/ims/audit", { cache: "no-store" }); const j = await r.json(); if (!r.ok) throw new Error(j.error || `${r.status}`); setList(j); } catch (e) { setErr(e instanceof Error ? e.message : "Could not read."); } };
  useEffect(() => { load(); }, []);
  if (open) return <AuditView id={open} boot={boot} back={() => { setOpen(null); load(); }} />;
  return (
    <Screen title="Internal audit" blurb="Plan an audit — the standards, the dates, the people, the departments. Meet a department and its clauses come up to be answered on the spot; a Minor or Major NC is numbered the moment it is marked. At the end, the audit file: the non-conformities, the action plan, and the report.">
      {err && <Note kind="error">{err}</Note>}
      {list && !list.installed && <Note kind="warn">Run migration 0222 first.</Note>}
      <div className="flex items-center gap-2 mb-3">
        {list?.mayPlan && <Btn kind="primary" onClick={() => setPlan("new")}>+ Plan an audit</Btn>}
        <span className="text-xs" style={{ color: MUTED }}>{list ? `${list.audits.length} audit${list.audits.length === 1 ? "" : "s"}` : ""}</span>
      </div>
      {list && list.audits.length === 0 && <Empty>No audit yet. Plan the first.</Empty>}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
        {list?.audits.map((a) => (
          <button key={a.id} onClick={() => setOpen(a.id)} className="text-left bg-white rounded-lg border p-3" style={{ borderColor: BORDER, borderLeft: `6px solid ${a.status === "closed" ? MUTED : a.status === "reporting" ? AMBER : a.status === "in_progress" ? ORANGE : "#1B2D6B"}` }}>
            <div className="flex items-start gap-2"><div className="text-sm font-bold flex-1" style={{ color: INK }}>{a.audit_no} · {a.title}</div><Chip text={a.status.replace("_", " ")} colour={a.status === "closed" ? MUTED : a.status === "reporting" ? AMBER : "#1B2D6B"} /></div>
            <div className="text-xs mt-1" style={{ color: MUTED }}>{(list.standards.filter((s) => a.standard_ids.includes(String(s.id))).map((s) => s.name.split(" ")[0] + " " + s.name.split(" ")[1]).join(" · ")) || "no standard"} · {fmtD(a.date_start)} → {fmtD(a.target_end)}</div>
            <div className="text-xs mt-0.5" style={{ color: MUTED }}>Lead {a.lead_auditor || "—"} · {(a.departments || []).length} departments</div>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              <Chip text={`${a.answered ?? 0} answered`} colour="#1B2D6B" />
              {!!a.major && <Chip text={`${a.major} major`} colour={RED} />}
              {!!a.minor && <Chip text={`${a.minor} minor`} colour="#C2410C" />}
              {!!a.ofi && <Chip text={`${a.ofi} OFI`} colour={AMBER} />}
              {!!a.open && <Chip text={`${a.open} open`} colour={ORANGE} />}
              {a.report_at && <Chip text="audit file written" colour={GREEN} />}
            </div>
          </button>
        ))}
      </div>
      {plan && list && <PlanBox boot={boot} standards={list.standards} a={plan === "new" ? undefined : plan} onDone={() => { setPlan(null); load(); }} />}
    </Screen>
  );
}

function PlanBox({ boot, standards, a, onDone }: { boot: Boot; standards: StandardRow[]; a?: Audit; onDone: () => void }) {
  const [f, setF] = useState({ title: a?.title || "", standard_ids: a?.standard_ids || standards.filter((s) => /9001|9100/.test(s.name)).map((s) => String(s.id)), date_start: a?.date_start || "", target_end: a?.target_end || "", lead_auditor: a?.lead_auditor || "", auditors: (a?.auditors || []).join(", "), auditees: (a?.auditees || []).join(", "), departments: a?.departments || DEPTS.slice(0, 11), status: a?.status || "planned" });
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setMsg("");
    const r = await post("/api/ims/audit", { action: a ? "edit" : "create", id: a?.id, ...f });
    setBusy(false);
    if (!r.ok) { setMsg(r.error || "Could not save."); return; }
    onDone();
  };
  const tog = (k: "standard_ids" | "departments", v: string) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] });
  return (
    <Modal onClose={onDone} title={a ? `Edit — ${a.audit_no}` : "Plan an audit"} width={760}>
      {msg && <Note kind="error">{msg}</Note>}
      <Label>Title</Label><Text value={f.title} onChange={(v) => setF({ ...f, title: v })} placeholder="AS 9100D internal audit — Q3 FY 2026-27" />
      <div className="mt-3"><Label>Standards</Label><div className="flex gap-3 flex-wrap">{standards.map((s) => <label key={s.id} className="text-sm flex items-center gap-1.5" style={{ color: INK }}><input type="checkbox" checked={f.standard_ids.includes(String(s.id))} onChange={() => tog("standard_ids", String(s.id))} />{s.name.split(" — ")[0].split(" - ")[0]}</label>)}</div></div>
      <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div><Label>Date start</Label><Text type="date" value={f.date_start} onChange={(v) => setF({ ...f, date_start: v })} /></div>
        <div><Label>Target completion date</Label><Text type="date" value={f.target_end} onChange={(v) => setF({ ...f, target_end: v })} /></div>
        <div><Label>Status</Label><Select value={f.status} onChange={(v) => setF({ ...f, status: v })} blank="planned" options={[{ value: "planned", label: "Planned" }, { value: "in_progress", label: "In progress" }, { value: "reporting", label: "Reporting" }, { value: "closed", label: "Closed" }]} /></div>
        <div><Label>Lead auditor</Label><Text value={f.lead_auditor} onChange={(v) => setF({ ...f, lead_auditor: v })} placeholder="Anil Shinde" /></div>
        <div><Label>Auditors — names, comma-separated</Label><Text value={f.auditors} onChange={(v) => setF({ ...f, auditors: v })} /></div>
        <div><Label>Auditees — the people met</Label><Text value={f.auditees} onChange={(v) => setF({ ...f, auditees: v })} placeholder="Pankaj Sutar, Prashant Patil, …" /></div>
      </div>
      <div className="mt-3"><Label>Departments</Label><div className="flex gap-2 flex-wrap">{DEPTS.map((d) => <label key={d} className="text-sm flex items-center gap-1" style={{ color: INK }}><input type="checkbox" checked={f.departments.includes(d)} onChange={() => tog("departments", d)} />{d}</label>)}</div></div>
      <div className="text-xs mt-2" style={{ color: MUTED }}>People on the IMS: {boot.people.map((p) => p.full_name).slice(0, 12).join(", ")}{boot.people.length > 12 ? "…" : ""}</div>
      <div className="flex gap-2 mt-4"><Btn kind="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : a ? "Save" : "Plan it"}</Btn><Btn onClick={onDone}>Cancel</Btn></div>
    </Modal>
  );
}

function AuditView({ id, boot, back }: { id: string; boot: Boot; back: () => void }) {
  const [d, setD] = useState<One | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"dept" | "file">("dept");
  const [dept, setDept] = useState<string>("");
  const [edit, setEdit] = useState(false);
  const [addItem, setAddItem] = useState(false);
  const load = async () => { try { const r = await fetch(`/api/ims/audit?id=${id}`, { cache: "no-store" }); const j = await r.json(); if (!r.ok) throw new Error(j.error || `${r.status}`); setD(j); if (!dept && j.departments?.length) setDept(j.departments[0]); } catch (e) { setErr(e instanceof Error ? e.message : "Could not read."); } };
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const ansOf = (itemId: string) => d?.answers.find((x) => x.item_id === itemId);
  const items = useMemo(() => (d?.items || []).filter((i) => !dept || (i.departments || []).includes(dept) || (i.departments || []).includes("All")), [d, dept]);
  if (err) return <Screen title="Internal audit"><Note kind="error">{err}</Note></Screen>;
  if (!d) return <Screen title="Internal audit"><Empty>Reading…</Empty></Screen>;
  const a = d.audit;
  const counts = ANSWER.map((s) => [s, d.answers.filter((x) => x.status === s).length] as const);
  const deptCounts = (dp: string) => { const its = d.items.filter((i) => (i.departments || []).includes(dp)); const an = its.map((i) => ansOf(i.id)).filter((x) => x && x.status !== "Not audited"); return `${an.length}/${its.length}`; };
  return (
    <Screen title={`${a.audit_no} · ${a.title}`} blurb={`${d.standards.filter((s) => a.standard_ids.includes(String(s.id))).map((s) => s.name).join(" · ")} · ${fmtD(a.date_start)} → ${fmtD(a.target_end)} · lead ${a.lead_auditor || "—"} · ${a.status.replace("_", " ")}`}>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <Btn onClick={back}>← Audits</Btn>
        <div className="flex gap-1 ml-2">{counts.filter(([, n]) => n).map(([s, n]) => <Chip key={s} text={`${s} ${n}`} colour={A_COLOUR[s]} />)}</div>
        <span className="flex-1" />
        {d.mayPlan && <Btn onClick={() => setEdit(true)}>Edit the plan</Btn>}
        {d.mayPlan && <Btn onClick={() => setAddItem(true)}>+ Checklist line</Btn>}
      </div>
      <div className="flex gap-1 mb-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
        {([["dept", "By department"], ["file", `Audit file — ${d.ncs.length} NC / OFI`]] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className="px-3 py-2 text-sm font-bold" style={{ color: tab === k ? INK : MUTED, borderBottom: `3px solid ${tab === k ? "#F04E23" : "transparent"}`, marginBottom: -1 }}>{l}</button>)}
      </div>

      {tab === "dept" && (
        <div>
          <div className="flex gap-1.5 flex-wrap mb-3">
            {d.departments.map((dp) => <button key={dp} onClick={() => setDept(dp)} className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: dept === dp ? "#1B2D6B" : "#fff", color: dept === dp ? "#fff" : INK, border: `1px solid ${dept === dp ? "#1B2D6B" : BORDER}` }}>{dp} <span style={{ opacity: .7 }}>{deptCounts(dp)}</span></button>)}
            <button onClick={() => setDept("")} className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: !dept ? "#1B2D6B" : "#fff", color: !dept ? "#fff" : INK, border: `1px solid ${BORDER}` }}>All lines</button>
          </div>
          {items.length === 0 ? <Empty>No checklist line for this department on these standards. Add one with + Checklist line.</Empty> : (
            <div className="grid gap-2">
              {items.map((i) => <Line key={i.id} i={i} ans={ansOf(i.id)} dept={dept || (i.departments || [])[0] || ""} auditId={a.id} mayAudit={d.mayAudit} nc={d.ncs.find((n) => n.id === ansOf(i.id)?.nc_id) || null} onSaved={load} />)}
            </div>
          )}
        </div>
      )}

      {tab === "file" && <AuditFile d={d} onChange={load} />}
      {edit && <PlanBox boot={boot} standards={d.standards} a={a} onDone={() => { setEdit(false); load(); }} />}
      {addItem && <ItemBox standards={d.standards} audit={a} onDone={() => { setAddItem(false); load(); }} />}
    </Screen>
  );
}

function Line({ i, ans, dept, auditId, mayAudit, nc, onSaved }: { i: Item; ans?: Answer; dept: string; auditId: string; mayAudit: boolean; nc: NC | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ status: ans?.status || "Not audited", finding: ans?.finding || "", evidence_ref: ans?.evidence_ref || "", remarks: ans?.remarks || "" });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  useEffect(() => { setF({ status: ans?.status || "Not audited", finding: ans?.finding || "", evidence_ref: ans?.evidence_ref || "", remarks: ans?.remarks || "" }); }, [ans?.status, ans?.finding, ans?.evidence_ref, ans?.remarks]);
  const save = async () => {
    setBusy(true); setMsg("");
    const r = await post("/api/ims/audit", { action: "answer", audit_id: auditId, item_id: i.id, department: dept, ...f });
    setBusy(false);
    if (!r.ok) { setMsg(r.error || "Could not save."); return; }
    setMsg("Saved."); onSaved();
  };
  const st = ans?.status || "Not audited";
  return (
    <div className="bg-white rounded-lg border" style={{ borderColor: BORDER, borderLeft: `6px solid ${A_COLOUR[st]}` }}>
      <button onClick={() => setOpen(!open)} className="w-full text-left px-3 py-2 flex items-start gap-3">
        <span className="font-bold tnum" style={{ color: MUTED, minWidth: 44, fontSize: 12 }}>{i.ref_no}</span>
        <span className="flex-1">
          <span className="text-sm" style={{ color: INK }}><b>{i.clause_no}</b> {i.clause_title} {i.aero && <Chip text="AS9100D" colour="#7C3AED" />}</span>
          <span className="block text-sm mt-0.5" style={{ color: "#374151" }}>{i.question}</span>
          {!open && ans?.finding && <span className="block text-xs mt-1" style={{ color: A_COLOUR[st] }}>{ans.finding}</span>}
        </span>
        <span className="flex flex-col items-end gap-1"><Chip text={st} colour={A_COLOUR[st]} />{nc && <span className="text-xs font-bold" style={{ color: RED }}>{nc.nc_no}</span>}</span>
      </button>
      {open && (
        <div className="px-3 pb-3" style={{ borderTop: `1px solid ${BORDER}` }}>
          <div className="grid gap-3 mt-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="text-xs" style={{ color: MUTED }}><b style={{ color: INK }}>Objective evidence to verify:</b> {i.evidence_to_verify || "—"}</div>
            <div className="text-xs" style={{ color: MUTED }}><b style={{ color: INK }}>Process owner:</b> {i.process_owner || "—"} · <b style={{ color: INK }}>Method:</b> {i.method || "—"}</div>
          </div>
          {mayAudit ? (
            <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "180px 1fr" }}>
              <div><Label>Status</Label><Select value={f.status} onChange={(v) => setF({ ...f, status: v })} blank="Not audited" options={ANSWER} /></div>
              <div><Label>Evidence reference — doc no./rev, record, PO, serial</Label><Text value={f.evidence_ref} onChange={(v) => setF({ ...f, evidence_ref: v })} /></div>
              <div style={{ gridColumn: "1/-1" }}><Label>Finding / observation — requirement + objective evidence + statement</Label><Area rows={3} value={f.finding} onChange={(v) => setF({ ...f, finding: v })} /></div>
              <div style={{ gridColumn: "1/-1" }}><Label>Remarks</Label><Text value={f.remarks} onChange={(v) => setF({ ...f, remarks: v })} /></div>
              <div style={{ gridColumn: "1/-1" }} className="flex items-center gap-2"><Btn kind="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save the line"}</Btn>{msg && <span className="text-xs font-bold" style={{ color: msg === "Saved." ? GREEN : RED }}>{msg}</span>}{ans?.auditor && <span className="text-xs" style={{ color: MUTED }}>· {ans.auditor}, {fmtD(ans.audited_at)}</span>}<span className="text-xs" style={{ color: MUTED }}>A Minor or Major NC is numbered on save and goes to the audit file; the finding is written on the clause in Standards too.</span></div>
            </div>
          ) : (
            <div className="text-sm mt-2" style={{ color: INK }}>{ans?.finding || "Not audited yet."}{ans?.evidence_ref ? <div className="text-xs" style={{ color: MUTED }}>Evidence: {ans.evidence_ref}</div> : null}</div>
          )}
        </div>
      )}
    </div>
  );
}

function AuditFile({ d, onChange }: { d: One; onChange: () => void }) {
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  const [capaFor, setCapaFor] = useState<NC | null>(null); const [editCapa, setEditCapa] = useState<Capa | null>(null);
  const a = d.audit;
  const report = async () => { setBusy(true); setMsg(""); const r = await post("/api/ims/audit", { action: "report", id: a.id }); setBusy(false); if (!r.ok) { setMsg(r.error || "Genie could not write it."); return; } onChange(); };
  const setNc = async (nc: NC, status: string) => { await post("/api/ims/audit", { action: "nc_status", id: nc.id, status }); onChange(); };
  const print = () => { const w = window.open("", "_blank", "noopener"); if (!w || !a.report_html) return; w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${a.audit_no} — Internal Audit Report</title><style>body{font-family:Arial,Helvetica,sans-serif;font-size:12.5px;color:#111;padding:18mm;line-height:1.5}table{border-collapse:collapse;width:100%;margin:8px 0;font-size:11.5px}td,th{border:1px solid #999;padding:4px 6px;vertical-align:top}h2{font-size:20px}h3{font-size:14px;margin-top:18px}@page{size:A4;margin:12mm}</style></head><body><div style="display:flex;justify-content:space-between;border-bottom:2px solid #1B2D6B;padding-bottom:6px;margin-bottom:10px"><b>NANDAN GSE PVT. LTD. — Integrated Management System</b><span>Internal Audit Report · ${a.audit_no}</span></div>${a.report_html}</body></html>`); w.document.close(); setTimeout(() => w.print(), 400); };
  const groups = [["major", "Major non-conformities"], ["minor", "Minor non-conformities"], ["observation", "Opportunities for improvement"]] as const;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        {(d.mayAudit || d.mayPlan) && <Btn kind="primary" onClick={report} disabled={busy} title="Genie writes the audit report from every line answered, the NCs and the action plan">{busy ? "Writing…" : a.report_at ? "✨ Rewrite the audit file" : "✨ Write the audit file"}</Btn>}
        {a.report_html && <Btn onClick={print}>🖨 Print / PDF</Btn>}
        {msg && <span className="text-xs font-bold" style={{ color: RED }}>{msg}</span>}
        {a.report_at && <span className="text-xs" style={{ color: MUTED }}>written {fmtD(a.report_at)}</span>}
      </div>
      {groups.map(([sev, label]) => {
        const rows = d.ncs.filter((n) => n.severity === sev || (sev === "major" && n.severity === "critical"));
        if (!rows.length) return null;
        return (
          <div key={sev} className="bg-white rounded-lg border" style={{ borderColor: BORDER }}>
            <div className="px-3 py-2 text-sm font-bold" style={{ background: NAVY_SOFT, color: INK }}>{label} · {rows.length}</div>
            {rows.map((n) => {
              const cs = d.capas.filter((c) => c.nc_id === n.id);
              return (
                <div key={n.id} className="px-3 py-2" style={{ borderTop: `1px solid ${BORDER}` }}>
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className="font-bold text-sm" style={{ color: RED, minWidth: 100 }}>{n.nc_no}</span>
                    <span className="text-sm flex-1" style={{ color: INK }}><b>Clause {n.clause_no}</b> · {n.department} — {n.description}{n.evidence_ref ? <span className="text-xs" style={{ color: MUTED }}> · evidence: {n.evidence_ref}</span> : null}</span>
                    {d.mayAudit ? <Select value={n.status} onChange={(v) => setNc(n, v)} blank="open" options={[{ value: "open", label: "Open" }, { value: "rca", label: "Root cause" }, { value: "capa", label: "Action planned" }, { value: "verification", label: "Verification" }, { value: "closed", label: "Closed" }]} /> : <Chip text={n.status} colour={n.status === "closed" ? GREEN : AMBER} />}
                  </div>
                  <div className="mt-1.5 ml-2">
                    {cs.length === 0 && <div className="text-xs" style={{ color: MUTED }}>No action planned yet.</div>}
                    {cs.map((c) => (
                      <div key={c.id} className="flex items-start gap-2 text-xs py-1" style={{ borderTop: `1px dashed ${BORDER}` }}>
                        <span style={{ color: INK }} className="flex-1"><b>Action:</b> {c.corrective_action}{c.correction ? <> · <b>Correction:</b> {c.correction}</> : null}{c.support ? <> · <b>Support:</b> {c.support}</> : null}</span>
                        <span style={{ color: MUTED, whiteSpace: "nowrap" }}>{c.owner_name || "—"} · by {fmtD(c.due_date)}</span>
                        <Chip text={c.status.replace("_", " ")} colour={c.status === "closed" || c.status === "verified" ? GREEN : AMBER} />
                        {d.mayAudit && <button onClick={() => setEditCapa(c)} className="font-bold" style={{ color: "#1B2D6B" }}>edit</button>}
                      </div>
                    ))}
                    {d.mayAudit && <button onClick={() => setCapaFor(n)} className="text-xs font-bold mt-1" style={{ color: "#F04E23" }}>+ Action</button>}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
      {d.ncs.length === 0 && <Empty>No non-conformity raised on this audit yet.</Empty>}
      {a.report_html && (
        <div className="bg-white rounded-lg border p-4" style={{ borderColor: BORDER }}>
          <div className="text-xs font-bold mb-2" style={{ color: MUTED, letterSpacing: 0.6 }}>THE AUDIT FILE — as Genie wrote it from the lines, the NCs and the action plan</div>
          <div className="ims-report" style={{ fontSize: 13, lineHeight: 1.55, color: INK }} dangerouslySetInnerHTML={{ __html: a.report_html }} />
          <style>{`.ims-report table{border-collapse:collapse;width:100%;margin:6px 0;font-size:12px}.ims-report td,.ims-report th{border:1px solid ${BORDER};padding:4px 6px;vertical-align:top}.ims-report h2{font-size:18px;margin:4px 0 8px}.ims-report h3{font-size:14px;margin:14px 0 4px;color:#1B2D6B}`}</style>
        </div>
      )}
      {capaFor && <CapaBox nc={capaFor} onDone={() => { setCapaFor(null); onChange(); }} />}
      {editCapa && <CapaBox nc={d.ncs.find((n) => n.id === editCapa.nc_id)!} c={editCapa} onDone={() => { setEditCapa(null); onChange(); }} />}
    </div>
  );
}

function CapaBox({ nc, c, onDone }: { nc: NC; c?: Capa; onDone: () => void }) {
  const [f, setF] = useState({ correction: c?.correction || "", corrective_action: c?.corrective_action || "", owner_name: c?.owner_name || "", support: c?.support || "", due_date: c?.due_date || "", status: c?.status || "open", effectiveness_result: c?.effectiveness_result || "" });
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); setMsg(""); const r = await post("/api/ims/audit", { action: c ? "capa_edit" : "capa_add", id: c?.id, nc_id: nc.id, ...f }); setBusy(false); if (!r.ok) { setMsg(r.error || "Could not save."); return; } onDone(); };
  return (
    <Modal onClose={onDone} title={`${c ? "Edit the action" : "Action plan"} — ${nc.nc_no}`} width={680}>
      {msg && <Note kind="error">{msg}</Note>}
      <div className="text-sm mb-2" style={{ color: INK }}><b>Clause {nc.clause_no}</b> · {SEV_LABEL[nc.severity] || nc.severity} · {nc.description}</div>
      <Label>Correction / containment — what was done at once</Label><Text value={f.correction} onChange={(v) => setF({ ...f, correction: v })} />
      <div className="mt-2"><Label>Corrective action — what removes the cause</Label><Area rows={3} value={f.corrective_action} onChange={(v) => setF({ ...f, corrective_action: v })} /></div>
      <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <div><Label>Owner</Label><Text value={f.owner_name} onChange={(v) => setF({ ...f, owner_name: v })} /></div>
        <div><Label>Support</Label><Text value={f.support} onChange={(v) => setF({ ...f, support: v })} /></div>
        <div><Label>Target date</Label><Text type="date" value={f.due_date} onChange={(v) => setF({ ...f, due_date: v })} /></div>
        <div><Label>Status</Label><Select value={f.status} onChange={(v) => setF({ ...f, status: v })} blank="open" options={[{ value: "open", label: "Open" }, { value: "in_progress", label: "In progress" }, { value: "verified", label: "Verified" }, { value: "closed", label: "Closed" }]} /></div>
        <div style={{ gridColumn: "span 2" }}><Label>Effectiveness — what was checked, when</Label><Text value={f.effectiveness_result} onChange={(v) => setF({ ...f, effectiveness_result: v })} /></div>
      </div>
      <div className="flex gap-2 mt-4"><Btn kind="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Btn><Btn onClick={onDone}>Cancel</Btn></div>
    </Modal>
  );
}

function ItemBox({ standards, audit, onDone }: { standards: StandardRow[]; audit: Audit; onDone: () => void }) {
  const [f, setF] = useState({ standard_id: audit.standard_ids[0] || "", clause_no: "", clause_title: "", question: "", evidence_to_verify: "", process_owner: "", departments: [] as string[], method: "Doc review + Interview", aero: false });
  const [msg, setMsg] = useState("");
  const save = async () => { setMsg(""); const r = await post("/api/ims/audit", { action: "item_add", ...f }); if (!r.ok) { setMsg(r.error || "Could not add."); return; } onDone(); };
  return (
    <Modal onClose={onDone} title="A new checklist line" width={720}>
      {msg && <Note kind="error">{msg}</Note>}
      <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div><Label>Standard</Label><Select value={f.standard_id} onChange={(v) => setF({ ...f, standard_id: v })} blank="Every standard" options={standards.map((s) => ({ value: String(s.id), label: s.name.split(" — ")[0].split(" - ")[0] }))} /></div>
        <div><Label>Clause</Label><Text value={f.clause_no} onChange={(v) => setF({ ...f, clause_no: v })} placeholder="8.5.1" /></div>
        <div style={{ gridColumn: "1/-1" }}><Label>Clause title</Label><Text value={f.clause_title} onChange={(v) => setF({ ...f, clause_title: v })} /></div>
        <div style={{ gridColumn: "1/-1" }}><Label>Audit question / requirement</Label><Area rows={3} value={f.question} onChange={(v) => setF({ ...f, question: v })} /></div>
        <div style={{ gridColumn: "1/-1" }}><Label>Objective evidence to verify</Label><Text value={f.evidence_to_verify} onChange={(v) => setF({ ...f, evidence_to_verify: v })} /></div>
        <div><Label>Process owner</Label><Text value={f.process_owner} onChange={(v) => setF({ ...f, process_owner: v })} /></div>
        <div><Label>Method</Label><Text value={f.method} onChange={(v) => setF({ ...f, method: v })} /></div>
        <div style={{ gridColumn: "1/-1" }}><Label>Departments</Label><div className="flex gap-2 flex-wrap">{DEPTS.map((dp) => <label key={dp} className="text-sm flex items-center gap-1" style={{ color: INK }}><input type="checkbox" checked={f.departments.includes(dp)} onChange={() => setF({ ...f, departments: f.departments.includes(dp) ? f.departments.filter((x) => x !== dp) : [...f.departments, dp] })} />{dp}</label>)}</div></div>
        <label className="text-sm flex items-center gap-1" style={{ color: INK }}><input type="checkbox" checked={f.aero} onChange={(e) => setF({ ...f, aero: e.target.checked })} /> An AS 9100D addition over ISO 9001</label>
      </div>
      <div className="flex gap-2 mt-4"><Btn kind="primary" onClick={save}>Add</Btn><Btn onClick={onDone}>Cancel</Btn></div>
    </Modal>
  );
}
