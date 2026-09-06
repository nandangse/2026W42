"use client";
// split out of PlanningSuite.tsx (Genie 5.0.1.1) — one file per tab, loaded when opened
import React, { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";

import { fmtFull, whoTag } from "@/lib/schedule";

// ============================ Consult Raghu ============================

/**
 * Ask a question, get an answer grounded in today's board.
 *
 * The point is not that it is a chat window. It is that the live figures go
 * with every question, so the answer names job numbers instead of offering
 * advice — "chase 2114 and 2560" rather than "follow up on overdue jobs".
 *
 * Deliberately not persisted. A consultation is about the board as it stands
 * this morning; an answer kept for three weeks is an answer about a board that
 * no longer exists, and somebody would quote it.
 */
export function ConsultRaghu() {
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<{ q: string; a: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [started, setStarted] = useState(false);

  const SUGGESTIONS = [
    "What should we finish this week to move the number most?",
    "Which jobs are stuck and who do I ring about each one?",
    "What is the single biggest risk to this month's delivery?",
    "Which escalations are actually the same problem?",
  ];

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true); setErr(""); setQ("");
    try {
      const r = await api.post("/api/consult", { question: text });
      setTurns((t) => [{ q: text, a: String(r.answer || "") }, ...t]);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  // "put the consult Raghu there in large letters. On clicking the start,
  // put some instructions there as to what can be done. and then lets go
  // with the flow" (Dr Raghu, 30 Aug 2026)
  if (!started) {
    return (
      <div className="p-4 flex flex-col items-center" style={{ maxWidth: 900, margin: "0 auto", paddingTop: 56 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/consult-raghu.png" alt="Consult Dr Raghu" style={{ width: 120, height: 120, borderRadius: "50%", objectFit: "cover", border: "4px solid #E8600A", boxShadow: "0 8px 28px rgba(27,45,107,.25)" }} />
        <div className="font-black mt-4" style={{ color: "var(--navy)", fontSize: 46, letterSpacing: 1, lineHeight: 1.1, textAlign: "center" }}>
          CONSULT DR RAGHU
        </div>
        <div className="text-sm mt-2 mb-6" style={{ color: "var(--dim)", textAlign: "center", maxWidth: "56ch", lineHeight: 1.6 }}>
          Sit down with the boss. He has today&apos;s live board in front of him — every job, every date, every escalation.
        </div>
        <button onClick={() => setStarted(true)} className="rounded-lg px-10 py-3 font-black text-white"
          style={{ background: "var(--accent)", fontSize: 20, letterSpacing: 1, boxShadow: "0 4px 16px rgba(232,96,10,.35)" }}>
          START
        </button>
      </div>
    );
  }

  return (
    <div className="p-4" style={{ maxWidth: 900 }}>
      <div className="flex items-center gap-3 mb-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/consult-raghu.png" alt="" style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "2px solid #E8600A" }} />
        <h2 className="font-black" style={{ color: "var(--navy)", fontSize: 28, letterSpacing: 0.5 }}>CONSULT DR RAGHU</h2>
      </div>

      {turns.length === 0 && (
        <div className="rounded-lg border p-3 mb-3" style={{ borderColor: "var(--accent)", background: "#FFFDF9" }}>
          <div className="text-xs font-bold mb-1.5" style={{ color: "var(--navy)" }}>WHAT YOU CAN DO HERE</div>
          <ul className="text-xs" style={{ color: "var(--ink)", lineHeight: 1.7, paddingLeft: 18, listStyle: "disc" }}>
            <li><b>Ask about the work in front of you</b> — every question goes with today&apos;s live board: the jobs, what is late, what is kitted and not moving, and every open escalation.</li>
            <li><b>Get names, not advice</b> — the answer says &ldquo;chase 2114 and 2560&rdquo; rather than &ldquo;follow up on overdue jobs&rdquo;. If the board doesn&apos;t answer the question, it says so instead of inventing a date.</li>
            <li><b>Ask the money questions</b> — what to finish this week to move the number most, the single biggest risk to this month&apos;s delivery, which escalations are really one problem.</li>
            <li><b>Keep asking</b> — each answer stacks below; follow up as many times as the situation needs.</li>
            <li><b>On a deal?</b> His face also sits on every CRM record — Opportunity, Quotation, Company and the rest. Click it there and he consults on that specific deal, attachments and all.</li>
          </ul>
          <div className="rounded p-2.5 mt-2 text-xs" style={{ background: "#FFF3E8", color: "var(--ink)", lineHeight: 1.7, borderLeft: "3px solid #E8600A" }}>
            <b>A word from Dr Raghu:</b> &ldquo;I am giving you my advice through this system, the way I would across the desk — that is the training I am doing here. Use it for decisions. Give it a lot of context. Ask the right questions — then I will be able to help you.&rdquo;
            <div className="mt-1"><b>Disclaimer:</b> use human judgement. Don&apos;t blindly follow the advice.</div>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") ask(q); }}
          placeholder="Ask anything about the board…"
          className="flex-1 px-3 py-2 rounded border text-sm"
          style={{ borderColor: "#D9D6CD" }}
        />
        <button
          onClick={() => ask(q)}
          disabled={busy || !q.trim()}
          className="px-4 py-2 rounded text-sm font-bold text-white"
          style={{ background: busy || !q.trim() ? "#B8B5AC" : "var(--accent)" }}
        >
          {busy ? "thinking…" : "Ask"}
        </button>
      </div>

      {turns.length === 0 && !busy && (
        <div className="flex gap-1.5 flex-wrap mb-3">
          {SUGGESTIONS.map((sug) => (
            <button key={sug} onClick={() => ask(sug)} className="text-xs rounded px-2 py-1 border"
              style={{ borderColor: "var(--line)", color: "var(--dim)", background: "#fff" }}>{sug}</button>
          ))}
        </div>
      )}

      {err && <div className="text-xs font-bold rounded p-2 mb-2" style={{ background: "#FBEDEA", color: "var(--red)" }}>{err}</div>}

      {turns.map((t, i) => (
        <div key={i} className="bg-white rounded-lg border p-3 mb-2" style={{ borderColor: "var(--line)" }}>
          <div className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>{t.q}</div>
          <div className="text-sm" style={{ color: "var(--ink)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{t.a}</div>
        </div>
      ))}
    </div>
  );
}

// ============================ Principles ============================

/**
 * How the company is run — Dr Raghu's thinking, organised.
 *
 * He types it roughly, in whatever order it arrives. Genie gives it a spine:
 * groups, a principle per thought, and a drill-down under each — why it
 * matters, what following it looks like on THIS shop floor, how it usually
 * gets broken, and a question to ask yourself in the moment.
 *
 * BOTH ARE KEPT. The structure is a rendering and can be regenerated; the
 * thinking cannot be recovered from the rendering, so his raw text is stored
 * beside it and shown to him whenever he comes back to add to it.
 *
 * Closed by default. A wall of open text is a page people scroll past — the
 * one-liner is what they read, and the detail is there for the day they want
 * to argue with it.
 */
export interface PrincipleItem {
  title: string;
  one_liner?: string;
  why?: string;
  looks_like?: string[];
  not_this?: string[];
  ask_yourself?: string;
}

export interface PrincipleGroup {
  name: string;
  icon?: string;
  summary?: string;
  principles?: PrincipleItem[];
}

export interface PrincipleDoc {
  id: string;
  version: number;
  raw: string;
  created_at: string;
  structured: { title?: string; intro?: string; groups?: PrincipleGroup[] };
}

export function Principles({ isOwner }: { isOwner: boolean }) {
  const [doc, setDoc] = useState<PrincipleDoc | null>(null);
  const [installed, setInstalled] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    api.get("/api/principles")
      .then((r: { installed?: boolean; doc?: PrincipleDoc | null }) => {
        setInstalled(r.installed !== false);
        setDoc(r.doc ?? null);
      })
      .catch(() => setInstalled(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const organise = async () => {
    if (raw.trim().length < 20) { setMsg("Write a little more — a line or two at least."); return; }
    setBusy(true); setMsg("");
    try {
      await api.post("/api/principles", { raw });
      setWriting(false);
      load();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const S = doc?.structured || {};
  const groups = S.groups || [];
  const total = groups.reduce((n, g) => n + (g.principles?.length || 0), 0);
  // A soft palette per group, so the page reads as sections rather than a list.
  const TONE = [
    { bg: "#FFF3E8", line: "var(--accent)" },
    { bg: "#EAF1F8", line: "var(--blue)" },
    { bg: "#E9F5EE", line: "var(--green)" },
    { bg: "#F5EFFA", line: "#7C3AED" },
    { bg: "#FDF3E3", line: "var(--warn)" },
    { bg: "#E9F4F4", line: "#0D9488" },
  ];

  return (
    <div className="p-4" style={{ maxWidth: 1000, margin: "0 auto" }}>
      {!installed && (
        <div className="text-xs rounded p-2 mb-3" style={{ background: "#FFF7E6", color: "#8A5A00" }}>
          Run migration 0039 — principles have nowhere to save yet.
        </div>
      )}
      {msg && <div className="text-xs font-bold rounded p-2 mb-2" style={{ background: "#FBEDEA", color: "var(--red)" }}>{msg}</div>}

      {/* ---- the hero ---- */}
      <div className="rounded-lg p-5 mb-4" style={{ background: "var(--navy)", color: "#fff" }}>
        <div className="text-xs font-bold" style={{ letterSpacing: 2, color: "var(--amber)" }}>NANDAN GSE</div>
        <h1 className="font-bold" style={{ fontSize: 30, margin: "4px 0 6px" }}>
          {S.title || "Principles"}
        </h1>
        {S.intro ? (
          <p style={{ color: "#9FB0C0", fontSize: 14, lineHeight: 1.6, maxWidth: "60ch", margin: 0 }}>{S.intro}</p>
        ) : (
          <p style={{ color: "#9FB0C0", fontSize: 14, margin: 0 }}>
            {isOwner ? "Write the thinking below and Genie will organise it." : "Not written yet."}
          </p>
        )}
        {total > 0 && (
          <div className="flex gap-4 mt-4 flex-wrap" style={{ fontSize: 12, color: "#8FA1B3" }}>
            <span><b style={{ color: "#fff" }}>{groups.length}</b> themes</span>
            <span><b style={{ color: "#fff" }}>{total}</b> principles</span>
            <span>updated {fmtFull(String(doc?.created_at || ""))}</span>
            <span style={{ opacity: .7 }}>v{doc?.version}</span>
          </div>
        )}
      </div>

      {/* ---- the groups ---- */}
      {groups.map((g, gi) => {
        const tone = TONE[gi % TONE.length];
        return (
          <div key={g.name + gi} className="mb-4">
            <div className="flex items-baseline gap-2 mb-2">
              <span style={{ fontSize: 20 }}>{g.icon || "◆"}</span>
              <h2 className="font-bold" style={{ color: "var(--navy)", fontSize: 18 }}>{g.name}</h2>
              {g.summary && <span className="text-xs" style={{ color: "var(--muted)" }}>{g.summary}</span>}
            </div>

            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))" }}>
              {(g.principles || []).map((p, pi) => {
                const key = `${gi}:${pi}`;
                const isOpen = open === key;
                return (
                  <div
                    key={key}
                    role="button" tabIndex={0} onClick={() => setOpen(isOpen ? null : key)}
                    className="rounded-lg border"
                    style={{
                      borderColor: isOpen ? tone.line : "var(--line)",
                      borderLeft: `4px solid ${tone.line}`,
                      background: isOpen ? tone.bg : "#fff",
                      cursor: "pointer",
                      gridColumn: isOpen ? "1 / -1" : undefined,
                      transition: "background .15s",
                    }}
                  >
                    <div className="p-3">
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <div className="font-bold text-sm" style={{ color: "var(--navy)" }}>{p.title}</div>
                          {p.one_liner && (
                            <div className="text-xs mt-0.5" style={{ color: "var(--dim)", lineHeight: 1.5 }}>{p.one_liner}</div>
                          )}
                        </div>
                        <span style={{ color: tone.line, fontWeight: 700, fontSize: 13 }}>{isOpen ? "−" : "+"}</span>
                      </div>

                      {isOpen && (
                        <div className="mt-3" style={{ borderTop: `1px solid ${tone.line}33`, paddingTop: 10 }}>
                          {p.why && (
                            <p className="text-xs" style={{ color: "var(--ink)", lineHeight: 1.65, margin: "0 0 10px" }}>{p.why}</p>
                          )}
                          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
                            {!!p.looks_like?.length && (
                              <div>
                                <div className="text-xs font-bold mb-1" style={{ color: "var(--green)" }}>WHAT IT LOOKS LIKE</div>
                                {p.looks_like.map((l, i) => (
                                  <div key={i} className="text-xs" style={{ color: "var(--ink)", lineHeight: 1.6 }}>· {l}</div>
                                ))}
                              </div>
                            )}
                            {!!p.not_this?.length && (
                              <div>
                                <div className="text-xs font-bold mb-1" style={{ color: "var(--red)" }}>HOW IT GETS BROKEN</div>
                                {p.not_this.map((l, i) => (
                                  <div key={i} className="text-xs" style={{ color: "var(--ink)", lineHeight: 1.6 }}>· {l}</div>
                                ))}
                              </div>
                            )}
                          </div>
                          {p.ask_yourself && (
                            <div className="rounded mt-3 px-3 py-2 text-xs" style={{ background: "#fff", border: `1px dashed ${tone.line}`, color: "var(--ink)" }}>
                              <b style={{ color: tone.line }}>Ask yourself:</b> {p.ask_yourself}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {groups.length === 0 && installed && !isOwner && (
        <div className="text-sm rounded-lg border p-4" style={{ borderColor: "var(--line)", background: "#fff", color: "var(--muted)" }}>
          Dr Raghu has not written these yet.
        </div>
      )}

      <PrincipleFiles isOwner={isOwner} />

      {/* ---- the owner's door ---- */}
      {isOwner && installed && (
        <div className="mt-5">
          {writing ? (
            <div className="bg-white rounded-lg border p-3" style={{ borderColor: "var(--accent)" }}>
              <div className="font-bold text-sm mb-1">Write the thinking</div>
              <p className="text-xs mb-2" style={{ color: "var(--dim)", lineHeight: 1.6 }}>
                However it arrives — bullets, half sentences, out of order. Genie groups it, gives each thought a
                spine and writes the drill-down. It keeps your words and adds no principle you did not say.
                {doc && " What is below is the last version, so you can add to it rather than start again."}
              </p>
              <textarea
                autoFocus
                rows={14}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder={"e.g.\nNever let a missing number read as zero.\nDecide at the lowest level that has the facts.\nA date once promised is the date we are judged on…"}
                className="w-full text-sm border rounded px-2 py-2"
                style={{ borderColor: "var(--line)", lineHeight: 1.6 }}
              />
              <div className="flex gap-2 mt-2 items-center">
                <button onClick={organise} disabled={busy}
                  className="rounded px-4 py-1.5 text-sm font-bold text-white"
                  style={{ background: busy ? "#B8B5AC" : "var(--accent)" }}>
                  {busy ? "organising…" : "✨ Organise & publish"}
                </button>
                <button onClick={() => setWriting(false)} className="text-xs font-semibold" style={{ color: "var(--muted)" }}>Cancel</button>
                <span className="text-xs ml-auto" style={{ color: "var(--muted)" }}>
                  your text is saved even if the organising fails
                </span>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setRaw(doc?.raw || ""); setWriting(true); }}
              className="rounded px-4 py-2 text-sm font-bold text-white"
              style={{ background: "var(--accent)" }}
            >
              {doc ? "✎ Add to the principles" : "✨ Write the principles"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Documents that sit alongside the principles.
 *
 * Some of the thinking already exists as a document — Breakthrough 2027, a
 * manifesto, a one-pager somebody has to sign. Retyping those into the text
 * box would lose the formatting, the diagrams and the point, so they are
 * attached rather than transcribed.
 *
 * Owner uploads and removes; everybody else opens. The list is shown even when
 * empty for the owner, so the door is visible without hunting for it — and
 * hidden when empty for everyone else, because a heading over nothing reads
 * like something failed to load.
 */
export function PrincipleFiles({ isOwner }: { isOwner: boolean }) {
  interface F { id: string; name: string; note: string; mime: string | null; bytes: number | null; by: string | null; at: string; url: string | null }
  const [files, setFiles] = useState<F[]>([]);
  const [installed, setInstalled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const pick = useRef<HTMLInputElement | null>(null);

  const load = useCallback(() => {
    api.get("/api/principles/files")
      .then((r: { installed?: boolean; files?: F[] }) => { setInstalled(r.installed !== false); setFiles(r.files || []); })
      .catch(() => setInstalled(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const upload = async (f: File | null) => {
    if (!f) return;
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("note", note);
      const r = await fetch("/api/principles/files", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not upload that");
      setNote("");
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
    if (pick.current) pick.current.value = "";
  };

  const remove = async (f: F) => {
    if (!window.confirm(`Remove "${f.name}"?\n\nThe file is deleted, not hidden.`)) return;
    try {
      const r = await fetch(`/api/principles/files?id=${encodeURIComponent(f.id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error || "Could not remove it");
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  const size = (b: number | null) =>
    !b ? "" : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;
  const icon = (m: string | null, n: string) => {
    const t = `${m || ""} ${n}`.toLowerCase();
    if (t.includes("pdf")) return "📕";
    if (/sheet|excel|\.xlsx?|\.csv/.test(t)) return "📊";
    if (/presentation|powerpoint|\.pptx?/.test(t)) return "📽";
    if (/word|\.docx?/.test(t)) return "📄";
    if (/image|\.png|\.jpe?g/.test(t)) return "🖼";
    return "📎";
  };

  if (!installed && !isOwner) return null;
  if (!files.length && !isOwner) return null;

  return (
    <div className="mt-6">
      <h2 className="font-bold" style={{ color: "var(--navy)", fontSize: 18, marginBottom: 2 }}>Documents</h2>
      <p className="text-xs" style={{ color: "var(--muted)", marginBottom: 10 }}>
        The longer form — read them alongside the principles above.
      </p>

      {!installed && (
        <div className="text-xs rounded p-2 mb-2" style={{ background: "#FFF7E6", color: "#8A5A00" }}>
          Run migration 0041 — documents have nowhere to go yet.
        </div>
      )}
      {err && <div className="text-xs font-bold rounded p-2 mb-2" style={{ background: "#FBEDEA", color: "var(--red)" }}>{err}</div>}

      {files.length === 0 && installed && (
        <div className="text-xs rounded-lg border p-3 mb-2" style={{ borderColor: "var(--line)", background: "#fff", color: "var(--muted)" }}>
          Nothing attached yet.
        </div>
      )}

      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))" }}>
        {files.map((f) => (
          <div key={f.id} className="rounded-lg border bg-white p-3 flex gap-3 items-start" style={{ borderColor: "var(--line)" }}>
            <span style={{ fontSize: 22, lineHeight: 1 }}>{icon(f.mime, f.name)}</span>
            <div className="min-w-0 flex-1">
              {f.url ? (
                <a href={f.url} target="_blank" rel="noreferrer" className="font-bold text-sm block truncate"
                   style={{ color: "var(--blue)" }} title={f.name}>{f.name}</a>
              ) : (
                <span className="font-bold text-sm block truncate" style={{ color: "var(--muted)" }}>{f.name}</span>
              )}
              {f.note && <div className="text-xs mt-0.5" style={{ color: "var(--dim)", lineHeight: 1.5 }}>{f.note}</div>}
              <div style={{ fontSize: 10.5, color: "#B8B5AC", marginTop: 3 }}>
                {size(f.bytes)}{f.bytes ? " · " : ""}{whoTag(f.by)} · {fmtFull(String(f.at))}
              </div>
            </div>
            {isOwner && (
              <button onClick={() => remove(f)} className="rounded px-1.5 py-0.5 text-xs font-bold flex-shrink-0"
                      style={{ background: "#FBEDEA", color: "var(--red)" }} title="Remove this document">✕</button>
            )}
          </div>
        ))}
      </div>

      {isOwner && installed && (
        <div className="mt-2 rounded-lg border bg-white p-3" style={{ borderColor: "var(--line)" }}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="One line saying what it is (optional)"
            className="w-full text-xs border rounded px-2 py-1 mb-2"
            style={{ borderColor: "var(--line)" }}
          />
          <input
            ref={pick}
            type="file"
            onChange={(e) => upload(e.target.files?.[0] || null)}
            style={{ display: "none" }}
          />
          <button
            onClick={() => pick.current?.click()}
            disabled={busy}
            className="rounded px-4 py-1.5 text-sm font-bold text-white"
            style={{ background: busy ? "#B8B5AC" : "var(--blue)" }}
          >
            {busy ? "uploading…" : "⬆ Attach a document"}
          </button>
          <span className="text-xs ml-2" style={{ color: "var(--muted)" }}>PDF, Word, slides, a sheet — up to 25 MB</span>
        </div>
      )}
    </div>
  );
}