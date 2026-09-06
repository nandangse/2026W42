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
 * intelligence layer the Consult Dr Raghu advisors will stand on.
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
      <AiMasterSwitch />
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
              <th className="py-1 pr-3" style={{ textAlign: "right" }}>CONSULT</th>
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
                  <td className="py-1.5 pr-3 tnum" style={{ textAlign: "right" }}>{r.ai.consult || "—"}</td>
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
  ["general_voice", "🗣️ General Voice", "How Dr Raghu speaks and decides — the voice that applies everywhere."],
];
type KbRow = { content: string; version: number; updated_at?: string };
type KbUpload = { filename: string | null; chars: number; note: string | null; uploaded_at: string };

export function ConsultRaghuPanel() {
  // "First - Knowledgebase / Next - Conversations done" (Dr Raghu, 30 Aug 2026)
  const [view, setView] = useState<"kb" | "conv">("kb");
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
      <div className="font-bold text-sm mb-2">🎓 Consult Dr Raghu</div>
      <div className="flex gap-1 mb-3">
        {([["kb", "📚 Knowledgebase"], ["conv", "💬 Conversations done"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} className="px-3 py-1.5 rounded text-sm font-bold"
            style={view === k ? { background: ORANGE, color: "#fff" } : { color: "#5A6672", border: `1px solid ${BORDER}` }}>
            {l}
          </button>
        ))}
      </div>
      {view === "conv" ? <DiscussionsPanel /> : (<>
      <div className="font-bold text-sm mb-1">The knowledgebase</div>
      <div className="text-xs mb-3" style={{ color: MUTED, maxWidth: "90ch", lineHeight: 1.5 }}>
        Five living documents — one per module, and the General Voice that applies everywhere. Dump knowledge in — pasted text or a text file — and Opus weaves it
        into ONE large organized document, nothing lost. A copy files into your Drive folder each time. This is the
        intelligence layer the Consult Dr Raghu advisors will stand on. Your eyes alone.
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
      </>)}
    </div>
  );
}

/** "where can i see all the collated discussions?" (Dr Raghu, 30 Aug 2026) —
 *  Conversations done: Date · By · From · Record · Minutes · Letters ·
 *  Remarks, a row per consultation; clicking opens the lightbox. */
function DiscussionsPanel() {
  type ChatRow = { id: string; who: string; target_type: string; target: string; messages: number; last_at: string; started_at: string; minutes: number; letters: number; remarks: string };
  const [chats, setChats] = useState<ChatRow[] | null>(null);
  const [open, setOpen] = useState<ChatRow | null>(null);
  const [thread, setThread] = useState<{ role: string; content: string }[] | null>(null);
  const [remark, setRemark] = useState<Record<string, string>>({});
  const [rMsg, setRMsg] = useState("");
  useEffect(() => {
    fetch("/api/crm/consult?all=1", { cache: "no-store" }).then((r) => r.json())
      .then((j) => {
        const rows: ChatRow[] = j.chats ?? [];
        setChats(rows);
        setRemark(Object.fromEntries(rows.map((c) => [c.id, c.remarks || ""])));
      }).catch(() => setChats([]));
  }, []);
  const read = async (c: ChatRow) => {
    setOpen(c); setThread(null);
    try {
      const j = await (await fetch(`/api/crm/consult?all=1&chat_id=${c.id}`, { cache: "no-store" })).json();
      setThread((j.messages ?? []).filter((m: { content: string }) => !m.content.startsWith("(The salesperson has just sat down")));
    } catch { setThread([]); }
  };
  const saveRemark = async (id: string) => {
    setRMsg("");
    try {
      const r = await fetch("/api/crm/consult", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: id, remarks: remark[id] ?? "" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save the remark");
    } catch (e) { setRMsg(e instanceof Error ? e.message : String(e)); }
  };
  const TT: Record<string, string> = { opportunity: "Opportunity", quotation: "Quotation", sales_order: "Sales Order", company: "Company", person: "Contact", industry: "Industry", product: "Product" };
  const d = (v: string) => new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  return (
    <div>
      <div className="text-xs mb-2" style={{ color: MUTED, maxWidth: "90ch", lineHeight: 1.5 }}>
        Every Consult Dr Raghu conversation, newest first — click a row to read it whole. Your eyes alone.
      </div>
      {rMsg && <div className="text-xs mb-2" style={{ color: "#B3261E" }}>{rMsg}</div>}
      {chats === null && <div className="text-sm" style={{ color: MUTED }}>loading…</div>}
      {chats !== null && chats.length === 0 && <div className="text-sm" style={{ color: MUTED }}>No consultations yet.</div>}
      {chats !== null && chats.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ textAlign: "left", color: MUTED, fontSize: 11 }}>
              <th className="py-1 pr-3">DATE</th>
              <th className="py-1 pr-3">BY</th>
              <th className="py-1 pr-3">FROM</th>
              <th className="py-1 pr-3">RECORD NAME</th>
              <th className="py-1 pr-3" style={{ textAlign: "right" }}>MINUTES</th>
              <th className="py-1 pr-3" style={{ textAlign: "right" }}>LETTERS</th>
              <th className="py-1" style={{ minWidth: 180 }}>REMARKS</th>
            </tr></thead>
            <tbody>
              {chats.map((c) => (
                <tr key={c.id} style={{ borderTop: `1px solid ${BORDER}`, cursor: "pointer" }}
                  role="button" tabIndex={0} onClick={() => void read(c)}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#FAF9F5"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}>
                  <td className="py-1.5 pr-3 tnum" style={{ whiteSpace: "nowrap" }}>{d(c.started_at)}</td>
                  <td className="py-1.5 pr-3 font-semibold" style={{ whiteSpace: "nowrap" }}>{c.who}</td>
                  <td className="py-1.5 pr-3" style={{ whiteSpace: "nowrap", color: "#5A6672" }}>{TT[c.target_type] ?? c.target_type}</td>
                  <td className="py-1.5 pr-3 font-semibold">{c.target}</td>
                  <td className="py-1.5 pr-3 tnum" style={{ textAlign: "right" }}>{c.minutes || "—"}</td>
                  <td className="py-1.5 pr-3 tnum" style={{ textAlign: "right" }}>{c.letters.toLocaleString("en-IN")}</td>
                  <td className="py-1.5" role="button" tabIndex={0} onClick={(e) => e.stopPropagation()}>
                    <input value={remark[c.id] ?? ""} placeholder="—"
                      onChange={(e) => setRemark((m) => ({ ...m, [c.id]: e.target.value }))}
                      onBlur={() => void saveRemark(c.id)}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      className="w-full rounded border px-2 py-1 text-xs" style={{ borderColor: BORDER }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <div onClick={() => setOpen(null)} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(22,35,47,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="rounded" style={{ background: "#fff", width: "min(640px, 100%)", maxHeight: "calc(100vh - 48px)", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(27,45,107,.4)" }}>
            <div className="flex items-center gap-2.5 px-3 py-2.5" style={{ background: NAVY, borderRadius: "6px 6px 0 0" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/consult-raghu.png" alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,255,255,.4)" }} />
              <div style={{ minWidth: 0 }}>
                <div className="text-white font-bold text-sm">{open.who} · {open.target}</div>
                <div className="text-xs" style={{ color: "#C8D2DC" }}>{TT[open.target_type] ?? open.target_type} · {d(open.started_at)} · {open.minutes} min · {open.letters.toLocaleString("en-IN")} letters</div>
              </div>
              <button onClick={() => setOpen(null)} className="ml-auto text-white font-bold px-2">✕</button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 14, background: "#FAF9F5" }}>
              {thread === null && <div className="text-xs" style={{ color: MUTED }}>reading…</div>}
              {(thread ?? []).map((m, i) => (
                <div key={i} className="mb-2.5 flex" style={{ justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                  <div className="rounded-lg px-3 py-2 text-sm" style={{
                    maxWidth: "85%", lineHeight: 1.55, whiteSpace: "pre-wrap",
                    background: m.role === "user" ? NAVY : "#fff",
                    color: m.role === "user" ? "#fff" : "#22303C",
                    border: m.role === "user" ? "none" : `1px solid ${BORDER}`,
                  }}>
                    {m.content}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** "stop all the genie on planning and crm also" (Dr Raghu, 30 Aug 2026) —
 *  the owner's master switch over every AI feature in the whole app. */
function AiMasterSwitch() {
  const [paused, setPaused] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    fetch("/api/app-settings", { cache: "no-store" }).then((r) => r.json())
      .then((j) => setPaused(!!j.ai_paused)).catch(() => setPaused(false));
  }, []);
  const flip = async () => {
    if (paused === null || busy) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/app-settings", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ai_paused: !paused }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not flip the switch");
      setPaused(!paused);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded border p-2.5 mb-3 flex items-center gap-3 flex-wrap" style={{ borderColor: paused ? "#B3261E" : BORDER, background: paused ? "#FBEDEA" : "#F6FBF7" }}>
      <div>
        <div className="text-sm font-bold" style={{ color: paused ? "#8E2C20" : "#1A7F4E" }}>
          {paused === null ? "…" : paused ? "⏻ Genie AI is PAUSED — everywhere" : "⏻ Genie AI is ON"}
        </div>
        <div className="text-xs" style={{ color: MUTED, maxWidth: "70ch" }}>
          One switch over every AI feature across Planning, CRM, HRMS, LMS, Kuber, Vishwakarma and the playbooks —
          nothing spends a rupee of API money while it is paused. Your hand alone.
        </div>
      </div>
      <button onClick={flip} disabled={busy || paused === null}
        className="ml-auto rounded px-4 py-2 text-sm font-black text-white"
        style={{ background: paused ? "#1A7F4E" : "#B3261E" }}>
        {busy ? "…" : paused ? "TURN AI ON" : "PAUSE ALL AI"}
      </button>
      {msg && <div className="text-xs w-full" style={{ color: "#8E2C20" }}>{msg}</div>}
    </div>
  );
}
