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
