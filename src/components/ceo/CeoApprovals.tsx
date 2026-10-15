"use client";
/**
 * APPROVALS (Dr Raghu, 15 Oct 2026: "consolidate all the places that have
 * asked me for approvals — leave, loan, records, etc. Show as aggregated and
 * then can open in new tab"). Every queue in Genie that waits on a word, the
 * count on each, the ones waiting on him first; a queue opens to its lines,
 * and every line and every queue opens its own screen in a new tab. Nothing
 * is approved here — that happens where it always did.
 */
import { useEffect, useState } from "react";
import { C } from "@/components/ceo/ui";
import { cr } from "@/components/ceo/Drill";

type Item = { title: string; sub: string; amount: number | null; at: string | null; href: string | null };
type Queue = { key: string; label: string; module: string; on: "you" | "team"; who: string; href: string; count: number; amount: number; items: Item[] };
const box: React.CSSProperties = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, boxShadow: "0 1px 3px rgba(16,24,40,.06)" };
const ago = (iso: string | null) => { if (!iso) return ""; const d = Math.floor((Date.now() - Date.parse(iso)) / 864e5); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };
const MOD: Record<string, string> = { HRMS: "#7A5AF8", Kuber: "#DC6803", Seva: "#0BA5EC", "Leaders Council": "#039855", Portal: "#1B2A41", Saamaan: "#465FFF" };

export function ApprovalsRoom({ top }: { top: number }) {
  const [d, setD] = useState<{ queues: Queue[]; you: number; team: number } | null>(null); const [err, setErr] = useState(""); const [open, setOpen] = useState<string | null>(null);
  const load = () => fetch("/api/ceo/approvals", { cache: "no-store" }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); }).catch((e) => setErr(String(e.message || e)));
  useEffect(() => { void load(); }, []);
  const group = (on: "you" | "team") => (d?.queues || []).filter((q) => q.on === on).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const card = (q: Queue) => (
    <div key={q.key} style={{ ...box, padding: 14, opacity: q.count ? 1 : 0.55, borderTop: `4px solid ${q.count ? MOD[q.module] || C.brand : C.line}` }}>
      <div className="flex items-start gap-3">
        <button onClick={() => setOpen(open === q.key ? null : q.key)} className="text-left flex-1" disabled={!q.count} title={q.count ? "Show the lines" : "Nothing waiting"}>
          <div className="text-xs font-semibold" style={{ color: MOD[q.module] || C.muted }}>{q.module.toUpperCase()}</div>
          <div className="text-sm font-bold" style={{ color: C.ink }}>{q.label}</div>
          <div className="text-xs" style={{ color: C.muted }}>waits on {q.who}{q.amount ? ` · ${cr(q.amount)}` : ""}</div>
        </button>
        <div className="font-bold tnum" style={{ fontSize: 28, color: q.count ? (q.on === "you" ? C.red : C.amber) : C.muted, lineHeight: 1 }}>{q.count}</div>
      </div>
      <div className="flex gap-2 mt-2">
        <a href={q.href} target="_blank" rel="noreferrer" className="text-xs font-bold rounded px-2 py-1" style={{ background: C.brand, color: "#fff" }}>Open ↗</a>
        {q.count > 0 && <button onClick={() => setOpen(open === q.key ? null : q.key)} className="text-xs font-bold rounded px-2 py-1" style={{ border: `1px solid ${C.line}`, color: C.ink }}>{open === q.key ? "Hide" : "Show"} the {q.count > 50 ? "first 50" : q.count === 1 ? "line" : "lines"}</button>}
      </div>
      {open === q.key && (
        <div className="mt-2 grid gap-1" style={{ borderTop: `1px dashed ${C.line}`, paddingTop: 8, maxHeight: 360, overflowY: "auto" }}>
          {q.items.map((i, k) => (
            <a key={k} href={i.href || q.href} target="_blank" rel="noreferrer" className="flex items-baseline gap-2 text-xs rounded px-1.5 py-1 hover:bg-gray-50" style={{ color: C.ink }}>
              <span className="flex-1"><b>{i.title}</b><div style={{ color: C.muted }}>{i.sub}</div></span>
              {i.amount != null && <span className="tnum font-semibold whitespace-nowrap">{cr(i.amount)}</span>}
              <span className="whitespace-nowrap" style={{ color: C.muted, minWidth: 70, textAlign: "right" }}>{ago(i.at)}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
  return (
    <div>
      <div className="mb-4" style={{ position: "sticky", top, zIndex: 30, background: C.bg, borderBottom: `1px solid ${C.line}`, margin: "0 -20px", padding: "16px 20px 10px" }}>
        <div className="flex items-baseline gap-3 flex-wrap">
          <div>
            <div className="text-xl font-bold" style={{ color: C.ink }}>Approvals</div>
            <div className="text-sm" style={{ color: C.muted }}>everything in Genie that waits for a word — each opens its own screen in a new tab, where it is approved</div>
          </div>
          {d && <div className="ml-auto flex gap-3"><span className="text-sm"><b style={{ color: C.red, fontSize: 20 }}>{d.you}</b> <span style={{ color: C.muted }}>on you</span></span><span className="text-sm"><b style={{ color: C.amber, fontSize: 20 }}>{d.team}</b> <span style={{ color: C.muted }}>on others</span></span><button onClick={() => { setD(null); void load(); }} className="text-xs font-bold rounded px-2 py-1" style={{ border: `1px solid ${C.line}`, color: C.ink }}>↻</button></div>}
        </div>
      </div>
      {err && <div className="text-sm" style={{ color: C.red }}>{err}</div>}
      {!d && !err && <div className="text-sm" style={{ color: C.muted }}>Reading every queue…</div>}
      {d && (
        <>
          <div className="text-xs font-bold mb-2" style={{ color: C.navy, letterSpacing: 1 }}>WAITING ON YOU</div>
          <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>{group("you").map(card)}</div>
          <div className="text-xs font-bold mb-2" style={{ color: C.navy, letterSpacing: 1 }}>WAITING ON OTHERS</div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>{group("team").map(card)}</div>
          <div className="text-xs mt-4" style={{ color: C.muted }}>Leave requests are not on this page yet: Genie has no leave-request table — leave is recorded on the muster. Say the word and a request-and-approve flow for leave goes in.</div>
        </>
      )}
    </div>
  );
}
