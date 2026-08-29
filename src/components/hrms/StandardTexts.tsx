"use client";
/**
 * Masters → Standard Texts.
 *
 * The paragraphs that go into letters, kept in one place. Editing here
 * changes the NEXT letter and never one already sent — every offer keeps its
 * own copy of the words it used, so a letter in somebody's inbox and our
 * record of it cannot drift apart.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import RichText, { RichTextView } from "./RichText";
import { Pane } from "./Pane";
import { C } from "./RecordFields";

interface Text { key: string; title: string; body: string; note: string | null; version: number; updated_by: string | null; updated_at: string | null }

/** The covering note is plain text — it becomes the body of a mail, not a page. */
const PLAIN = new Set(["offer_covering_letter"]);

export default function StandardTexts({ who }: { who: string }) {
  const [rows, setRows] = useState<Text[] | null>(null);
  const [needs, setNeeds] = useState(false);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const j = await api.get("/api/hrms/texts"); setRows(j.texts || []); setNeeds(!!j.needsMigration); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (t: Text, body: string) => {
    try { await api.post("/api/hrms/texts", { key: t.key, title: t.title, body, note: t.note }); setMsg(`${t.title} saved ✓`); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <Pane title="Masters — Standard Texts" who={who} print
      blurb="The words that go into every letter, written once. Each letter keeps the copy it used, so editing here changes the next one and never one already sent.">
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>}
      {needs && <div className="rounded p-2 mb-2" style={{ background: "#FFF7E6", border: "1px solid #F5D9A8", fontSize: 12.5, color: "#8A5B00" }}>Run migration 0068 — the standard texts have nowhere to live yet.</div>}

      {rows === null && <div className="text-sm py-6 text-center" style={{ color: C.faint }}>loading…</div>}
      {rows?.map((t) => (
        <div key={t.key} className="bg-white rounded-lg border mb-3" style={{ borderColor: C.line }}>
          <button onClick={() => setOpen(open === t.key ? null : t.key)} className="w-full text-left px-3 py-2.5">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-bold" style={{ fontSize: 14 }}>{t.title}</span>
              <span className="rounded px-1.5 py-0.5" style={{ fontSize: 10, background: "#F4F2EC", color: C.faint }}>v{t.version}</span>
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
              {PLAIN.has(t.key)
                ? <PlainEditor value={t.body} onSave={(v) => save(t, v)} />
                : <RichText value={t.body} rows={18} onSave={(html) => save(t, html)} placeholder="The standard text…" />}
            </div>
          )}
          {open !== t.key && (
            <div className="px-3 pb-3" style={{ maxHeight: 92, overflow: "hidden", position: "relative", color: C.dim, fontSize: 12.5 }}>
              {PLAIN.has(t.key)
                ? <div style={{ whiteSpace: "pre-wrap" }}>{t.body.slice(0, 300)}</div>
                : <RichTextView html={t.body.slice(0, 900)} />}
              <div style={{ position: "absolute", inset: "auto 0 0 0", height: 34, background: "linear-gradient(transparent,#fff)" }} />
            </div>
          )}
        </div>
      ))}
    </Pane>
  );
}

function PlainEditor({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  return (
    <>
      <textarea value={v} rows={16} onChange={(e) => setV(e.target.value)}
        className="w-full rounded px-2 py-1.5" style={{ border: `1px solid ${C.line}`, fontSize: 13, lineHeight: 1.7 }} />
      <div className="flex items-center gap-2 mt-1">
        <button onClick={() => onSave(v)} disabled={v === value} className="rounded px-3 py-1.5 font-bold"
          style={{ background: v === value ? "#E2E0DA" : C.green, color: v === value ? "#8A94A0" : "#fff", fontSize: 12.5 }}>Save</button>
        <span style={{ fontSize: 11.5, color: C.faint }}>&lt;name&gt; is replaced with the candidate&apos;s name when the mail goes out.</span>
      </div>
    </>
  );
}
