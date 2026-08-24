"use client";
/**
 * Offer Letters — the register, and the six pages that build one.
 *
 * An offer carries its own copy of the role, the salary and the terms. If
 * the Roles register is edited next month, the letter already in somebody's
 * inbox does not change, and neither does our record of it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { TYPE_OPTIONS, splitMulti, joinMulti } from "@/lib/hrms";
import { type SalaryRow, type Components, SPLIT_DEFAULTS } from "@/lib/salary";
import { OFFER_STEPS, STATUS_TONE, OFFER_STATUS, DOC_KINDS, defaultJoining, iso, coveringLetter, titleCase, splitPhone } from "@/lib/offer";
import RichText, { RichTextView } from "./RichText";
import { Pane } from "./Pane";
import { C } from "./RecordFields";

const inr = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("en-IN"));
const day = (s: string | null) => (s ? fmtFull(String(s).slice(0, 10)) : "—");

interface Row {
  id: string; offer_no: string | null; name: string; email: string | null; mobile: string | null;
  designation: string | null; roles: string | null; reporting_to: string | null;
  offer_date: string | null; joining_date: string | null; type: string | null;
  agreed_gross: number | null; status: string; sent_at: string | null;
  accepted_at: string | null; joined_at: string | null; employee_id: string | null;
  created_by: string | null; updated_at: string | null;
}
interface Boot {
  roles: { id: string; role: string; department: string | null; job_description: string | null; deliverable: string | null; metric: string | null; summary: string | null; reports_to: string | null }[];
  competencies: { name: string; definition: string; category: string | null }[];
  roleCompetency: { role_id: string; competency: string; level: number }[];
  people: { id: string; name: string; designation: string | null }[];
  texts: Record<string, string>;
}
interface Offer extends Row {
  address: string | null; discussion_notes: string | null; probation_months: number | null;
  role_doc: { role?: string; purpose?: string; job_description?: string; deliverable?: string; metric?: string } | null;
  competencies: { name: string; level: number }[] | null;
  salary: { rows: SalaryRow[]; ctcLakhs: string; exempt: boolean; gross: number } | null;
  components: Components | null; basic_pct: number | null;
  terms: string | null; internal_notes: string | null;
  send_to: string | null; send_from: string | null; send_cc: string | null;
  covering_letter: string | null; valid_days: number | null;
  resume_name: string | null; resumeUrl?: string | null;
  resume_read: Record<string, string | null> | null;
  country_code: string | null;
  documents: OfferDoc[] | null;
}
interface OfferDoc {
  id: string; name: string; kind: string; path: string; size: number;
  mime: string | null; at: string; by: string | null; note: string | null; url?: string | null;
}

export default function Offers({ who, isOwner }: { who: string; isOwner: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [needs, setNeeds] = useState(false);
  const [msg, setMsg] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [boot, setBoot] = useState<Boot | null>(null);

  const load = useCallback(async () => {
    try { const j = await api.get("/api/hrms/offers"); setRows(j.offers || []); setNeeds(!!j.needsMigration); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/api/hrms/offers?bootstrap=1").then(setBoot).catch(() => {}); }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows || []) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);

  return (
    <Pane title="Offer Letters" who={who} print
      blurb="The letter that starts an employment: the person, the role, the money, the terms — built over six pages and kept exactly as it was sent.">
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>}
      {needs && <div className="rounded p-2 mb-2" style={{ background: "#FFF7E6", border: "1px solid #F5D9A8", fontSize: 12.5, color: "#8A5B00" }}>Run migrations 0067 and 0068 — offers have nowhere to live yet.</div>}

      <div className="flex gap-2 flex-wrap items-center mb-3">
        {OFFER_STATUS.filter((s) => counts[s]).map((s) => (
          <div key={s} className="bg-white rounded-lg border px-3 py-2" style={{ borderColor: C.line, minWidth: 92 }}>
            <div className="font-bold tnum" style={{ fontSize: 19, lineHeight: 1.15, color: STATUS_TONE[s].fg }}>{counts[s]}</div>
            <div style={{ fontSize: 11, color: C.faint }}>{s}</div>
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setMaking(true)} className="rounded px-3 py-2 font-bold no-print"
          style={{ background: C.green, color: "#fff", fontSize: 13 }}>+ New offer</button>
      </div>

      <div className="bg-white rounded-lg border" style={{ borderColor: C.line, overflowX: "auto" }}>
        <table className="w-full" style={{ fontSize: 12.5, borderCollapse: "collapse", minWidth: 960 }}>
          <thead><tr style={{ color: C.faint, fontSize: 10.5, background: "#F4F2EC" }}>
            {["Offer No", "Name", "Designation", "Reporting to", "Offer date", "Joining date", "Gross", "Status", "Where it stands"].map((h) => (
              <th key={h} className="text-left px-2 py-1.5" style={{ borderBottom: `1px solid ${C.line}` }}>{h}</th>))}
          </tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={9} className="px-2 py-6 text-center" style={{ color: C.faint }}>loading…</td></tr>}
            {rows !== null && !rows.length && (
              <tr><td colSpan={9} className="px-2 py-6 text-center" style={{ color: C.faint }}>No offer has been made yet. Press “New offer” and start with the resume.</td></tr>
            )}
            {(rows || []).map((r) => {
              const t = STATUS_TONE[r.status] || STATUS_TONE.Draft;
              return (
                <tr key={r.id} style={{ borderBottom: "1px solid #F2F0EA" }}>
                  <td className="px-2 py-1.5 mono" style={{ fontSize: 11.5 }}>
                    <button onClick={() => setOpenId(r.id)} className="font-semibold" style={{ color: "#1B3A5C", textDecoration: "underline", textUnderlineOffset: 2 }}>
                      {r.offer_no || "(new)"}
                    </button>
                  </td>
                  <td className="px-2 py-1.5 font-bold">
                    <button onClick={() => setOpenId(r.id)} className="text-left" style={{ color: "#1B3A5C" }}>{r.name || "(unnamed)"}</button>
                    {r.email && <div style={{ fontSize: 10.5, color: C.faint, fontWeight: 400 }}>{r.email}</div>}
                  </td>
                  <td className="px-2 py-1.5">{r.designation || "—"}</td>
                  <td className="px-2 py-1.5">{r.reporting_to || "—"}</td>
                  <td className="px-2 py-1.5">{day(r.offer_date)}</td>
                  <td className="px-2 py-1.5">{day(r.joining_date)}</td>
                  <td className="px-2 py-1.5 tnum">{r.agreed_gross ? `₹${inr(r.agreed_gross)}` : "—"}</td>
                  <td className="px-2 py-1.5">
                    <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: t.bg, color: t.fg }}>{r.status}</span>
                  </td>
                  <td className="px-2 py-1.5" style={{ fontSize: 11, color: C.faint }}>
                    {r.joined_at ? `joined ${day(r.joined_at)}${r.employee_id ? ` · ${r.employee_id}` : ""}`
                      : r.accepted_at ? `accepted ${day(r.accepted_at)}`
                      : r.sent_at ? `sent ${day(r.sent_at)}` : `drafted by ${String(r.created_by || "").split("·")[0].trim()}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {making && <NewOffer boot={boot} onClose={() => setMaking(false)} onMade={(id) => { setMaking(false); load(); setOpenId(id); }} />}
      {openId && <OfferBuilder id={openId} boot={boot} isOwner={isOwner} onClose={() => { setOpenId(null); load(); }} />}
    </Pane>
  );
}

/* ══════════ starting one: the resume comes first ══════════ */
function NewOffer({ boot, onClose, onMade }: { boot: Boot | null; onClose: () => void; onMade: (id: string) => void }) {
  const [f, setF] = useState({ name: "", email: "", mobile: "", address: "", country_code: "+91" });
  const [resume, setResume] = useState<{ path: string; filename: string; read: Record<string, string | null> | null; doc?: Record<string, unknown> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setErr("Choose the resume first."); return; }
    setBusy(true); setErr(""); setNote("");
    try {
      const fd = new FormData(); fd.append("file", file);
      const r = await fetch("/api/hrms/offers", { method: "POST", body: fd });
      const text = await r.text();
      let j: Record<string, unknown> = {};
      try { j = JSON.parse(text); } catch { throw new Error(`The server replied ${r.status} and not JSON — the file may be too large.`); }
      if (!r.ok) throw new Error(String(j.error || `Upload failed (${r.status})`));
      const read = (j.read || null) as Record<string, string | null> | null;
      setResume({ path: String(j.path), filename: String(j.filename), read, doc: j.doc as Record<string, unknown> });
      if (read) {
        setF((x) => ({
          ...x,
          name: read.name || x.name, email: read.email || x.email,
          mobile: read.mobile || x.mobile, address: read.address || x.address,
        }));
        setNote(`Read from the resume${read.current_employer ? ` · currently at ${read.current_employer}` : ""}. Check every line before you send anything.`);
      } else setNote(`The resume is stored, but nothing could be read from it${j.why ? ` — ${j.why}` : ""}. Type the details in.`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const create = async () => {
    if (!f.name.trim()) { setErr("A name at least."); return; }
    setBusy(true); setErr("");
    try {
      const j = await api.post("/api/hrms/offers", {
        action: "create", ...f, name: titleCase(f.name), mobile: splitPhone(f.mobile).number,
        resume_name: resume?.filename ?? null, resume_path: resume?.path ?? null, resume_read: resume?.read ?? null,
        documents: resume?.doc ? [resume.doc] : [],
        offer_date: iso(), joining_date: defaultJoining(),
        terms: boot?.texts?.terms_of_engagement || "",
        covering_letter: coveringLetter(boot?.texts?.offer_covering_letter || "", f.name),
      });
      onMade(String(j.id));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };

  return (
    <Modal title="New offer" sub="Start with the resume — the details are read out of it and can be corrected." onClose={onClose} width={640}>
      <div className="rounded-lg border p-3 mb-3" style={{ borderColor: C.line, background: "#FBFAF7" }}>
        <div className="font-bold mb-1" style={{ fontSize: 13 }}>The resume</div>
        <div className="flex gap-2 items-center flex-wrap">
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" style={{ fontSize: 12, maxWidth: 280 }} />
          <button onClick={upload} disabled={busy} className="rounded px-3 py-1.5 font-bold" style={{ background: "#1B3A5C", color: "#fff", fontSize: 12.5 }}>
            {busy ? "Reading…" : "Upload and read"}
          </button>
        </div>
        {note && <div className="mt-2" style={{ fontSize: 12, color: resume?.read ? "#0D7A3F" : "#8A5B00" }}>{note}</div>}
      </div>

      <label className="block mb-2" style={{ fontSize: 11.5, color: C.faint }}>Name
        <input value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))}
          onBlur={() => setF((x) => ({ ...x, name: titleCase(x.name) }))}
          className="w-full rounded px-2 py-1.5 block" style={{ border: `1px solid ${C.line}`, fontSize: 13.5, color: C.ink }} />
      </label>
      <label className="block mb-2" style={{ fontSize: 11.5, color: C.faint }}>Email
        <input value={f.email} onChange={(e) => setF((x) => ({ ...x, email: e.target.value }))}
          className="w-full rounded px-2 py-1.5 block" style={{ border: `1px solid ${C.line}`, fontSize: 13.5, color: C.ink }} />
      </label>
      <div className="mb-2" style={{ fontSize: 11.5, color: C.faint }}>Mobile
        <div className="flex gap-1.5">
          <input value={f.country_code} onChange={(e) => setF((x) => ({ ...x, country_code: e.target.value }))}
            className="rounded px-2 py-1.5 tnum text-center" style={{ border: `1px solid ${C.line}`, fontSize: 13.5, color: C.ink, width: 62 }} />
          <input value={f.mobile} inputMode="numeric"
            onChange={(e) => setF((x) => ({ ...x, mobile: e.target.value.replace(/[^0-9]/g, "") }))}
            onBlur={() => setF((x) => ({ ...x, mobile: splitPhone(x.mobile).number }))}
            className="rounded px-2 py-1.5 tnum" style={{ border: `1px solid ${C.line}`, fontSize: 13.5, color: C.ink, flex: 1 }} />
        </div>
        {f.mobile && f.mobile.length !== 10 && (
          <div style={{ color: "#8A5B00", marginTop: 2 }}>{f.mobile.length} digits — an Indian mobile is ten.</div>
        )}
      </div>
      <label className="block mb-2" style={{ fontSize: 11.5, color: C.faint }}>Address
        <textarea value={f.address} rows={2} onChange={(e) => setF((x) => ({ ...x, address: e.target.value }))}
          className="w-full rounded px-2 py-1.5 block" style={{ border: `1px solid ${C.line}`, fontSize: 13.5, color: C.ink }} />
      </label>

      {err && <div className="text-xs font-semibold mb-2" style={{ color: C.red }}>{err}</div>}
      <button onClick={create} disabled={busy} className="rounded px-4 py-2 font-bold" style={{ background: C.green, color: "#fff", fontSize: 13.5 }}>
        {busy ? "…" : "Create the offer →"}
      </button>
    </Modal>
  );
}

/* ══════════ the six pages ══════════ */
function OfferBuilder({ id, boot, isOwner, onClose }: { id: string; boot: Boot | null; isOwner: boolean; onClose: () => void }) {
  const [d, setD] = useState<Offer | null>(null);
  const [step, setStep] = useState(0);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const j = await api.get(`/api/hrms/offers?id=${encodeURIComponent(id)}`); setD(j.offer); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (patch: Record<string, unknown>) => {
    setD((x) => (x ? { ...x, ...(patch as Partial<Offer>) } : x));
    try { await api.post("/api/hrms/offers", { action: "save", id, patch }); setMsg(""); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  }, [id]);

  const setStatus = async (status: string, employee_id?: string) => {
    setBusy(true);
    try { await api.post("/api/hrms/offers", { action: "status", id, status, employee_id }); await load(); setMsg(`Marked ${status.toLowerCase()} ✓`); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  if (!d) return <Modal title="Offer" onClose={onClose} width={980}><div className="py-8 text-center" style={{ color: C.faint }}>{msg || "loading…"}</div></Modal>;

  const tone = STATUS_TONE[d.status] || STATUS_TONE.Draft;
  const locked = d.status !== "Draft" && !isOwner;

  return (
    <Modal
      title={d.name || "Offer"}
      sub={`${d.offer_no || ""}${d.designation || d.role_doc?.role ? ` · ${d.designation || d.role_doc?.role}` : ""}`}
      chip={<span className="rounded px-2 py-0.5 font-bold" style={{ fontSize: 10.5, background: tone.bg, color: tone.fg }}>{d.status}</span>}
      onClose={onClose} width={980}
    >
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>}
      {locked && <div className="rounded p-2 mb-2 no-print" style={{ background: "#FFF7E6", border: "1px solid #F5D9A8", fontSize: 12, color: "#8A5B00" }}>
        This offer has been {d.status.toLowerCase()} — it is a document the candidate holds. Only Dr Raghu can change it now.
      </div>}

      <div className="flex gap-1 flex-wrap mb-3 no-print">
        {OFFER_STEPS.map((s, i) => (
          <button key={s.key} onClick={() => setStep(i)} className="rounded px-2.5 py-1.5 font-bold"
            style={{ fontSize: 11.5, background: step === i ? C.orange : "#fff", color: step === i ? "#fff" : C.dim, border: `1px solid ${step === i ? C.orange : C.line}` }}>
            {i + 1}. {s.label}
          </button>
        ))}
      </div>

      <div style={{ minHeight: 320 }}>
        {step === 0 && <PagePerson d={d} boot={boot} save={save} locked={locked} />}
        {step === 1 && <PageRole d={d} boot={boot} save={save} locked={locked} />}
        {step === 2 && <PageSalary d={d} save={save} locked={locked} />}
        {step === 3 && <PageTerms d={d} boot={boot} save={save} locked={locked} />}
        {step === 4 && <PageNotes d={d} save={save} locked={locked} />}
        {step === 5 && <PageReview d={d} save={save} setStatus={setStatus} busy={busy} isOwner={isOwner} />}
        {step === 6 && <PageDocuments d={d} reload={load} locked={locked} />}
      </div>

      <div className="flex gap-2 items-center mt-4 no-print" style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
        <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}
          className="rounded px-3 py-1.5 font-bold" style={{ background: "#fff", color: step === 0 ? "#C9C6BD" : C.dim, border: `1px solid ${C.line}`, fontSize: 12.5 }}>← Back</button>
        <button onClick={() => setStep((s) => Math.min(OFFER_STEPS.length - 1, s + 1))} disabled={step === OFFER_STEPS.length - 1}
          className="rounded px-3 py-1.5 font-bold" style={{ background: step === OFFER_STEPS.length - 1 ? "#E2E0DA" : "#1B3A5C", color: step === OFFER_STEPS.length - 1 ? "#8A94A0" : "#fff", fontSize: 12.5 }}>Next →</button>
        <span style={{ fontSize: 11.5, color: C.faint }}>{OFFER_STEPS[step].hint} · saved as you type</span>
      </div>
    </Modal>
  );
}

/* ── page 1 ── */
function PagePerson({ d, boot, save, locked }: { d: Offer; boot: Boot | null; save: (p: Record<string, unknown>) => void; locked: boolean }) {
  const roles = splitMulti(d.roles || "");
  const toggleRole = (r: string) => {
    const next = roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r];
    save({ roles: joinMulti(next) });
  };
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
      <Card title="The person">
        <F label="Name" v={d.name} onSave={(v) => save({ name: v })} locked={locked} />
        <F label="Email" v={d.email} onSave={(v) => save({ email: v, send_to: v })} locked={locked} />
        <div className="mb-2" style={{ fontSize: 11.5, color: C.faint }}>Mobile
          <div className="flex gap-1.5">
            <input value={d.country_code || "+91"} disabled={locked}
              onChange={(e) => save({ country_code: e.target.value })}
              className="rounded px-2 py-1.5 tnum text-center" style={{ border: `1px solid ${C.line}`, fontSize: 13.5, color: C.ink, width: 62, background: locked ? "#F7F6F2" : "#fff" }} />
            <div style={{ flex: 1 }}><F label="" v={d.mobile} onSave={(v) => save({ mobile: v })} locked={locked} /></div>
          </div>
        </div>
        <F label="Address" v={d.address} onSave={(v) => save({ address: v })} locked={locked} area />
        {d.resume_name && (
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 6 }}>
            Resume: {d.resumeUrl
              ? <a href={d.resumeUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1B3A5C", textDecoration: "underline" }}>{d.resume_name}</a>
              : d.resume_name}
            {d.resume_read && <span> · read automatically, corrected by hand where needed</span>}
          </div>
        )}
      </Card>

      <Card title="The offer">
        <F label="Designation (as it will read)" v={d.designation} onSave={(v) => save({ designation: v })} locked={locked} />
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 8 }}>Roles — one or more from the register</div>
        <div className="flex gap-1 flex-wrap mt-1">
          {(boot?.roles || []).map((r) => (
            <button key={r.id} disabled={locked} onClick={() => toggleRole(r.role)}
              className="rounded px-1.5 py-0.5 font-semibold"
              style={{ fontSize: 11, border: `1px solid ${roles.includes(r.role) ? C.green : C.line}`, background: roles.includes(r.role) ? "#E6F4EA" : "#fff", color: roles.includes(r.role) ? "#0D7A3F" : C.dim }}>
              {roles.includes(r.role) ? "✓ " : ""}{r.role}
            </button>
          ))}
        </div>
        <label className="block mt-2" style={{ fontSize: 11.5, color: C.faint }}>Reporting to
          <select value={d.reporting_to || ""} disabled={locked} onChange={(e) => save({ reporting_to: e.target.value })}
            className="w-full rounded px-2 py-1.5 block bg-white" style={{ border: `1px solid ${C.line}`, fontSize: 13.5, color: C.ink }}>
            <option value="">— choose —</option>
            {(boot?.people || []).map((p) => <option key={p.id} value={`${p.name}${p.designation ? `, ${p.designation}` : ""}`}>{p.name}{p.designation ? `, ${p.designation}` : ""}</option>)}
          </select>
        </label>
        <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <F label="Offer date" v={d.offer_date} onSave={(v) => save({ offer_date: v })} locked={locked} type="date" />
          <F label="Joining date" v={d.joining_date} onSave={(v) => save({ joining_date: v })} locked={locked} type="date" />
        </div>
        <F label="Probation (months)" v={d.probation_months == null ? "" : String(d.probation_months)} onSave={(v) => save({ probation_months: v })} locked={locked} />
      </Card>

      <Card title="Discussion notes" note="From the ATS, or whatever was said in the interview.">
        <F label="" v={d.discussion_notes} onSave={(v) => save({ discussion_notes: v })} locked={locked} area rows={7} />
      </Card>
    </div>
  );
}

/* ── page 2 ── */
function PageRole({ d, boot, save, locked }: { d: Offer; boot: Boot | null; save: (p: Record<string, unknown>) => void; locked: boolean }) {
  const rd = d.role_doc || {};
  const comps = d.competencies || [];
  const chosenRoles = splitMulti(d.roles || "");

  const pullFromRegister = useCallback(() => {
    const src = (boot?.roles || []).filter((r) => chosenRoles.includes(r.role));
    if (!src.length) return;
    save({
      role_doc: {
        role: src.map((s) => s.role).join(" · "),
        purpose: src.map((s) => s.summary || "").filter(Boolean).join(""),
        job_description: src.map((s) => s.job_description || "").filter(Boolean).join(""),
        deliverable: src.map((s) => s.deliverable || "").filter(Boolean).join(""),
        metric: src.map((s) => s.metric || "").filter(Boolean).join(""),
      },
    });
    const ids = src.map((s) => s.id);
    const mapped = (boot?.roleCompetency || []).filter((rc) => ids.includes(rc.role_id));
    if (mapped.length) save({ competencies: mapped.map((m) => ({ name: m.competency, level: m.level })) });
  }, [boot, chosenRoles, save]);

  /**
   * The roles were chosen on page 1, so this page should already be filled in
   * when it is opened — pressing a button to fetch what was already decided
   * is a step that exists only because the code was written that way. It
   * pulls ONCE, when there is nothing here yet; after that the offer's own
   * copy is left alone, because it may have been edited on purpose.
   */
  const pulled = useRef(false);
  useEffect(() => {
    if (pulled.current) return;
    if (!boot || !chosenRoles.length) return;
    const empty = !rd.role && !rd.job_description && !rd.deliverable && !rd.metric;
    if (!empty) { pulled.current = true; return; }
    pulled.current = true;
    pullFromRegister();
  }, [boot, chosenRoles, rd, pullFromRegister]);

  const setComp = (name: string, level: number | null) => {
    const next = level == null ? comps.filter((c) => c.name !== name)
      : comps.some((c) => c.name === name) ? comps.map((c) => (c.name === name ? { ...c, level } : c))
      : [...comps, { name, level }];
    save({ competencies: next });
  };

  return (
    <>
      <div className="flex items-center gap-2 mb-2 flex-wrap no-print">
        <button onClick={pullFromRegister} disabled={locked || !chosenRoles.length}
          className="rounded px-3 py-1.5 font-bold" style={{ background: chosenRoles.length ? "#1B3A5C" : "#E2E0DA", color: chosenRoles.length ? "#fff" : "#8A94A0", fontSize: 12 }}>
          ↻ Re-pull {chosenRoles.length ? chosenRoles.join(" + ") : "the role"} from the register
        </button>
        <span style={{ fontSize: 11.5, color: C.faint }}>
          {chosenRoles.length
            ? "Filled from the roles chosen on page 1. Edit freely — this offer keeps its own copy; re-pulling overwrites your edits."
            : "Choose one or more roles on page 1 and this page fills itself."}
        </span>
      </div>

      <Card title="Role" >
        <F label="Role title on the letter" v={rd.role} onSave={(v) => save({ role_doc: { ...rd, role: v } })} locked={locked} />
      </Card>
      {([["purpose", "Purpose of the role"], ["job_description", "Job description"], ["deliverable", "Deliverables (KRA)"], ["metric", "Measurement metric (KPI)"]] as const).map(([k, label]) => (
        <Card key={k} title={label}>
          {locked ? <RichTextView html={rd[k] || ""} />
            : <RichText value={rd[k] || ""} rows={5} onSave={(html) => save({ role_doc: { ...rd, [k]: html } })} placeholder={`${label}…`} />}
        </Card>
      ))}

      <Card title="Competency mapping" note="The level this role needs, out of 5.">
        <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
          {(boot?.competencies || []).map((c) => {
            const hit = comps.find((x) => x.name === c.name);
            return (
              <div key={c.name} className="flex items-center gap-2 py-0.5" style={{ fontSize: 12.5 }}>
                <span style={{ flex: 1, color: hit ? C.ink : C.faint }} title={c.definition}>{c.name}</span>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} disabled={locked} onClick={() => setComp(c.name, hit?.level === n ? null : n)}
                    className="rounded font-bold" style={{
                      width: 20, height: 20, fontSize: 10.5,
                      border: `1px solid ${hit && hit.level >= n ? C.orange : C.line}`,
                      background: hit && hit.level >= n ? C.orange : "#fff",
                      color: hit && hit.level >= n ? "#fff" : "#C9C6BD",
                    }}>{n}</button>
                ))}
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}

/* ── page 3 ── */
const COMP_ROWS: [keyof Components, string][] = [
  ["basic_da", "Basic & DA"], ["hra", "HRA"], ["fixed_allowance", "Fixed Allowance"],
  ["conveyance", "Conveyance"], ["medical_allowance", "Medical Allowance"],
];

function PageSalary({ d, save, locked }: { d: Offer; save: (p: Record<string, unknown>) => void; locked: boolean }) {
  const [gross, setGross] = useState(d.agreed_gross == null ? "" : String(Math.round(d.agreed_gross)));
  const [pct, setPct] = useState(d.basic_pct == null ? String(SPLIT_DEFAULTS.basicPct) : String(d.basic_pct));
  const [type, setType] = useState(d.type || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  /** components: undefined asks the server to derive them from gross and %. */
  const compute = useCallback(async (g: string, t: string, p: string, components?: Partial<Components>) => {
    if (!Number(g) || !t) return;
    setBusy(true); setErr("");
    try {
      const j = await api.post("/api/hrms/offers", {
        action: "salary", id: d.id, agreed_gross: g, type: t, basic_pct: p, components,
      });
      setPct(String(j.basic_pct));
      save({ agreed_gross: Number(g), type: t, basic_pct: Number(j.basic_pct), salary: j.salary, components: j.components });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }, [d.id, save]);

  const comps = d.components;
  const sum = comps ? COMP_ROWS.reduce((a, [k]) => a + (Number(comps[k]) || 0), 0) : 0;
  const drift = comps && Number(gross) ? sum - Number(gross) : 0;

  return (
    <>
      <div className="rounded-lg border p-3 mb-3" style={{ borderColor: C.green, background: "#F2FAF4" }}>
        <div className="flex gap-3 items-end flex-wrap">
          <label style={{ fontSize: 12, color: C.dim, fontWeight: 600 }}>Agreed Gross (per month)
            <input value={gross} inputMode="numeric" disabled={locked}
              onChange={(e) => setGross(e.target.value.replace(/[^0-9]/g, ""))}
              onBlur={() => compute(gross, type, pct)}
              className="rounded px-2 py-2 block tnum" style={{ border: `2px solid ${C.green}`, color: C.green, fontWeight: 700, fontSize: 17, width: 150 }} />
          </label>
          <label style={{ fontSize: 12, color: C.dim, fontWeight: 600 }}>Basic as % of gross
            <input value={pct} inputMode="decimal" disabled={locked}
              onChange={(e) => setPct(e.target.value.replace(/[^0-9.]/g, ""))}
              onBlur={() => compute(gross, type, pct)}
              className="rounded px-2 py-2 block tnum" style={{ border: `2px solid ${C.green}`, color: C.green, fontWeight: 700, fontSize: 17, width: 90 }} />
          </label>
          <label style={{ fontSize: 12, color: C.dim, fontWeight: 600 }}>Type
            <select value={type} disabled={locked} onChange={(e) => { setType(e.target.value); compute(gross, e.target.value, pct); }}
              className="rounded px-2 py-2 block bg-white" style={{ border: `1px solid ${C.line}`, fontSize: 14, color: C.ink }}>
              <option value="">— choose —</option>
              {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          {d.salary && <div><div className="font-bold" style={{ fontSize: 20, color: C.orange }}>Rs {d.salary.ctcLakhs} L</div><div style={{ fontSize: 11, color: C.faint }}>annual CTC</div></div>}
          {busy && <span style={{ fontSize: 12, color: C.faint }}>computing…</span>}
        </div>
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 6 }}>
          Those two drive everything: HRA comes out at {SPLIT_DEFAULTS.hraOfBasic}% of basic, Conveyance at ₹{SPLIT_DEFAULTS.conveyance.toLocaleString("en-IN")},
          Medical at ₹{SPLIT_DEFAULTS.medical.toLocaleString("en-IN")}, and Fixed Allowance takes the balance.
          Any line can still be typed over below — Fixed absorbs the difference so the five always sum to the agreed gross.
          The type decides the rest: HRA, PF and PT drop for Management and the contract types, and benefits drop for Management.
        </div>
        {err && <div className="text-xs font-semibold mt-1" style={{ color: C.red }}>{err}</div>}
      </div>

      {comps && (
        <Card title="The split" note="Type over any line to change it by hand.">
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
            {COMP_ROWS.map(([k, label]) => (
              <CompBox key={k} label={label} value={Number(comps[k]) || 0} locked={locked}
                onSave={(v) => compute(gross, type, pct, { [k]: v } as Partial<Components>)} />
            ))}
          </div>
          <div className="mt-2 flex gap-3 items-baseline flex-wrap" style={{ fontSize: 12.5 }}>
            <span>Components total: <b className="tnum">₹{inr(sum)}</b></span>
            <span style={{ color: C.faint }}>Agreed gross: <b className="tnum">₹{inr(Number(gross))}</b></span>
            {drift !== 0
              ? <b style={{ color: C.red }}>Off by ₹{inr(Math.abs(drift))} — retype a line and Fixed will absorb it</b>
              : <b style={{ color: C.green }}>✓ balanced</b>}
            <button onClick={() => compute(gross, type, pct)} disabled={locked || busy}
              className="rounded px-2.5 py-1 font-bold no-print" style={{ background: "#fff", color: C.dim, border: `1px solid ${C.line}`, fontSize: 11.5 }}>
              ↺ Back to {pct}% of gross
            </button>
          </div>
        </Card>
      )}

      {d.salary
        ? <SalaryTable rows={d.salary.rows} ctc={d.salary.ctcLakhs} />
        : <div className="text-sm py-6 text-center" style={{ color: C.faint }}>Put in the agreed gross and choose the type — the structure builds itself.</div>}
    </>
  );
}

function CompBox({ label, value, locked, onSave }: { label: string; value: number; locked: boolean; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => { setV(String(value)); }, [value]);
  return (
    <label style={{ fontSize: 11.5, color: C.faint }}>
      {label}
      <input value={v} inputMode="numeric" disabled={locked}
        onChange={(e) => setV(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={() => { if (Number(v) !== value) onSave(Number(v) || 0); }}
        className="w-full rounded px-2 py-1.5 block tnum text-right"
        style={{ border: `1px solid ${C.line}`, fontSize: 14, fontWeight: 600, color: C.ink, background: locked ? "#F7F6F2" : "#fff" }} />
    </label>
  );
}

function SalaryTable({ rows, ctc }: { rows: SalaryRow[]; ctc: string }) {
  return (
    <div>
      <table style={{ fontSize: 12.5, width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
        <thead><tr>
          <th className="text-left px-1.5 py-1" style={{ border: `1px solid ${C.line}`, width: "48%" }}>Components of Compensation</th>
          <th className="text-right px-1.5 py-1" style={{ border: `1px solid ${C.line}`, width: "24%" }}>Monthly (Rs.)</th>
          <th className="text-right px-1.5 py-1" style={{ border: `1px solid ${C.line}`, width: "28%" }}>Yearly (Rs.)</th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: r.kind === "head" || r.kind === "total" ? "#FFF9C4" : "#fff", fontWeight: r.kind !== "row" && r.kind !== "note" ? 700 : 400 }}>
              {r.kind === "note"
                ? <td colSpan={3} className="px-1.5 py-1" style={{ border: `1px solid ${C.line}`, fontSize: 11.5, color: C.dim }}>{r.label}</td>
                : <>
                    <td className="px-1.5 py-1" style={{ border: `1px solid ${C.line}` }}>{r.label}</td>
                    <td className="px-1.5 py-1 text-right tnum" style={{ border: `1px solid ${C.line}` }}>{inr(r.monthly)}</td>
                    <td className="px-1.5 py-1 text-right tnum" style={{ border: `1px solid ${C.line}` }}>{inr(r.yearly)}</td>
                  </>}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1 font-bold" style={{ fontSize: 14 }}>CTC ≈ <span style={{ color: C.orange }}>Rs {ctc} Lakhs</span> per annum</div>
    </div>
  );
}

/* ── page 4 ── */
function PageTerms({ d, boot, save, locked }: { d: Offer; boot: Boot | null; save: (p: Record<string, unknown>) => void; locked: boolean }) {
  return (
    <Card title="Terms of engagement" note="Comes from Masters → Standard Texts. Edit here and only THIS offer changes.">
      <div className="flex gap-2 mb-2 no-print">
        <button disabled={locked || !boot?.texts?.terms_of_engagement} onClick={() => save({ terms: boot?.texts?.terms_of_engagement || "" })}
          className="rounded px-2.5 py-1 font-bold" style={{ background: "#fff", color: C.dim, border: `1px solid ${C.line}`, fontSize: 11.5 }}>
          ↺ Reset to the master text
        </button>
      </div>
      {locked ? <RichTextView html={d.terms || ""} />
        : <RichText value={d.terms || ""} rows={16} onSave={(html) => save({ terms: html })} placeholder="The terms of employment…" />}
    </Card>
  );
}

/* ── page 5 ── */
function PageNotes({ d, save, locked }: { d: Offer; save: (p: Record<string, unknown>) => void; locked: boolean }) {
  return (
    <Card title="Internal notes" note="Ours alone. Never printed on the letter and never sent.">
      {locked ? <RichTextView html={d.internal_notes || ""} />
        : <RichText value={d.internal_notes || ""} rows={12} onSave={(html) => save({ internal_notes: html })} placeholder="What we think, what was negotiated, what to watch…" />}
    </Card>
  );
}

/* ── page 6 ── */
function PageReview({ d, save, setStatus, busy, isOwner }: { d: Offer; save: (p: Record<string, unknown>) => void; setStatus: (s: string, empId?: string) => void; busy: boolean; isOwner: boolean }) {
  const [empId, setEmpId] = useState(d.employee_id || "");
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState("");
  const to = d.send_to || d.email || "";
  const cc = d.send_cc || "raghu@nandan.co.in";
  const from = d.send_from || "hr@nandan.co.in";
  const subject = `Offer of Employment — ${d.name}${d.designation ? ` · ${d.designation}` : ""} — Nandan GSE`;
  const body = d.covering_letter || "";

  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&cc=${encodeURIComponent(cc)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <>
      <Card title="The letter" note="What prints. Use the browser's print to make the PDF that goes out.">
        <LetterPreview d={d} />
      </Card>

      <Card title="The mail">
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
          <F label="Send to" v={to} onSave={(v) => save({ send_to: v })} locked={false} />
          <F label="Send from" v={from} onSave={(v) => save({ send_from: v })} locked={false} />
          <F label="CC" v={cc} onSave={(v) => save({ send_cc: v })} locked={false} />
        </div>
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 8 }}>Covering letter</div>
        <textarea value={body} rows={13} onChange={(e) => save({ covering_letter: e.target.value })}
          className="w-full rounded px-2 py-1.5" style={{ border: `1px solid ${C.line}`, fontSize: 13, lineHeight: 1.6 }} />

        <div className="flex gap-2 mt-3 flex-wrap items-center no-print">
          <button
            onClick={async () => {
              if (!window.confirm(`Send this offer to ${to}, copying ${cc}?`)) return;
              setSending(true); setSendMsg("");
              try {
                await api.post("/api/hrms/offers", { action: "send", id: d.id, send_to: to, send_from: from, send_cc: cc, covering_letter: body });
                setSendMsg("Sent ✓"); setStatus("Sent");
              } catch (e) { setSendMsg(e instanceof Error ? e.message : String(e)); }
              setSending(false);
            }}
            disabled={sending || !to || d.status !== "Draft"}
            className="rounded px-3 py-1.5 font-bold"
            style={{ background: d.status === "Draft" && to ? C.green : "#E2E0DA", color: d.status === "Draft" && to ? "#fff" : "#8A94A0", fontSize: 12.5 }}>
            {sending ? "Sending…" : "✉ Send it now"}
          </button>
          <a href={`/hrms/offer/${d.id}/print`} target="_blank" rel="noopener noreferrer"
            className="rounded px-3 py-1.5 font-bold" style={{ background: "#1B3A5C", color: "#fff", fontSize: 12.5 }}>
            📄 Open the PDF — logo, DRAFT watermark, page numbers
          </a>
          <a href={gmail} target="_blank" rel="noopener noreferrer" className="rounded px-3 py-1.5 font-bold" style={{ background: "#fff", color: C.dim, border: `1px solid ${C.line}`, fontSize: 12.5 }}>✉ Open a Gmail draft instead</a>
        </div>
        {sendMsg && <div className="text-xs font-semibold mt-2" style={{ color: sendMsg.includes("✓") ? C.green : C.red }}>{sendMsg}</div>}
        <div className="rounded p-2 mt-2" style={{ background: "#F4F2EC", fontSize: 11.5, color: C.dim, lineHeight: 1.6 }}>
          “Send it now” goes out from <b>{from}</b> through Resend, with the covering note and the full letter in the body.
          It needs RESEND_API_KEY set in Vercel — until then it refuses plainly and the Gmail draft is the way.
          Sending from each person&apos;s own connected mailbox is a later, larger piece of work.
        </div>
      </Card>

      <Card title="Where it stands" note="Draft → Sent → Accepted → Joined. On joining it becomes the appointment letter.">
        <div className="flex gap-2 flex-wrap items-center no-print">
          {d.status === "Draft" && <B onClick={() => setStatus("Sent")} busy={busy} bg="#1B3A5C">Mark as Sent</B>}
          {d.status === "Sent" && <>
            <B onClick={() => setStatus("Accepted")} busy={busy} bg={C.green}>Accepted</B>
            <B onClick={() => setStatus("Declined")} busy={busy} bg="#fff" fg={C.red} border>Declined</B>
          </>}
          {d.status === "Accepted" && (
            <>
              <input value={empId} onChange={(e) => setEmpId(e.target.value.replace(/[^0-9]/g, ""))} placeholder="EmployeeID"
                className="rounded px-2 py-1.5 tnum" style={{ border: `1px solid ${C.line}`, width: 120, fontSize: 13 }} />
              <B onClick={() => setStatus("Joined", empId)} busy={busy || !empId} bg={C.green}>Joined — make it the appointment letter</B>
            </>
          )}
          {d.status === "Joined" && <span style={{ fontSize: 13, color: C.green, fontWeight: 700 }}>✓ Joined {day(d.joined_at)}{d.employee_id ? ` as ${d.employee_id}` : ""}</span>}
          {isOwner && d.status !== "Draft" && d.status !== "Joined" && <B onClick={() => setStatus("Draft")} busy={busy} bg="#fff" fg="#8A5B00" border>Back to draft</B>}
        </div>
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 8 }}>
          Valid for {d.valid_days || 3} days from sending, as the covering letter says.
        </div>
      </Card>
    </>
  );
}

/* ── page 7 ── */
const KIND_TONE: Record<string, string> = {
  "Resume": "#1B3A5C", "Interview notes": "#8A5B00", "Offer letter": "#0D7A3F",
  "Appointment letter": "#0D7A3F", "Acceptance": "#5B3FA8", "ID proof": "#46545F",
  "Certificate": "#46545F", "Other": "#8B8F87",
};
const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function PageDocuments({ d, reload, locked }: { d: Offer; reload: () => void; locked: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [kind, setKind] = useState<string>("Interview notes");
  const fileRef = useRef<HTMLInputElement>(null);
  const docs = d.documents || [];

  const upload = async () => {
    const files = Array.from(fileRef.current?.files || []);
    if (!files.length) { setErr("Choose one or more files."); return; }
    setBusy(true); setErr("");
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file); fd.append("id", d.id); fd.append("kind", kind);
        const r = await fetch("/api/hrms/offers", { method: "POST", body: fd });
        const t = await r.text();
        let j: Record<string, unknown> = {};
        try { j = JSON.parse(t); } catch { throw new Error(`${file.name}: the server replied ${r.status} and not JSON — it may be too large.`); }
        if (!r.ok) throw new Error(`${file.name}: ${String(j.error || r.status)}`);
      }
      if (fileRef.current) fileRef.current.value = "";
      reload();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const act = async (body: Record<string, unknown>) => {
    setBusy(true); setErr("");
    try { await api.post("/api/hrms/offers", { ...body, id: d.id }); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  return (
    <>
      <div className="rounded-lg border p-3 mb-3 no-print" style={{ borderColor: C.line, background: "#FBFAF7" }}>
        <div className="font-bold mb-1" style={{ fontSize: 13 }}>Add documents</div>
        <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 6 }}>
          Anything at all — a photograph of handwritten interview notes, a certificate, an ID. Several at once is fine.
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select value={kind} onChange={(e) => setKind(e.target.value)} disabled={locked}
            className="rounded px-2 py-1.5 bg-white" style={{ border: `1px solid ${C.line}`, fontSize: 12.5, color: C.ink }}>
            {DOC_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <input ref={fileRef} type="file" multiple disabled={locked} style={{ fontSize: 12, maxWidth: 300 }} />
          <button onClick={upload} disabled={busy || locked} className="rounded px-3 py-1.5 font-bold"
            style={{ background: C.green, color: "#fff", fontSize: 12.5 }}>{busy ? "Uploading…" : "Upload"}</button>
        </div>
        {err && <div className="text-xs font-semibold mt-2" style={{ color: C.red }}>{err}</div>}
      </div>

      <Card title={`On file (${docs.length})`}
        note="When this person joins, these flow into their Drive folder — “Active - 6001 - Name” — together with the offer and appointment letters. The kind decides what goes where, which is why it is worth labelling correctly.">
        {!docs.length ? <div className="text-sm" style={{ color: C.faint }}>Nothing on file yet. The resume lands here automatically when an offer is started from one.</div> : (
          <table className="w-full" style={{ fontSize: 12.5, borderCollapse: "collapse" }}>
            <thead><tr style={{ color: C.faint, fontSize: 11 }}>
              {["Kind", "File", "Size", "Added", "By", ""].map((h) => (
                <th key={h} className="text-left px-1.5 py-1" style={{ borderBottom: `1px solid ${C.line}` }}>{h}</th>))}
            </tr></thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id} style={{ borderBottom: "1px solid #F2F0EA" }}>
                  <td className="px-1.5 py-1.5">
                    <select value={doc.kind} disabled={locked}
                      onChange={(e) => act({ action: "doc-kind", docId: doc.id, kind: e.target.value, note: doc.note })}
                      className="rounded px-1 py-0.5 font-bold bg-white"
                      style={{ border: `1px solid ${C.line}`, fontSize: 11, color: KIND_TONE[doc.kind] || C.dim }}>
                      {DOC_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </td>
                  <td className="px-1.5 py-1.5">
                    {doc.url
                      ? <a href={doc.url} target="_blank" rel="noopener noreferrer" style={{ color: "#1B3A5C", textDecoration: "underline", textUnderlineOffset: 2 }}>{doc.name}</a>
                      : doc.name}
                    {doc.note && <div style={{ fontSize: 10.5, color: C.faint }}>{doc.note}</div>}
                  </td>
                  <td className="px-1.5 py-1.5 tnum" style={{ color: C.faint }}>{size(doc.size)}</td>
                  <td className="px-1.5 py-1.5">{day(doc.at)}</td>
                  <td className="px-1.5 py-1.5">{String(doc.by || "").split("·")[0].trim()}</td>
                  <td className="px-1.5 py-1.5 no-print">
                    {!locked && (
                      <button onClick={() => { if (window.confirm(`Take ${doc.name} off the list? The file itself stays in storage.`)) act({ action: "doc-remove", docId: doc.id }); }}
                        disabled={busy} style={{ color: C.red, fontSize: 11, fontWeight: 700 }}>Remove</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

/** What prints: the letter itself, in the shape of the one in use. */
function LetterPreview({ d }: { d: Offer }) {
  return (
    <div id="hrms-print" style={{ background: "#fff", padding: 18, border: `1px solid ${C.line}`, fontSize: 13, lineHeight: 1.7 }}>
      <div className="flex justify-between" style={{ fontSize: 11.5, color: C.faint }}>
        <span>Ref: {d.offer_no}</span><span>Date: {day(d.offer_date)}</span>
      </div>
      <div className="font-bold text-center" style={{ fontSize: 16, margin: "10px 0" }}>
        {d.status === "Draft" ? "DRAFT OFFER LETTER" : "OFFER OF EMPLOYMENT"}
      </div>
      <div style={{ fontSize: 11, textAlign: "center", color: C.faint, marginTop: -8, marginBottom: 12 }}>Private &amp; Confidential</div>

      <div><b>{d.name}</b></div>
      {d.address && <div style={{ whiteSpace: "pre-wrap", color: C.dim }}>{d.address}</div>}

      <p style={{ marginTop: 12 }}>Dear {String(d.name || "").split(" ")[0]},</p>
      <p>
        We are happy to have you join us for the role of <b>{d.role_doc?.role || d.designation || "—"}</b>.
        The roles and responsibility are as documented in Annexure 2.
        Your offered gross monthly salary shall be <b>Rs. {inr(d.agreed_gross)}/-</b>
        {d.salary ? <> and the annual CTC shall be <b>Rs. {d.salary.ctcLakhs} Lakhs</b></> : null} as detailed in Annexure 1.
      </p>
      <p>
        You shall join on or around <b>{day(d.joining_date)}</b>, reporting to <b>{d.reporting_to || "—"}</b>.
        Your probation period shall be <b>{d.probation_months || 3} months</b>.
        The terms and conditions of employment are as attached. The finalised hard copy shall be given on joining
        along with your roles and responsibilities.
      </p>

      <div className="font-bold" style={{ marginTop: 16 }}>Annexure 1 — Compensation</div>
      {d.salary ? <SalaryTable rows={d.salary.rows} ctc={d.salary.ctcLakhs} /> : <div style={{ color: C.faint }}>Not yet set.</div>}

      <div className="font-bold" style={{ marginTop: 16 }}>Annexure 2 — Roles and Responsibility</div>
      {d.role_doc?.purpose && <><div className="font-bold" style={{ fontSize: 12.5, marginTop: 8 }}>Purpose of the role</div><RichTextView html={d.role_doc.purpose} /></>}
      {d.role_doc?.job_description && <><div className="font-bold" style={{ fontSize: 12.5, marginTop: 8 }}>Job description</div><RichTextView html={d.role_doc.job_description} /></>}
      {d.role_doc?.deliverable && <><div className="font-bold" style={{ fontSize: 12.5, marginTop: 8 }}>Key responsibility areas</div><RichTextView html={d.role_doc.deliverable} /></>}
      {d.role_doc?.metric && <><div className="font-bold" style={{ fontSize: 12.5, marginTop: 8 }}>KPI metrics</div><RichTextView html={d.role_doc.metric} /></>}
      {!!(d.competencies || []).length && (
        <>
          <div className="font-bold" style={{ fontSize: 12.5, marginTop: 8 }}>Competencies expected</div>
          <div className="flex gap-1 flex-wrap">
            {(d.competencies || []).map((c) => (
              <span key={c.name} className="rounded px-1.5 py-0.5" style={{ fontSize: 11, background: "#F4F2EC" }}>{c.name} <b>{c.level}/5</b></span>
            ))}
          </div>
        </>
      )}

      <div className="font-bold" style={{ marginTop: 16 }}>Terms of Employment</div>
      <RichTextView html={d.terms || ""} />

      <div style={{ marginTop: 20 }}>For Nandan GSE Pvt. Ltd.</div>
      <div style={{ marginTop: 22 }}><b>Dr. Raghunandan Jagdish</b><br />Founder, Managing Director &amp; CEO</div>
      <div style={{ marginTop: 18, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
        <b>Acceptance</b><div>I, {d.name}, accept the offer of employment on the terms set out above.</div>
        <div style={{ marginTop: 16, color: C.faint }}>Signature: ______________________&nbsp;&nbsp;&nbsp;Date: ____________</div>
      </div>
    </div>
  );
}

/* ── small parts ── */
function Modal({ title, sub, chip, onClose, width, children }: { title: string; sub?: string; chip?: React.ReactNode; onClose: () => void; width: number; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: "rgba(15,23,32,.55)" }} onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl flex flex-col" style={{ width: `min(${width}px,96vw)`, maxHeight: "94vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C.line}` }}>
          <div className="flex items-baseline gap-2 flex-wrap">
            <div className="font-bold" style={{ fontSize: 15.5 }}>{title}</div>
            {sub && <div style={{ fontSize: 11.5, color: C.faint }}>{sub}</div>}
            {chip}
          </div>
          <button onClick={onClose} className="text-sm font-bold px-2 py-1" style={{ color: C.faint }}>✕ Close</button>
        </div>
        <div className="overflow-y-auto px-4 py-3" style={{ flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

const Card = ({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) => (
  <div className="bg-white rounded-lg border mb-3" style={{ borderColor: C.line }}>
    <div className="px-3 pt-2.5 pb-1">
      <div className="font-bold" style={{ fontSize: 13 }}>{title}</div>
      {note && <div style={{ fontSize: 11, color: C.faint }}>{note}</div>}
    </div>
    <div className="px-3 pb-3">{children}</div>
  </div>
);

function F({ label, v, onSave, locked, area, rows = 3, type }: { label: string; v: string | null | undefined; onSave: (s: string) => void; locked: boolean; area?: boolean; rows?: number; type?: string }) {
  const [s, setS] = useState(v ?? "");
  useEffect(() => { setS(v ?? ""); }, [v]);
  const common = {
    value: s, disabled: locked,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setS(e.target.value),
    onBlur: () => { if (s !== (v ?? "")) onSave(s); },
    className: "w-full rounded px-2 py-1.5 block",
    style: { border: `1px solid ${C.line}`, fontSize: 13.5, color: C.ink, background: locked ? "#F7F6F2" : "#fff" },
  };
  return (
    <label className="block mb-2" style={{ fontSize: 11.5, color: C.faint }}>
      {label}
      {area ? <textarea {...common} rows={rows} /> : <input {...common} type={type} />}
    </label>
  );
}

const B = ({ onClick, busy, bg, fg = "#fff", border, children }: { onClick: () => void; busy: boolean; bg: string; fg?: string; border?: boolean; children: React.ReactNode }) => (
  <button onClick={onClick} disabled={busy} className="rounded px-3 py-1.5 font-bold"
    style={{ background: bg, color: fg, border: border ? `1px solid ${C.line}` : "none", fontSize: 12.5 }}>{children}</button>
);
