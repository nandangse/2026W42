"use client";
/**
 * SETTINGS → GENIE and SETTINGS → CONSULT RAGHU (Dr Raghu, 30 Aug 2026).
 * Owner's eyes alone — the tabs only render for him, and the APIs behind
 * them answer only him.
 *
 * Genie: who uses it, and roughly what the AI costs.
 * Consult Raghu: four living knowledgebases — Planning, Sales, Kuber,
 * Vishwakarma. He dumps knowledge in; Opus weaves it into ONE large
 * organized document; a copy files into his Drive folder. This is the
 * intelligence layer the Consult Raghu advisors will stand on.
 */
import { useCallback, useEffect, useState } from "react";

const BORDER = "#E2E0DA", MUTED = "#8A94A0", INK = "#22303C", ORANGE = "#E8600A", NAVY = "#16232F";

/* ------------------------------------------------ Genie usage (owner) */
type UsageRow = { name: string; total: number; last30: number; ai: Record<string, number>; costInr: number; costInr30: number; hours30?: number; hoursAll?: number };
export function GenieUsagePanel() {
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  const [totals, setTotals] = useState<{ actions: number; last30: number; costInr: number; costInr30: number } | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch("/api/genie-usage", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "?");
        setRows(j.rows); setTotals(j.totals); setNote(j.note || "");
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  const inr = (n: number) => `₹ ${Math.round(n).toLocaleString("en-IN")}`;
  return (
    <div className="bg-white rounded-lg border p-3" style={{ borderColor: BORDER }}>
      <div className="font-bold text-sm mb-1">🧞 Genie — who uses it, and what the AI costs</div>
      <div className="text-xs mb-3" style={{ color: MUTED, maxWidth: "90ch", lineHeight: 1.5 }}>{note}</div>
      {err && <div className="text-sm" style={{ color: "#B3261E" }}>{err}</div>}
      {rows === null && !err && <div className="text-sm" style={{ color: MUTED }}>reading the trail…</div>}
      {totals && (
        <div className="flex gap-3 flex-wrap mb-3">
          {([["Actions · last 30 days", String(totals.last30)], ["Actions · all time", String(totals.actions)],
             ["~AI spend · last 30 days", inr(totals.costInr30)], ["~AI spend · all time", inr(totals.costInr)]] as const).map(([l, v]) => (
            <div key={l} className="rounded px-3 py-2" style={{ background: NAVY, color: "#fff", minWidth: 150 }}>
              <div className="text-xs" style={{ color: "#8FA1B3" }}>{l}</div>
              <div className="tnum font-bold" style={{ fontSize: 18 }}>{v}</div>
            </div>
          ))}
        </div>
      )}
      {rows && rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ textAlign: "left", color: MUTED, fontSize: 11 }}>
              <th className="py-1 pr-3">PERSON</th>
              <th className="py-1 pr-3" style={{ textAlign: "right" }}>≈HOURS · 30D</th>
              <th className="py-1 pr-3" style={{ textAlign: "right" }}>≈HOURS · ALL</th>
              <th className="py-1 pr-3" style={{ textAlign: "right" }}>LAST 30 DAYS</th>
              <th className="py-1 pr-3" style={{ textAlign: "right" }}>ALL TIME</th>
              <th className="py-1 pr-3" style={{ textAlign: "right" }}>EVA</th>
              <th className="py-1 pr-3" style={{ textAlign: "right" }}>ASK GENIE</th>
              <th className="py-1 pr-3" style={{ textAlign: "right" }}>SITUATIONAL</th>
              <th className="py-1 pr-3" style={{ textAlign: "right" }}>LETTERS</th>
              <th className="py-1" style={{ textAlign: "right" }}>~AI SPEND</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} style={{ borderTop: `1px solid ${BORDER}` }}>
                  <td className="py-1.5 pr-3 font-semibold">{r.name}</td>
                  <td className="py-1.5 pr-3 tnum" style={{ textAlign: "right", fontWeight: 800, color: "#1B3A5C" }}>{r.hours30 ?? "—"}</td>
                  <td className="py-1.5 pr-3 tnum" style={{ textAlign: "right", color: MUTED }}>{r.hoursAll ?? "—"}</td>
                  <td className="py-1.5 pr-3 tnum" style={{ textAlign: "right", fontWeight: 700 }}>{r.last30.toLocaleString("en-IN")}</td>
                  <td className="py-1.5 pr-3 tnum" style={{ textAlign: "right", color: MUTED }}>{r.total.toLocaleString("en-IN")}</td>
                  <td className="py-1.5 pr-3 tnum" style={{ textAlign: "right" }}>{r.ai.eva_brief || "—"}</td>
                  <td className="py-1.5 pr-3 tnum" style={{ textAlign: "right" }}>{r.ai.opp_brief || "—"}</td>
                  <td className="py-1.5 pr-3 tnum" style={{ textAlign: "right" }}>{r.ai.situational_run || "—"}</td>
                  <td className="py-1.5 pr-3 tnum" style={{ textAlign: "right" }}>{r.ai.letter_beautify || "—"}</td>
                  <td className="py-1.5 tnum" style={{ textAlign: "right", fontWeight: 700 }}>{r.costInr ? inr(r.costInr) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------- Consult Raghu (owner) */
const SECTIONS: [string, string, string][] = [
  ["planning", "📐 Planning", "How Dr Raghu plans — dates, belief, throughput, escalation."],
  ["sales", "🤝 Sales", "How Dr Raghu sells — qualification, pricing, the close."],
  ["kuber", "💰 Kuber", "How Dr Raghu reads the money — collections, margins, discipline."],
  ["vishwakarma", "🔨 Vishwakarma", "How Dr Raghu builds — the works, quality, the floor."],
];
type KbRow = { content: string; version: number; updated_at?: string };
type KbUpload = { filename: string | null; chars: number; note: string | null; uploaded_at: string };

export function ConsultRaghuPanel() {
  const [section, setSection] = useState("planning");
  const [row, setRow] = useState<KbRow | null>(null);
  const [uploads, setUploads] = useState<KbUpload[]>([]);
  const [needs, setNeeds] = useState(false);
  const [paste, setPaste] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [showDoc, setShowDoc] = useState(false);

  const load = useCallback(async (sec: string) => {
    setRow(null); setMsg("");
    try {
      const j = await (await fetch(`/api/consult-kb?section=${sec}`, { cache: "no-store" })).json();
      setRow(j.row); setUploads(j.uploads || []); setNeeds(!!j.needsMigration);
    } catch { setRow({ content: "", version: 0 }); }
  }, []);
  useEffect(() => { void load(section); }, [section, load]);

  const drop = async () => {
    if (!paste.trim() && !file) return;
    setBusy(true); setMsg("Opus is weaving it into the document — a big drop takes a minute or two…");
    try {
      const fd = new FormData();
      fd.set("section", section);
      if (paste.trim()) fd.set("text", paste);
      if (file) fd.set("file", file);
      const r = await fetch("/api/consult-kb", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "The drop failed");
      setPaste(""); setFile(null);
      setMsg(`✓ Woven in — version ${j.version}, ${Number(j.chars).toLocaleString("en-IN")} characters.${j.driveLink ? " Filed to Drive." : j.driveNote ? ` ${j.driveNote}` : ""}`);
      await load(section);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-white rounded-lg border p-3" style={{ borderColor: BORDER }}>
      <div className="font-bold text-sm mb-1">🎓 Consult Raghu — the knowledgebase</div>
      <div className="text-xs mb-3" style={{ color: MUTED, maxWidth: "90ch", lineHeight: 1.5 }}>
        Four living documents, one per module. Dump knowledge in — pasted text or a text file — and Opus weaves it
        into ONE large organized document, nothing lost. A copy files into your Drive folder each time. This is the
        intelligence layer the Consult Raghu advisors will stand on. Your eyes alone.
      </div>
      {needs && <div className="rounded px-3 py-2 mb-2 text-xs" style={{ background: "#FFF7E6", color: "#8A5B00" }}>Run Genie migration 0104 first — the knowledgebase has nowhere to live yet.</div>}

      <div className="flex gap-1 mb-3 flex-wrap">
        {SECTIONS.map(([k, label]) => (
          <button key={k} onClick={() => setSection(k)} className="px-3 py-1.5 rounded text-sm font-semibold"
            style={section === k ? { background: NAVY, color: "#fff" } : { color: "#5A6672", border: `1px solid ${BORDER}` }}>
            {label}
          </button>
        ))}
      </div>
      <div className="text-xs mb-2" style={{ color: MUTED }}>{SECTIONS.find(([k]) => k === section)?.[2]}</div>

      <div className="rounded border p-3 mb-3" style={{ borderColor: ORANGE, background: "#FFFDF9" }}>
        <div className="text-xs font-bold mb-1.5" style={{ color: INK }}>📎 ATTACH KNOWLEDGE</div>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={5} disabled={busy}
          placeholder="Paste anything — notes, rules, a call debrief, a spec, a story with a lesson in it…"
          className="w-full rounded border p-2 text-sm" style={{ borderColor: BORDER }} />
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <label className="text-xs rounded border px-2 py-1 font-bold cursor-pointer" style={{ borderColor: BORDER, background: "#fff" }}>
            {file ? `📄 ${file.name}` : "📄 or a text file (.md .txt .csv .html …)"}
            <input type="file" className="hidden" accept=".md,.txt,.csv,.json,.html,.htm,.xml,.log"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <button onClick={() => void drop()} disabled={busy || (!paste.trim() && !file)}
            className="rounded px-3 py-1.5 text-sm font-bold text-white"
            style={{ background: busy || (!paste.trim() && !file) ? "#B9BEC4" : "#7C3AED" }}>
            {busy ? "Weaving…" : "🧠 Weave into the knowledgebase"}
          </button>
          {msg && <span className="text-xs font-semibold" style={{ color: msg.startsWith("✓") ? "#0D7A3F" : busy ? MUTED : "#B3261E", maxWidth: "60ch" }}>{msg}</span>}
        </div>
      </div>

      {row && (
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <span className="text-xs font-bold" style={{ color: INK }}>
            Version {row.version} · {String(row.content || "").length.toLocaleString("en-IN")} characters
          </span>
          <button onClick={() => setShowDoc((v) => !v)} className="text-xs font-bold rounded border px-2 py-0.5"
            style={{ borderColor: BORDER, background: "#fff", color: "#5A6672" }}>
            {showDoc ? "hide the document" : "read the document"}
          </button>
        </div>
      )}
      {showDoc && row && (
        <div className="rounded border p-3 text-sm" style={{ borderColor: BORDER, whiteSpace: "pre-wrap", lineHeight: 1.6, maxHeight: "60vh", overflowY: "auto", fontFamily: "Georgia, serif" }}>
          {row.content || <span style={{ color: MUTED }}>Empty — the first drop founds it.</span>}
        </div>
      )}

      {uploads.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.6 }}>RECENT DROPS</div>
          {uploads.map((u, i) => (
            <div key={i} className="text-xs py-0.5" style={{ color: "#5A6672" }}>
              {String(u.uploaded_at).slice(0, 16).replace("T", " ")} · {u.filename || "pasted text"} · {Number(u.chars).toLocaleString("en-IN")} chars {u.note ? `· ${u.note}` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
