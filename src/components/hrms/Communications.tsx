"use client";
/**
 * Communications — everything HRMS has sent and everything that came back
 * (Dr Raghu, 4 Sep 2026: "kept in the communications tab which will be in
 * the side as well as with each employee and also with the payroll runs").
 *
 * One list across every person and every run: e-mail and WhatsApp out,
 * WhatsApp replies in. Filter by channel, direction, run, or a name.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { MONTHS } from "@/lib/hrms-template";
import { Pane } from "./Pane";
import { C } from "./RecordFields";

interface Row { id: string; employee_id: string; name: string; channel: string; direction: string; to_address: string | null; subject: string | null; body: string; status: string; error: string | null; sent_by: string | null; sent_at: string; run_id: string | null; run_label: string | null }

export default function Communications({ who }: { who: string }) {
  const [mass, setMass] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("");
  const [dir, setDir] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const j = await api.get("/api/hrms/communication?all=1"); setRows(j.rows || []); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = (rows || []).filter((r) => (!channel || r.channel === channel) && (!dir || r.direction === dir) && (!q || `${r.name} ${r.employee_id} ${r.subject || ""} ${r.body}`.toLowerCase().includes(q.toLowerCase())));
  const tone = (s: string) => (s === "delivered" || s === "received" ? C.green : s === "failed" ? C.red : s === "sent" ? "var(--blue)" : C.dim);
  const counts: Record<string, number> = {};
  for (const r of rows || []) { const k = r.direction === "in" ? "replies" : r.status; counts[k] = (counts[k] || 0) + 1; }

  return (
    <Pane title="Communications" who={who} print blurb="Everything HRMS has sent, and everything that came back — by person, by run, by channel. The same lines sit on each record's Communication tab and on each payroll run.">
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: C.red }}>{msg}</div>}
      <div className="flex gap-1.5 mb-2 flex-wrap items-center text-xs">
        {Object.entries(counts).map(([k, v]) => <span key={k} className="rounded px-2 py-0.5 font-bold" style={{ background: "#F4F2EC", color: tone(k === "replies" ? "received" : k) }}>{k} {v}</span>)}
        <span style={{ flex: 1 }} />
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className="rounded px-2 py-1 bg-white" style={{ border: `1px solid ${C.line}` }}><option value="">all channels</option><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="note">Logged</option></select>
        <select value={dir} onChange={(e) => setDir(e.target.value)} className="rounded px-2 py-1 bg-white" style={{ border: `1px solid ${C.line}` }}><option value="">out and in</option><option value="out">sent</option><option value="in">replies</option></select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="name, id, words…" className="rounded px-2 py-1" style={{ border: `1px solid ${C.line}`, width: 200 }} />
        <button onClick={load} className="rounded border px-2 py-1 bg-white" style={{ borderColor: C.line, color: C.dim }}>↻</button>
        <button onClick={() => setMass(true)} className="rounded px-2.5 py-1 font-bold text-white" style={{ background: "var(--accent)" }}
          title="One mail to many — the template, the address it goes from, the variables and an attachment">✉ Send mass email</button>
      </div>
      <div className="bg-white rounded-lg border" style={{ borderColor: C.line }}>
        {rows === null && <div className="p-3 text-xs" style={{ color: C.faint }}>loading…</div>}
        {rows && !shown.length && <div className="p-3 text-xs" style={{ color: C.faint }}>Nothing here.</div>}
        {shown.map((r, i) => (
          <div key={r.id} className="px-3 py-2" style={{ borderTop: i ? "1px solid #EEECE6" : undefined }}>
            <button onClick={() => setOpen(open === r.id ? null : r.id)} className="w-full text-left text-xs flex gap-2 items-baseline flex-wrap">
              <span className="rounded px-1.5 py-0.5 font-bold" style={{ background: r.direction === "in" ? "#E6F4EA" : "#F4F2EC", color: tone(r.status), fontSize: 10 }}>{r.direction === "in" ? "↩ reply" : r.status}</span>
              <span className="font-semibold">{r.name}</span>
              <span style={{ color: C.faint }}>{r.channel === "whatsapp" ? "💬" : r.channel === "email" ? "✉" : "📝"} {r.to_address || ""}{r.subject && r.channel === "email" ? ` · ${r.subject}` : ""}</span>
              {r.run_label && <span className="rounded px-1.5 py-0.5" style={{ background: "#DCE8F5", color: "var(--blue)", fontSize: 10 }}>run {r.run_label}</span>}
              <span style={{ flex: 1 }} />
              <span style={{ color: C.faint }}>{fmtFull(String(r.sent_at))} · {String(r.sent_by || "").split("·")[0].trim()}</span>
              {r.error && <span style={{ color: C.red }} title={r.error}>!</span>}
            </button>
            {open === r.id && <div className="mt-1" style={{ fontSize: 12.5, whiteSpace: "pre-wrap", lineHeight: 1.5, color: r.direction === "in" ? C.green : C.ink }}>{r.body}</div>}
          </div>
        ))}
      </div>
      <div className="text-xs mt-2" style={{ color: C.faint }}>{MONTHS.length ? "" : ""}Replies are pulled from WhatsApp on each run&apos;s Communications tab (Pull replies).</div>
      {mass && <MassEmail onClose={() => { setMass(false); load(); }} />}
    </Pane>
  );
}

/* ─────────────────────────── one mail to many ───────────────────────────
   Dr Raghu, 7 Sep 2026: "here make a button — Send mass email, template
   choice, from mail id hr@nandan.co.in / raghu@nandan.co.in, choose the
   OAuth of that for sending, variables to add on right side, attachment,
   send." The mail leaves from that address's own connected Gmail, so it
   sits in its Sent and replies come back to it. */
type Boot = {
  froms: { email: string; connected: boolean }[];
  templates: { key: string; title: string; body: string }[];
  variables: { key: string; label: string }[];
  types: string[]; departments: string[]; total: number; withEmail: number;
};
type Pre = { count: number; noEmail: { id: string; name: string }[]; missing: string[]; sample: { name: string; to: string; subject: string; html: string }[] };

function MassEmail({ onClose }: { onClose: () => void }) {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [from, setFrom] = useState("");
  const [tpl, setTpl] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [depts, setDepts] = useState<string[]>([]);
  const [atts, setAtts] = useState<{ name: string; mime: string; base64: string; size: number }[]>([]);
  const [pre, setPre] = useState<Pre | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [progress, setProgress] = useState<{ done: number; of: number; sent: number; failed: number } | null>(null);
  const subjRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const lastBox = useRef<"subject" | "body">("body");

  useEffect(() => {
    api.get("/api/hrms/mass-mail").then((j: Boot) => {
      setBoot(j);
      const ok = j.froms.find((f) => f.connected);
      if (ok) setFrom(ok.email);
    }).catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
  }, []);

  /** Click a variable and it drops where the cursor was. */
  const insert = (k: string) => {
    const token = `{{${k}}}`;
    const el = lastBox.current === "subject" ? subjRef.current : bodyRef.current;
    if (!el) return;
    const a = el.selectionStart ?? el.value.length, b2 = el.selectionEnd ?? a;
    const next = el.value.slice(0, a) + token + el.value.slice(b2);
    if (lastBox.current === "subject") setSubject(next); else setBody(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + token.length, a + token.length); });
  };
  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const out = [...atts];
    for (const f of Array.from(list)) {
      const buf = await f.arrayBuffer();
      let bin = ""; const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      out.push({ name: f.name, mime: f.type || "application/octet-stream", base64: btoa(bin), size: f.size });
    }
    setAtts(out);
  };
  const audience = { types: types.length ? types : undefined, departments: depts.length ? depts : undefined };
  const check = async () => {
    setBusy("check"); setMsg(""); setPre(null);
    try { setPre(await api.post("/api/hrms/mass-mail", { action: "preview", subject, body, ...audience })); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };
  const send = async () => {
    if (!pre?.count) return;
    if (!window.confirm(`Send this to ${pre.count} ${pre.count === 1 ? "person" : "people"} from ${from}?\n\nIt goes out of that mailbox, and every one is written into the record.`)) return;
    setBusy("send"); setMsg(""); setProgress({ done: 0, of: pre.count, sent: 0, failed: 0 });
    let off = 0, sent = 0, failed = 0;
    try {
      for (;;) {
        const r = await api.post("/api/hrms/mass-mail", { action: "send", from, subject, body, template_key: tpl || undefined, attachments: atts.map(({ name, mime, base64 }) => ({ name, mime, base64 })), offset: off, ...audience });
        sent += r.sent || 0; failed += (r.failed || []).length; off = r.done;
        setProgress({ done: r.done, of: r.of, sent, failed });
        if (!r.more) break;
      }
      setMsg(`${sent} sent${failed ? `, ${failed} failed` : ""} ✓`);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };

  const inp: React.CSSProperties = { border: `1px solid ${C.line}`, borderRadius: 6, padding: "7px 9px", fontSize: 13, width: "100%", background: "#fff", color: C.ink };
  const chip = (on: boolean) => ({ border: `1px solid ${on ? C.ink : C.line}`, background: on ? C.ink : "#fff", color: on ? "#fff" : C.dim, borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer" });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(22,35,47,.55)", zIndex: 70, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 12px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg genie-modal" style={{ width: "min(1060px, 100%)", maxHeight: "92vh", overflowY: "auto" }}>
        <div className="px-4 py-3 flex items-center gap-3" style={{ background: C.ink, color: "#fff", position: "sticky", top: 0, zIndex: 2 }}>
          <div className="font-bold flex-1" style={{ fontSize: 16 }}>Send mass email</div>
          <button onClick={onClose} style={{ color: "#8FA1B3", fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>
        <div className="p-4">
          {!boot && <div className="text-sm" style={{ color: C.faint }}>{msg || "opening…"}</div>}
          {boot && (
            <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1fr) 250px" }}>
              <div className="min-w-0">
                <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <label className="text-xs font-bold" style={{ color: C.dim }}>FROM — its own Gmail carries the mail
                    <select value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...inp, marginTop: 3 }}>
                      {boot.froms.map((f) => <option key={f.email} value={f.email} disabled={!f.connected}>{f.email}{f.connected ? "" : " — Gmail not connected"}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-bold" style={{ color: C.dim }}>TEMPLATE
                    <select value={tpl} onChange={(e) => { setTpl(e.target.value); const t = boot.templates.find((x) => x.key === e.target.value); if (t) { setBody(t.body || ""); if (!subject.trim()) setSubject(t.title || ""); } }} style={{ ...inp, marginTop: 3 }}>
                      <option value="">— none, write it here —</option>
                      {boot.templates.map((t) => <option key={t.key} value={t.key}>{t.title}</option>)}
                    </select>
                  </label>
                </div>

                <div className="text-xs font-bold mb-1" style={{ color: C.dim }}>WHO IT GOES TO</div>
                <div className="flex gap-1.5 flex-wrap mb-1">
                  {boot.types.map((t) => <span key={t} onClick={() => setTypes((x) => x.includes(t) ? x.filter((y) => y !== t) : [...x, t])} style={chip(types.includes(t))}>{t}</span>)}
                </div>
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {boot.departments.map((d) => <span key={d} onClick={() => setDepts((x) => x.includes(d) ? x.filter((y) => y !== d) : [...x, d])} style={chip(depts.includes(d))}>{d}</span>)}
                </div>
                <div className="text-xs mb-3" style={{ color: C.faint }}>
                  {types.length || depts.length ? "Only the ticked ones." : `Everybody on the roll — ${boot.total}, of whom ${boot.withEmail} have an e-mail on the record.`}
                </div>

                <label className="text-xs font-bold" style={{ color: C.dim }}>SUBJECT
                  <input ref={subjRef} value={subject} onFocus={() => { lastBox.current = "subject"; }} onChange={(e) => setSubject(e.target.value)} style={{ ...inp, marginTop: 3 }} />
                </label>
                <label className="text-xs font-bold block mt-2" style={{ color: C.dim }}>THE MAIL — HTML is fine
                  <textarea ref={bodyRef} value={body} onFocus={() => { lastBox.current = "body"; }} onChange={(e) => setBody(e.target.value)} rows={12}
                    style={{ ...inp, marginTop: 3, fontFamily: "ui-monospace, monospace", fontSize: 12.5, lineHeight: 1.5 }} />
                </label>

                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <label className="text-xs font-bold rounded px-2.5 py-1.5" style={{ border: `1px solid ${C.line}`, cursor: "pointer", color: C.dim }}>
                    📎 Attach files<input type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                  </label>
                  {atts.map((a, i) => (
                    <span key={i} className="text-xs rounded px-2 py-1" style={{ background: "#F4F2EC" }}>
                      {a.name} <span style={{ color: C.faint }}>{(a.size / 1024).toFixed(0)} KB</span>
                      <button onClick={() => setAtts(atts.filter((_, j) => j !== i))} className="ml-1" style={{ color: C.red }}>✕</button>
                    </span>
                  ))}
                </div>

                <div className="flex gap-2 mt-3 items-center flex-wrap">
                  <button onClick={check} disabled={!!busy || !subject.trim() || !body.trim()} className="rounded px-3 py-1.5 text-xs font-bold text-white" style={{ background: busy || !subject.trim() || !body.trim() ? "#B9BEC4" : C.ink }}>
                    {busy === "check" ? "checking…" : "1 · Check it"}
                  </button>
                  <button onClick={send} disabled={!pre?.count || !!busy || !from} className="rounded px-3 py-1.5 text-xs font-bold text-white" style={{ background: pre?.count && !busy && from ? "var(--accent)" : "#B9BEC4" }}>
                    {busy === "send" ? "sending…" : `2 · Send to ${pre?.count ?? 0}`}
                  </button>
                  {progress && <span className="text-xs font-bold" style={{ color: C.green }}>{progress.done} of {progress.of} · {progress.sent} sent{progress.failed ? ` · ${progress.failed} failed` : ""}</span>}
                  {msg && <span className="text-xs font-bold" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</span>}
                </div>

                {pre && (
                  <div className="mt-3 rounded border p-3" style={{ borderColor: C.line, background: "#FBFAF7" }}>
                    <div className="text-xs"><b>{pre.count}</b> will receive it{pre.noEmail.length ? <> · <b style={{ color: C.red }}>{pre.noEmail.length}</b> have no e-mail on the record</> : null}</div>
                    {pre.missing.length > 0 && <div className="text-xs mt-1" style={{ color: "#8A5B00" }}>These variables come out blank for somebody: {pre.missing.join(", ")}</div>}
                    {pre.sample[0] && (
                      <div className="mt-2 rounded bg-white p-2" style={{ border: `1px solid ${C.line}` }}>
                        <div className="text-xs" style={{ color: C.faint }}>as {pre.sample[0].name} will see it — {pre.sample[0].to}</div>
                        <div className="text-sm font-bold mt-1">{pre.sample[0].subject}</div>
                        <div className="text-sm" style={{ maxHeight: 220, overflow: "auto" }} dangerouslySetInnerHTML={{ __html: pre.sample[0].html }} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded border p-2" style={{ borderColor: C.line, background: "#FBFAF7", alignSelf: "start", position: "sticky", top: 60 }}>
                <div className="text-xs font-bold mb-1" style={{ color: C.faint }}>VARIABLES — click to drop in</div>
                <div style={{ maxHeight: 420, overflowY: "auto" }}>
                  {boot.variables.map((v) => (
                    <button key={v.key} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(v.key)}
                      className="block w-full text-left rounded px-1.5 py-0.5 mb-0.5" style={{ background: "#fff", border: `1px solid ${C.line}`, fontSize: 11 }} title={v.label}>
                      <span style={{ fontFamily: "ui-monospace, monospace" }}>{`{{${v.key}}}`}</span>
                    </button>
                  ))}
                </div>
                <div className="text-xs mt-2" style={{ color: C.faint, lineHeight: 1.5 }}>Filled per person from their record. A variable with nothing behind it is left blank, and the check names it.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
