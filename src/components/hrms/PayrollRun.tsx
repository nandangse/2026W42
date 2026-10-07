"use client";
/**
 * One payroll run, as a document (Dr Raghu, 4 Sep 2026): Month Year in
 * bold, run by, run date; the uploads (muster, rate list, anything else)
 * filed in Drive under HR-Payroll run-Month Year; Generate; then the
 * Attendance muster and the Salary register as tabs; Send WhatsApp message
 * at the top, through the queue; every message and every reply kept on the
 * run's Communications tab.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
/** date AND time, in IST (Dr Raghu, 7 Oct 2026: "show the time vinay generated. and also mine approval time") */
const fmtIst = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso); if (isNaN(d.getTime())) return "—";
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value || "";
  return `${g("day")}-${g("month")}-${g("year")} ${g("hour")}:${g("minute")} IST`;
};
import { MONTHS } from "@/lib/hrms-template";
import { PAYROLL_RULES, PAYROLL_RULES_AS_OF, type MusterRow, type RegisterRow } from "@/lib/muster";
import { C } from "./RecordFields";
import { inr } from "@/lib/fmt";

interface Run { id: string; month: number; year: number; status: string; uploaded_by: string | null; uploaded_at: string | null; approved_by: string | null; approved_at: string | null; run_note: string | null; working_days: number | null; generated_at: string | null; generated_by: string | null; wa_batch_id: string | null; drive_folder_link: string | null; total_count: number | null; net_payable: number | null; earned_pay: number | null; deductions: number | null; mapping: { warnings?: string[]; rules_as_of?: string; approval_mail?: { at: string; by: string } } | null }
interface FileRow { id: string; kind: string; name: string; size: number | null; drive_link: string | null; uploaded_by: string | null; uploaded_at: string }
interface Msg { id: string; employee_id: string; name: string; channel: string; direction: string; to_address: string | null; subject: string | null; body: string; status: string; error: string | null; sent_by: string | null; sent_at: string }
interface InputRow { key: string; submitted_by: string | null; submitted_at: string | null; note: string }
interface Detail { run: Run; files: FileRow[]; inputs: InputRow[]; live_rates: { title: string; count: number } | null; muster: { month: number | null; year: number | null; days: number; columns: Record<string, string>; unmapped: string[]; warnings: string[]; rows: MusterRow[] } | null; rates: { rows: number; warnings: string[] } | null; register: RegisterRow[]; messages: Msg[]; counts: Record<string, number> }

const who = (s: string | null) => (s ? String(s).split("·")[0].trim() : "—");

/** 0 = Sunday. Null when the muster never said which month it is. */
const dayOfWeek = (year: number | null, month: number | null, day: number): number | null =>
  year && month ? new Date(Date.UTC(year, month - 1, day)).getUTCDay() : null;

const KINDS = [["essl", "ESSL attendance"], ["muster", "Attendance muster"], ["gsheet", "Google Sheet — Salary tab (for comparison)"], ["rates", "Salary rate list"], ["advance", "Advance (Tally)"], ["loan", "Loan (Tally)"], ["final", "Finalised salary sheet (Excel)"], ["bank", "Bank files (zip)"], ["other", "Other document"]] as const;
/** The run's inputs, one form each (Dr Raghu, 5 Sep 2026) — who brings it, how it comes, whether a file is expected. */
const INPUTS: { key: string; label: string; by: string; how: string; upload: boolean; needFile: boolean; accept: string }[] = [
  { key: "essl", label: "ESSL attendance output", by: "Vishwas", how: "the biometric export, Excel or CSV", upload: true, needFile: true, accept: ".csv,.xlsx,.xls,.txt" },
  { key: "rates", label: "Salary rates", by: "Vinay", how: "from the Appraisals — the Live salary structure; a rate list can be uploaded to override", upload: true, needFile: false, accept: ".csv,.xlsx,.xls" },
  { key: "muster", label: "Muster sheet", by: "HR", how: "CSV — attendance, leave encashment, loan, advance, lunch, site allowance", upload: true, needFile: true, accept: ".csv,.xlsx,.xls" },
  { key: "gsheet", label: "Google Sheet — Salary tab", by: "HR", how: "the sheet's Salary tab as CSV or Excel — compared against Genie's register on the Observation tab, nothing else; not needed once the sheet is retired", upload: true, needFile: false, accept: ".csv,.xlsx,.xls" },
  { key: "advance", label: "Advance", by: "Suresh", how: "PDF from Tally, sent on the 1st to Vinay", upload: true, needFile: true, accept: ".pdf,.csv,.xlsx,.xls" },
  { key: "loan", label: "Loan", by: "Suresh", how: "PDF from Tally, sent on the 1st to Vinay", upload: true, needFile: true, accept: ".pdf,.csv,.xlsx,.xls" },
  { key: "lunch", label: "Lunch", by: "HR", how: "in the muster — check and submit", upload: false, needFile: false, accept: "" },
  { key: "site", label: "Site allowance", by: "HR", how: "in the muster — check and submit", upload: false, needFile: false, accept: "" },
];
type Tab = "overview" | "uploads" | "muster" | "register" | "obs" | "comms";

/** What /api/hrms/observation answers with. */
type ObsFlag = { day: string; mark: string; what: string; in?: string; out?: string; mins?: number };
type ObsPerson = {
  employee_id: string; name: string; department: string; designation: string;
  category: string; location: string;
  paid_present: number; seen_at_gate: number; site_days: number;
  never_on_machine: boolean; unexplained: number; flags: ObsFlag[]; flag_count: number;
};
const REG_KEYS = ["employee_id", "name", "type", "days_due", "leave_ob", "leave_earned", "compoff_days", "leave_used", "leave_encashed", "leave_cb", "paid_days", "per_day", "basic_da", "hra", "fixed_allowance", "conveyance", "medical", "ot_pay", "site_allowance", "compoff_amt", "encash_amt", "arrears", "earned", "pf", "pt", "loan", "advance", "tds", "lunch", "late_ded", "other_ded", "deductions", "net", "round_up", "to_pay", "rate_from"];
type PayCompare = {
  ready: boolean; why?: string; compared: number; matched: number; pay_mismatched: number; rate_mismatched: number; att_mismatched: number; net_mismatched: number;
  holds: { employee_id: string; name: string; type: string; genie_net: number; sheet_net: number | null; sheet_pay: number | null; status: string }[];
  mismatches: {
    employee_id: string; name: string; type: string; genie_net: number; sheet_net: number; diff: number; genie_pay: number; sheet_pay: number | null; pay_diff: number;
    genie_gross: number; sheet_gross: number | null; genie_per_day: number; sheet_per_day: number | null; genie_att: number; sheet_att: number | null; genie_paid: number; sheet_paid: number | null;
    heads: { head: string; genie: number; sheet: number; diff: number }[];
  }[];
  genie_total: number; sheet_total: number; genie_pay_total: number; sheet_pay_total: number; not_in_sheet: number;
};
type ObsData = {
  pay?: PayCompare;
  ok: boolean; ready: boolean; why?: string;
  month?: number; year?: number; days?: number;
  totals?: {
    people: number; punches: number; on_machine: number; matched: number;
    paid_no_record: number; absent_but_punched: number; site_days: number;
    short_days: number; never_on_machine: number; not_in_muster: number;
  };
  not_in_muster?: string[];
  people?: ObsPerson[];
};

const TH: React.CSSProperties = { textAlign: "left", padding: "6px 8px", background: "var(--navy)", color: "#fff", fontWeight: 700, position: "sticky", top: 0, zIndex: 2 };

export default function PayrollRun({ id, isOwner, onBack }: { id: string; isOwner: boolean; onBack: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  /* THE CHRO'S OBSERVATION (Dr Raghu, 9 Sep 2026) — computed on opening, never
     stored: a saved observation disagrees with its own sources the first time
     either the muster or the punches are corrected. */
  const [obs, setObs] = useState<ObsData | null>(null);
  const [obsBusy, setObsBusy] = useState(false);
  useEffect(() => {
    if (tab !== "obs" || obs || obsBusy || !d) return;
    setObsBusy(true);
    fetch(`/api/hrms/observation?id=${encodeURIComponent(String(d.run.id))}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setObs(j))
      .catch((e) => setObs({ ok: false, ready: false, why: String(e?.message || e) }))
      .finally(() => setObsBusy(false));
  }, [tab, obs, obsBusy, d]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  /** The rate source for Generate — the system by default from August on. */
  const [rateSource, setRateSource] = useState<"system" | "list">("system");
  const [pick, setPick] = useState<Record<string, FileList | null>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [wa, setWa] = useState<{ count: number; noPhone: number; blanks: Record<string, number>; sample: { id: string; name: string; phone: string; text: string }[]; template: string } | null>(null);
  const [waOpen, setWaOpen] = useState(false);
  const [q, setQ] = useState("");
  // SORTABLE REGISTER (Dr Raghu, 7 Oct 2026: "make this sortable"): click a
  // heading to sort by that column, click again to turn it; figures sort
  // high to low first, names A to Z first
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 } | null>(null);

  const load = useCallback(async () => {
    try { setD(await api.get(`/api/hrms/payroll?id=${encodeURIComponent(id)}`)); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const act = async (body: Record<string, unknown>, ok: (j: Record<string, unknown>) => string) => {
    setBusy(true); setMsg("");
    try { const j = await api.post("/api/hrms/payroll", { ...body, id }); setMsg(`${ok(j)} ✓`); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const upload = async (kind: string, files: FileList | null | undefined) => {
    if (!files || !files.length) { setMsg("Choose one or more files first."); return; }
    setBusy(true); setMsg("");
    try {
      const fd = new FormData();
      fd.append("id", id); fd.append("kind", kind);
      for (const f of Array.from(files)) fd.append("files", f);
      const r = await fetch("/api/hrms/payroll", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const lines = (j.files as { name: string; parsed: string | null; warnings: string[]; drive_link: string | null }[]).map((f) => `${f.name}${f.parsed ? ` — ${f.parsed}` : ""}${f.drive_link ? " · filed in Drive" : ""}${f.warnings.length ? ` · ${f.warnings.join("; ")}` : ""}`);
      setMsg(`Uploaded ✓ ${lines.join(" | ")}`);
      setPick((p) => ({ ...p, [kind]: null }));
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const waPreview = async () => {
    setBusy(true); setMsg("");
    try { setWa(await api.post("/api/hrms/payroll", { action: "wa_preview", id })); setWaOpen(true); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const waQueue = async () => {
    if (!wa) return;
    if (!window.confirm(`Queue ${wa.count - wa.noPhone} WhatsApp messages for ${MONTHS[(d?.run.month || 1) - 1]} ${d?.run.year}?\n\nThey go out from the WhatsApp queue through Periskope's default number, within the ceilings. Release them from HRMS → WhatsApp — send to all → Send.`)) return;
    await act({ action: "wa_queue", template_key: "attendance_monthly" }, (j) => `${j.queued} queued${(j.skipped as unknown[])?.length ? ` · ${(j.skipped as unknown[]).length} skipped (no mobile)` : ""}`);
    setWaOpen(false); setWa(null); setTab("comms");
  };

  if (!d) return <div className="p-4 text-sm" style={{ color: C.faint }}>{msg || "opening the run…"}</div>;
  const r = d.run;
  const title = `${MONTHS[r.month - 1]} ${r.year}`;
  const musterRows = (d.muster?.rows || []).filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()) || m.employee_id.includes(q));
  const musterMonth = d?.muster?.month ? `${MONTHS[d.muster.month - 1]}${d.muster.year ? ` ${d.muster.year}` : ""}` : "";
  const regRows = (d.register || []).filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()) || m.employee_id.includes(q))
    .sort((a, b) => {
      if (!sort) return 0;
      const av = (a as unknown as Record<string, unknown>)[sort.k], bv = (b as unknown as Record<string, unknown>)[sort.k];
      if (typeof av === "string" || typeof bv === "string") return String(av ?? "").localeCompare(String(bv ?? ""), "en", { numeric: true }) * sort.dir;
      return ((Number(av) || 0) - (Number(bv) || 0)) * sort.dir;
    });
  const tone = (s: string) => (s === "delivered" || s === "received" ? C.green : s === "failed" ? C.red : s === "sent" ? "var(--blue)" : C.dim);
  const mark = (v: string) => ({ P: { bg: "#E6F4EA", c: C.green }, A: { bg: "#FBEDEA", c: C.red }, WO: { bg: "#F4F2EC", c: C.faint }, MO: { bg: "#DCE8F5", c: "var(--blue)" }, S: { bg: "#FFF3E8", c: C.orange } }[v] || { bg: "transparent", c: C.dim });

  return (
    <div>
      {/* ── head ── */}
      <div className="rounded-lg px-4 py-3 mb-3 flex items-start gap-3 flex-wrap" style={{ background: "var(--navy)", color: "#fff" }}>
        <button onClick={onBack} className="text-xs font-bold rounded px-2 py-1" style={{ background: "rgba(255,255,255,0.12)", color: "#D7DEE6" }}>← Runs</button>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="font-bold" style={{ fontSize: 20 }}>{title} <span className="font-normal text-xs" style={{ color: "#8FA1B3" }}>payroll run</span></div>
          <div className="text-xs" style={{ color: "#8FA1B3" }}>
            Run by <b style={{ color: "#D7DEE6" }}>{who(r.uploaded_by)}</b> · run date <b style={{ color: "#D7DEE6" }}>{r.uploaded_at ? fmtFull(String(r.uploaded_at)) : "—"}</b>
            {r.generated_at && <> · generated <b style={{ color: "#D7DEE6" }}>{fmtIst(String(r.generated_at))}</b> by {who(r.generated_by)}</>}
            {r.mapping?.approval_mail && <> · sent for approval <b style={{ color: "#D7DEE6" }}>{fmtIst(r.mapping.approval_mail.at)}</b> by {who(r.mapping.approval_mail.by)}</>}
            {" · "}{r.approved_by ? <span style={{ color: "#7BD389" }}>✓ approved by {who(r.approved_by)} at {fmtIst(String(r.approved_at))}</span> : <span style={{ color: "var(--amber)" }}>awaiting Raghu&apos;s approval</span>}
          </div>
        </div>
        <button onClick={waPreview} disabled={busy || !d.muster} className="text-xs font-bold rounded px-3 py-2" style={{ background: d.muster ? "#25D366" : "rgba(255,255,255,0.12)", color: d.muster ? "#0B3D1E" : "#8FA1B3" }} title={d.muster ? "The attendance message to everybody on the muster, through the WhatsApp queue" : "Upload the muster first"}>💬 Send WhatsApp message</button>
        {/* EXECUTE BANK FILES (Dr Raghu, 7 Oct 2026): once approved, the bank's own upload files, one per class, under ₹10 lakh each, zipped */}
        {/* THE FINALISED SALARY SHEET (Dr Raghu, 7 Oct 2026): the Excel in the Google Sheet's Salary-tab layout, made on approval and filed in Drive */}
        {r.approved_by && (
          <a href={`/api/hrms/payroll?id=${encodeURIComponent(id)}&xlsx=1`} className="text-xs font-bold rounded px-3 py-2" style={{ background: "#D7DEE6", color: "#1F2328", textDecoration: "none" }}
            title="The month's salary sheet as Excel, in the same columns as the Google Sheet's Salary tab — made from the approved register">📗 Salary sheet (Excel)</a>
        )}
        {r.approved_by && (
          <a href={`/api/hrms/payroll?id=${encodeURIComponent(id)}&bank=1`} className="text-xs font-bold rounded px-3 py-2" style={{ background: "#F3B33D", color: "#1F2328", textDecoration: "none" }}
            title="The bank's NEFT upload files for this run — management, staff and labour kept apart, each file under ₹10 lakh, with a note of anybody left out">🏦 Execute Bank Files</a>
        )}
        {/* MAIL FOR APPROVAL (Dr Raghu, 7 Oct 2026: "Send me an email from this to approve") — the run's figures and a link, from HR's mailbox to Raghu */}
        {r.generated_at && !r.approved_by && (
          <button onClick={() => act({ action: "mail_approval" }, (j) => `Mailed ${String(j.to || "Raghu")} for approval${j.note ? ` — ${j.note}` : ""}`)} disabled={busy} className="text-xs font-bold rounded px-3 py-2" style={{ background: "#D7DEE6", color: "#1F2328" }}
            title="E-mails Raghu the run's totals, holds and warnings with a link to this run, so he can approve it">✉ Mail Raghu to approve</button>
        )}
        {isOwner && (r.approved_by
          ? <button onClick={() => act({ action: "unapprove" }, () => "Approval withdrawn")} className="text-xs font-semibold rounded px-3 py-2" style={{ background: "rgba(255,255,255,0.12)", color: "#D7DEE6" }}>withdraw approval</button>
          : <button onClick={() => { if (window.confirm(`Approve the ${title} payroll run?`)) act({ action: "approve" }, () => `${title} approved`); }} className="text-xs font-bold rounded px-3 py-2" style={{ background: C.green, color: "#fff" }}>✓ Approve</button>)}
      </div>
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>}

      {/* ── the WhatsApp preview ── */}
      {waOpen && wa && (
        <div className="bg-white rounded-lg border p-3 mb-3" style={{ borderColor: "#25D366" }}>
          <div className="flex items-baseline gap-2 flex-wrap">
            <div className="font-bold text-sm">Attendance message — {wa.count} people, {wa.noPhone} without a mobile</div>
            {Object.keys(wa.blanks).length > 0 && <span className="text-xs" style={{ color: C.red }}>blank: {Object.entries(wa.blanks).map(([k, n]) => `{{${k}}} ×${n}`).join(", ")}</span>}
            <span style={{ flex: 1 }} />
            <span className="text-xs" style={{ color: C.faint }}>Template: Masters → Standard Texts → Attendance monthly</span>
          </div>
          <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {wa.sample.map((s) => (
              <div key={s.id} className="rounded p-2" style={{ background: "#F7F6F2", fontSize: 12, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                <div style={{ color: C.faint, fontSize: 11 }}>{s.name} · {s.phone || <span style={{ color: C.red }}>no mobile</span>}</div>{s.text}
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setWaOpen(false)} className="text-xs font-semibold rounded border px-3 py-1.5 bg-white" style={{ borderColor: C.line, color: C.dim }}>Cancel</button>
            <button onClick={waQueue} disabled={busy} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#25D366", color: "#0B3D1E" }}>Queue {wa.count - wa.noPhone} → then Send from the queue</button>
          </div>
        </div>
      )}

      {/* ── tabs ── */}
      <div className="flex gap-1 flex-wrap mb-2">
        {([["overview", "Overview"], ["uploads", `Uploads (${d.files.length})`], ["muster", `Attendance muster${d.muster ? ` (${d.muster.rows.length})` : ""}`], ["register", `Salary register${d.register.length ? ` (${d.register.length})` : ""}`], ["obs", "Observation"], ["comms", `Communications (${d.messages.length})`]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="text-xs font-bold rounded px-2.5 py-1.5" style={tab === k ? { background: "var(--navy)", color: "#fff" } : { color: "#5B6B7A", background: "#EAE7DF" }}>{l}</button>
        ))}
        {(tab === "muster" || tab === "register" || tab === "obs" || tab === "comms") && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="find a person" className="text-xs rounded px-2 py-1 ml-auto" style={{ border: `1px solid ${C.line}`, width: 180 }} />}
        {/* PRINT THE MUSTER (Dr Raghu, 7 Sep 2026: "once you give me the
            muster and the salary register for print, I can print it, sign
            it, and then freeze it"). The register had a print; the muster,
            which is the record of who was actually here, did not. */}
        {tab === "muster" && d.muster && (
          <a href={`/hrms/muster/${id}/print`} target="_blank" rel="noopener noreferrer"
            className="text-xs font-bold rounded px-2.5 py-1.5" style={{ background: "var(--blue)", color: "#fff" }}
            title="A4 landscape, day by day, with Prepared / Checked / Approved and the stamp — to print and sign">📄 Print muster</a>
        )}
      </div>

      {tab === "overview" && (
        <div className="flex gap-3 items-start" style={{ flexWrap: "wrap" }}>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", flex: "1 1 520px" }}>
          <Card title="Uploads">{d.files.length ? <>{d.files.length} file{d.files.length === 1 ? "" : "s"} · muster {d.muster ? "✓" : "—"} · rate list {d.rates ? "✓" : "—"}</> : "Nothing uploaded yet."}{r.drive_folder_link && <div className="mt-1"><a href={r.drive_folder_link} target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>Drive folder ↗</a></div>}</Card>
          <Card title="Generated">{r.generated_at ? <>{d.register.length} lines · earned ₹{inr(r.earned_pay)} · deductions ₹{inr(r.deductions)} · net ₹{inr(r.net_payable)}</> : "Not generated yet — upload the muster and press Generate on the Uploads tab."}</Card>
          <Card title="Working days this month">
            <WorkingDays run={r} onSave={(n) => act({ action: "working_days", id: r.id, working_days: n }, () => "Working days saved — press Generate again for the conveyance to follow.")} />
          </Card>
          <Card title="WhatsApp">{d.messages.length ? Object.entries(d.counts).map(([k, v]) => <span key={k} className="mr-2" style={{ color: tone(k) }}><b>{v}</b> {k}</span>) : "No message sent from this run yet."}</Card>
          {(r.mapping?.warnings || []).length > 0 && <Card title="Warnings"><ul className="text-xs" style={{ color: "#8A5B00", paddingLeft: 16 }}>{(r.mapping?.warnings || []).map((w, i) => <li key={i}>{w}</li>)}</ul></Card>}
        </div>
        <Rules runRulesAsOf={r.mapping?.rules_as_of ?? null} />
        </div>
      )}

      {tab === "uploads" && (
        <>
          <div className="text-xs mb-2" style={{ color: C.dim }}>Seven inputs, one form each. Upload what comes as a file, check what the muster carries, and press <b>Submit</b> to sign it — who and when stay on the run. Then Generate.</div>
          {INPUTS.map((inp) => {
            const files = d.files.filter((f) => f.kind === inp.key);
            const sub = d.inputs.find((x) => x.key === inp.key);
            const signed = !!sub?.submitted_at;
            const m = d.muster;
            const sum = (k: keyof MusterRow) => m ? m.rows.reduce((a, r) => a + (Number(r[k]) || 0), 0) : 0;
            const cnt = (k: keyof MusterRow) => m ? m.rows.filter((r) => Number(r[k]) > 0).length : 0;
            const fromMuster = (k: keyof MusterRow, label: string) => m ? `${label}: ₹${inr(sum(k))} across ${cnt(k)} people, from the muster` : `${label}: the muster is not uploaded yet`;
            const carried = inp.key === "advance" ? fromMuster("advance", "Advance")
              : inp.key === "loan" ? `${fromMuster("loan_ded", "Loan deduction")}${m ? ` · loans taken ₹${inr(sum("loan_taken"))}` : ""}`
              : inp.key === "lunch" ? fromMuster("lunch", "Lunch")
              : inp.key === "site" ? fromMuster("site_allowance", "Site allowance")
              : inp.key === "muster" ? (m ? (m.rows.length ? `${m.rows.length} people over ${m.days} days · leave encashment ₹${inr(sum("leave_encash"))} · advance ₹${inr(sum("advance"))} · loan ₹${inr(sum("loan_ded"))} · lunch ₹${inr(sum("lunch"))} · site ₹${inr(sum("site_allowance"))}` : `⚠ The file was read but nobody was found in it — ${(m.warnings || []).join(" ") || "no header row the parser knows."} Press Re-read after a fix, or upload the Muster tab.`) : "Not uploaded yet.")
              : inp.key === "rates" ? (d.rates ? `Rate list uploaded on this run: ${d.rates.rows} rates (overrides the Live structure).` : d.live_rates ? `Live structure: ${d.live_rates.title}, ${d.live_rates.count} rates — Generate reads it.` : "No Live salary structure — set one in HRIS → Salary Rate List, or upload a rate list here.")
              : (files.length ? `${files.length} file${files.length === 1 ? "" : "s"} filed as evidence. Attendance itself is read from the muster.` : "Not uploaded yet. Attendance itself is read from the muster.");
            return (
              <div key={inp.key} className="bg-white rounded-lg border mb-2" style={{ borderColor: signed ? "#BFE3C9" : C.line }}>
                <div className="px-3 py-2 flex gap-2 items-baseline flex-wrap">
                  <span className="font-bold text-sm">{inp.label}</span>
                  <span className="text-xs" style={{ color: C.dim }}>{inp.by} · {inp.how}</span>
                  <span style={{ flex: 1 }} />
                  {signed
                    ? <span className="text-xs font-bold" style={{ color: C.green }}>✓ Submitted by {who(sub!.submitted_by)} on {fmtFull(String(sub!.submitted_at))}</span>
                    : <span className="text-xs font-bold" style={{ color: "#8A5B00" }}>Not submitted</span>}
                </div>
                <div className="px-3 pb-2 text-xs" style={{ color: C.dim }}>{carried}</div>
                {files.map((f) => (
                  <div key={f.id} className="px-3 py-1.5 flex gap-2 items-baseline text-xs flex-wrap" style={{ borderTop: "1px solid #EEECE6" }}>
                    <span className="font-semibold">{f.name}</span>
                    <span style={{ color: C.faint }}>{f.size ? `${Math.round(f.size / 1024)} KB` : ""} · {who(f.uploaded_by)} · {fmtFull(String(f.uploaded_at))}</span>
                    <span style={{ flex: 1 }} />
                    {f.drive_link ? <a href={f.drive_link} target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>Drive ↗</a> : <span style={{ color: "#8A5B00" }}>not filed in Drive</span>}
                    {!signed && <button onClick={() => { if (window.confirm(`Remove ${f.name} from this run?${f.drive_link ? "\n\nThe Drive copy goes to the bin as well." : ""}`)) act({ action: "remove_file", file_id: f.id }, () => `${f.name} removed`); }}
                      disabled={busy} className="rounded px-2 py-0.5 font-semibold" style={{ background: "#FBEDEA", color: C.red }} title="Remove this upload">✕</button>}
                  </div>
                ))}
                <div className="px-3 py-2 flex gap-2 items-center flex-wrap" style={{ borderTop: "1px solid #EEECE6" }}>
                  {/* RE-READ (7 Oct 2026): the file already on the run, fetched back from Drive and parsed again with today's parser */}
                  {inp.key === "muster" && files.length > 0 && !signed && (
                    <button onClick={() => act({ action: "reparse_muster" }, (j) => `Re-read: ${j.rows} people over ${j.days} days${(j.warnings as string[])?.length ? ` · ${(j.warnings as string[]).join(" ")}` : ""}`)}
                      disabled={busy} className="text-xs font-bold rounded px-3 py-2" style={{ background: "#EEF3F8", color: "var(--navy)" }} title="Read the newest muster file on this run again, without uploading it twice">↻ Re-read</button>
                  )}
                  {inp.upload && !signed && (
                    <>
                      <input type="file" multiple accept={inp.accept} className="block" style={{ fontSize: 12 }} onChange={(e) => setPick({ ...pick, [inp.key]: e.target.files })} />
                      <button onClick={() => upload(inp.key, pick[inp.key])} disabled={busy || !pick[inp.key]?.length} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: C.orange, color: "#fff", opacity: busy || !pick[inp.key]?.length ? 0.5 : 1 }}>⬆ Upload</button>
                    </>
                  )}
                  {!signed && <input value={notes[inp.key] ?? ""} onChange={(e) => setNotes({ ...notes, [inp.key]: e.target.value })} placeholder="Note (optional)" className="text-xs rounded px-2 py-1.5" style={{ border: `1px solid ${C.line}`, minWidth: 200, flex: "1 1 200px" }} />}
                  {signed && sub?.note && <span className="text-xs" style={{ color: C.dim }}>Note: {sub.note}</span>}
                  <span style={{ flex: 1 }} />
                  {signed
                    ? <button onClick={() => act({ action: "unsubmit_input", key: inp.key, note: sub?.note || "" }, () => `${inp.label} reopened`)} disabled={busy} className="text-xs font-semibold rounded px-3 py-1.5" style={{ background: "#F4F2EC", color: C.dim }}>Reopen</button>
                    : <button onClick={() => act({ action: "submit_input", key: inp.key, note: notes[inp.key] || "" }, () => `${inp.label} submitted`)} disabled={busy || (inp.upload && inp.needFile && !files.length)} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: inp.upload && inp.needFile && !files.length ? "var(--line)" : C.green, color: inp.upload && inp.needFile && !files.length ? C.faint : "#fff" }} title={inp.upload && inp.needFile && !files.length ? "Upload the file first" : "Sign this input as received and checked"}>✓ Submit</button>}
                </div>
              </div>
            );
          })}
          {/* WHERE THE RATE COMES FROM (Dr Raghu, 7 Sep 2026: "from the
              August month we should not use the salary rates as an upload —
              take the salary rate from the system, the latest one
              available"). A rate list is a copy, and a copy is stale the
              moment the thing it copied moves: the August run read one on
              5 September and paid 43 people their old rate. */}
          <div className="bg-white rounded-lg border p-3" style={{ borderColor: C.line }}>
            <div className="text-xs font-bold mb-1" style={{ color: C.dim }}>WHERE THE RATE COMES FROM</div>
            <div className="flex gap-3 flex-wrap">
              {([["system", "From the system — the finalised appraisals"], ["list", "From the uploaded rate list"]] as const).map(([k, label]) => (
                <label key={k} className="text-xs flex gap-1.5 items-center" style={{ cursor: "pointer" }}>
                  <input type="radio" name="ratesrc" checked={rateSource === k} onChange={() => setRateSource(k)} />
                  <span style={{ fontWeight: rateSource === k ? 700 : 400 }}>{label}</span>
                </label>
              ))}
            </div>
            <div className="text-xs mt-1" style={{ color: C.faint, lineHeight: 1.5 }}>
              {rateSource === "system"
                ? "Each person is paid the appraisal you have finalised, provided its effective date has arrived by the end of this month. Anybody without one falls through to their record — nothing is invented."
                : "The uploaded list, or the Live salary structure if none is uploaded. A list is a copy: it does not move when an appraisal is finalised after it was made."}
            </div>
          </div>
          <div className="bg-white rounded-lg border p-3 flex gap-2 items-center flex-wrap" style={{ borderColor: C.line }}>
            <div className="text-xs" style={{ color: C.dim }}>{d.inputs.filter((x) => x.submitted_at).length} of {INPUTS.length} inputs submitted.{d.files.filter((f) => !INPUTS.some((i) => i.key === f.kind)).length ? ` ${d.files.filter((f) => !INPUTS.some((i) => i.key === f.kind)).length} other file(s) on the run.` : ""}</div>
            <span style={{ flex: 1 }} />
            <button onClick={() => act({ action: "generate", rate_source: rateSource }, (j) => `Generated ${j.lines} lines${j.fromSystem ? ` · ${j.fromSystem} rates taken from the system` : ""}${(j.warnings as string[])?.length ? ` · ${(j.warnings as string[]).join("; ")}` : ""}`)} disabled={busy || !d.muster} className="text-xs font-bold rounded px-4 py-2" style={{ background: d.muster ? C.green : "var(--line)", color: d.muster ? "#fff" : C.faint }} title={d.muster ? "Muster × rates → the salary register" : "Upload the muster first"}>▶ Generate</button>
          </div>
          {d.muster && (
            <div className="text-xs mt-2" style={{ color: C.faint }}>
              Muster read: {d.muster.rows.length} people over {d.muster.days} days{d.muster.month ? ` (${MONTHS[d.muster.month - 1]}${d.muster.year ? ` ${d.muster.year}` : ""})` : ""}. Columns understood: {Object.values(d.muster.columns).join(", ")}.{d.muster.unmapped.length ? ` Not used: ${d.muster.unmapped.join(", ")}.` : ""}
              {d.muster.warnings.map((w, i) => <div key={i} style={{ color: "#8A5B00" }}>{w}</div>)}
            </div>
          )}
          {d.rates && <div className="text-xs mt-1" style={{ color: C.faint }}>Rate list read: {d.rates.rows} people.{d.rates.warnings.map((w, i) => <div key={i} style={{ color: "#8A5B00" }}>{w}</div>)}</div>}
        </>
      )}

      {tab === "muster" && (
        !d.muster ? <div className="text-xs" style={{ color: C.faint }}>No muster uploaded yet.</div> : (
          <div className="bg-white rounded-lg border" style={{ borderColor: C.line, overflow: "auto", maxHeight: "calc(100vh - 300px)" }}>
            <table className="genie-table" style={{ fontSize: 11.5, borderCollapse: "collapse", whiteSpace: "nowrap" }}>
              {/* THE FROZEN ROW CARRIES THE DATE (Dr Raghu, 7 Sep 2026:
                  "attendance muster frozen row to have date heading"). Bare
                  numbers in grey told nobody which day they were looking at;
                  the weekday sits above the date, and Sundays are shaded, so
                  the roster reads the way Vishwas keeps it. */}
              <thead><tr style={{ fontSize: 10 }}>
                <th className="px-2 py-1.5 text-left" style={{ position: "sticky", left: 0, top: 0, background: "#F4F2EC", zIndex: 3, minWidth: 60, width: 60, color: C.ink, borderBottom: `2px solid ${C.line}` }}>Emp</th>
                <th className="px-2 py-1.5 text-left" style={{ position: "sticky", left: 60, top: 0, background: "#F4F2EC", zIndex: 3, minWidth: 160, color: C.ink, borderBottom: `2px solid ${C.line}` }}>
                  Name{musterMonth ? <span style={{ color: C.faint, fontWeight: 400 }}> · {musterMonth}</span> : null}
                </th>
                {Array.from({ length: d.muster.days }, (_, i) => {
                  const dw = dayOfWeek(d.muster!.year, d.muster!.month, i + 1);
                  const sun = dw === 0;
                  return (
                    <th key={i} className="px-1 py-1" style={{ position: "sticky", top: 0, background: sun ? "#FBEFE7" : "#F4F2EC", zIndex: 2, minWidth: 24, textAlign: "center", color: sun ? "#8A5B00" : C.ink, borderBottom: `2px solid ${C.line}`, lineHeight: 1.15 }}>
                      <div style={{ fontSize: 9, fontWeight: 400, color: sun ? "#8A5B00" : C.faint }}>{dw == null ? "" : "SMTWTFS"[dw]}</div>
                      <div style={{ fontSize: 11, fontWeight: 700 }}>{i + 1}</div>
                    </th>
                  );
                })}
                {["P", "A", "WO", "MO", "Pay", "OT", "Adv", "Loan", "Cat", "Mobile"].map((h) => <th key={h} className="px-2 py-1.5" style={{ position: "sticky", top: 0, background: "#F4F2EC", zIndex: 2, textAlign: "right", color: C.ink, borderBottom: `2px solid ${C.line}` }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {musterRows.map((m) => (
                  <tr key={m.employee_id} style={{ borderTop: "1px solid #EEECE6" }}>
                    <td className="px-2 py-1 tnum" style={{ position: "sticky", left: 0, background: "#fff", zIndex: 1, minWidth: 60, width: 60 }}>{m.employee_id}</td>
                    <td className="px-2 py-1 font-semibold" style={{ position: "sticky", left: 60, background: "#fff", zIndex: 1 }}>{m.name}{m.status !== "Active" && <span className="ml-1" style={{ color: C.red, fontSize: 10 }}>{m.status}</span>}</td>
                    {m.days.map((v, i) => { const t = mark(v); return <td key={i} className="text-center" style={{ background: t.bg, color: t.c, fontWeight: 700, fontSize: 10 }}>{v}</td>; })}
                    <td className="px-2 text-right tnum">{m.present}</td><td className="px-2 text-right tnum" style={{ color: m.absent ? C.red : undefined }}>{m.absent}</td><td className="px-2 text-right tnum">{m.wo}</td><td className="px-2 text-right tnum">{m.mo_st}</td><td className="px-2 text-right tnum font-bold">{m.pay_days}</td>
                    <td className="px-2 text-right tnum">{m.ot ?? ""}</td><td className="px-2 text-right tnum">{m.advance ?? ""}</td><td className="px-2 text-right tnum">{m.loan_ded ?? ""}</td><td className="px-2 text-right" style={{ color: C.faint }}>{m.category}</td><td className="px-2 text-right tnum" style={{ color: C.faint }}>{m.mobile}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === "register" && (
        !d.register.length ? <div className="text-xs" style={{ color: C.faint }}>Not generated yet — Uploads → Generate.</div> : (
          <div className="flex gap-3 items-start" style={{ flexWrap: "wrap" }}>
          <div className="bg-white rounded-lg border" style={{ borderColor: C.line, overflow: "auto", maxHeight: "calc(100vh - 300px)", flex: "1 1 700px", minWidth: 0 }}>
            <table className="genie-table" style={{ fontSize: 12, borderCollapse: "collapse", whiteSpace: "nowrap" }}>
              {/* A HEADING HAS TO BE READABLE (Dr Raghu, 7 Sep 2026: "this on
                  the payroll run is still blank — show the background in dark
                  colour"). It was C.faint on white: pale grey on white, which
                  is not a faint heading, it is no heading. Thirty-five columns
                  of figures with nothing naming them. Dark ground, white type
                  — the same as the printed register, so the screen and the
                  paper name their columns the same way. */}
              <thead><tr style={{ fontSize: 10 }}>
                {["Emp", "Name", "Type", "Due", "Leave OB", "Earned lv", "Comp off", "Lv used", "Encashed", "Leave CB", "Paid days", "Per day", "Basic & DA", "HRA", "Fixed", "Conv", "Medical", "OT pay", "Site", "Comp off ₹", "Encash ₹", "Arrears", "Earned", "PF", "PT", "Loan", "Advance", "TDS", "Lunch", "Late", "Other", "Deductions", "Net", "Round up", "To pay", "Rate from"].map((h, i) => {
                  const k = REG_KEYS[i];
                  const on = sort?.k === k;
                  return (
                  <th key={h} className="px-2 py-1.5" title="click to sort" onClick={() => setSort(on ? (sort!.dir === (i < 3 ? 1 : -1) ? { k, dir: sort!.dir === 1 ? -1 : 1 } : null) : { k, dir: i < 3 ? 1 : -1 })} style={{ position: "sticky", top: 0, background: on ? "#2C4A66" : "#16232F", color: "#fff", fontWeight: 700, textAlign: i < 3 ? "left" : "right", zIndex: i < 2 ? 3 : 2, borderBottom: "2px solid #16232F", cursor: "pointer", userSelect: "none", ...(i === 0 ? { left: 0, minWidth: 60, width: 60 } : i === 1 ? { left: 60 } : {}) }}>{h}{on ? (sort!.dir === 1 ? " ▲" : " ▼") : ""}</th>
                  );
                })}
              </tr></thead>
              <tbody>
                {regRows.map((x) => (
                  <tr key={x.employee_id} style={{ borderTop: "1px solid #EEECE6", opacity: x.hold ? 0.6 : 1 }}>
                    <td className="px-2 py-1 tnum" style={{ position: "sticky", left: 0, background: "#fff", minWidth: 60, width: 60 }}>{x.employee_id}</td>
                    <td className="px-2 py-1 font-semibold" style={{ position: "sticky", left: 60, background: "#fff" }}>{x.name}{x.hold && <span className="ml-1" style={{ color: C.red, fontSize: 10 }}>hold</span>}</td>
                    <td className="px-2 py-1" style={{ color: C.faint }}>{x.type || ""}</td>
                    {[x.days_due, x.leave_ob, x.leave_earned, x.compoff_days, x.leave_used, x.leave_encashed, x.leave_cb, x.paid_days].map((v, i) => (
                      <td key={"l" + i} className="px-2 py-1 text-right tnum" style={{ color: i === 6 ? "var(--blue)" : C.dim, fontWeight: i === 6 || i === 7 ? 700 : 400 }}>{v == null ? "—" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                    ))}
                    {[x.per_day, x.basic_da, x.hra, x.fixed_allowance, x.conveyance, x.medical, x.ot_pay, x.site_allowance, x.compoff_amt, x.encash_amt, x.arrears, x.earned, x.pf, x.pt, x.loan, x.advance, x.tds, x.lunch, x.late_ded, x.other_ded, x.deductions, x.net, x.round_up, x.to_pay].map((v, i) => (
                      <td key={i} className="px-2 py-1 text-right tnum" style={i === 11 || i === 21 || i === 23 ? { fontWeight: 700 } : i === 22 ? { color: C.faint } : undefined}>{i === 22 ? (v ? Number(v).toFixed(2) : "·") : inr(v)}</td>
                    ))}
                    <td className="px-2 py-1 text-right" style={{ color: x.rate_from === "none" ? C.red : C.faint, fontSize: 10 }}>{x.rate_from}</td>
                  </tr>
                ))}
              </tbody>
              {/* THE TOTAL IS SEEN AT THE BOTTOM (Dr Raghu, 7 Oct 2026: "The total should be seen at the bottom"; "This total at the bottom is
                  including the people who are holding or excluding?") — pinned under the scroll, and it says: the holds are IN every column's total
                  (their net is booked) and their to-pay is ₹0, so the To pay total is the bank figure */}
              <tfoot><tr style={{ borderTop: `2px solid ${C.line}`, fontWeight: 700, position: "sticky", bottom: 0, background: "#fff", boxShadow: "0 -2px 0 #16232F", zIndex: 2 }}>
                <td className="px-2 py-1.5" colSpan={3} style={{ position: "sticky", left: 0, background: "#fff", zIndex: 3, whiteSpace: "normal", lineHeight: 1.3 }}>
                  {regRows.length} people{regRows.some((x) => x.hold) && <span className="font-normal" style={{ color: C.red, fontSize: 10 }}> · {regRows.filter((x) => x.hold).length} on hold — counted in every total, to pay ₹0</span>}
                </td>
                {["days_due", "leave_ob", "leave_earned", "compoff_days", "leave_used", "leave_encashed", "leave_cb", "paid_days", "per_day", "basic_da", "hra", "fixed_allowance", "conveyance", "medical", "ot_pay", "site_allowance", "compoff_amt", "encash_amt", "arrears", "earned", "pf", "pt", "loan", "advance", "tds", "lunch", "late_ded", "other_ded", "deductions", "net", "round_up", "to_pay"].map((k) => (
                  <td key={k} className="px-2 py-1.5 text-right tnum">{["days_due", "leave_ob", "leave_earned", "compoff_days", "leave_used", "leave_encashed", "leave_cb", "paid_days", "per_day"].includes(k) ? "" : inr(regRows.reduce((a, x) => a + (Number((x as unknown as Record<string, unknown>)[k]) || 0), 0))}</td>
                ))}
                <td />
              </tr></tfoot>
            </table>
          </div>
          <Rules runRulesAsOf={r.mapping?.rules_as_of ?? null} />
          </div>
        )
      )}

      {tab === "obs" && (
        <div className="bg-white rounded-lg border p-3" style={{ borderColor: C.line }}>
          <div className="font-bold mb-1" style={{ color: C.ink }}>
            CHRO observation
            <span className="text-xs font-normal" style={{ color: C.dim }}> · wherever Genie and the sheet differ — net, to pay, holds — and the muster against the machine at the gate</span>
          </div>
          {obsBusy && <div className="text-xs" style={{ color: C.dim }}>Reading both sides…</div>}
          {/* NET PAY — GENIE AGAINST THE SHEET (Dr Raghu, 7 Oct 2026): the holds, then every
              mismatch one by one with the heads that differ, largest first */}
          {obs?.pay && (
            <div className="rounded border p-3 mb-3" style={{ borderColor: C.line, background: "#FBFAF6" }}>
              <div className="font-bold text-sm mb-1" style={{ color: C.ink }}>Genie against the sheet — rates, attendance, net, to pay <span className="font-normal text-xs" style={{ color: C.dim }}>· red cells are where the two sides differ</span></div>
              {!obs.pay.ready ? <div className="text-xs" style={{ color: "#8A5B00" }}>{obs.pay.why}</div> : (
                <>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {([
                      ["Compared", obs.pay.compared, C.ink], ["Match on every count", obs.pay.matched, "#2A6B39"], ["Do not match", obs.pay.mismatches.length, obs.pay.mismatches.length ? "#8E2C20" : "#2A6B39"],
                      ["Rate differs", obs.pay.rate_mismatched, obs.pay.rate_mismatched ? "#8E2C20" : "#2A6B39"], ["Attendance differs", obs.pay.att_mismatched, obs.pay.att_mismatched ? "#8E2C20" : "#2A6B39"], ["Net differs", obs.pay.net_mismatched, obs.pay.net_mismatched ? "#8E2C20" : "#2A6B39"],
                      ["On hold", obs.pay.holds.length, "#B26A00"], ["Genie net", Math.round(obs.pay.genie_total), C.ink], ["Sheet net", Math.round(obs.pay.sheet_total), C.ink], ["Net difference", Math.round(obs.pay.genie_total - obs.pay.sheet_total), Math.abs(obs.pay.genie_total - obs.pay.sheet_total) >= 1 ? "#8E2C20" : "#2A6B39"],
                      ["To pay differs", obs.pay.pay_mismatched, obs.pay.pay_mismatched ? "#8E2C20" : "#2A6B39"], ["Genie to pay (bank)", obs.pay.genie_pay_total, C.ink], ["Sheet to pay (bank)", obs.pay.sheet_pay_total, C.ink], ["To pay difference", obs.pay.genie_pay_total - obs.pay.sheet_pay_total, Math.abs(obs.pay.genie_pay_total - obs.pay.sheet_pay_total) >= 1 ? "#8E2C20" : "#2A6B39"],
                    ] as [string, number, string][]).map(([label, n, col]) => (
                      <div key={label} className="rounded px-3 py-2" style={{ border: `1px solid ${C.line}`, minWidth: 120, background: "#fff" }}>
                        <div className="tnum font-bold" style={{ fontSize: 18, color: col, lineHeight: 1.1 }}>{/net|difference|to pay \(/i.test(label) ? `₹${inr(n)}` : n.toLocaleString("en-IN")}</div>
                        <div style={{ fontSize: 11, color: C.dim }}>{label}</div>
                      </div>
                    ))}
                  </div>
                  {obs.pay.holds.length > 0 && (
                    <div className="mb-2">
                      <div className="text-xs font-bold mb-1" style={{ color: "#B26A00" }}>ON HOLD — {obs.pay.holds.length}: attendance earnings only, nothing paid until lifted</div>
                      <div className="text-xs" style={{ color: C.ink, lineHeight: 1.7 }}>
                        {obs.pay.holds.filter((h) => !q || h.name.toLowerCase().includes(q.toLowerCase()) || h.employee_id.includes(q)).map((h) => (
                          <div key={h.employee_id}><b>{h.employee_id}</b> {h.name} <span style={{ color: C.faint }}>· {h.type} · {h.status}</span> — Genie net ₹{inr(h.genie_net)}{h.sheet_net != null ? ` · sheet net ₹${inr(h.sheet_net)}` : ""} · <b>Genie to pay ₹0</b>{h.sheet_pay != null && h.sheet_pay > 0 && <span style={{ color: "#8E2C20" }}> · <b>but the sheet pays ₹{inr(h.sheet_pay)}</b> — settle which is right</span>}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {obs.pay.mismatches.length === 0 ? <div className="text-xs" style={{ color: "#2A6B39" }}>Every line that is not on hold matches the sheet on every count — rate, attendance, net and to pay.</div> : (
                    <div style={{ maxHeight: "48vh", overflow: "auto" }}>
                      <table className="w-full text-xs genie-table">
                        <thead>
                          <tr>
                            <th style={TH} rowSpan={2}>Employee</th><th style={TH} rowSpan={2}>Type</th>
                            <th style={{ ...TH, textAlign: "center", borderLeft: "1px solid #D7DEE6" }} colSpan={2}>Gross rate</th><th style={{ ...TH, textAlign: "center", borderLeft: "1px solid #D7DEE6" }} colSpan={2}>Per day</th>
                            <th style={{ ...TH, textAlign: "center", borderLeft: "1px solid #D7DEE6" }} colSpan={2}>Attendance</th><th style={{ ...TH, textAlign: "center", borderLeft: "1px solid #D7DEE6" }} colSpan={2}>Payment days</th>
                            <th style={{ ...TH, textAlign: "center", borderLeft: "1px solid #D7DEE6" }} colSpan={3}>Net</th><th style={{ ...TH, textAlign: "center", borderLeft: "1px solid #D7DEE6" }} colSpan={3}>To pay (bank)</th>
                            <th style={TH} rowSpan={2}>Where the heads differ (Genie vs sheet)</th>
                          </tr>
                          <tr>
                            {["Genie", "Sheet", "Genie", "Sheet", "Genie", "Sheet", "Genie", "Sheet", "Genie", "Sheet", "Diff", "Genie", "Sheet", "Diff"].map((h, i) => <th key={i} style={{ ...TH, textAlign: "right", fontWeight: 400, borderLeft: [0, 2, 4, 6, 8, 11].includes(i) ? "1px solid #D7DEE6" : undefined }}>{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {obs.pay.mismatches.filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()) || m.employee_id.includes(q)).map((m) => {
                            const off = (a: number | null, b: number | null, tol = 1) => a != null && b != null && Math.abs(a - b) >= tol;
                            const RED = { background: "#FBE3E0", color: "#8E2C20", fontWeight: 700 } as const;
                            const cell = (v: number | null, bad: boolean, days = false, left = false) => (
                              <td className="px-2 py-1 text-right tnum" style={{ ...(bad ? RED : {}), borderLeft: left ? "1px solid #EEECE6" : undefined }}>{v == null ? "—" : days ? Number(v).toLocaleString("en-IN", { maximumFractionDigits: 1 }) : `₹${inr(v)}`}</td>
                            );
                            const rateBad = off(m.genie_gross, m.sheet_gross), pdBad = off(m.genie_per_day, m.sheet_per_day, 2), attBad = off(m.genie_att, m.sheet_att, 0.5), paidBad = off(m.genie_paid, m.sheet_paid, 0.5), netBad = Math.abs(m.diff) >= 1, payBad = Math.abs(m.pay_diff) >= 1;
                            return (
                            <tr key={m.employee_id} style={{ borderTop: "1px solid #EEECE6" }}>
                              <td className="px-2 py-1"><b>{m.employee_id}</b> {m.name}</td>
                              <td className="px-2 py-1" style={{ color: C.faint }}>{m.type}</td>
                              {cell(m.genie_gross, rateBad, false, true)}{cell(m.sheet_gross, rateBad)}
                              {cell(m.genie_per_day, pdBad, false, true)}{cell(m.sheet_per_day, pdBad)}
                              {cell(m.genie_att, attBad, true, true)}{cell(m.sheet_att, attBad, true)}
                              {cell(m.genie_paid, paidBad, true, true)}{cell(m.sheet_paid, paidBad, true)}
                              {cell(m.genie_net, netBad, false, true)}{cell(m.sheet_net, netBad)}
                              <td className="px-2 py-1 text-right tnum font-bold" style={{ color: netBad ? (m.diff > 0 ? "#2A6B39" : "#8E2C20") : C.faint }}>{netBad ? `${m.diff > 0 ? "+" : ""}₹${inr(m.diff)}` : "same"}</td>
                              {cell(m.genie_pay, payBad, false, true)}{cell(m.sheet_pay, payBad)}
                              <td className="px-2 py-1 text-right tnum font-bold" style={{ color: payBad ? (m.pay_diff > 0 ? "#2A6B39" : "#8E2C20") : C.faint }}>{payBad ? `${m.pay_diff > 0 ? "+" : ""}₹${inr(m.pay_diff)}` : "same"}</td>
                              <td className="px-2 py-1" style={{ color: C.dim, whiteSpace: "normal", minWidth: 220 }}>{m.heads.length ? m.heads.map((h) => `${h.head} ${inr(h.genie)} vs ${inr(h.sheet)} (${h.diff > 0 ? "+" : ""}${inr(h.diff)})`).join(" · ") : netBad ? "same heads — the sheet's own net differs from its parts" : rateBad || attBad || paidBad ? "the rate or the attendance differs, the money happens to agree" : "net agrees — only the to-pay (bank) figure differs: a rounding or a hold the sheet treats differently"}</td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {obs.pay.not_in_sheet > 0 && <div className="text-xs mt-1" style={{ color: C.dim }}>{obs.pay.not_in_sheet} on the register with no line in the sheet.</div>}
                </>
              )}
            </div>
          )}
          {obs && !obs.ready && (
            <div className="rounded p-2 text-xs" style={{ background: "#FDF0E7", border: "1px solid #F0C9A8", color: "#8A4520" }}>{obs.why}</div>
          )}
          {obs?.ready && obs.totals && (
            <>
              {/* EVERY LINE IS A QUESTION, NOT A FINDING. A man with no punch
                  may have been on a customer's site all week — which is why
                  the site mark is set apart rather than counted against him. */}
              <div className="flex flex-wrap gap-2 my-2">
                {([
                  ["Paid present, nothing at the gate", obs.totals.paid_no_record, "#8E2C20"],
                  ["Marked absent, machine saw him", obs.totals.absent_but_punched, "#B26A00"],
                  ["Under four hours", obs.totals.short_days, "#B26A00"],
                  ["Explained by a site mark", obs.totals.site_days, "#2A6B39"],
                  ["Agreed", obs.totals.matched, "#2A6B39"],
                  ["Never on the machine all month", obs.totals.never_on_machine, "#5B6B7A"],
                  ["On the machine, not in the muster", obs.totals.not_in_muster, "#5B6B7A"],
                ] as [string, number, string][]).map(([label, n, col]) => (
                  <div key={label} className="rounded px-3 py-2" style={{ border: `1px solid ${C.line}`, minWidth: 150 }}>
                    <div className="tnum font-bold" style={{ fontSize: 20, color: col, lineHeight: 1.1 }}>{n.toLocaleString("en-IN")}</div>
                    <div style={{ fontSize: 11, color: C.dim }}>{label}</div>
                  </div>
                ))}
              </div>
              <div className="text-xs mb-2" style={{ color: C.dim }}>
                {obs.totals.punches.toLocaleString("en-IN")} punches read for {obs.totals.on_machine} people.
                <b> Nothing here is an accusation</b> — a day with no gate record is reported as exactly that,
                never as absence, because service and sales are out of the building by design.
              </div>
              <div style={{ maxHeight: "56vh", overflow: "auto" }}>
                <table className="w-full text-xs genie-table">
                  <thead><tr>
                    <th style={TH}>Employee</th><th style={TH}>Dept</th>
                    <th style={{ ...TH, textAlign: "right" }}>Paid present</th>
                    <th style={{ ...TH, textAlign: "right" }}>At the gate</th>
                    <th style={{ ...TH, textAlign: "right" }}>On site</th>
                    <th style={{ ...TH, textAlign: "right" }}>Unexplained</th>
                    <th style={TH}>What the days say</th>
                  </tr></thead>
                  <tbody>
                    {(obs.people ?? []).filter((p) => !q || `${p.name} ${p.employee_id} ${p.department}`.toLowerCase().includes(q.toLowerCase())).map((p) => (
                      <tr key={p.employee_id} className="border-t" style={{ borderColor: C.line }}>
                        <td className="px-2 py-1"><b>{p.name}</b> <span style={{ color: C.dim }}>{p.employee_id}</span></td>
                        <td className="px-2 py-1" style={{ color: C.dim }}>{p.department || "·"}</td>
                        <td className="px-2 py-1 text-right tnum">{p.paid_present}</td>
                        <td className="px-2 py-1 text-right tnum" style={{ color: p.never_on_machine ? "#5B6B7A" : undefined }}>
                          {p.never_on_machine ? "never" : p.seen_at_gate}
                        </td>
                        <td className="px-2 py-1 text-right tnum" style={{ color: C.dim }}>{p.site_days || "·"}</td>
                        <td className="px-2 py-1 text-right tnum font-bold" style={{ color: p.unexplained ? "#8E2C20" : "#2A6B39" }}>{p.unexplained || "·"}</td>
                        <td className="px-2 py-1" style={{ color: C.dim, maxWidth: 420 }}>
                          {p.flags.slice(0, 4).map((f, i) => (
                            <div key={i}>{f.day.slice(8)} <b>{f.mark}</b> — {f.what}{f.in ? ` (${f.in}→${f.out})` : ""}</div>
                          ))}
                          {p.flag_count > 4 && <div style={{ opacity: .7 }}>…and {p.flag_count - 4} more</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "comms" && (
        <>
          <div className="flex gap-2 mb-2 flex-wrap items-center text-xs">
            {Object.entries(d.counts).map(([k, v]) => <span key={k} className="rounded px-2 py-0.5 font-bold" style={{ background: "#F4F2EC", color: tone(k) }}>{k} {v}</span>)}
            <span style={{ flex: 1 }} />
            <button onClick={() => act({ action: "pull_replies" }, (j) => `Pulled ${j.pulled} repl${Number(j.pulled) === 1 ? "y" : "ies"} from ${j.checked} number${Number(j.checked) === 1 ? "" : "s"}${j.why ? ` — ${j.why}` : ""}`)} disabled={busy} className="font-semibold rounded border px-3 py-1.5 bg-white" style={{ borderColor: C.line, color: "var(--blue)" }}>⟳ Pull replies from WhatsApp</button>
          </div>
          <div className="bg-white rounded-lg border" style={{ borderColor: C.line }}>
            {!d.messages.length && <div className="p-3 text-xs" style={{ color: C.faint }}>Nothing sent from this run yet. Send WhatsApp message at the top builds the attendance message for everybody on the muster.</div>}
            {d.messages.filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()) || m.employee_id.includes(q)).map((m, i) => (
              <details key={m.id} className="px-3 py-2" style={{ borderTop: i ? "1px solid #EEECE6" : undefined }}>
                <summary className="text-xs flex gap-2 items-baseline flex-wrap" style={{ cursor: "pointer", listStyle: "none" }}>
                  <span className="rounded px-1.5 py-0.5 font-bold" style={{ background: m.direction === "in" ? "#E6F4EA" : "#F4F2EC", color: tone(m.status), fontSize: 10 }}>{m.direction === "in" ? "↩ reply" : m.status}</span>
                  <span className="font-semibold">{m.name}</span>
                  <span style={{ color: C.faint }}>{m.channel === "whatsapp" ? "💬" : "✉"} {m.to_address}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ color: C.faint }}>{fmtFull(String(m.sent_at))}</span>
                  {m.error && <span style={{ color: C.red }} title={m.error}>!</span>}
                </summary>
                <div className="mt-1" style={{ fontSize: 12, whiteSpace: "pre-wrap", lineHeight: 1.5, color: m.direction === "in" ? C.green : C.ink }}>{m.body}</div>
              </details>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** The rules Generate runs on, beside the numbers — "in the right side show the rules we are using" (Dr Raghu, 4 Sep 2026). */
/** THE RULES, TRACKED (Dr Raghu, 7 Oct 2026): a line changed since the rules were first given is yellow and says when */
function Rules({ runRulesAsOf }: { runRulesAsOf: string | null }) {
  const changed = PAYROLL_RULES.reduce((a, g) => a + g.lines.filter((l) => l.changed).length, 0);
  const stale = runRulesAsOf !== PAYROLL_RULES_AS_OF;
  return (
    <div className="bg-white rounded-lg border p-3" style={{ borderColor: C.line, flex: "0 0 300px", position: "sticky", top: 8, maxHeight: "calc(100vh - 120px)", overflowY: "auto" }}>
      <div className="text-xs font-bold mb-1" style={{ color: C.faint, letterSpacing: 0.5 }}>THE RULES WE ARE USING</div>
      <div className="text-xs mb-1" style={{ color: C.faint }}>What Generate does with the muster and the rate list. Given 4 Sep 2026; rules as of <b>{PAYROLL_RULES_AS_OF}</b>.</div>
      <div className="text-xs mb-2" style={{ color: C.dim }}><span style={{ background: "#FFF1A8", padding: "0 4px", borderRadius: 2 }}>yellow</span> = {changed} line{changed === 1 ? "" : "s"} changed from the rules given before, with the day.</div>
      {stale && (
        <div className="text-xs mb-2 rounded px-2 py-1" style={{ background: "#FDF0E7", border: "1px solid #F0C9A8", color: "#8A4520" }}>
          This register was generated under {runRulesAsOf ? `the rules of ${runRulesAsOf}` : "older rules"}. Press Generate again to apply the rules of {PAYROLL_RULES_AS_OF}.
        </div>
      )}
      {PAYROLL_RULES.map((g) => (
        <div key={g.head} className="mb-2">
          <div className="text-xs font-bold" style={{ color: "var(--navy)" }}>{g.head}</div>
          <ul style={{ paddingLeft: 14, margin: "2px 0" }}>
            {g.lines.map((l, i) => (
              <li key={i} className="text-xs" style={{ color: l.changed ? C.ink : C.dim, lineHeight: 1.5, marginBottom: 2, background: l.changed ? "#FFF1A8" : "transparent", borderRadius: 2, padding: l.changed ? "1px 3px" : 0 }}>
                {l.text}{l.changed && <span style={{ color: "#8A6D00", fontSize: 10, marginLeft: 4 }}>changed {l.changed}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Conveyance runs on the company's working days for the month — calendar
 * days less Sundays and the third Saturday — not on the individual's days
 * (Dr Raghu, 5 Sep 2026). HR sets it here when a statutory holiday takes a
 * day out; blank goes back to the default.
 */
function WorkingDays({ run, onSave }: { run: Run; onSave: (n: number | null) => void }) {
  const days = new Date(Date.UTC(run.year, run.month, 0)).getUTCDate();
  let sundays = 0, sats = 0, third = 0;
  for (let d = 1; d <= days; d++) { const w = new Date(Date.UTC(run.year, run.month - 1, d)).getUTCDay(); if (w === 0) sundays++; if (w === 6) { sats++; if (sats === 3) third = 1; } }
  const dflt = days - sundays - third;
  const [v, setV] = useState(run.working_days != null ? String(run.working_days) : "");
  const cur = run.working_days ?? dflt;
  return (
    <div className="text-xs">
      <div><b style={{ fontSize: 16 }}>{cur}</b> working days · conveyance = rate × present ÷ {cur}</div>
      <div style={{ color: "#8A8A8A" }}>Default {dflt}: {days} days less {sundays} Sundays and the third Saturday. Set it when a statutory holiday falls in the month; clear it to go back to the default.</div>
      <div className="flex gap-1 items-center mt-1">
        <input type="number" min={1} max={31} value={v} onChange={(e) => setV(e.target.value)} placeholder={String(dflt)} className="rounded px-2 py-1" style={{ border: "1px solid #E2E0DA", width: 70 }} />
        <button onClick={() => onSave(v.trim() ? Number(v) : null)} className="font-bold rounded px-2 py-1" style={{ background: "var(--blue)", color: "#fff" }}>Save</button>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border p-3" style={{ borderColor: C.line }}>
      <div className="text-xs font-bold mb-1" style={{ color: C.faint, letterSpacing: 0.5 }}>{title.toUpperCase()}</div>
      <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}
