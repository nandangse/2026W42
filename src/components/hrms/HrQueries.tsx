"use client";
/**
 * HR Queries — the "How can we help you?" form, in Genie (Dr Raghu, 4 Sep
 * 2026): "recreate a form like this for the guy who will be logged in. HR
 * can also fill in. Have two buttons: HR Queries for self and HR query for
 * others."
 *
 * The form is the Google Form's, line for line, in English and Hindi. For
 * self, the contact block is filled from the person's own record; for
 * others, HR picks the person and the block fills from theirs. Below the
 * form: the queries — one's own for everybody, all of them for HRMS — with
 * the thread and HR's answer.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { SECTIONS, FREE_TEXT, INTRO_EN, INTRO_HI, formToText, type HrQueryForm } from "@/lib/hr-query-form";
import { Pane } from "./Pane";
import { C } from "./RecordFields";

interface Row {
  id: string; employee_id: string | null; person: string | null; subject: string; question: string; status: string;
  thread: { by: string; at: string; text: string }[]; answer: string | null; form: HrQueryForm | null; for_self: boolean;
  raised_by: string | null; raised_email: string | null; raised_at: string; answered_by: string | null; answered_at: string | null;
}
interface Contact { employee_id: string; name: string; mobile: string; personal_email: string; stay_location: string; work_email?: string; department?: string | null; designation?: string | null }

const day = (iso: string | null) => (iso ? fmtFull(String(iso)) : "—");
const who = (s: string | null) => String(s || "—").split("·")[0].trim();
const inp: React.CSSProperties = { border: `1px solid ${C.line}`, borderRadius: 6, padding: "6px 8px", fontSize: 13, width: "100%", background: "#fff" };
const emptyForm = (): HrQueryForm => ({ ticks: {}, other: {}, text: {}, contact: { employee_id: "", name: "", mobile: "", personal_email: "", stay_location: "" } });

export default function HrQueries({ who: me, standalone }: { who: string; standalone?: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [hr, setHr] = useState(false);
  const [anon, setAnon] = useState(false);
  const [mine, setMine] = useState<Contact | null>(null);
  const [needs, setNeeds] = useState(false);
  const [msg, setMsg] = useState("");
  const [mode, setMode] = useState<"" | "self" | "other">("");
  const [tab, setTab] = useState<"open" | "answered">("open");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const j = await api.get("/api/hrms/hr-query"); setRows(j.rows || []); setHr(!!j.hr); setAnon(!!j.anon); setMine(j.me || null); setNeeds(!!j.needsMigration); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = (rows || []).filter((r) => (tab === "open" ? r.status === "Open" : r.status !== "Open"));
  const openN = (rows || []).filter((r) => r.status === "Open").length;

  const body = (
    <>
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>}
      {needs && <div className="rounded p-2 mb-2" style={{ background: "#FFF7E6", border: "1px solid #F5D9A8", fontSize: 12.5, color: "#8A5B00" }}>Run migration 0131 — the form has nowhere to be kept yet.</div>}

      {/* the two buttons */}
      {!mode && (
        <div className="bg-white rounded-lg border p-4 mb-3" style={{ borderColor: C.line }}>
          <div className="font-bold" style={{ fontSize: 16 }}>How can we help you? <span style={{ color: C.dim, fontWeight: 500 }}>“हम आपकी किस प्रकार मदद कर सकते हैं?”</span></div>
          <div className="text-xs mt-1" style={{ color: C.dim, lineHeight: 1.6, maxWidth: 760 }}>{INTRO_EN}</div>
          <div className="text-xs mt-1" style={{ color: C.faint, lineHeight: 1.6, maxWidth: 760 }}>{INTRO_HI}</div>
          <div className="flex gap-2 mt-3 flex-wrap">
            <button onClick={() => setMode("self")} className="rounded px-4 py-2.5 font-bold" style={{ background: C.orange, color: "#fff", fontSize: 14 }}>🙋 HR query for myself</button>
            {hr && !standalone && <button onClick={() => setMode("other")} className="rounded px-4 py-2.5 font-bold" style={{ background: "#1B3A5C", color: "#fff", fontSize: 14 }}>👥 HR query for others</button>}
          </div>
          {anon && <div className="text-xs mt-2" style={{ color: C.faint }}>No login needed. Fill the contact block at the end so HR knows who to answer.</div>}
        </div>
      )}
      {mode && <QueryForm mode={mode} mine={mine} onClose={() => setMode("")} onDone={(s) => { setMode(""); setMsg(`Sent to HR ✓ — ${s}`); load(); }} />}

      {/* the queries — one's own need a login */}
      {!anon && <>
      <div className="flex gap-1.5 mb-2 no-print flex-wrap items-center">
        <span className="text-xs font-bold" style={{ color: C.faint }}>{hr ? "ALL QUERIES" : "MY QUERIES"}</span>
        {(["open", "answered"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="rounded px-3 py-1 font-bold" style={{ fontSize: 12, background: tab === t ? "#16232F" : "#fff", color: tab === t ? "#fff" : C.dim, border: `1px solid ${tab === t ? "#16232F" : C.line}` }}>
            {t === "open" ? `Open${openN ? ` (${openN})` : ""}` : `Answered (${(rows || []).length - openN})`}
          </button>
        ))}
      </div>
      {rows === null ? <div className="text-sm py-6 text-center" style={{ color: C.faint }}>loading…</div>
        : !shown.length ? <div className="bg-white rounded-lg border p-4 text-xs" style={{ borderColor: C.line, color: C.dim }}>{tab === "open" ? "Nothing open." : "Nothing answered yet."}</div>
        : shown.map((r) => <QueryCard key={r.id} r={r} hr={hr} expanded={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} onChanged={load} />)}
      </>}
      {anon && <div className="text-xs" style={{ color: C.faint }}>Sign in to Genie to see your earlier queries and HR&apos;s answers.</div>}
    </>
  );

  if (standalone) return <div className="p-4" style={{ maxWidth: 900, margin: "0 auto" }}>{body}</div>;
  return (
    <Pane title="HR Queries" who={me} print blurb="A question put to HR, and the answer it got. Raise it for yourself, or HR raises it for someone; talked through in the thread; closed with HR's answer.">
      {body}
    </Pane>
  );
}

function QueryForm({ mode, mine, onClose, onDone }: { mode: "self" | "other"; mine: Contact | null; onClose: () => void; onDone: (subject: string) => void }) {
  const [f, setF] = useState<HrQueryForm>(() => ({ ...emptyForm(), contact: mode === "self" && mine ? { employee_id: mine.employee_id, name: mine.name, mobile: mine.mobile, personal_email: mine.personal_email, stay_location: mine.stay_location } : emptyForm().contact }));
  const [people, setPeople] = useState<Contact[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (mode === "other") api.get("/api/hrms/hr-query?people=1").then((j) => setPeople(j.people || [])).catch(() => setPeople([])); }, [mode]);
  const hits = useMemo(() => { const n = q.trim().toLowerCase(); return n ? people.filter((p) => p.name.toLowerCase().includes(n) || p.employee_id.toLowerCase().includes(n)).slice(0, 8) : []; }, [people, q]);

  const tick = (s: string, k: string, on: boolean) => setF((x) => { const cur = new Set(x.ticks[s] || []); if (on) cur.add(k); else cur.delete(k); return { ...x, ticks: { ...x.ticks, [s]: [...cur] } }; });
  const preview = formToText(f);
  const submit = async () => {
    setBusy(true); setErr("");
    try { const j = await api.post("/api/hrms/hr-query", { action: "raise", for_self: mode === "self", employee_id: f.contact.employee_id, form: f }); onDone(j.subject || preview.subject); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  const Cf = ({ k, label, hi }: { k: keyof HrQueryForm["contact"]; label: string; hi?: string }) => (
    <label className="text-xs" style={{ color: C.dim }}>{label}{hi && <span style={{ color: C.faint }}> · {hi}</span>} <span style={{ color: C.red }}>*</span>
      <input value={f.contact[k]} onChange={(e) => setF({ ...f, contact: { ...f.contact, [k]: e.target.value } })} style={{ ...inp, marginTop: 2 }} />
    </label>
  );

  return (
    <div className="bg-white rounded-lg border mb-3" style={{ borderColor: C.orange }}>
      <div className="px-4 py-3 flex items-center gap-2" style={{ background: "#16232F", color: "#fff", borderRadius: "8px 8px 0 0" }}>
        <div style={{ flex: 1 }}>
          <div className="font-bold" style={{ fontSize: 15 }}>{mode === "self" ? "HR query for myself" : "HR query for someone else"}</div>
          <div className="text-xs" style={{ color: "#8FA1B3" }}>Tick everything that applies · जो लागू हो सब टिक करें</div>
        </div>
        <button onClick={onClose} className="font-bold" style={{ color: "#8FA1B3", fontSize: 20 }}>✕</button>
      </div>
      <div className="p-4">
        {err && <div className="text-xs font-semibold mb-2" style={{ color: C.red }}>{err}</div>}

        {mode === "other" && (
          <div className="rounded p-3 mb-3" style={{ background: "#F4F2EC" }}>
            <div className="text-xs font-bold mb-1" style={{ color: C.faint }}>WHO IS THIS FOR?</div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="type a name or employee ID — the contact block fills from the record" style={inp} />
            {hits.length > 0 && (
              <div className="rounded border mt-1 bg-white" style={{ borderColor: C.line }}>
                {hits.map((p) => (
                  <button key={p.employee_id} onClick={() => { setF({ ...f, contact: { employee_id: p.employee_id, name: p.name, mobile: p.mobile, personal_email: p.personal_email, stay_location: p.stay_location } }); setQ(""); }} className="block w-full text-left px-2 py-1.5" style={{ borderTop: "1px solid #EEECE6", fontSize: 13 }}>
                    <b>{p.name}</b> <span style={{ color: C.faint, fontSize: 11.5 }}>{p.employee_id} · {p.designation || "—"} · {p.department || "—"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {SECTIONS.map((s) => (
          <div key={s.key} className="rounded border p-3 mb-2" style={{ borderColor: C.line }}>
            <div className="font-bold" style={{ fontSize: 13.5 }}>{s.en}</div>
            {s.hi && <div className="text-xs mb-2" style={{ color: C.faint }}>{s.hi}</div>}
            <div className="grid gap-1" style={{ gridTemplateColumns: "1fr 1fr" }}>
              {s.items.map((i) => {
                const on = (f.ticks[s.key] || []).includes(i.key);
                return (
                  <label key={i.key} className="flex items-start gap-2 rounded px-2 py-1" style={{ cursor: "pointer", background: on ? "#FFF3E8" : "transparent", fontSize: 12.5 }}>
                    <input type="checkbox" checked={on} onChange={(e) => tick(s.key, i.key, e.target.checked)} style={{ accentColor: C.orange, marginTop: 3 }} />
                    <span><span style={{ color: C.ink }}>{i.en}</span>{i.hi && <span style={{ display: "block", color: C.faint, fontSize: 11 }}>{i.hi}</span>}</span>
                  </label>
                );
              })}
            </div>
            {s.other && (
              <input value={f.other[s.key] || ""} onChange={(e) => setF({ ...f, other: { ...f.other, [s.key]: e.target.value } })} placeholder="Other — please mention / अन्य – कृपया उल्लेख करें" style={{ ...inp, marginTop: 6, fontSize: 12.5 }} />
            )}
          </div>
        ))}

        {FREE_TEXT.map((t) => (
          <label key={t.key} className="block mb-2 text-xs" style={{ color: C.dim }}>
            <div>{t.en}</div><div style={{ color: C.faint }}>{t.hi}</div>
            <textarea value={f.text[t.key] || ""} rows={3} onChange={(e) => setF({ ...f, text: { ...f.text, [t.key]: e.target.value } })} style={{ ...inp, marginTop: 2, lineHeight: 1.5 }} />
          </label>
        ))}

        <div className="rounded border p-3 mb-3" style={{ borderColor: C.line, background: "#FBFAF7" }}>
          <div className="text-xs font-bold mb-2" style={{ color: C.faint }}>CONTACT · संपर्क</div>
          <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 2fr" }}>
            <Cf k="employee_id" label="Employee ID" hi="कर्मचारी आईडी" />
            <Cf k="name" label="Name" hi="नाम" />
            <Cf k="mobile" label="Personal mobile" hi="व्यक्तिगत मोबाइल" />
            <Cf k="personal_email" label="Personal email" hi="व्यक्तिगत ईमेल" />
            <div style={{ gridColumn: "1 / -1" }}><Cf k="stay_location" label="Current stay location" hi="वर्तमान निवास स्थान" /></div>
          </div>
        </div>

        <div className="rounded p-2 mb-3 text-xs" style={{ background: preview.count ? "#E6F4EA" : "#F4F2EC", color: preview.count ? C.green : C.faint }}>
          {preview.count ? `${preview.count} point${preview.count === 1 ? "" : "s"} will go to HR — "${preview.subject}"` : "Nothing ticked yet."}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-xs font-semibold rounded border px-3 py-1.5 bg-white" style={{ borderColor: C.line, color: C.dim }}>Cancel</button>
          <button onClick={submit} disabled={busy || !preview.count} className="text-xs font-bold rounded px-4 py-2" style={{ background: C.orange, color: "#fff", opacity: busy || !preview.count ? 0.6 : 1 }}>{busy ? "Sending…" : "Submit to HR · एचआर को भेजें"}</button>
        </div>
      </div>
    </div>
  );
}

function QueryCard({ r, hr, expanded, onToggle, onChanged }: { r: Row; hr: boolean; expanded: boolean; onToggle: () => void; onChanged: () => void }) {
  const [reply, setReply] = useState("");
  const [answer, setAnswer] = useState(r.answer || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const send = async (body: Record<string, unknown>) => {
    setBusy(true); setErr("");
    try { await api.post("/api/hrms/hr-query", { ...body, id: r.id }); setReply(""); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const answered = r.status !== "Open";
  const c = r.form?.contact;
  return (
    <div className="bg-white rounded-lg border mb-2" style={{ borderColor: C.line, borderLeft: `4px solid ${answered ? "#0D7A3F" : "#E8600A"}` }}>
      <button onClick={onToggle} className="w-full text-left px-3 py-2.5">
        <div className="flex items-baseline gap-2 flex-wrap">
          {String(r.subject || "").startsWith("Application") && <span className="rounded px-1.5 py-0.5 font-bold" style={{ background: "#E6F0FA", color: "#1B3A5C", fontSize: 10 }}>APPLICATION</span>}
          <span className="font-bold" style={{ fontSize: 13.5 }}>{r.subject}</span>
          {(r.person || c?.name) && <span style={{ fontSize: 12, color: C.faint }}>· {r.employee_id || c?.employee_id} {r.person || c?.name}</span>}
          {!r.for_self && <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: "#DCE8F5", color: "#1B3A5C" }}>raised by HR</span>}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: C.faint }}>{day(r.raised_at)} · {who(r.raised_by)}</span>
          {answered ? <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: "#E6F4EA", color: "#0D7A3F" }}>answered {day(r.answered_at)}</span>
            : <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: "#FFF3E8", color: "#8A5B00" }}>open</span>}
          <span style={{ color: C.faint, fontSize: 12 }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3">
          <div style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.6, borderTop: `1px solid ${C.line}`, paddingTop: 8 }}>{r.question}</div>
          {c && <div className="text-xs mt-2" style={{ color: C.faint }}>Contact: {c.mobile || "—"} · {c.personal_email || "—"} · {c.stay_location || "—"}</div>}
          {r.thread.map((t, i) => (
            <div key={i} className="rounded p-2 mt-2" style={{ background: "#F7F6F2", fontSize: 12.5 }}>
              <div style={{ color: C.faint, fontSize: 11 }}>{who(t.by)} · {day(t.at)}</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{t.text}</div>
            </div>
          ))}
          {r.answer && (
            <div className="rounded p-2 mt-2" style={{ background: "#E6F4EA", fontSize: 13 }}>
              <div className="font-bold" style={{ color: C.green, fontSize: 11 }}>HR&apos;S ANSWER · {who(r.answered_by)} · {day(r.answered_at)}</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{r.answer}</div>
            </div>
          )}
          {err && <div className="text-xs font-semibold mt-2" style={{ color: C.red }}>{err}</div>}
          <div className="flex gap-2 mt-2 flex-wrap">
            <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="add to the discussion…" style={{ ...inp, flex: 1 }} />
            <button onClick={() => send({ action: "reply", text: reply })} disabled={busy || !reply.trim()} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#1B3A5C", color: "#fff" }}>Reply</button>
          </div>
          {hr && !answered && (
            <div className="mt-2">
              <textarea value={answer} rows={3} onChange={(e) => setAnswer(e.target.value)} placeholder="HR's answer — closes the query" style={{ ...inp, lineHeight: 1.5 }} />
              <div className="flex justify-end mt-1"><button onClick={() => send({ action: "answer", answer })} disabled={busy || !answer.trim()} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: C.green, color: "#fff" }}>✓ Answer & close</button></div>
            </div>
          )}
          {hr && answered && <div className="flex justify-end mt-2"><button onClick={() => send({ action: "reopen" })} disabled={busy} className="text-xs font-semibold rounded border px-3 py-1 bg-white" style={{ borderColor: C.line, color: C.dim }}>Reopen</button></div>}
        </div>
      )}
    </div>
  );
}
