"use client";
/**
 * THE CEO MODULE'S BUILDING BLOCKS, IN THE TAILADMIN MANNER (Dr Raghu, 14 Oct
 * 2026: "improve the look and feel of this" — tailadmin.com). Soft white
 * cards, an icon in a tinted square, the figure large, and a pill with the
 * week's change: a triangle up or down, green when it is better, red when it
 * is worse, grey when neither ("show triangles in each box with respect to
 * last week — is there improvement or has it got worse").
 */
import { useDrill, cr, type DrillAsk } from "@/components/ceo/Drill";

export const C = { ink: "#1D2939", muted: "#667085", line: "#E4E7EC", bg: "#F2F4F7", brand: "#465FFF", green: "#039855", red: "#D92D20", amber: "#DC6803", violet: "#7A5AF8", sky: "#0BA5EC", navy: "#1B2A41" };

/** last week's comparison for one figure */
export type Delta = { cur: number; prev?: number; good: 1 | -1 | 0; pct?: boolean };

export function DeltaPill({ d }: { d?: Delta }) {
  if (!d || d.prev === undefined || d.prev === null || !Number.isFinite(d.prev)) return null;
  const diff = d.cur - d.prev;
  if (Math.abs(diff) < (d.pct ? 0.05 : 0.5)) return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "#F2F4F7", color: C.muted }} title="the same as a week ago">● same</span>;
  const up = diff > 0;
  const better = d.good === 0 ? null : (d.good > 0) === up;
  const color = better === null ? C.muted : better ? C.green : C.red;
  const bg = better === null ? "#F2F4F7" : better ? "#ECFDF3" : "#FEF3F2";
  const txt = d.pct ? `${Math.abs(diff).toFixed(1)} pts` : d.prev ? `${Math.abs((diff / Math.abs(d.prev)) * 100).toFixed(Math.abs(diff / d.prev) < 0.1 ? 1 : 0)}%` : cr(Math.abs(diff));
  return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: bg, color }} title={`a week ago: ${d.pct ? `${d.prev.toFixed(1)}%` : Math.abs(d.prev) >= 1000 ? cr(d.prev) : d.prev.toLocaleString("en-IN")} — ${better === null ? "moved" : better ? "better" : "worse"}`}>{up ? "▲" : "▼"} {txt}</span>;
}

type Row = { label: string; value: string; ask?: DrillAsk; delta?: Delta; tone?: string };

/** a card: icon, label, the figure (opens its lightbox), a line under it, the week's change, and optional rows beneath */
export function Card({ label, value, sub, ask, tone, icon, delta, rows }: { label: string; value: string; sub?: React.ReactNode; ask?: DrillAsk; tone?: string; icon?: string; delta?: Delta; rows?: Row[] }) {
  const open = useDrill();
  const t = tone || C.brand;
  return (
    <div className="rounded-2xl bg-white p-4 h-full flex flex-col" style={{ border: `1px solid ${C.line}`, boxShadow: "0 1px 3px rgba(16,24,40,.06), 0 1px 2px rgba(16,24,40,.04)" }}>
      <div className="flex items-start gap-3">
        {icon && <div className="rounded-xl flex items-center justify-center flex-shrink-0" style={{ width: 40, height: 40, background: `${t}14`, color: t, fontSize: 18 }}>{icon}</div>}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium" style={{ color: C.muted }}>{label}</div>
          <button onClick={() => ask && open({ ...ask, label: ask.label || label })} disabled={!ask} className="text-left font-bold tnum" style={{ fontSize: 24, color: C.ink, lineHeight: 1.2, cursor: ask ? "pointer" : "default" }} title={ask ? "Open what makes this number" : undefined}>{value}</button>
        </div>
        <DeltaPill d={delta} />
      </div>
      {sub && <div className="text-xs mt-1.5" style={{ color: C.muted }}>{sub}</div>}
      {rows && rows.length > 0 && (
        <div className="mt-3 pt-2 grid gap-1" style={{ borderTop: `1px dashed ${C.line}` }}>
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-2 text-sm">
              <span style={{ color: C.muted, flex: 1 }}>{r.label}</span>
              <button onClick={() => r.ask && open({ ...r.ask, label: r.ask.label || `${label} — ${r.label}` })} disabled={!r.ask} className="font-semibold tnum hover:underline" style={{ color: r.tone || C.ink, cursor: r.ask ? "pointer" : "default" }}>{r.value}</button>
              <DeltaPill d={r.delta} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Section({ title, hint, err, children, min = 210 }: { title: string; hint?: string; err?: string; children: React.ReactNode; min?: number }) {
  return (
    <div className="mb-5">
      <div className="flex items-baseline gap-2 mb-2"><div className="text-sm font-semibold" style={{ color: C.ink }}>{title}</div>{hint && <div className="text-xs" style={{ color: C.muted }}>{hint}</div>}</div>
      {err ? <div className="text-xs" style={{ color: C.red }}>Could not be read: {err}</div> : <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}>{children}</div>}
    </div>
  );
}
