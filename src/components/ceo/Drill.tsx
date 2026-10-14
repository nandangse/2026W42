"use client";
/**
 * EVERY NUMBER OPENS (Dr Raghu, 14 Oct 2026: "all the numbers should be
 * clickable in to a lightbox … in the lightbox show details which will open in
 * new tab"). Click a figure: a lightbox lists what makes it, largest first;
 * each line opens its own record in a new tab, and the whole list opens on the
 * screen that holds it, also in a new tab.
 */
import { createContext, useContext, useEffect, useState } from "react";

export type DrillAsk = { what: string; from?: string; to?: string; label?: string };
const Ctx = createContext<(a: DrillAsk) => void>(() => undefined);
export const useDrill = () => useContext(Ctx);

const NAVY = "var(--navy)", MUTED = "var(--muted)", LINE = "var(--line)";
export const cr = (n: number) => { const v = Math.abs(n); const s = v >= 1e7 ? `${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(1)} L` : Math.round(v).toLocaleString("en-IN"); return `${n < 0 ? "−" : ""}₹${s}`; };
const dmy = (d?: string | null) => (d ? new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "");
export const monthRange = (m: string): [string, string] => { const [y, mo] = m.split("-").map(Number); return [`${m}-01`, new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10)]; };

type Got = { title: string; total: number; count: number; rows: { date?: string | null; title: string; sub?: string; amount?: number | null; href?: string | null }[]; screen: string | null; note: string | null };

export function DrillProvider({ children }: { children: React.ReactNode }) {
  const [ask, setAsk] = useState<DrillAsk | null>(null);
  const [got, setGot] = useState<Got | null>(null); const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!ask) return; setGot(null); setErr(null); setQ("");
    const p = new URLSearchParams({ what: ask.what, ...(ask.from ? { from: ask.from } : {}), ...(ask.to ? { to: ask.to } : {}) });
    fetch(`/api/ceo/drill?${p}`, { cache: "no-store" }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setGot(j); }).catch((e) => setErr(String(e.message || e)));
  }, [ask]);
  const rows = (got?.rows || []).filter((r) => !q.trim() || `${r.title} ${r.sub || ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Ctx.Provider value={setAsk}>
      {children}
      {ask && (
        <div onClick={() => setAsk(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="rounded-xl" style={{ width: "min(980px, 100%)", maxHeight: "90vh", display: "flex", flexDirection: "column", background: "var(--paper)", boxShadow: "0 20px 50px rgba(0,0,0,.3)" }}>
            <div className="flex items-start gap-2 p-4" style={{ borderBottom: `1px solid ${LINE}` }}>
              <div className="flex-1 min-w-0">
                <div className="font-bold" style={{ fontSize: 18, color: NAVY }}>{ask.label || got?.title || "…"}</div>
                <div className="text-xs" style={{ color: MUTED }}>{ask.from && ask.to ? `${dmy(ask.from)} – ${dmy(ask.to)} · ` : ""}{got ? `${got.count.toLocaleString("en-IN")} line${got.count === 1 ? "" : "s"}${got.total ? ` · ${cr(got.total)}` : ""}` : "reading…"}{got?.note ? ` · ${got.note}` : ""}</div>
              </div>
              {got?.screen && <a href={got.screen} target="_blank" rel="noreferrer" className="rounded px-3 py-1.5 text-xs font-bold" style={{ background: "var(--accent)", color: "#fff", textDecoration: "none", whiteSpace: "nowrap" }}>Open the full screen ↗</a>}
              <button onClick={() => setAsk(null)} className="font-bold ml-1" style={{ color: MUTED, fontSize: 18 }}>✕</button>
            </div>
            <div className="px-4 pt-2"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search these lines…" style={{ border: `1px solid ${LINE}`, borderRadius: 6, padding: "4px 8px", fontSize: 12, width: 260, background: "#fff" }} /></div>
            <div style={{ overflow: "auto", padding: "8px 16px 16px" }}>
              {err && <div className="text-sm font-bold" style={{ color: "var(--red)" }}>{err}</div>}
              {!got && !err && <div className="text-sm" style={{ color: MUTED }}>Reading…</div>}
              {got && (
                <table className="genie-table" style={{ width: "100%" }}>
                  <thead><tr><th style={{ width: 90 }}>Date</th><th>What</th><th style={{ textAlign: "right", width: 130 }}>Amount</th><th style={{ width: 40 }} /></tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td className="tnum text-xs" style={{ whiteSpace: "nowrap" }}>{dmy(r.date)}</td>
                        <td>{r.href ? <a href={r.href} target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: "var(--blue)" }}>{r.title}</a> : <b style={{ color: NAVY }}>{r.title}</b>}{r.sub && <div className="text-xs" style={{ color: MUTED }}>{r.sub}</div>}</td>
                        <td className="tnum text-right">{r.amount !== null && r.amount !== undefined ? cr(r.amount) : ""}</td>
                        <td>{r.href && <a href={r.href} target="_blank" rel="noreferrer" title="Open in a new tab" style={{ color: "var(--blue)" }}>↗</a>}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && <tr><td colSpan={4} style={{ color: MUTED, padding: 14 }}>Nothing here.</td></tr>}
                  </tbody>
                </table>
              )}
              {got && got.count > got.rows.length && <div className="text-xs mt-1" style={{ color: MUTED }}>The largest {got.rows.length} of {got.count.toLocaleString("en-IN")} — the full screen has them all.</div>}
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

/** a figure that opens */
export function Num({ ask, children, style }: { ask: DrillAsk; children: React.ReactNode; style?: React.CSSProperties }) {
  const open = useDrill();
  return <button onClick={(e) => { e.stopPropagation(); open(ask); }} className="tnum hover:underline" style={{ font: "inherit", color: "inherit", textAlign: "inherit", cursor: "pointer", textDecorationStyle: "dotted", ...style }} title="Open what makes this number">{children}</button>;
}
