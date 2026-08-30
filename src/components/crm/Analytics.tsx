"use client";

/**
 * ANALYTICS — the pipeline as arithmetic.
 *
 * Opportunities → Quotations → Sales Orders for the chosen dates, with the
 * conversion between each pair and from end to end. A toggle lays it out as
 * swimlanes on Sector or as one line for the whole business; a second toggle
 * beside Quotations opens the hotness stages of the quotes in between.
 */

import { useEffect, useState } from "react";
import { NAVY, NAVY_SOFT, MUTED, BORDER, ORANGE, GREEN, INK } from "./palette";
import { DateRangeBar, DEFAULT_RANGE, type DateRange } from "./DateRange";

type Lane = {
  key: string;
  name: string;
  opps: number;
  quotes: number;
  sos: number;
  quoteAmt?: number;
  soAmt?: number;
  quoteStages: { name: string; colour: string | null; count: number }[];
};

/** ₹ 12.40 Cr / ₹ 8.2 L — money at analytics altitude. */
const cr = (v?: number) => {
  const n = Number(v) || 0;
  if (!n) return null;
  return n >= 1e7 ? `₹ ${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹ ${(n / 1e5).toFixed(1)} L` : `₹ ${Math.round(n).toLocaleString("en-IN")}`;
};

const pct = (num: number, den: number) =>
  den > 0 ? `${Math.round((num / den) * 1000) / 10}%` : "—";

export default function AnalyticsScreen() {
  const [range, setRange] = useState<DateRange>(DEFAULT_RANGE);
  // the four rooms (Dr Raghu, 30 Aug 2026)
  const [view, setView] = useState<"ratios" | "funnel" | "focus" | "effort" | "breakdown">("ratios");
  // sector · person · all — the same three-station arithmetic, cut three ways
  const [mode, setMode] = useState<"sector" | "person" | "all">("sector");
  const swim = mode !== "all";
  const [showStages, setShowStages] = useState(false);
  const [lanes, setLanes] = useState<Lane[] | null>(null);
  const [all, setAll] = useState<Lane | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setLanes(null); setErr("");
    fetch(`/api/crm/analytics?from=${range.from}&to=${range.to}${mode === "person" ? "&by=person" : ""}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not load analytics");
        setLanes(j.lanes); setAll(j.all);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [range.from, range.to, mode]);

  const shown: Lane[] = swim ? (lanes ?? []).filter((l) => l.opps + l.quotes + l.sos > 0) : [];

  return (
    <div>
      <DateRangeBar value={range} onChange={setRange} />

      <div className="flex gap-1 mb-3 flex-wrap">
        {([["ratios", "📐 Conversion Ratios"], ["funnel", "🏺 Sales Funnel"], ["focus", "🎯 Focus Dashboard"], ["effort", "🏃 Effort Dashboard"], ["breakdown", "📦 Breakdowns"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} className="px-3 py-1.5 rounded text-sm font-bold"
            style={view === k ? { background: NAVY, color: "#fff" } : { color: "#5A6672", border: `1px solid ${BORDER}`, background: "#fff" }}>
            {l}
          </button>
        ))}
      </div>

      {view === "funnel" && <FunnelView range={range} />}
      {view === "focus" && <FocusView />}
      {view === "effort" && <EffortView range={range} />}
      {view === "breakdown" && <BreakdownView range={range} />}
      {view !== "ratios" ? null : (<>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setMode("sector")}
          className="px-3 py-1 rounded-full text-xs font-bold border"
          style={mode === "sector" ? { background: NAVY, borderColor: NAVY, color: "#fff" } : { background: "#fff", borderColor: BORDER, color: MUTED }}
        >
          Swimlanes · Sector
        </button>
        <button
          onClick={() => setMode("person")}
          className="px-3 py-1 rounded-full text-xs font-bold border"
          title="The same conversions per salesperson — opportunity to quote, quote to order, end to end"
          style={mode === "person" ? { background: NAVY, borderColor: NAVY, color: "#fff" } : { background: "#fff", borderColor: BORDER, color: MUTED }}
        >
          Swimlanes · Salesperson
        </button>
        <button
          onClick={() => setMode("all")}
          className="px-3 py-1 rounded-full text-xs font-bold border"
          style={mode === "all" ? { background: NAVY, borderColor: NAVY, color: "#fff" } : { background: "#fff", borderColor: BORDER, color: MUTED }}
        >
          Show all
        </button>
        <span style={{ width: 10 }} />
        <button
          onClick={() => setShowStages((v) => !v)}
          className="px-3 py-1 rounded-full text-xs font-bold border"
          style={showStages ? { background: ORANGE, borderColor: ORANGE, color: "#fff" } : { background: "#fff", borderColor: BORDER, color: MUTED }}
        >
          {showStages ? "Hide quote stages" : "Show quote stages"}
        </button>
      </div>

      {err && <div className="rounded p-3 text-sm" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>}
      {!err && lanes === null && <div className="text-sm" style={{ color: MUTED }}>loading…</div>}
      {!err && lanes !== null && shown.length === 0 && (
        <div className="rounded p-6 text-sm" style={{ background: "#fff", border: `1px dashed ${BORDER}`, color: MUTED }}>
          Nothing moved in this date range.
        </div>
      )}

      {/* THE WHOLE BUSINESS FIRST (Dr Raghu, 30 Aug 2026) — then the lanes,
          name on the left, the three boxes to its right */}
      {all && (
        <div className="rounded border mb-3 p-4" style={{ borderColor: BORDER, background: "#fff" }}>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <div className="font-bold" style={{ color: NAVY, fontSize: 15, minWidth: 120 }}>{all.name}</div>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: NAVY_SOFT, color: NAVY }}
              title="End to end: sales orders against opportunities">
              top {pct(all.sos, all.opps)}
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Station label="Opportunities" n={all.opps} />
            <Arrow label={pct(all.quotes, all.opps)} />
            <Station label="Quotations" n={all.quotes} amt={cr(all.quoteAmt)} />
            <Arrow label={pct(all.sos, all.quotes)} />
            <Station label="Sales Orders" n={all.sos} amt={cr(all.soAmt)} strong />
          </div>
        </div>
      )}

      {shown.map((l) => (
        <div key={l.key} className="rounded border mb-2 px-4 py-2.5" style={{ borderColor: BORDER, background: "#fff" }}>
          <div className="flex items-center gap-3 flex-wrap">
            <div style={{ minWidth: 190 }}>
              <div className="font-bold" style={{ color: NAVY, fontSize: 14 }}>{l.name}</div>
              <span className="text-xs font-bold" style={{ color: MUTED }}
                title="End to end: sales orders against opportunities">top {pct(l.sos, l.opps)}</span>
            </div>
            <Station label="Opportunities" n={l.opps} compact />
            <Arrow label={pct(l.quotes, l.opps)} />
            <Station label="Quotations" n={l.quotes} amt={cr(l.quoteAmt)} compact />
            <Arrow label={pct(l.sos, l.quotes)} />
            <Station label="Sales Orders" n={l.sos} amt={cr(l.soAmt)} strong compact />
          </div>

          {showStages && l.quoteStages.length > 0 && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.6 }}>QUOTE STAGES</span>
              {l.quoteStages.map((s) => (
                <span
                  key={s.name}
                  className="text-xs font-semibold px-2 py-1 rounded border"
                  style={{ borderColor: BORDER, background: "#fff", color: INK }}
                >
                  <span style={{
                    display: "inline-block", width: 8, height: 8, borderRadius: 2,
                    background: s.colour || "#8A94A0", marginRight: 6,
                  }} />
                  {s.name} <b className="tnum">{s.count.toLocaleString("en-IN")}</b>
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      <p className="text-xs mt-2" style={{ color: MUTED, maxWidth: "80ch", lineHeight: 1.6 }}>
        Counted by BUSINESS date (Dr Raghu, 30 Aug 2026): opportunities by their Opportunity Date, quotations by
        the Date of Quote, sales orders by the Order Date — never by when a row entered Genie. The conversions compare those
        counts, so a quote made this month against last month&apos;s enquiry shows in its own column, not the arrow.</p>
      </>)}
    </div>
  );
}

function Station({ label, n, amt, strong, compact }: { label: string; n: number; amt?: string | null; strong?: boolean; compact?: boolean }) {
  return (
    <div
      className="rounded text-center"
      style={{ background: strong ? NAVY : NAVY_SOFT, minWidth: compact ? 118 : 130, padding: compact ? "5px 12px" : "8px 16px" }}
    >
      <div className="tnum font-extrabold" style={{ fontSize: compact ? 16 : 20, color: strong ? "#fff" : NAVY }}>
        {n.toLocaleString("en-IN")}
      </div>
      {amt && (
        <div className="tnum font-bold" style={{ fontSize: compact ? 10.5 : 12, color: strong ? "#8FD5A6" : "#0D7A3F" }}>
          {amt}
        </div>
      )}
      <div className="text-xs font-bold" style={{ color: strong ? "#C8D2EC" : MUTED, letterSpacing: 0.4, fontSize: compact ? 10 : undefined }}>
        {label}
      </div>
    </div>
  );
}

function Arrow({ label }: { label: string }) {
  return (
    <div className="text-center" style={{ minWidth: 64 }}>
      <div className="tnum font-bold" style={{ color: GREEN, fontSize: 13 }}>{label}</div>
      <div style={{ color: MUTED, fontSize: 16, lineHeight: 1 }}>→</div>
    </div>
  );
}

/** The opportunity ladder as a funnel — every rung with its count and money. */
function FunnelView({ range }: { range: DateRange }) {
  type Rung = { name: string; colour: string | null; count: number; amt: number };
  const [rungs, setRungs] = useState<Rung[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    setRungs(null); setErr("");
    fetch(`/api/crm/analytics?view=funnel&from=${range.from}&to=${range.to}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "?"); setRungs(j.rungs); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [range.from, range.to]);
  if (err) return <div className="rounded p-3 text-sm" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>;
  if (rungs === null) return <div className="text-sm" style={{ color: MUTED }}>loading…</div>;
  const max = Math.max(1, ...rungs.map((r) => r.count));
  return (
    <div className="rounded border p-4" style={{ borderColor: BORDER, background: "#fff" }}>
      <div className="text-xs mb-3" style={{ color: MUTED, maxWidth: "80ch", lineHeight: 1.5 }}>
        Opportunities dated inside the range, rung by rung down the ladder — the bar is the count, the money beside it.
      </div>
      {rungs.map((r) => (
        <div key={r.name} className="flex items-center gap-3 mb-1.5">
          <div className="text-xs font-bold" style={{ width: 170, textAlign: "right", color: INK }}>{r.name}</div>
          <div style={{ flex: 1 }}>
            <div className="rounded-r flex items-center px-2" style={{
              width: `${Math.max(2, (r.count / max) * 100)}%`, minWidth: 44, height: 22,
              background: r.colour || "#8A94A0", color: "#fff", fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap",
            }}>
              {r.count.toLocaleString("en-IN")}
            </div>
          </div>
          <div className="tnum text-xs font-bold" style={{ width: 100, color: "#0D7A3F" }}>{cr(r.amt) ?? "—"}</div>
        </div>
      ))}
    </div>
  );
}

/** Where the attention should go today — biggest open quotes, quotes about
 *  to expire, opportunities going cold. */
function FocusView() {
  type Q = { id: string; quote_no: string; grand_total: number; quoted_value: number; valid_until: string | null; status: string; company: string | null };
  type C = { id: string; name: string; company: string | null; amount: number | null; opportunity_on: string | null; stage: string | null };
  const [data, setData] = useState<{ hot: Q[]; expiring: Q[]; cold: C[] } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch("/api/crm/analytics?view=focus", { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "?"); setData(j); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  if (err) return <div className="rounded p-3 text-sm" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>;
  if (!data) return <div className="text-sm" style={{ color: MUTED }}>loading…</div>;
  const money = (q: Q) => cr(Number(q.grand_total) > 0 ? Number(q.grand_total) : Number(q.quoted_value) || 0) ?? "—";
  const d = (v: string | null) => (v ? v.slice(0, 10).split("-").reverse().join("/") : "—");
  const Card = ({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) => (
    <div className="rounded border p-3 mb-3" style={{ borderColor: BORDER, background: "#fff" }}>
      <div className="font-bold text-sm" style={{ color: NAVY }}>{title}</div>
      <div className="text-xs mb-2" style={{ color: MUTED }}>{hint}</div>
      {children}
    </div>
  );
  return (
    <div>
      <Card title="💰 The biggest open quotes" hint="Every rupee on the table, largest first — draft, live, hotlist and submitted.">
        {data.hot.map((q) => (
          <div key={q.id} className="flex items-baseline gap-3 text-sm py-0.5 flex-wrap">
            <b className="tnum" style={{ width: 90, color: "#0D7A3F" }}>{money(q)}</b>
            <span style={{ minWidth: 160 }}>{q.company ?? "—"}</span>
            <span className="tnum text-xs" style={{ color: MUTED }}>{(q.quote_no.match(/(\d+)\s*$/) || [, q.quote_no])[1]}</span>
            <span className="text-xs rounded px-1.5" style={{ background: "#EEF1F5", color: NAVY, fontWeight: 700 }}>{q.status}</span>
            <span className="text-xs" style={{ color: MUTED }}>valid till {d(q.valid_until)}</span>
          </div>
        ))}
        {data.hot.length === 0 && <div className="text-sm" style={{ color: MUTED }}>No open quotes.</div>}
      </Card>
      <Card title="⏳ Expiring inside 14 days" hint="Still open, validity running out — extend or chase.">
        {data.expiring.map((q) => (
          <div key={q.id} className="flex items-baseline gap-3 text-sm py-0.5 flex-wrap">
            <b style={{ color: "#B45309", width: 90 }}>{d(q.valid_until)}</b>
            <span style={{ minWidth: 160 }}>{q.company ?? "—"}</span>
            <b className="tnum" style={{ color: "#0D7A3F" }}>{money(q)}</b>
          </div>
        ))}
        {data.expiring.length === 0 && <div className="text-sm" style={{ color: MUTED }}>Nothing expiring soon.</div>}
      </Card>
      <Card title="🧊 Going cold" hint="Open opportunities with no touch in 14 days — biggest first; one call warms them.">
        {data.cold.map((o) => (
          <div key={o.id} className="flex items-baseline gap-3 text-sm py-0.5 flex-wrap">
            <b className="tnum" style={{ width: 90, color: "#0D7A3F" }}>{cr(Number(o.amount) || 0) ?? "—"}</b>
            <span style={{ minWidth: 160 }}>{o.company ?? "—"}</span>
            <span className="text-xs" style={{ color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>{o.name}</span>
            <span className="text-xs rounded px-1.5" style={{ background: "#EEF1F5", color: NAVY, fontWeight: 700 }}>{o.stage ?? "—"}</span>
            <span className="text-xs" style={{ color: MUTED }}>since {d(o.opportunity_on)}</span>
          </div>
        ))}
        {data.cold.length === 0 && <div className="text-sm" style={{ color: MUTED }}>Nothing going cold — every open deal was touched inside 14 days.</div>}
      </Card>
    </div>
  );
}

/** Activity against output, per salesperson, inside the range. */
function EffortView({ range }: { range: DateRange }) {
  type E = { key: string; name: string; touches: number; calls: number; mails: number; visits: number; quotes: number; quoteAmt: number; opps: number };
  const [rows, setRows] = useState<E[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    setRows(null); setErr("");
    fetch(`/api/crm/analytics?view=effort&from=${range.from}&to=${range.to}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "?"); setRows(j.rows); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [range.from, range.to]);
  if (err) return <div className="rounded p-3 text-sm" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>;
  if (rows === null) return <div className="text-sm" style={{ color: MUTED }}>loading…</div>;
  return (
    <div className="rounded border p-4" style={{ borderColor: BORDER, background: "#fff" }}>
      <div className="text-xs mb-3" style={{ color: MUTED, maxWidth: "84ch", lineHeight: 1.5 }}>
        Effort against output, inside the range: every interaction logged (calls, mails, visits), the enquiries opened, and the quotes made with their money. Effort that never becomes a quote shows itself here.
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ textAlign: "left", color: MUTED, fontSize: 11 }}>
            <th className="py-1 pr-3">PERSON</th>
            <th className="py-1 pr-3" style={{ textAlign: "right" }}>TOUCHES</th>
            <th className="py-1 pr-3" style={{ textAlign: "right" }}>CALLS</th>
            <th className="py-1 pr-3" style={{ textAlign: "right" }}>MAILS</th>
            <th className="py-1 pr-3" style={{ textAlign: "right" }}>VISITS</th>
            <th className="py-1 pr-3" style={{ textAlign: "right" }}>ENQUIRIES</th>
            <th className="py-1 pr-3" style={{ textAlign: "right" }}>QUOTES</th>
            <th className="py-1" style={{ textAlign: "right" }}>QUOTED ₹</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} style={{ borderTop: `1px solid ${BORDER}` }}>
                <td className="py-1.5 pr-3 font-semibold">{r.name}</td>
                <td className="py-1.5 pr-3 tnum" style={{ textAlign: "right", fontWeight: 800 }}>{r.touches.toLocaleString("en-IN")}</td>
                <td className="py-1.5 pr-3 tnum" style={{ textAlign: "right" }}>{r.calls || "—"}</td>
                <td className="py-1.5 pr-3 tnum" style={{ textAlign: "right" }}>{r.mails || "—"}</td>
                <td className="py-1.5 pr-3 tnum" style={{ textAlign: "right" }}>{r.visits || "—"}</td>
                <td className="py-1.5 pr-3 tnum" style={{ textAlign: "right" }}>{r.opps || "—"}</td>
                <td className="py-1.5 pr-3 tnum" style={{ textAlign: "right" }}>{r.quotes || "—"}</td>
                <td className="py-1.5 tnum font-bold" style={{ textAlign: "right", color: "#0D7A3F" }}>{cr(r.quoteAmt) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** BREAKDOWNS (Dr Raghu, 30 Aug 2026) — the range sliced four ways:
 *  product family and product from the quote lines; source and industry
 *  from the opportunities. Counts are distinct records, ₹ is the money. */
function BreakdownView({ range }: { range: { from: string; to: string } }) {
  type RowB = { name: string; count: number; amt: number };
  const [data, setData] = useState<{ families: RowB[]; products: RowB[]; sources: RowB[]; industries: RowB[] } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    setData(null); setErr("");
    fetch(`/api/crm/analytics?view=breakdown&from=${range.from}&to=${range.to}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Could not read"); setData(j); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [range.from, range.to]);
  const inr = (n: number) => n >= 10000000 ? `₹ ${(n / 10000000).toFixed(2)} Cr` : n >= 100000 ? `₹ ${(n / 100000).toFixed(1)} L` : `₹ ${n.toLocaleString("en-IN")}`;
  const Lane = ({ title, note, rows }: { title: string; note: string; rows: RowB[] }) => (
    <div className="bg-white rounded-lg border p-3" style={{ borderColor: "#E2E0DA" }}>
      <div className="font-bold text-sm">{title}</div>
      <div className="text-xs mb-2" style={{ color: "#8A94A0" }}>{note}</div>
      {rows.length === 0 && <div className="text-sm" style={{ color: "#8A94A0" }}>Nothing in this range.</div>}
      {rows.map((r) => {
        const max = rows[0]?.amt || 1;
        return (
          <div key={r.name} className="flex items-center gap-2 py-1" style={{ borderTop: "1px solid #F0F1F6" }}>
            <span className="text-sm" style={{ minWidth: 220, maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.name}>{r.name}</span>
            <div style={{ flex: 1, height: 10, background: "#F4F2EC", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ width: `${Math.max(2, (r.amt / max) * 100)}%`, height: "100%", background: "#1B3A5C", borderRadius: 5 }} />
            </div>
            <span className="text-xs tnum" style={{ color: "#8A94A0", minWidth: 34, textAlign: "right" }}>{r.count}</span>
            <span className="text-sm tnum font-bold" style={{ minWidth: 90, textAlign: "right" }}>{inr(r.amt)}</span>
          </div>
        );
      })}
    </div>
  );
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "1fr", maxWidth: 980 }}>
      {err && <div className="rounded p-2 text-sm" style={{ background: "#FBEDEA", color: "#B3261E" }}>{err}</div>}
      {data === null && !err && <div className="text-sm" style={{ color: "#8A94A0" }}>slicing the range…</div>}
      {data && (<>
        <Lane title="📦 Product family" note="Quote money per Item Group in the range — count is distinct quotations" rows={data.families} />
        <Lane title="🔩 Product" note="The top products by quote money in the range" rows={data.products} />
        <Lane title="🧭 Source" note="Opportunity money by where it came from" rows={data.sources} />
        <Lane title="🏭 Industry" note="Opportunity money by the customer's industry" rows={data.industries} />
      </>)}
    </div>
  );
}
