"use client";
/**
 * The Start · Stop · Continue document — one page per column, a page break
 * between, the leader's colour down the side of each card. Opens the print
 * dialog itself; "Save as PDF" is the PDF. The owner alone reaches this page.
 */
import { useEffect } from "react";
import { RichContent } from "@/components/RichTextEditor";
import { LOGO } from "@/lib/logo";
import type { Leader } from "@/lib/lc/auth";

interface Row { id: string; kind: string; title: string; details: string | null; added_by: string; created_at: string; up: number; down: number }
const KINDS = [{ key: "start", label: "Start", colour: "#0d7a3f" }, { key: "stop", label: "Stop", colour: "#b3261e" }, { key: "continue", label: "Continue", colour: "#1b3a5c" }];
const dmy = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

export default function SscPrint({ cards, members }: { cards: Row[]; members: Leader[] }) {
  useEffect(() => { const t = setTimeout(() => window.print(), 600); return () => clearTimeout(t); }, []);
  const who = (e: string) => members.find((m) => m.email === e.toLowerCase()) || { name: e.split("@")[0], colour: "#8a94a0", initials: "?" };
  const today = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" });
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: "#22303c", background: "#fff" }}>
      <div className="no-print" style={{ padding: 12, background: "#16232f", color: "#fff", display: "flex", gap: 12, alignItems: "center" }}>
        <b>Start · Stop · Continue — print</b><span style={{ color: "#8FA1B3", fontSize: 13 }}>Choose "Save as PDF" in the dialog. One page per column.</span>
        <button onClick={() => window.print()} style={{ marginLeft: "auto", background: "#e8600a", color: "#fff", border: 0, borderRadius: 6, padding: "6px 14px", fontWeight: 700 }}>Print</button>
        <a href="/lc#ssc" style={{ color: "#fff" }}>← back</a>
      </div>
      {KINDS.map((k, i) => {
        const rows = cards.filter((c) => c.kind === k.key).sort((a, b) => (b.up - b.down) - (a.up - a.down));
        return (
          <section key={k.key} style={{ padding: "18mm 16mm", pageBreakAfter: i < KINDS.length - 1 ? "always" : "auto", breakAfter: i < KINDS.length - 1 ? "page" : "auto", minHeight: "250mm" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, borderBottom: `3px solid ${k.colour}`, paddingBottom: 8, marginBottom: 14 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO} alt="Nandan GSE" style={{ height: 26 }} />
              <div><div style={{ fontSize: 12, color: "#5a6672", letterSpacing: 1 }}>LEADERS COUNCIL · START · STOP · CONTINUE</div><div style={{ fontSize: 26, fontWeight: 800, color: k.colour }}>{k.label}</div></div>
              <div style={{ marginLeft: "auto", fontSize: 12, color: "#5a6672", textAlign: "right" }}>{today}<br />{rows.length} card{rows.length === 1 ? "" : "s"}</div>
            </div>
            {rows.length === 0 && <div style={{ color: "#8a94a0" }}>Nothing on this column.</div>}
            {rows.map((c, n) => { const w = who(c.added_by); return (
              <div key={c.id} style={{ borderLeft: `6px solid ${w.colour}`, border: "1px solid #e2e0da", borderLeftWidth: 6, borderLeftColor: w.colour, borderRadius: 8, padding: "10px 12px", marginBottom: 10, breakInside: "avoid" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                  <span style={{ fontWeight: 800, color: k.colour }}>{n + 1}.</span>
                  <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.35, flex: 1 }}>{c.title}</div>
                  <span style={{ fontSize: 12, whiteSpace: "nowrap" }}>👍 {c.up} &nbsp; 👎 {c.down}</span>
                </div>
                {c.details && <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5 }}><RichContent text={c.details} legacy={(s) => <div style={{ whiteSpace: "pre-wrap" }}>{s}</div>} /></div>}
                <div style={{ fontSize: 11, color: "#5a6672", marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: w.colour }} /> {w.name} · {dmy(c.created_at)}
                </div>
              </div>
            ); })}
          </section>
        );
      })}
      <style>{`@media print { .no-print { display: none !important; } body { margin: 0; } img { max-width: 100%; } } @page { size: A4; margin: 0; }`}</style>
    </div>
  );
}
