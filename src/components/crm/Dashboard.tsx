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
import { swallow } from "@/lib/swallow";
import { NAVY, NAVY_SOFT, INK, MUTED, BORDER, ORANGE, GREEN } from "./palette";
import Funnel from "./Funnel";
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
  fy: string; fyEnd: string; weeksLeft: number; weeksGone: number;
  fytd: Record<string, number>; targets: Record<string, number>;
}
interface GoalTask { id: string; title: string; detail: string | null; due: string | null; esc: string; job: string | null }

/**
 * Each box knows where its target and its year-to-date live: money targets
 * are annual (÷52 for the week), activity targets are already per week.
 */
const METRIC_DEFS: {
  key: string; label: string; money?: boolean; sub?: string;
  targetKey?: string; targetWeekly?: boolean; fytdKey?: string;
}[] = [
  { key: "booking", label: "Booking", money: true, targetKey: "booking", fytdKey: "booking" },
  { key: "billing", label: "Billing", money: true, targetKey: "billing", fytdKey: "billing" },
  { key: "collections", label: "Collections", money: true, sub: "invoices marked Paid in ERP", targetKey: "collections", fytdKey: "collections" },
  { key: "calls", label: "Calls", targetKey: "calls_wk", targetWeekly: true, fytdKey: "calls" },
  { key: "visits", label: "Visits", targetKey: "visits_wk", targetWeekly: true, fytdKey: "visits" },
  { key: "video_calls", label: "Video Calls", targetKey: "video_calls_wk", targetWeekly: true, fytdKey: "video_calls" },
  { key: "quotations", label: "Quotations", money: true, targetKey: "quotation_value", fytdKey: "quotations_value" },
  { key: "opportunities_handled", label: "Opps Handled", targetKey: "opps_wk", targetWeekly: true },
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
  const [openTask, setOpenTask] = useState<GoalTask | null>(null);
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
      {/* THE FUNNEL, FIRST (Dr Raghu, 30 Sep 2026). It is the question the
          rest of this page is evidence for: how many came in, how many got
          as far as somebody speaking to them, how many became an
          opportunity. Its own window and its own person picker, because a
          funnel scoped to something else is not this funnel. */}
      <div className="mb-3"><Funnel /></div>

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
      {err && <div className="text-xs font-semibold mb-2" style={{ color: "var(--red)" }}>{err}</div>}

      {/* ── the top strip ── */}
      <div className="flex gap-2 mb-4" style={{ flexWrap: "wrap" }}>
        {METRIC_DEFS.map((m) => {
          const v = data?.metrics?.[m.key];
          const main = v == null ? "…" : m.money ? fmtMoney(v.value || 0) : String(v.n);
          const weekly = v == null || !data ? null
            : m.money ? `${fmtMoney((v.value || 0) / data.weeks)}/wk` : `${((v.n || 0) / data.weeks).toFixed(1)}/wk`;
          // target/week (light green) and the run rate still owed per week to
          // land the year by 31 March — red when it exceeds the target pace
          const tRaw = m.targetKey && data ? data.targets?.[m.targetKey] : undefined;
          const tWk = tRaw == null ? null : m.targetWeekly ? tRaw : tRaw / 52;
          const annualT = tRaw == null ? null : m.targetWeekly ? tRaw * 52 : tRaw;
          const done = m.fytdKey && data ? data.fytd?.[m.fytdKey] ?? 0 : null;
          const req = annualT != null && done != null && data ? Math.max(0, annualT - done) / data.weeksLeft : null;
          const fmt = (n: number) => (m.money ? fmtMoney(n) : n >= 10 ? String(Math.round(n)) : n.toFixed(1));
          return (
            <div key={m.key} title={m.sub || m.label}
              style={{ border: `1px solid ${BORDER}`, borderTop: `3px solid ${m.key === "booking" ? GREEN : m.key === "tasks_open" ? ORANGE : NAVY}`, borderRadius: 8, padding: "7px 12px", background: "#fff", flex: "1 1 0", minWidth: 108 }}>
              <div style={{ fontSize: 9.5, letterSpacing: ".04em", color: MUTED, fontWeight: 700, whiteSpace: "nowrap" }}>{m.label.toUpperCase()}</div>
              <div className="tnum" style={{ fontSize: 17, fontWeight: 800, color: INK, whiteSpace: "nowrap" }}>{main}</div>
              <div className="tnum" style={{ fontSize: 10, color: MUTED, whiteSpace: "nowrap" }}>
                {m.money && v ? `${v.n} nos · ` : ""}{weekly ? `≈ ${weekly}` : ""}
              </div>
              {tWk != null && (
                <div className="tnum" style={{ fontSize: 10, fontWeight: 700, color: "#4CAF7D", whiteSpace: "nowrap" }}
                  title={`The plan for FY ${data?.fy}`}>
                  Target {fmt(tWk)}/wk
                </div>
              )}
              {req != null && tWk != null && (
                <div className="tnum" style={{ fontSize: 10, fontWeight: 800, whiteSpace: "nowrap", color: req > tWk * 1.05 ? "var(--red)" : GREEN }}
                  title={`Still owed ÷ the ${data?.weeksLeft} weeks to ${data?.fyEnd} — red when the pace needed now exceeds the planned pace`}>
                  Req {fmt(req)}/wk
                </div>
              )}
              {tRaw == null && m.targetKey && (
                <div style={{ fontSize: 9, color: "#C9CDD6", whiteSpace: "nowrap" }}>no target set</div>
              )}
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
          <FollowUps onOpen={onOpen} />
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
                <button key={t.id} onClick={() => setOpenTask(t)} className="w-full text-left px-3 py-2"
                  title="Open the detail" style={{ borderBottom: "1px solid #F2F4F8", display: "block" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: INK, lineHeight: 1.35 }}>
                    {t.esc !== "None" && <span style={{ color: "var(--red)" }}>⚑ </span>}{t.title}
                  </div>
                  <div style={{ fontSize: 10.5, color: late ? "var(--red)" : MUTED }}>
                    {t.job ? `JOB ${t.job} · ` : ""}{t.due ? `due ${t.due}${late ? " · late" : ""}` : "no date"}
                  </div>
                </button>
              );
            })}
            <div className="px-3 py-2 text-xs" style={{ color: MUTED }}>
              Done where it lives — <a href="/" style={{ color: NAVY, fontWeight: 700 }}>open Genie Tasking ↗</a>
            </div>
          </div>
        </div>
      </div>

      {openTask && (
        <div onClick={() => setOpenTask(null)} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(22,35,47,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="rounded" style={{ background: "#fff", width: "min(520px,100%)", boxShadow: "0 12px 40px rgba(27,45,107,.35)" }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ background: NAVY, borderRadius: "6px 6px 0 0" }}>
              <b className="text-white" style={{ fontSize: 14 }}>◎ Goal Task</b>
              <button onClick={() => setOpenTask(null)} className="px-2 py-1 rounded text-sm" style={{ background: "rgba(255,255,255,.12)", color: "#C8D2DC" }}>✕</button>
            </div>
            <div className="p-4">
              <div style={{ fontSize: 15, fontWeight: 800, color: INK, lineHeight: 1.4 }}>
                {openTask.esc !== "None" && <span style={{ color: "var(--red)" }}>⚑ {openTask.esc} · </span>}{openTask.title}
              </div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
                {openTask.job ? `JOB ${openTask.job} · ` : ""}{openTask.due ? `due ${openTask.due}` : "no date"}
              </div>
              {openTask.detail && (
                <div style={{ fontSize: 13, color: INK, lineHeight: 1.6, marginTop: 10, whiteSpace: "pre-wrap" }}>{openTask.detail}</div>
              )}
              <div style={{ fontSize: 12, color: MUTED, marginTop: 12 }}>
                Done where it lives — <a href="/" style={{ color: NAVY, fontWeight: 700 }}>open Genie Tasking ↗</a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The courtesy queue — thank-yous a card scan promised, due tomorrow
 * morning, each with the message already written. One tap opens the
 * WhatsApp or mail draft; ✓ records that the courtesy went. The sending
 * hand stays human — the automation killed the forgetting, not the
 * judgement.
 */
function FollowUps({ onOpen }: { onOpen: (target: string, id: string) => void }) {
  interface Fu { id: string; channel: string; due_at: string; person_id: string | null; person: string | null; company: string | null; to_email: string | null; to_phone: string | null; subject: string | null; body: string | null; send_mode: string }
  const [items, setItems] = useState<Fu[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch("/api/crm/outbound?due=1").then(async (r) => setItems(((await r.json()).items || []) as Fu[])).catch(() => setItems([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  const send = async (id: string) => {
    setBusy(id);
    try {
      const r = await fetch("/api/crm/outbound", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "send", id }) });
      const j = await r.json().catch(() => ({}));
      if (j.url) window.open(j.url, "_blank", "noopener");
    } catch (e) { swallow("crm/Dashboard", e); /* the queue screen carries the errors */ }
    setBusy(null); load();
  };
  const cancel = async (id: string) => {
    setBusy(id);
    await fetch("/api/crm/outbound", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cancel", id }) }).catch(() => {});
    setBusy(null); load();
  };
  if (items !== null && !items.length) return null;
  return (
    <div className="rounded-lg border mt-3" style={{ borderColor: BORDER, background: "#fff" }}>
      <div className="px-2.5 py-2 flex items-baseline gap-2" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <b style={{ fontSize: 12.5, color: INK }}>🤝 Thank-yous due</b>
        <span style={{ fontSize: 10, color: MUTED }}>{items?.length ?? "…"} · from card scans</span>
      </div>
      {(items || []).map((f) => (
        <div key={f.id} className="px-2.5 py-1.5" style={{ borderBottom: "1px solid #F2F4F8" }}>
          <div className="flex items-center gap-1.5">
            <span style={{ fontSize: 11 }}>{f.channel === "email" ? "✉" : "🟢"}</span>
            <button onClick={() => f.person_id && onOpen("person", f.person_id)} className="text-left font-bold"
              style={{ color: NAVY, fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: 1 }}>
              {f.person || f.to_email || f.to_phone}{f.company ? ` · ${f.company}` : ""}
            </button>
            {f.send_mode === "auto" && <span style={{ fontSize: 8.5, color: GREEN, fontWeight: 800 }} title="Will send itself at 6 AM">AUTO</span>}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5" style={{ paddingLeft: 18 }}>
            <button onClick={() => send(f.id)} disabled={busy === f.id}
              className="rounded px-2 py-0.5 font-bold"
              style={{ background: f.channel === "email" ? NAVY_SOFT : "#E6F4EB", color: f.channel === "email" ? NAVY : GREEN, fontSize: 10.5 }}>
              {f.channel === "email" ? "send now" : "open WhatsApp, written"}
            </button>
            <button onClick={() => cancel(f.id)} disabled={busy === f.id} title="Let it go, on purpose"
              style={{ color: MUTED, fontSize: 10 }}>✕</button>
          </div>
        </div>
      ))}
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
    try { const v = Number(window.localStorage.getItem(storageKey)); if (v >= 1 && v <= 12) setLines(v); } catch (e) { swallow("crm/Dashboard", e); /* fine */ }
  }, [storageKey]);
  const bump = (d: number) => {
    const v = Math.min(12, Math.max(1, lines + d));
    setLines(v);
    try { window.localStorage.setItem(storageKey, String(v)); } catch (e) { swallow("crm/Dashboard", e); /* fine */ }
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
