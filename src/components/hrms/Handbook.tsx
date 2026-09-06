"use client";
/**
 * The Employee Handbook, published (Dr Raghu, 4 Sep 2026): "make it go
 * under the employee handbook policy and make it readable and publishable
 * for people. They can, of course, ask questions there too."
 *
 * An index down the side, one section at a time in the middle, each with a
 * one-line "what this means for you", the words, the questions people have
 * asked under it with HR's answers, and Ask HR about this. HRMS edits in
 * place, answers, and chooses which answers everybody sees. The reader
 * acknowledges the edition at the foot.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { swallow } from "@/lib/swallow";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import RichText, { RichTextView } from "./RichText";
import { Pane } from "./Pane";
import { C } from "./RecordFields";

interface Section { slug: string; ord: number; title: string; summary: string | null; body: string; audience: string; published: boolean; version: number; updated_by: string | null; updated_at: string; translated?: boolean; translated_at?: string | null; en_title?: string }
interface Q { id: string; subject: string; question: string; answer: string | null; status: string; published: boolean; raised_by: string | null; raised_at: string; answered_by: string | null; answered_at: string | null; section: string | null; mine: boolean }
interface State { sections: Section[]; questions: Q[]; hr: boolean; edition: string; acknowledged: string | null; ackCount: number; needsMigration?: boolean; lang?: string; pending?: number; me: { email: string; name: string | null } }

const who = (s: string | null) => (s ? String(s).split("·")[0].trim() : "HR");
const CSS = `
.hb h4{font-size:14px;font-weight:700;margin:14px 0 6px;color:#16232F}
.hb p{margin:6px 0;line-height:1.65;font-size:13.5px}
.hb ul,.hb ol{margin:6px 0 6px 20px;line-height:1.6;font-size:13.5px}
.hb li{margin:3px 0}
.hb table{border-collapse:collapse;margin:8px 0;font-size:12.5px;width:100%}
.hb th,.hb td{border:1px solid #E2E0DA;padding:5px 8px;text-align:left;vertical-align:top}
.hb th{background:#F4F2EC;font-weight:700}
.hb .check{background:#FFF7E6;border-left:3px solid #F5B32B;padding:6px 10px;color:#8A5B00;font-size:12.5px}
`;

export type HandbookLang = "en" | "hi" | "mr";
const LANG_NAMES: Record<HandbookLang, string> = { en: "English", hi: "हिन्दी", mr: "मराठी" };

export default function Handbook({ who: me, standalone, defaultLang = "en" }: { who: string; standalone?: boolean; defaultLang?: HandbookLang }) {
  const [lang, setLang] = useState<HandbookLang>(defaultLang);
  const [st, setSt] = useState<State | null>(null);
  const [msg, setMsg] = useState("");
  const [cur, setCur] = useState<string>("");
  const [edit, setEdit] = useState(false);
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try { const j = await api.get(`/api/hrms/handbook${lang !== "en" ? `?lang=${lang}` : ""}`); setSt(j); if (!cur && j.sections?.[0]) setCur(j.sections[0].slug); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // TRANSLATE (Dr Raghu, 5 Sep 2026): Genie renders the pending sections a
  // few at a time until none are left; the count on the button is what remains.
  const [translating, setTranslating] = useState<number | null>(null);
  const translateAll = async () => {
    if (lang === "en") return;
    setTranslating(st?.pending ?? 0); setMsg("");
    try {
      for (let guard = 0; guard < 12; guard++) {
        const j = await api.post("/api/hrms/handbook", { action: "translate", lang, limit: 3 });
        setTranslating(Number(j.pending) || 0);
        if (!j.pending) break;
      }
      setMsg(`${LANG_NAMES[lang]} ready ✓`);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setTranslating(null); await load(); }
  };
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!standalone) return; try { const h = window.location.hash.replace("#", ""); if (h) setCur(h); } catch (e) { swallow("hrms/Handbook", e); /* */ } }, [standalone]);
  const goTo = (slug: string) => { setCur(slug); setEdit(false); if (standalone) { try { window.location.hash = slug; } catch (e) { swallow("hrms/Handbook", e); /* */ } } try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { swallow("hrms/Handbook", e); /* */ } };

  const act = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true); setMsg("");
    try { await api.post("/api/hrms/handbook", body); setMsg(`${ok} ✓`); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const sec = st?.sections.find((s) => s.slug === cur) || st?.sections[0] || null;
  const idx = sec && st ? st.sections.findIndex((s) => s.slug === sec.slug) : -1;
  const prev = idx > 0 && st ? st.sections[idx - 1] : null;
  const next = st && idx >= 0 && idx < st.sections.length - 1 ? st.sections[idx + 1] : null;
  const Nav = () => (
    <div className="flex items-center gap-2 px-5 py-2" style={{ borderTop: `1px solid ${C.line}`, background: "#fff" }}>
      {prev ? <button onClick={() => goTo(prev.slug)} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#F4F2EC", color: "#1B3A5C" }}>← {prev.ord}. {prev.title}</button> : <span />}
      <span style={{ flex: 1 }} />
      {next ? <button onClick={() => goTo(next.slug)} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#16232F", color: "#fff" }}>{next.ord}. {next.title} →</button> : <span className="text-xs" style={{ color: C.faint }}>end of the handbook</span>}
    </div>
  );
  const qs = useMemo(() => (st?.questions || []).filter((x) => x.section === sec?.slug), [st, sec]);
  const hits = useMemo(() => {
    const n = q.trim().toLowerCase(); if (!n || !st) return [];
    return st.sections.filter((s) => `${s.title} ${s.summary || ""} ${s.body}`.toLowerCase().includes(n)).map((s) => s.slug);
  }, [q, st]);
  const openN = (st?.questions || []).filter((x) => x.status === "Open").length;

  const body = (
    <>
      <style>{CSS}</style>
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>}
      {st?.needsMigration && <div className="rounded p-2 mb-2" style={{ background: "#FFF7E6", border: "1px solid #F5D9A8", fontSize: 12.5, color: "#8A5B00" }}>Run migration 0134 — the handbook has nowhere to live yet.</div>}
      <div className="flex gap-3 items-start" style={{ flexWrap: "wrap" }}>
        {/* ── index ── */}
        <div className="bg-white rounded-lg border p-2" style={{ borderColor: C.line, flex: "0 0 260px", position: "sticky", top: 8, maxHeight: "calc(100vh - 110px)", overflowY: "auto" }}>
          <div className="px-2 pt-1 pb-2">
            <div className="font-bold" style={{ fontSize: 14 }}>Employee Handbook</div>
            <div className="text-xs" style={{ color: C.faint }}>Edition {st?.edition || "…"}</div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs" style={{ color: C.faint }}>🌐</span>
              <select value={lang} onChange={(e) => { setLang(e.target.value as HandbookLang); setEdit(false); }} className="text-xs rounded px-2 py-1 bg-white flex-1" style={{ border: `1px solid ${C.line}` }} title="Read the handbook in English, Hindi or Marathi">
                {(Object.keys(LANG_NAMES) as HandbookLang[]).map((k) => <option key={k} value={k}>{LANG_NAMES[k]}</option>)}
              </select>
            </div>
            {lang !== "en" && (
              <div className="text-xs mt-1.5" style={{ color: C.faint, lineHeight: 1.5 }}>
                {lang === "hi" ? "Genie ने अंग्रेज़ी से अनुवाद किया है; मतभेद होने पर अंग्रेज़ी मान्य है।" : "Genie ने इंग्रजीतून भाषांतर केले आहे; फरक असल्यास इंग्रजी ग्राह्य धरली जाईल."}
                {st?.pending ? ` · ${st.pending} section${st.pending === 1 ? "" : "s"} still in English` : ""}
              </div>
            )}
            {st?.hr && lang !== "en" && (st.pending || 0) > 0 && (
              <button onClick={translateAll} disabled={busy || translating != null} className="mt-1.5 w-full text-xs font-bold rounded px-2 py-1.5" style={{ background: C.orange, color: "#fff", opacity: translating != null ? 0.7 : 1 }}>
                {translating != null ? `Translating… ${translating} left` : `✨ Translate ${st.pending} section${st.pending === 1 ? "" : "s"} to ${LANG_NAMES[lang]}`}
              </button>
            )}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search the handbook" className="w-full rounded px-2 py-1 mt-2 text-xs" style={{ border: `1px solid ${C.line}` }} />
          </div>
          {(st?.sections || []).map((s) => {
            const n = (st?.questions || []).filter((x) => x.section === s.slug && (x.published || x.mine)).length;
            const on = sec?.slug === s.slug, hit = hits.includes(s.slug);
            return (
              <button key={s.slug} onClick={() => goTo(s.slug)} className="block w-full text-left rounded px-2 py-1.5 text-xs"
                style={{ background: on ? "#16232F" : hit ? "#FFF3E8" : "transparent", color: on ? "#fff" : C.ink, fontWeight: on || hit ? 700 : 500, opacity: s.published ? 1 : 0.55 }}>
                <span style={{ color: on ? "#8FA1B3" : C.faint, marginRight: 6 }}>{s.ord}</span>{s.title}{!s.published && <span className="ml-1" style={{ fontSize: 9, color: on ? "#F5B32B" : "#8A5B00" }}>draft</span>}{n > 0 && <span className="ml-1 rounded px-1" style={{ fontSize: 9, background: on ? "rgba(255,255,255,0.15)" : "#F4F2EC", color: on ? "#fff" : C.faint }}>{n} Q</span>}
              </button>
            );
          })}
          {st?.hr && <button onClick={() => { const slug = window.prompt("A key for the new section, letters and dashes (e.g. khalapur-move):"); if (slug) act({ action: "save", slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"), title: "New section", summary: "", body: "<p></p>", ord: (st?.sections.length || 0) + 1 }, "Section added"); }} className="block w-full text-left rounded px-2 py-1.5 text-xs font-bold mt-1" style={{ color: C.orange }}>+ Add a section</button>}
          {st?.hr && openN > 0 && <div className="px-2 pt-2 text-xs" style={{ color: "#8A5B00" }}>{openN} question{openN === 1 ? "" : "s"} waiting for HR</div>}
        </div>

        {/* ── the section ── */}
        <div style={{ flex: "1 1 560px", minWidth: 0 }}>
          {sec && (
            <div className="bg-white rounded-lg border" style={{ borderColor: C.line }}>
              <div className="px-5 pt-4 pb-3" style={{ borderBottom: `1px solid ${C.line}` }}>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <div className="text-xs font-bold" style={{ color: C.faint }}>SECTION {sec.ord} OF {st?.sections.length}</div>
                  {prev && <button onClick={() => goTo(prev.slug)} className="text-xs font-semibold" style={{ color: "#1B3A5C" }} title={prev.title}>← back</button>}
                  {next && <button onClick={() => goTo(next.slug)} className="text-xs font-semibold" style={{ color: "#1B3A5C" }} title={next.title}>next →</button>}
                  <span style={{ flex: 1 }} />
                  <span className="text-xs" style={{ color: C.faint }}>v{sec.version}{sec.updated_by && sec.updated_by !== "system" ? ` · ${who(sec.updated_by)} · ${fmtFull(String(sec.updated_at))}` : ""}</span>
                  {st?.hr && lang !== "en" && <span className="text-xs" style={{ color: C.faint }}>Edit in English — the translation follows</span>}
                  {st?.hr && lang === "en" && <button onClick={() => setEdit((v) => !v)} className="text-xs font-bold rounded px-2.5 py-1" style={{ background: edit ? "#fff" : C.orange, color: edit ? C.dim : "#fff", border: `1px solid ${edit ? C.line : C.orange}` }}>{edit ? "✕ Close editor" : "✎ Edit"}</button>}
                </div>
                {!edit ? (
                  <>
                    <h2 className="font-bold" style={{ fontSize: 22, color: "#16232F", marginTop: 4 }}>{sec.title}</h2>
                    {sec.summary && <div className="rounded p-2.5 mt-2" style={{ background: "#FFF3E8", borderLeft: `3px solid ${C.orange}`, fontSize: 13.5, color: "#16232F", lineHeight: 1.5 }}><b>What this means for you.</b> {sec.summary}</div>}
                  </>
                ) : (
                  <Editor sec={sec} busy={busy} onSave={(patch) => act({ action: "save", slug: sec.slug, ...patch }, `${sec.title} saved`)} onRemove={() => { if (window.confirm(`Remove the section "${sec.title}"?`)) { act({ action: "remove", slug: sec.slug }, "Section removed"); setCur(""); setEdit(false); } }} />
                )}
              </div>
              {!edit && <div className="hb px-5 py-3"><RichTextView html={sec.body} /></div>}
              {!edit && <Nav />}

              {/* ── questions under the section ── */}
              <div className="px-5 py-4" style={{ background: "#FBFAF7", borderTop: `1px solid ${C.line}` }}>
                <div className="font-bold text-sm mb-1">Questions on this section</div>
                {!qs.length && <div className="text-xs mb-2" style={{ color: C.faint }}>Nobody has asked yet. Yours would be the first.</div>}
                {qs.map((x) => <QCard key={x.id} x={x} hr={!!st?.hr} busy={busy} onAct={act} />)}
                <div className="mt-3">
                  <div className="text-xs font-bold" style={{ color: C.dim }}>Ask HR about this · एचआर से पूछें</div>
                  <textarea value={ask} rows={3} onChange={(e) => setAsk(e.target.value)} placeholder="Write your question in any language. HR answers you here, and may publish the answer for everyone." className="w-full rounded px-2 py-1.5 mt-1" style={{ border: `1px solid ${C.line}`, fontSize: 13 }} />
                  <div className="flex justify-end mt-1"><button onClick={async () => { await act({ action: "ask", section: sec.slug, question: ask }, "Sent to HR"); setAsk(""); }} disabled={busy || !ask.trim()} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#1B3A5C", color: "#fff", opacity: ask.trim() ? 1 : 0.5 }}>Ask HR</button></div>
                </div>
              </div>
            </div>
          )}

          {/* ── acknowledgement ── */}
          <div className="bg-white rounded-lg border p-4 mt-3" style={{ borderColor: C.line }}>
            {st?.acknowledged
              ? <div className="text-sm" style={{ color: C.green }}>✓ You acknowledged edition {st.edition} on {fmtFull(String(st.acknowledged))}.</div>
              : (
                <div className="flex items-center gap-3 flex-wrap">
                  <div style={{ flex: 1, fontSize: 13, color: C.dim }}>I have read and understood the Employee Handbook, edition {st?.edition}, and agree to abide by it.</div>
                  <button onClick={() => act({ action: "acknowledge" }, "Acknowledged")} disabled={busy} className="text-xs font-bold rounded px-4 py-2" style={{ background: C.green, color: "#fff" }}>✓ I acknowledge</button>
                </div>
              )}
            {st?.hr && <div className="text-xs mt-2" style={{ color: C.faint }}>{st.ackCount} acknowledgement{st.ackCount === 1 ? "" : "s"} of this edition so far.</div>}
          </div>
        </div>
      </div>
    </>
  );

  if (standalone) return <div className="p-4" style={{ maxWidth: 1100, margin: "0 auto" }}>{body}</div>;
  return (
    <Pane title="Employee Handbook" who={me} print blurb="Readable, versioned per section, acknowledged per edition. Every section takes questions; HR answers, and publishes the answers everybody should have.">
      {body}
    </Pane>
  );
}

function QCard({ x, hr, busy, onAct }: { x: Q; hr: boolean; busy: boolean; onAct: (b: Record<string, unknown>, ok: string) => Promise<void> }) {
  const [ans, setAns] = useState(x.answer || "");
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded border bg-white mb-2" style={{ borderColor: C.line, borderLeft: `3px solid ${x.status === "Open" ? "#E8600A" : "#0D7A3F"}` }}>
      <button onClick={() => setOpen((v) => !v)} className="w-full text-left px-3 py-2 text-xs flex gap-2 items-baseline flex-wrap">
        <span className="font-semibold" style={{ flex: 1, color: C.ink }}>{x.question.length > 140 && !open ? x.question.slice(0, 140) + "…" : x.question}</span>
        {x.mine && <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 9, background: "#DCE8F5", color: "#1B3A5C" }}>MINE</span>}
        {x.published && <span className="rounded px-1.5 py-0.5 font-bold" style={{ fontSize: 9, background: "#E6F4EA", color: C.green }}>PUBLISHED</span>}
        <span style={{ color: C.faint }}>{hr || x.mine ? who(x.raised_by) : "a colleague"} · {fmtFull(String(x.raised_at))}</span>
      </button>
      {(open || x.answer) && (
        <div className="px-3 pb-2">
          {x.answer ? <div className="rounded p-2" style={{ background: "#E6F4EA", fontSize: 13, lineHeight: 1.55 }}><div className="font-bold" style={{ fontSize: 10.5, color: C.green }}>HR · {who(x.answered_by)} · {x.answered_at ? fmtFull(String(x.answered_at)) : ""}</div>{x.answer}</div>
            : <div className="text-xs" style={{ color: "#8A5B00" }}>Waiting for HR.</div>}
          {hr && (
            <div className="mt-2">
              {!x.answer && <textarea value={ans} rows={3} onChange={(e) => setAns(e.target.value)} placeholder="HR's answer" className="w-full rounded px-2 py-1.5" style={{ border: `1px solid ${C.line}`, fontSize: 13 }} />}
              <div className="flex gap-2 justify-end mt-1 flex-wrap">
                {!x.answer && <button onClick={() => onAct({ action: "answer", id: x.id, answer: ans, publish: false }, "Answered")} disabled={busy || !ans.trim()} className="text-xs font-semibold rounded border px-3 py-1 bg-white" style={{ borderColor: C.line, color: "#1B3A5C" }}>Answer privately</button>}
                {!x.answer && <button onClick={() => onAct({ action: "answer", id: x.id, answer: ans, publish: true }, "Answered and published")} disabled={busy || !ans.trim()} className="text-xs font-bold rounded px-3 py-1" style={{ background: C.green, color: "#fff" }}>Answer & publish</button>}
                {x.answer && (x.published
                  ? <button onClick={() => onAct({ action: "unpublish", id: x.id }, "Unpublished")} disabled={busy} className="text-xs font-semibold rounded border px-3 py-1 bg-white" style={{ borderColor: C.line, color: C.dim }}>Unpublish</button>
                  : <button onClick={() => onAct({ action: "publish", id: x.id }, "Published for everyone")} disabled={busy} className="text-xs font-bold rounded px-3 py-1" style={{ background: C.green, color: "#fff" }}>Publish for everyone</button>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Editor({ sec, busy, onSave, onRemove }: { sec: Section; busy: boolean; onSave: (patch: Record<string, unknown>) => void; onRemove: () => void }) {
  const [title, setTitle] = useState(sec.title);
  const [summary, setSummary] = useState(sec.summary || "");
  const [ord, setOrd] = useState(String(sec.ord));
  const [published, setPublished] = useState(sec.published);
  useEffect(() => { setTitle(sec.title); setSummary(sec.summary || ""); setOrd(String(sec.ord)); setPublished(sec.published); }, [sec]);
  return (
    <div className="mt-2">
      <div className="grid gap-2" style={{ gridTemplateColumns: "60px 1fr" }}>
        <label className="text-xs" style={{ color: C.dim }}>No.<input value={ord} onChange={(e) => setOrd(e.target.value)} className="w-full rounded px-2 py-1.5 mt-0.5" style={{ border: `1px solid ${C.line}`, fontSize: 13 }} /></label>
        <label className="text-xs" style={{ color: C.dim }}>Title<input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded px-2 py-1.5 mt-0.5 font-bold" style={{ border: `1px solid ${C.line}`, fontSize: 15 }} /></label>
      </div>
      <label className="text-xs block mt-2" style={{ color: C.dim }}>What this means for you — one line<textarea value={summary} rows={2} onChange={(e) => setSummary(e.target.value)} className="w-full rounded px-2 py-1.5 mt-0.5" style={{ border: `1px solid ${C.line}`, fontSize: 13 }} /></label>
      <div className="mt-2 hb"><RichText value={sec.body} rows={24} onSave={(html) => onSave({ title, summary, ord: Number(ord) || sec.ord, published, body: html })} placeholder="The section…" /></div>
      <div className="flex items-center gap-3 mt-2 flex-wrap text-xs">
        <label className="flex items-center gap-1" style={{ cursor: "pointer" }}><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Published (visible to everyone)</label>
        <button onClick={() => onSave({ title, summary, ord: Number(ord) || sec.ord, published })} disabled={busy} className="font-bold rounded px-3 py-1.5" style={{ background: "#1B3A5C", color: "#fff" }}>Save title, summary and order</button>
        <span style={{ flex: 1 }} />
        <button onClick={onRemove} disabled={busy} className="font-semibold rounded px-2 py-1" style={{ background: "#FBEDEA", color: C.red }}>✕ Remove section</button>
      </div>
      <div className="text-xs mt-1" style={{ color: C.faint }}>The words save from the editor&apos;s own Save; the title, summary, number and published tick from the button. Every save bumps this section&apos;s version. Paragraphs marked [CHECK] are the points that need Dr Raghu&apos;s word before the edition is issued.</div>
    </div>
  );
}
