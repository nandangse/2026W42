"use client";
/**
 * Roles, JD, KRA, KPI — the register a role is defined in.
 *
 * The employee master's Role points here, and that is the point of the
 * distinction: a DESIGNATION may be anything, a ROLE is accountable, and a
 * role is only accountable once somebody has written down what it delivers
 * and how that is measured.
 *
 * DRAFT until Dr Raghu marks it Final. Not ceremony — a job description
 * nobody has agreed is a suggestion, and an appraisal run against a
 * suggestion is not defensible.
 *
 * The management expectation note is spoken rather than typed, because that
 * is the part nobody writes. Kept three ways: the audio (tone carries what
 * words lose), the transcript (nobody scrubs audio for one sentence), and a
 * summary (spoken thought runs longer than the thought in it).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Pane } from "./Pane";
import { C } from "./RecordFields";
import RichText from "./RichText";

interface Role {
  id: string;
  role: string;
  department: string | null;
  grade: string | null;
  reports_to: string | null;
  job_description: string | null;
  deliverable: string | null;
  metric: string | null;
  stage: "Draft" | "Final";
  url: string | null;
  voice_seconds: number | null;
  transcript: string | null;
  summary: string | null;
  approved_by: string | null;
  approved_at: string | null;
  updated_by: string | null;
  people: { id: string; name: string; onRoll: boolean }[];
  activeCount: number;
}

export default function RolesRegister({ who, isOwner }: { who: string; isOwner: boolean }) {
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [unassigned, setUnassigned] = useState(0);
  const [activeTotal, setActiveTotal] = useState(0);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [stage, setStage] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState("");
  const [adding, setAdding] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api.get("/api/hrms/roles");
      setRoles(r.roles || []);
      setUnassigned(r.unassigned || 0);
      setActiveTotal(r.activeTotal || 0);
      setNeedsMigration(!!r.needsMigration);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      setRoles([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const departments = useMemo(() => {
    const s = new Set<string>();
    for (const r of roles || []) if (r.department) s.add(r.department);
    return [...s].sort();
  }, [roles]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (roles || []).filter((r) => {
      if (dept && r.department !== dept) return false;
      if (stage && r.stage !== stage) return false;
      if (!n) return true;
      return [r.role, r.department, r.grade, r.reports_to, r.job_description, r.deliverable, r.metric, r.summary]
        .filter(Boolean).join(" ").toLowerCase().includes(n);
    });
  }, [roles, q, dept, stage]);

  const run = async (body: Record<string, unknown>, ok: string) => {
    setMsg("");
    try { await api.post("/api/hrms/roles", body); setMsg(`${ok} ✓`); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  const current = (roles || []).find((r) => r.id === open) || null;

  return (
    <Pane title="Roles, JD, KRA, KPI" who={who}
      blurb="What each role is for, what it must deliver, and how that is measured. The employee master's Role points here."
      tools={
        <>
          <input value={adding} onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && adding.trim()) { run({ action: "create", role: adding.trim() }, `Added “${adding.trim()}”`); setAdding(""); } }}
            placeholder="New role…" className="text-xs rounded px-2 py-1.5" style={{ border: `1px solid ${C.line}`, width: 170 }} />
          <button onClick={() => { if (adding.trim()) { run({ action: "create", role: adding.trim() }, `Added “${adding.trim()}”`); setAdding(""); } }}
            className="text-xs font-bold rounded px-2.5 py-1.5" style={{ background: "#E8600A", color: "#fff" }}>+ Add role</button>
        </>
      }>
      {needsMigration && (
        <div className="rounded p-3 mb-3" style={{ background: "#FFF7E6", border: "1px solid #F5B32B", fontSize: 12, color: "#8A5B00" }}>
          <b>Run migration 0050 first.</b> The role register does not exist yet.
        </div>
      )}
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>}

      {/* the three counts */}
      <div className="flex gap-2 flex-wrap mb-3">
        <Stat n={(roles || []).length} l="Roles" hint="Roles in the register" />
        <Stat n={activeTotal} l="Active employees" hint="Everybody on the roll" />
        <Stat n={unassigned} l="Unassigned" warn={unassigned > 0}
          hint="On the roll with no role set. Their designation is not a role — until somebody chooses one, nothing defines what they are accountable for." />
      </div>

      <div className="flex gap-1.5 flex-wrap items-center mb-2 no-print">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search roles, JD, deliverable, metric…"
          className="text-xs rounded px-2.5 py-1.5" style={{ border: `1px solid ${C.line}`, width: 300 }} />
        <select value={dept} onChange={(e) => setDept(e.target.value)} className="text-xs rounded px-2 py-1.5 bg-white" style={{ border: `1px solid ${C.line}` }}>
          <option value="">All departments</option>
          {departments.map((d) => (<option key={d} value={d}>{d}</option>))}
        </select>
        <select value={stage} onChange={(e) => setStage(e.target.value)} className="text-xs rounded px-2 py-1.5 bg-white" style={{ border: `1px solid ${C.line}` }}>
          <option value="">Draft and Final</option>
          <option value="Draft">Draft only</option>
          <option value="Final">Final only</option>
        </select>
        <span className="text-xs" style={{ color: C.faint }}>{roles === null ? "loading…" : `${shown.length} shown`}</span>
      </div>

      <div className="bg-white rounded-lg border" style={{ borderColor: C.line }}>
        {roles !== null && shown.length === 0 && (
          <div className="px-3 py-5 text-xs" style={{ color: C.faint }}>No role matches that.</div>
        )}
        {shown.map((r, i) => (
          <div key={r.id} style={{ borderTop: i ? "1px solid #EEECE6" : undefined }}>
            <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
              <button onClick={() => setExpanded((e) => ({ ...e, [r.id]: !e[r.id] }))}
                className="font-bold rounded"
                style={{ width: 20, height: 20, background: "#F4F2EC", color: C.dim, fontSize: 12, flexShrink: 0 }}
                title={r.people.length ? "Who holds this role" : "Nobody holds this role"}>
                {expanded[r.id] ? "−" : "+"}
              </button>
              <button onClick={() => setOpen(open === r.id ? null : r.id)} className="text-xs font-bold text-left" style={{ minWidth: 200, flex: 1 }}>
                {r.role}
              </button>
              <span className="text-xs" style={{ color: C.dim, minWidth: 130 }}>{r.department || <span style={{ color: "#C9C6BD" }}>—</span>}</span>
              <span className="text-xs" style={{ color: C.faint, minWidth: 70 }}>{r.grade || ""}</span>
              <span className="text-xs tnum" style={{ color: r.activeCount ? C.ink : "#C9C6BD", minWidth: 74, textAlign: "right" }}
                title="Active employees holding this role">
                {r.activeCount} active
              </span>
              {r.summary && <span title="Has a management expectation note">🎙</span>}
              <span className="rounded px-1.5 py-0.5 font-bold" style={{
                fontSize: 10,
                background: r.stage === "Final" ? "#E6F4EA" : "#FFF3E8",
                color: r.stage === "Final" ? C.green : "#8A5B00",
              }}>{r.stage}</span>
            </div>

            {expanded[r.id] && (
              <div className="px-3 pb-2" style={{ paddingLeft: 44 }}>
                {r.people.length === 0 && <div className="text-xs" style={{ color: C.faint }}>Nobody holds this role.</div>}
                <div className="flex gap-1 flex-wrap">
                  {r.people.map((p) => (
                    <a key={p.id} href={`/hrms/employee/${encodeURIComponent(p.id)}`} target="_blank" rel="noopener noreferrer"
                      className="rounded px-1.5 py-0.5 text-xs"
                      style={{ background: p.onRoll ? "#F4F2EC" : "#FBEDEA", color: p.onRoll ? C.dim : C.red }}
                      title={p.onRoll ? `${p.id} — on the roll` : `${p.id} — no longer on the roll`}>
                      {p.name}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {open === r.id && <RoleEditor r={r} isOwner={isOwner} onRun={run} reload={load} />}
          </div>
        ))}
      </div>
    </Pane>
  );
}

function Stat({ n, l, hint, warn }: { n: number; l: string; hint?: string; warn?: boolean }) {
  return (
    <div className="bg-white rounded-lg border px-3 py-2" style={{ borderColor: warn ? "#F5B32B" : C.line, minWidth: 130 }} title={hint}>
      <div className="font-bold tnum" style={{ fontSize: 21, lineHeight: 1.1, color: warn ? "#8A5B00" : C.ink }}>{n}</div>
      <div style={{ fontSize: 11, color: C.faint }}>{l}</div>
    </div>
  );
}

function RoleEditor({
  r, isOwner, onRun, reload,
}: {
  r: Role; isOwner: boolean;
  onRun: (body: Record<string, unknown>, ok: string) => Promise<void>;
  reload: () => Promise<void>;
}) {
  const save = (field: string, value: string) => {
    if ((r as unknown as Record<string, string | null>)[field] === (value || null)) return;
    onRun({ action: "save", id: r.id, [field]: value }, "Saved");
  };

  /**
   * Job Description, Deliverable and Measurement Metric are RICH TEXT
   * (Dr Raghu, 23 Aug 2026) — a job description with three bullets is a
   * different document from the same words run together in a paragraph.
   */
  const Rich = ({ f, label, rows = 3, hint, placeholder }: { f: keyof Role; label: string; rows?: number; hint?: string; placeholder?: string }) => (
    <div className="mb-2">
      <div className="text-xs font-semibold" style={{ color: C.dim }}>{label}</div>
      {hint && <div style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.5, marginBottom: 3 }}>{hint}</div>}
      <RichText value={(r[f] as string) || ""} rows={rows} placeholder={placeholder}
        onSave={(html) => save(f as string, html)} />
    </div>
  );

  return (
    <div className="px-3 pb-3" style={{ background: "#F8F7F3", borderTop: "1px solid #EEECE6" }}>
      <div className="flex gap-2 flex-wrap pt-2 mb-2">
        <Field label="Role" value={r.role} onSave={(v) => save("role", v)} width={210} />
        <Field label="Department" value={r.department || ""} onSave={(v) => save("department", v)} />
        <Field label="Grade" value={r.grade || ""} onSave={(v) => save("grade", v)} width={110} />
        <Field label="Reports To" value={r.reports_to || ""} onSave={(v) => save("reports_to", v)} />
      </div>

      <Rich f="job_description" label="Job Description" rows={4} placeholder="What this role exists to do…" />
      <Rich f="deliverable" label="Deliverable" rows={3}
        hint="What this role must produce — an outcome, not a list of activities."
        placeholder="One bullet per outcome…" />
      <Rich f="metric" label="Measurement Metric" rows={3}
        hint="How the deliverable is measured. A number, a date, or a rate."
        placeholder="e.g. On-time delivery ≥ 90% each month…" />

      <VoiceNote r={r} reload={reload} />

      <div className="flex items-center gap-2 flex-wrap mt-3">
        {r.stage === "Draft" ? (
          <button
            onClick={() => onRun({ action: "stage", id: r.id, stage: "Final" }, `“${r.role}” is Final`)}
            disabled={!isOwner}
            className="text-xs font-bold rounded px-3 py-1.5"
            style={{ background: isOwner ? "#0D7A3F" : "#E2E0DA", color: isOwner ? "#fff" : "#8A94A0", cursor: isOwner ? "pointer" : "not-allowed" }}
            title={isOwner ? "Mark this role agreed" : "Only Dr Raghu can make a role Final. Write it, then ask him."}>
            ✓ Mark Final
          </button>
        ) : (
          <>
            <span className="text-xs" style={{ color: C.green, fontWeight: 700 }}>
              Final{r.approved_by ? ` — approved by ${r.approved_by.split("·")[0].trim()}` : ""}
              {r.approved_at ? ` on ${new Date(r.approved_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : ""}
            </span>
            {isOwner && (
              <button onClick={() => onRun({ action: "stage", id: r.id, stage: "Draft" }, "Back to draft")}
                className="text-xs font-bold rounded px-2 py-1" style={{ background: "#FFF3E8", color: "#8A5B00" }}>
                ↩ Back to draft
              </button>
            )}
          </>
        )}
        <button
          onClick={() => { if (window.confirm(`Delete the role “${r.role}”?`)) onRun({ action: "delete", id: r.id }, "Deleted"); }}
          className="text-xs font-bold rounded px-2 py-1 ml-auto" style={{ background: "#FBEDEA", color: C.red }}>
          ✕ Delete role
        </button>
      </div>
      <div style={{ fontSize: 10.5, color: C.faint, marginTop: 6 }}>
        Every box saves when you click away. {r.updated_by && <>Last changed by {r.updated_by.split("·")[0].trim()}.</>}
      </div>
    </div>
  );
}

function Field({ label, value, onSave, width = 150 }: { label: string; value: string; onSave: (v: string) => void; width?: number }) {
  return (
    <div>
      <div className="text-xs font-semibold" style={{ color: C.dim }}>{label}</div>
      <input defaultValue={value} onBlur={(e) => onSave(e.target.value)}
        className="text-xs rounded px-2 py-1 mt-1" style={{ border: `1px solid ${C.line}`, width }} />
    </div>
  );
}

/* ──────────────── the management expectation note ──────────────── */

function VoiceNote({ r, reload }: { r: Role; reload: () => Promise<void> }) {
  const [rec, setRec] = useState(false);
  const [live, setLive] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srRef = useRef<any>(null);
  const startedRef = useRef(0);
  const textRef = useRef("");

  const stop = () => {
    try { mediaRef.current?.stop(); } catch { /* already stopped */ }
    try { srRef.current?.stop(); } catch { /* dictation may not be running */ }
    setRec(false);
  };

  const start = async () => {
    setErr(""); setLive(""); textRef.current = "";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        const seconds = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000));
        const transcript = textRef.current.trim();
        if (!blob.size && !transcript) return;
        setBusy(true);
        try {
          const fd = new FormData();
          fd.append("id", r.id);
          fd.append("transcript", transcript);
          fd.append("seconds", String(seconds));
          if (blob.size) fd.append("file", new File([blob], "note.webm", { type: blob.type }));
          const res = await fetch("/api/hrms/roles", { method: "POST", body: fd });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error || "Could not save the note");
          await reload();
        } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
        setBusy(false);
        setLive("");
      };
      mr.start();
      mediaRef.current = mr;
      startedRef.current = Date.now();
      setRec(true);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        const sr = new SR();
        sr.continuous = true; sr.interimResults = true; sr.lang = "en-IN";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sr.onresult = (ev: any) => {
          let done = "", interim = "";
          for (let i = 0; i < ev.results.length; i++) {
            const x = ev.results[i];
            if (x.isFinal) done += x[0].transcript + " "; else interim += x[0].transcript;
          }
          textRef.current = done.trim();
          setLive((done + interim).trim());
        };
        sr.onerror = () => {};
        sr.start();
        srRef.current = sr;
      }
    } catch (e) {
      const name = (e as { name?: string })?.name || "";
      setErr(
        name === "NotAllowedError"
          ? "The browser blocked the microphone. Click the padlock in the address bar → Microphone → Allow, then press Record again."
          : name === "NotFoundError" ? "No microphone is connected to this machine."
          : name === "NotReadableError" ? "Something else is using the microphone — close it and press Record again."
          : "Could not open the microphone on this browser.",
      );
    }
  };

  return (
    <div className="rounded p-2 mt-2" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-xs font-semibold" style={{ color: C.dim }}>Management Expectation Note</div>
        {!rec ? (
          <button onClick={start} disabled={busy} className="text-xs font-bold rounded px-2.5 py-1"
            style={{ background: "#E8600A", color: "#fff", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Saving…" : r.summary ? "🎙 Record again" : "🎙 Record"}
          </button>
        ) : (
          <button onClick={stop} className="text-xs font-bold rounded px-2.5 py-1" style={{ background: "#B3261E", color: "#fff" }}>
            ■ Stop
          </button>
        )}
        {r.url && <audio controls src={r.url} style={{ height: 28 }} />}
        {r.voice_seconds ? <span className="text-xs tnum" style={{ color: C.faint }}>{r.voice_seconds}s</span> : null}
      </div>
      <div style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.5, marginTop: 4 }}>
        Say what this role is really for. It is kept three ways — the recording, the words, and a summary — because tone
        carries what a typed paragraph loses, and nobody scrubs through audio to find one sentence.
      </div>
      {rec && <div className="text-xs mt-1" style={{ color: "#B3261E" }}>● recording… {live && <span style={{ color: C.dim }}>{live}</span>}</div>}
      {err && <div className="text-xs mt-1" style={{ color: C.red }}>{err}</div>}
      {r.summary && (
        <div className="rounded p-2 mt-2" style={{ background: "#F4F2EC" }}>
          <div className="text-xs font-bold" style={{ color: C.dim }}>What it comes to</div>
          <div className="text-xs" style={{ color: C.ink, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{r.summary}</div>
          {r.transcript && (
            <details className="mt-1">
              <summary className="text-xs cursor-pointer" style={{ color: C.faint }}>the words as spoken</summary>
              <div className="text-xs mt-1" style={{ color: C.dim, lineHeight: 1.6 }}>{r.transcript}</div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
