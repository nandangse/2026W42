"use client";
/**
 * Masters → Standard Texts.
 *
 * The paragraphs that go into letters, kept in one place. Editing here
 * changes the NEXT letter and never one already sent — every offer keeps its
 * own copy of the words it used, so a letter in somebody's inbox and our
 * record of it cannot drift apart.
 *
 * "keep a provision to add template. Have a list of variables in the side"
 * (Dr Raghu, 4 Sep 2026): new templates are added here — a paragraph for
 * letters, or an e-mail with a subject that the record's Communication tab
 * offers when writing to a person — and the variables the record can fill
 * ({{name}}, {{designation}}, {{doj}} …) sit down the right-hand side. Click
 * one to copy it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { TEMPLATE_VARS } from "@/lib/hrms-template";
import RichText, { RichTextView } from "./RichText";
import { Pane } from "./Pane";
import { C } from "./RecordFields";

interface Text { key: string; title: string; body: string; note: string | null; version: number; updated_by: string | null; updated_at: string | null; kind?: string | null; subject?: string | null }

/** The covering note is plain text — it becomes the body of a mail, not a page. E-mail templates are the same. */
const PLAIN = new Set(["offer_covering_letter"]);
const BUILT_IN = new Set(["offer_covering_letter", "terms_of_employment"]);
const isPlain = (t: Text) => PLAIN.has(t.key) || t.kind === "email";

const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);

export default function StandardTexts({ who }: { who: string }) {
  const [rows, setRows] = useState<Text[] | null>(null);
  const [needs, setNeeds] = useState(false);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [nf, setNf] = useState({ title: "", kind: "email", subject: "", note: "" });
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    try { const j = await api.get("/api/hrms/texts"); setRows(j.texts || []); setNeeds(!!j.needsMigration); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (t: Text, body: string, subject?: string) => {
    try {
      await api.post("/api/hrms/texts", { key: t.key, title: t.title, body, note: t.note, ...(subject !== undefined ? { subject } : {}) });
      setMsg(`${t.title} saved ✓`); await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  const add = async () => {
    const title = nf.title.trim();
    if (!title) { setMsg("Give the template a title."); return; }
    const key = slug(title);
    if (!key) { setMsg("The title needs a letter or two."); return; }
    if (rows?.some((r) => r.key === key)) { setMsg(`"${title}" is already here — open it below.`); return; }
    try {
      const body = nf.kind === "email" ? `Dear {{first_name}},\n\n\n\nRaghu` : `<p>Dear {{name}},</p><p></p>`;
      await api.post("/api/hrms/texts", { key, title, body, note: nf.note.trim() || null, kind: nf.kind, subject: nf.kind === "email" ? nf.subject.trim() : null });
      setMsg(`${title} added ✓ — write it below.`); setAdding(false); setNf({ title: "", kind: "email", subject: "", note: "" });
      await load(); setOpen(key);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  const remove = async (t: Text) => {
    if (!window.confirm(`Remove the template "${t.title}"?\n\nMessages already sent with it keep their own copy.`)) return;
    try { await api.del(`/api/hrms/texts?key=${encodeURIComponent(t.key)}`); setMsg(`${t.title} removed`); if (open === t.key) setOpen(null); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  const copy = async (k: string) => {
    const v = `{{${k}}}`;
    try { await navigator.clipboard.writeText(v); setCopied(k); setTimeout(() => setCopied(""), 1200); }
    catch { window.prompt("Copy this", v); }
  };

  const groups = useMemo(() => {
    const m = new Map<string, typeof TEMPLATE_VARS>();
    for (const v of TEMPLATE_VARS) { if (!m.has(v.group)) m.set(v.group, []); m.get(v.group)!.push(v); }
    return [...m.entries()];
  }, []);

  return (
    <Pane title="Masters — Standard Texts" who={who} print
      blurb="The words that go into every letter and mail, written once. Each letter keeps the copy it used, so editing here changes the next one and never one already sent."
      tools={<button onClick={() => setAdding((v) => !v)} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: C.orange, color: "#fff" }}>{adding ? "✕ Cancel" : "+ Add template"}</button>}>
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>}
      {needs && <div className="rounded p-2 mb-2" style={{ background: "#FFF7E6", border: "1px solid #F5D9A8", fontSize: 12.5, color: "#8A5B00" }}>Run migration 0068 — the standard texts have nowhere to live yet.</div>}

      <div className="flex gap-3 items-start" style={{ flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 520px", minWidth: 0 }}>
          {adding && (
            <div className="bg-white rounded-lg border p-3 mb-3" style={{ borderColor: C.orange }}>
              <div className="font-bold text-sm mb-2">New template</div>
              <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 160px" }}>
                <label className="text-xs" style={{ color: C.dim }}>Title
                  <input value={nf.title} onChange={(e) => setNf({ ...nf, title: e.target.value })} placeholder="e.g. IDP reminder" className="w-full rounded px-2 py-1.5 mt-0.5" style={{ border: `1px solid ${C.line}`, fontSize: 13 }} />
                </label>
                <label className="text-xs" style={{ color: C.dim }}>Kind
                  <select value={nf.kind} onChange={(e) => setNf({ ...nf, kind: e.target.value })} className="w-full rounded px-2 py-1.5 mt-0.5 bg-white" style={{ border: `1px solid ${C.line}`, fontSize: 13 }}>
                    <option value="email">E-mail (plain, with a subject)</option>
                    <option value="text">Letter paragraph (rich text)</option>
                  </select>
                </label>
                {nf.kind === "email" && (
                  <label className="text-xs" style={{ color: C.dim, gridColumn: "1 / -1" }}>Subject
                    <input value={nf.subject} onChange={(e) => setNf({ ...nf, subject: e.target.value })} placeholder="e.g. IDP — last reminder, {{first_name}}" className="w-full rounded px-2 py-1.5 mt-0.5" style={{ border: `1px solid ${C.line}`, fontSize: 13 }} />
                  </label>
                )}
                <label className="text-xs" style={{ color: C.dim, gridColumn: "1 / -1" }}>Note — when is this one used?
                  <input value={nf.note} onChange={(e) => setNf({ ...nf, note: e.target.value })} className="w-full rounded px-2 py-1.5 mt-0.5" style={{ border: `1px solid ${C.line}`, fontSize: 13 }} />
                </label>
              </div>
              <div className="flex justify-end mt-2">
                <button onClick={add} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: C.green, color: "#fff" }}>Create</button>
              </div>
            </div>
          )}

          {rows === null && <div className="text-sm py-6 text-center" style={{ color: C.faint }}>loading…</div>}
          {rows?.map((t) => (
            <div key={t.key} className="bg-white rounded-lg border mb-3" style={{ borderColor: C.line }}>
              <button onClick={() => setOpen(open === t.key ? null : t.key)} className="w-full text-left px-3 py-2.5">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-bold" style={{ fontSize: 14 }}>{t.title}</span>
                  <span className="rounded px-1.5 py-0.5" style={{ fontSize: 10, background: "#F4F2EC", color: C.faint }}>v{t.version}</span>
                  <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 10, background: t.kind === "email" ? "#DCE8F5" : "#FFF3E8", color: t.kind === "email" ? "#1B3A5C" : C.orange }}>{t.kind === "email" ? "✉ e-mail" : "¶ letter text"}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: C.faint }}>
                    {t.updated_by ? `${String(t.updated_by).split("·")[0].trim()} · ${t.updated_at ? fmtFull(String(t.updated_at)) : ""}` : "not edited yet"}
                  </span>
                  <span style={{ color: C.faint, fontSize: 12 }}>{open === t.key ? "▲" : "▼"}</span>
                </div>
                {t.note && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>{t.note}</div>}
              </button>
              {open === t.key && (
                <div className="px-3 pb-3">
                  {isPlain(t)
                    ? <PlainEditor value={t.body} subject={t.kind === "email" ? (t.subject || "") : undefined} onSave={(v, sub) => save(t, v, sub)} />
                    : <RichText value={t.body} rows={18} onSave={(html) => save(t, html)} placeholder="The standard text…" />}
                  {!BUILT_IN.has(t.key) && (
                    <div className="flex justify-end mt-2">
                      <button onClick={() => remove(t)} className="text-xs font-semibold rounded px-2 py-1" style={{ background: "#FBEDEA", color: C.red }}>✕ Remove template</button>
                    </div>
                  )}
                </div>
              )}
              {open !== t.key && (
                <div className="px-3 pb-3" style={{ maxHeight: 92, overflow: "hidden", position: "relative", color: C.dim, fontSize: 12.5 }}>
                  {t.kind === "email" && t.subject && <div className="font-semibold mb-1" style={{ color: C.ink }}>Subject: {t.subject}</div>}
                  {isPlain(t)
                    ? <div style={{ whiteSpace: "pre-wrap" }}>{t.body.slice(0, 300)}</div>
                    : <RichTextView html={t.body.slice(0, 900)} />}
                  <div style={{ position: "absolute", inset: "auto 0 0 0", height: 34, background: "linear-gradient(transparent,#fff)" }} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── the variables, down the side ── */}
        <div className="bg-white rounded-lg border p-3" style={{ borderColor: C.line, flex: "0 0 250px", position: "sticky", top: 8, maxHeight: "calc(100vh - 120px)", overflowY: "auto" }}>
          <div className="font-bold text-sm">Variables</div>
          <div className="text-xs mb-2" style={{ color: C.faint, lineHeight: 1.5 }}>Filled from the person&apos;s record when the letter or mail goes. Click to copy.</div>
          {groups.map(([g, vars]) => (
            <div key={g} className="mb-2">
              <div className="text-xs font-bold" style={{ color: C.faint, letterSpacing: 0.5 }}>{g.toUpperCase()}</div>
              {vars.map((v) => (
                <button key={v.key} onClick={() => copy(v.key)} className="block w-full text-left rounded px-1.5 py-0.5"
                  style={{ fontSize: 12, background: copied === v.key ? "#E6F4EA" : "transparent", color: C.ink }} title={`{{${v.key}}} → ${v.label}`}>
                  <code style={{ color: "#1B3A5C", fontSize: 11.5 }}>{`{{${v.key}}}`}</code> <span style={{ color: C.faint }}>{v.label}</span>{copied === v.key && <span style={{ color: C.green }}> copied</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Pane>
  );
}

function PlainEditor({ value, subject, onSave }: { value: string; subject?: string; onSave: (v: string, subject?: string) => void }) {
  const [v, setV] = useState(value);
  const [sub, setSub] = useState(subject || "");
  useEffect(() => { setV(value); }, [value]);
  useEffect(() => { setSub(subject || ""); }, [subject]);
  const dirty = v !== value || (subject !== undefined && sub !== subject);
  return (
    <>
      {subject !== undefined && (
        <input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="Subject — variables work here too" className="w-full rounded px-2 py-1.5 mb-1 font-semibold" style={{ border: `1px solid ${C.line}`, fontSize: 13 }} />
      )}
      <textarea value={v} rows={16} onChange={(e) => setV(e.target.value)}
        className="w-full rounded px-2 py-1.5" style={{ border: `1px solid ${C.line}`, fontSize: 13, lineHeight: 1.7 }} />
      <div className="flex items-center gap-2 mt-1">
        <button onClick={() => onSave(v, subject !== undefined ? sub : undefined)} disabled={!dirty} className="rounded px-3 py-1.5 font-bold"
          style={{ background: !dirty ? "#E2E0DA" : C.green, color: !dirty ? "#8A94A0" : "#fff", fontSize: 12.5 }}>Save</button>
        <span style={{ fontSize: 11.5, color: C.faint }}>{"{{name}}"}, {"{{first_name}}"} and the variables on the right are filled in when the mail goes out. &lt;name&gt; still works.</span>
      </div>
    </>
  );
}
