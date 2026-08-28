"use client";
/**
 * The Dashboard — the salesperson's morning, on one screen.
 *
 * Laid out as Dr Raghu drew it (28 Aug 2026): the metric boxes across the
 * top, each with its weekly average under the date filter; then the space
 * split 50 / 25 / 25 — Open Opportunities and Target Quotations stacked on
 * the left, the Prospecting Queue and the Goal Tasks (from Main Genie
 * Tasking) standing in the two right quarters.
 *
 * Scope: your own numbers, always; the whole desk only for the CEO, Sales
 * Head and admin — a salesperson's dashboard is a mirror, not a leaderboard.
 */
import { useCallback, useEffect, useState } from "react";
import { NAVY, NAVY_SOFT, INK, MUTED, BORDER, ORANGE, GREEN } from "./palette";
import { DateRangeBar, DEFAULT_RANGE, type DateRange } from "./DateRange";
import ProspectQueue from "./ProspectQueue";

const fmtMoney = (n: number): string =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : `₹${Math.round(n).toLocaleString("en-IN")}`;

interface Metric { n: number; value?: number }
interface Chip { id: string; title: string; company: string | null; amount: number; group?: string; bucket?: string }
interface Data {
  scope: string; allowedTeam: boolean; weeks: number;
  metrics: Record<string, Metric>;
  openOpportunities: Chip[]; targetQuotations: Chip[];
}
interface GoalTask { id: string; title: string; detail: string | null; due: string | null; esc: string; job: string | null }

const METRIC_DEFS: { key: string; label: string; money?: boolean; sub?: string }[] = [
  { key: "booking", label: "Booking", money: true },
  { key: "billing", label: "Billing", money: true },
  { key: "collections", label: "Collections", money: true, sub: "invoices marked Paid in ERP" },
  { key: "calls", label: "Calls" },
  { key: "visits", label: "Visits" },
  { key: "video_calls", label: "Video Calls" },
  { key: "quotations", label: "Quotations", money: true },
  { key: "opportunities_handled", label: "Opps Handled" },
  { key: "tasks_open", label: "Tasks Open" },
];

const BUCKET_ORDER = ["bucket_0", "bucket_a", "bucket_b", "this_month", "next_month"];
const BUCKET_LABEL: Record<string, string> = {
  bucket_0: "Bucket 0", bucket_a: "Bucket A", bucket_b: "Bucket B",
  this_month: "This Month", next_month: "Next Month",
};

export default function Dashboard({ onOpen }: { onOpen: (target: string, id: string) => void }) {
  const [range, setRange] = useState<DateRange>(DEFAULT_RANGE);
  const [scope, setScope] = useState<"me" | "team">("me");
  const [data, setData] = useState<Data | null>(null);
  const [tasks, setTasks] = useState<GoalTask[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const p = new URLSearchParams({ from: range.from, to: range.to, scope });
    fetch(`/api/crm/dashboard?${p}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(String(j.error || r.status)); setData(j); setErr(""); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [range, scope]);
  useEffect(() => {
    fetch("/api/crm/goal-tasks").then(async (r) => setTasks(((await r.json()).tasks || []) as GoalTask[])).catch(() => setTasks([]));
  }, []);

  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <DateRangeBar value={range} onChange={setRange} />
        {data?.allowedTeam && (
          <div className="flex gap-1">
            {(["me", "team"] as const).map((s) => (
              <button key={s} onClick={() => setScope(s)} className="rounded px-2.5 py-1 font-bold"
                style={{ fontSize: 12, background: scope === s ? NAVY : "#fff", color: scope === s ? "#fff" : MUTED, border: `1px solid ${scope === s ? NAVY : BORDER}` }}>
                {s === "me" ? "Me" : "Sales Team"}
              </button>
            ))}
          </div>
        )}
      </div>
      {err && <div className="text-xs font-semibold mb-2" style={{ color: "#B3261E" }}>{err}</div>}

      {/* ── the top strip ── */}
      <div className="flex gap-2 mb-4" style={{ flexWrap: "wrap" }}>
        {METRIC_DEFS.map((m) => {
          const v = data?.metrics?.[m.key];
          const main = v == null ? "…" : m.money ? fmtMoney(v.value || 0) : String(v.n);
          const weekly = v == null || !data ? null
            : m.money ? `${fmtMoney((v.value || 0) / data.weeks)}/wk` : `${((v.n || 0) / data.weeks).toFixed(1)}/wk`;
          return (
            <div key={m.key} title={m.sub || m.label}
              style={{ border: `1px solid ${BORDER}`, borderTop: `3px solid ${m.key === "booking" ? GREEN : m.key === "tasks_open" ? ORANGE : NAVY}`, borderRadius: 8, padding: "7px 12px", background: "#fff", flex: "1 1 0", minWidth: 108 }}>
              <div style={{ fontSize: 9.5, letterSpacing: ".04em", color: MUTED, fontWeight: 700, whiteSpace: "nowrap" }}>{m.label.toUpperCase()}</div>
              <div className="tnum" style={{ fontSize: 17, fontWeight: 800, color: INK, whiteSpace: "nowrap" }}>{main}</div>
              <div className="tnum" style={{ fontSize: 10, color: MUTED, whiteSpace: "nowrap" }}>
                {m.money && v ? `${v.n} nos · ` : ""}{weekly ? `≈ ${weekly}` : ""}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 50 / 25 / 25 ── */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr) minmax(0,1fr)" }}>
        <div style={{ minWidth: 0 }}>
          <ChipPanel
            title="Open Opportunities"
            storageKey="crm.dash.opps"
            groups={[
              { key: "new", label: "New", chips: (data?.openOpportunities || []).filter((c) => c.group === "new") },
              { key: "handled", label: "In Process", chips: (data?.openOpportunities || []).filter((c) => c.group !== "new") },
            ]}
            onChip={(c) => onOpen("opportunity", c.id)}
          />
          <ChipPanel
            title="Target Quotations"
            storageKey="crm.dash.target"
            groups={BUCKET_ORDER.map((b) => ({
              key: b, label: BUCKET_LABEL[b],
              chips: (data?.targetQuotations || []).filter((c) => c.bucket === b),
            }))}
            onChip={(c) => onOpen("quotation", c.id)}
          />
        </div>

        <div style={{ minWidth: 0 }}>
          <ProspectQueue onOpen={onOpen} compact />
        </div>

        <div style={{ minWidth: 0 }}>
          <div className="rounded-lg border" style={{ borderColor: BORDER, background: "#fff" }}>
            <div className="px-3 py-2.5 flex items-baseline gap-2" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <b style={{ fontSize: 13.5, color: INK }}>◎ Goal Tasks</b>
              <span style={{ fontSize: 10.5, color: MUTED }}>from Genie Tasking · {tasks?.length ?? "…"}</span>
            </div>
            {tasks !== null && !tasks.length && (
              <div className="px-3 py-4 text-xs" style={{ color: MUTED }}>Nothing assigned to you in Nandan Tasking.</div>
            )}
            {(tasks || []).map((t) => {
              const late = t.due && t.due < new Date().toISOString().slice(0, 10);
              return (
                <div key={t.id} className="px-3 py-2" style={{ borderBottom: "1px solid #F2F4F8" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: INK, lineHeight: 1.35 }}>
                    {t.esc !== "None" && <span style={{ color: "#B3261E" }}>⚑ </span>}{t.title}
                  </div>
                  <div style={{ fontSize: 10.5, color: late ? "#B3261E" : MUTED }}>
                    {t.job ? `JOB ${t.job} · ` : ""}{t.due ? `due ${t.due}${late ? " · late" : ""}` : "no date"}
                  </div>
                </div>
              );
            })}
            <div className="px-3 py-2 text-xs" style={{ color: MUTED }}>
              Done where it lives — <a href="/" style={{ color: NAVY, fontWeight: 700 }}>open Genie Tasking ↗</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A wrapping row of deal chips, capped at N lines — four by default, and the
 * salesperson sets their own cap with the +/− control (kept per screen in
 * the browser), exactly as asked: "add or remove lines based on their need".
 */
function ChipPanel({ title, storageKey, groups, onChip }: {
  title: string; storageKey: string;
  groups: { key: string; label: string; chips: Chip[] }[];
  onChip: (c: Chip) => void;
}) {
  const [lines, setLines] = useState(4);
  useEffect(() => {
    try { const v = Number(window.localStorage.getItem(storageKey)); if (v >= 1 && v <= 12) setLines(v); } catch { /* fine */ }
  }, [storageKey]);
  const bump = (d: number) => {
    const v = Math.min(12, Math.max(1, lines + d));
    setLines(v);
    try { window.localStorage.setItem(storageKey, String(v)); } catch { /* fine */ }
  };
  const total = groups.reduce((a, g) => a + g.chips.length, 0);
  const CHIP_LINE = 30; // one wrapped row of chips, in px

  return (
    <div className="rounded-lg border mb-3" style={{ borderColor: BORDER, background: "#fff" }}>
      <div className="px-3 py-2.5 flex items-center gap-2" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <b style={{ fontSize: 13.5, color: INK }}>{title}</b>
        <span className="tnum rounded px-2" style={{ background: NAVY_SOFT, color: NAVY, fontSize: 11.5, fontWeight: 800 }}>{total}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: MUTED }}>{lines} line{lines === 1 ? "" : "s"}</span>
        <button onClick={() => bump(-1)} title="Fewer lines" className="rounded px-1.5" style={{ border: `1px solid ${BORDER}`, color: MUTED, fontSize: 12 }}>−</button>
        <button onClick={() => bump(1)} title="More lines" className="rounded px-1.5" style={{ border: `1px solid ${BORDER}`, color: MUTED, fontSize: 12 }}>+</button>
      </div>
      <div className="px-3 py-2">
        {groups.map((g) => g.chips.length > 0 && (
          <div key={g.key} className="mb-1.5">
            <div style={{ fontSize: 9.5, letterSpacing: ".05em", fontWeight: 800, color: MUTED, marginBottom: 3 }}>
              {g.label.toUpperCase()} <span className="tnum">({g.chips.length} · {fmtMoney(g.chips.reduce((a, c) => a + c.amount, 0))})</span>
            </div>
            <div className="flex flex-wrap gap-1" style={{ maxHeight: lines * CHIP_LINE, overflow: "hidden" }}>
              {g.chips.sort((a, b) => b.amount - a.amount).map((c) => (
                <button key={c.id} onClick={() => onChip(c)}
                  title={`${c.company ? c.company + " — " : ""}${c.title}`}
                  className="rounded border px-2 py-0.5 text-left"
                  style={{ borderColor: BORDER, background: "#F8F9FC", fontSize: 11, maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  <b style={{ color: NAVY }}>{c.company || c.title}</b>
                  {c.amount ? <span className="tnum" style={{ color: MUTED }}> · {fmtMoney(c.amount)}</span> : null}
                </button>
              ))}
            </div>
          </div>
        ))}
        {total === 0 && <div className="text-xs py-1" style={{ color: MUTED }}>Nothing here for this scope.</div>}
      </div>
    </div>
  );
}
