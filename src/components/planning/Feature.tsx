"use client";
// split out of PlanningSuite.tsx (Genie 5.0.1.1) — one file per tab, loaded when opened
import React, { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";

import { fmtFull, whoTag, diffDays } from "@/lib/schedule";

import { StatCard } from "./Material";
import { TODAY } from "./shared";

// ============================ Feature Requests ============================

export const WANTS: [string, string, string][] = [
  ["must", "Must have", "var(--red)"],
  ["good", "Good to have", "var(--warn)"],
  ["future", "Future potential", "var(--blue)"],
];

export const FR_STATUSES: [string, string, string][] = [
  ["open", "Open", "var(--dim)"],
  ["planned", "Planned", "#7C3AED"],
  ["done", "Done", "var(--green)"],
  ["declined", "Not doing", "var(--muted)"],
];

/**
 * Asking for something in Genie, inside Genie.
 *
 * Requests arrive today as a sentence in a chat or a remark on a call, and the
 * ones not acted on the same day are gone. This gives them somewhere to sit
 * with what was actually meant: the words, a picture of the screen, and how
 * badly it is wanted.
 *
 * HOW BADLY is stated by the person asking, not inferred from how forcefully
 * they asked. Everything sounds urgent in the sentence it is written in;
 * almost nothing is, and the person asking knows which.
 */
export function FeatureRequests({ isOwner }: { isOwner: boolean }) {
  interface F {
    id: string; title: string; body: string; want: string; status: string; note: string;
    by: string | null; at: string; acted_by: string | null; acted_at: string | null;
    files: { id: string; name: string; mime: string | null; url: string | null }[];
  }
  const [items, setItems] = useState<F[]>([]);
  const [installed, setInstalled] = useState(true);
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [title, setTitle] = useState("");
  const [want, setWant] = useState("good");
  const [files, setFiles] = useState<File[]>([]);
  const editor = useRef<HTMLDivElement | null>(null);
  const pick = useRef<HTMLInputElement | null>(null);

  const load = useCallback(() => {
    api.get("/api/feature")
      .then((r: { installed?: boolean; items?: F[] }) => { setInstalled(r.installed !== false); setItems(r.items || []); })
      .catch(() => setInstalled(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const cmd = (c: string) => {
    editor.current?.focus();
    document.execCommand(c);
  };

  const submit = async () => {
    if (title.trim().length < 3) { setErr("Give it a title."); return; }
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("title", title);
      fd.append("body", editor.current?.innerHTML || "");
      fd.append("want", want);
      files.forEach((f) => fd.append("file", f));
      const r = await fetch("/api/feature", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save that");
      setTitle(""); setWant("good"); setFiles([]);
      if (editor.current) editor.current.innerHTML = "";
      setWriting(false);
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const setStatus = async (f: F, status: string) => {
    try {
      await fetch("/api/feature", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: f.id, status, note: f.note }),
      });
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  // The developer's margin: a note editable in place, kept with the request —
  // what was done, what was decided, what to know when it is picked up again.
  const [noteEdit, setNoteEdit] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const saveNote = async (f: F) => {
    try {
      await fetch("/api/feature", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: f.id, status: f.status, note: noteText.trim() }),
      });
      setNoteEdit(null);
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  const shown = items.filter((f) =>
    (filter === "all" || f.want === filter) && (statusFilter === "all" || f.status === statusFilter));
  const count = (k: string) => items.filter((f) => f.want === k && f.status === "open").length;
  // What actually got done, recently — acted_at is stamped when the status moves.
  const doneSince = (days: number) => {
    const cut = new Date(Date.now() - days * 86400000).toISOString();
    return items.filter((f) => f.status === "done" && f.acted_at && f.acted_at >= cut).length;
  };

  return (
    <div className="p-4" style={{ maxWidth: 980 }}>
      <div className="flex items-baseline gap-2 flex-wrap mb-1">
        <h2 className="font-bold text-lg" style={{ color: "var(--navy)" }}>Feature Requests</h2>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          ask for anything in Genie — everyone can raise one and read the rest
        </span>
      </div>

      {!installed && (
        <div className="text-xs rounded p-2 mb-2" style={{ background: "#FFF7E6", color: "#8A5A00" }}>
          Run migration 0045 — requests have nowhere to go yet.
        </div>
      )}
      {err && <div className="text-xs font-bold rounded p-2 mb-2" style={{ background: "#FBEDEA", color: "var(--red)" }}>{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 mb-3">
        {WANTS.map(([k, label, c]) => (
          <StatCard key={k} label={`PENDING · ${label.toUpperCase()}`} value={String(count(k))} sub="still open" color={c} />
        ))}
        <StatCard label="DONE · 7 DAYS" value={String(doneSince(7))} sub="completed this week" color="var(--green)" />
        <StatCard label="DONE · 15 DAYS" value={String(doneSince(15))} sub="completed this fortnight" color="var(--green)" />
        <StatCard label="DONE · 30 DAYS" value={String(doneSince(30))} sub="completed this month" color="var(--green)" />
      </div>

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        {!writing && installed && (
          <button onClick={() => setWriting(true)} className="rounded px-4 py-1.5 text-sm font-bold text-white" style={{ background: "var(--accent)" }}>
            + Raise a request
          </button>
        )}
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          className="px-2 py-1 rounded border text-sm font-semibold" style={{ borderColor: "#D9D6CD" }}>
          <option value="all">Everything</option>
          {WANTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-2 py-1 rounded border text-sm font-semibold" style={{ borderColor: "#D9D6CD" }}>
          <option value="all">Any status</option>
          {FR_STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <span className="text-xs" style={{ color: "var(--muted)" }}>{shown.length} shown</span>
      </div>

      {writing && (
        <div className="bg-white rounded-lg border p-3 mb-3" style={{ borderColor: "var(--accent)" }}>
          <input
            autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="What do you want, in one line?"
            className="w-full text-sm font-bold border rounded px-2 py-1.5 mb-2"
            style={{ borderColor: "var(--line)" }}
          />

          <div className="flex gap-1 mb-1">
            {([["bold", "B"], ["italic", "I"], ["insertUnorderedList", "• list"], ["insertOrderedList", "1. list"]] as const).map(([c, l]) => (
              <button key={c} onMouseDown={(e) => { e.preventDefault(); cmd(c); }}
                className="rounded px-2 py-0.5 text-xs font-bold" style={{ background: "#F4F2EC", color: "var(--ink)" }}>{l}</button>
            ))}
            <span className="text-xs ml-auto" style={{ color: "#B8B5AC" }}>write as much as you like</span>
          </div>
          <div
            ref={editor}
            contentEditable
            suppressContentEditableWarning
            className="w-full text-sm border rounded px-3 py-2"
            style={{ borderColor: "var(--line)", minHeight: 220, lineHeight: 1.6, outline: "none", background: "#fff" }}
          />

          <div className="flex gap-2 items-center flex-wrap mt-2">
            <label className="text-xs font-semibold" style={{ color: "var(--dim)" }}>
              How badly{" "}
              <select value={want} onChange={(e) => setWant(e.target.value)}
                className="text-sm border rounded px-2 py-1 font-semibold"
                style={{ borderColor: "var(--line)", color: WANTS.find(([k]) => k === want)?.[2] }}>
                {WANTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <input ref={pick} type="file" multiple style={{ display: "none" }}
              onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 5))} />
            <button onClick={() => pick.current?.click()} className="rounded px-3 py-1 text-xs font-bold" style={{ background: "#DCE8F5", color: "var(--blue)" }}>
              📎 Attach {files.length ? `· ${files.length}` : ""}
            </button>
            {files.length > 0 && (
              <span className="text-xs truncate" style={{ color: "var(--muted)", maxWidth: 260 }}>{files.map((f) => f.name).join(", ")}</span>
            )}
            <button onClick={submit} disabled={busy} className="rounded px-4 py-1.5 text-sm font-bold text-white ml-auto"
              style={{ background: busy ? "#B8B5AC" : "var(--green)" }}>{busy ? "sending…" : "Send it"}</button>
            <button onClick={() => setWriting(false)} className="text-xs font-semibold" style={{ color: "var(--muted)" }}>Cancel</button>
          </div>
        </div>
      )}

      {shown.length === 0 && installed && !writing && (
        <div className="text-sm rounded-lg border p-4" style={{ borderColor: "var(--line)", background: "#fff", color: "var(--muted)" }}>
          Nothing here yet.
        </div>
      )}

      {shown.map((f) => {
        const w = WANTS.find(([k]) => k === f.want);
        const st = FR_STATUSES.find(([k]) => k === f.status);
        return (
          <div key={f.id} className="bg-white rounded-lg border p-3 mb-2" style={{ borderColor: "var(--line)", borderLeft: `4px solid ${w?.[2] || "var(--line)"}` }}>
            <div className="flex items-start gap-2 flex-wrap">
              <div className="flex-1" style={{ minWidth: 240 }}>
                <div className="font-bold text-sm" style={{ color: "var(--navy)" }}>{f.title}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  {whoTag(f.by)} · {fmtFull(String(f.at))}
                </div>
              </div>
              <span className="rounded px-2 py-0.5 text-xs font-bold" style={{ background: `${w?.[2]}18`, color: w?.[2] }}>{w?.[1]}</span>
              {isOwner ? (
                <select value={f.status} onChange={(e) => setStatus(f, e.target.value)}
                  className="text-xs border rounded px-1 py-0.5 font-bold bg-white"
                  style={{ borderColor: "var(--line)", color: st?.[2] }}>
                  {FR_STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              ) : (
                <span className="rounded px-2 py-0.5 text-xs font-bold" style={{ background: "#F4F2EC", color: st?.[2] }}>{st?.[1]}</span>
              )}
            </div>

            {f.body && (
              <div className="text-sm mt-2 feature-body" style={{ color: "var(--ink)", lineHeight: 1.6 }}
                dangerouslySetInnerHTML={{ __html: f.body }} />
            )}

            {f.files.length > 0 && (
              <div className="flex gap-2 flex-wrap mt-2">
                {f.files.map((a) => (
                  a.url && /^image\//.test(a.mime || "") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                      <img src={a.url} alt={a.name} style={{ height: 90, borderRadius: 4, border: "1px solid #E2E0DA" }} />
                    </a>
                  ) : (
                    <a key={a.id} href={a.url || "#"} target="_blank" rel="noreferrer"
                      className="text-xs rounded px-2 py-1" style={{ background: "#F4F2EC", color: "var(--blue)" }}>📎 {a.name}</a>
                  )
                ))}
              </div>
            )}

            {isOwner && (
              <div className="mt-2">
                {noteEdit === f.id ? (
                  <div>
                    <textarea
                      value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={2}
                      placeholder="The developer's note — what was done, what to know."
                      className="w-full text-xs border rounded px-2 py-1.5" style={{ borderColor: "var(--line)" }}
                    />
                    <div className="flex gap-2 mt-1">
                      <button onClick={() => saveNote(f)} className="rounded px-2 py-0.5 text-xs font-bold text-white" style={{ background: "var(--green)" }}>Save note</button>
                      <button onClick={() => setNoteEdit(null)} className="rounded px-2 py-0.5 text-xs font-bold" style={{ background: "#F4F2EC", color: "var(--ink)" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setNoteEdit(f.id); setNoteText(f.note || ""); }}
                    className="text-xs font-bold" style={{ color: "var(--blue)" }}>
                    ✎ {f.note ? "Edit note" : "Add note"}
                  </button>
                )}
              </div>
            )}
            {f.note && noteEdit !== f.id && (
              <div className="text-xs mt-2 rounded px-2 py-1" style={{ background: "#F4F2EC", color: "var(--dim)" }}>
                <b>{whoTag(f.acted_by)}:</b> {f.note}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The thank-you, straight after a shop-floor update.
 *
 * Recording a note is a small act of generosity — somebody stopped work to
 * tell the rest of the company something. Saying so, by name, and showing what
 * it just moved, is the cheapest thing in this whole application and probably
 * the one that decides whether the second note ever gets recorded.
 *
 * The days figure is the point. "Thank you" alone is manners; "thank you, and
 * this job is eleven days overdue" is manners plus a reason to have bothered.
 *
 * The photograph is picked at random from public/coach so it is not the same
 * face every time, and hides itself if that number is not there — no manifest
 * to keep in step with the folder.
 */
export function ThankYou({
  who, tdd, job, onClose,
}: { who: string; tdd: string | null; job: string; onClose: () => void }) {
  const COACH_MAX = 12;
  const [pic, setPic] = useState(() => 1 + Math.floor(Math.random() * COACH_MAX));
  const [ext, setExt] = useState("jpg");
  const [hide, setHide] = useState(false);

  // Closes itself: this is a thank-you, not a dialogue.
  useEffect(() => {
    const t = setTimeout(onClose, 7000);
    return () => clearTimeout(t);
  }, [onClose]);

  const days = tdd ? diffDays(TODAY, tdd) : null;
  const overdue = days != null && days < 0;

  return (
    <div
      role="button" tabIndex={0} onClick={onClose}
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background: "rgba(13,22,31,.55)", zIndex: 70 }}
    >
      <div
        role="button" tabIndex={0} onClick={(e) => e.stopPropagation()}
        className="rounded-lg"
        style={{ background: "#fff", maxWidth: 470, width: "100%", overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,.35)" }}
      >
        <div style={{ background: "var(--navy)", padding: "16px 18px", display: "flex", gap: 14, alignItems: "center" }}>
          {!hide && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/coach/${pic}.${ext}`}
              alt=""
              onError={() => {
                // try png for the same number, then give up quietly
                if (ext === "jpg") setExt("png");
                else if (pic !== 1) { setPic(1); setExt("jpg"); }
                else setHide(true);
              }}
              style={{ width: 54, height: 54, borderRadius: "50%", objectFit: "cover", border: "2px solid #F5B32B", flexShrink: 0 }}
            />
          )}
          <div style={{ color: "#fff" }}>
            <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.2 }}>Thank you {who}!</div>
            <div style={{ fontSize: 12, color: "#8FA1B3" }}>your update is on JOB {job}</div>
          </div>
        </div>

        <div style={{ padding: "16px 18px" }}>
          <p style={{ margin: 0, fontSize: 14.5, color: "var(--ink)", lineHeight: 1.6 }}>
            This update will help move this job.
          </p>
          {tdd ? (
            <p style={{ margin: "8px 0 0", fontSize: 14.5, color: "var(--ink)", lineHeight: 1.6 }}>
              Target delivery is <b>{fmtFull(tdd)}</b>
              {days === 0 ? (
                <> — <b style={{ color: "var(--warn)" }}>that is today</b>.</>
              ) : overdue ? (
                <> — <b style={{ color: "var(--red)" }}>{Math.abs(days as number)} days overdue!</b></>
              ) : (
                <> — <b style={{ color: "var(--green)" }}>{days} days away</b>.</>
              )}
            </p>
          ) : (
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted)" }}>
              This job carries no target delivery date yet.
            </p>
          )}
          <button
            onClick={onClose}
            className="rounded px-4 py-1.5 text-sm font-bold text-white"
            style={{ background: "var(--accent)", marginTop: 14 }}
          >
            Back to it
          </button>
        </div>
      </div>
    </div>
  );
}