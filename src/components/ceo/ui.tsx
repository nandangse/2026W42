"use client";
/** The CEO module's two building blocks: a card whose number opens its lightbox, and a titled row of them. */
import { useDrill, type DrillAsk } from "@/components/ceo/Drill";

const NAVY = "var(--navy)", MUTED = "var(--muted)", LINE = "var(--line)", RED = "var(--red)";

/** a card whose number opens its lightbox */
export function Card({ label, value, sub, ask, tone }: { label: string; value: string; sub?: React.ReactNode; ask?: DrillAsk; tone?: string }) {
  const open = useDrill();
  return (
    <div onClick={() => ask && open({ ...ask, label: ask.label || label.charAt(0) + label.slice(1).toLowerCase() })} role={ask ? "button" : undefined} className="bg-white rounded-lg p-3 h-full" style={{ border: `1px solid ${LINE}`, borderTop: `3px solid ${tone || NAVY}`, cursor: ask ? "pointer" : "default" }} title={ask ? "Open what makes this number" : undefined}>
      <div className="text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.6 }}>{label}</div>
      <div className="font-bold tnum" style={{ fontSize: 22, color: "var(--ink)", lineHeight: 1.2, textDecoration: ask ? "underline dotted" : undefined, textUnderlineOffset: 4 }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: MUTED }}>{sub}</div>}
    </div>
  );
}
export function Section({ title, err, children }: { title: string; err?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-xs font-bold mb-1.5" style={{ color: NAVY, letterSpacing: 1 }}>{title}</div>
      {err ? <div className="text-xs" style={{ color: RED }}>Could not be read: {err}</div> : <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>{children}</div>}
    </div>
  );
}

