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
  quoteStages: { name: string; colour: string | null; count: number }[];
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

  const shown: Lane[] = swim ? (lanes ?? []).filter((l) => l.opps + l.quotes + l.sos > 0) : all ? [all] : [];

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

      {shown.map((l) => (
        <div key={l.key} className="rounded border mb-3 p-4" style={{ borderColor: BORDER, background: "#fff" }}>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <div className="font-bold" style={{ color: NAVY, fontSize: 15, minWidth: 120 }}>{l.name}</div>
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: NAVY_SOFT, color: NAVY }}
              title="End to end: sales orders against opportunities"
            >
              top {pct(l.sos, l.opps)}
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Station label="Opportunities" n={l.opps} />
            <Arrow label={pct(l.quotes, l.opps)} />
            <Station label="Quotations" n={l.quotes} />
            <Arrow label={pct(l.sos, l.quotes)} />
            <Station label="Sales Orders" n={l.sos} strong />
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
        Counted by date: opportunities by when they were created, quotations by
        when they were made, sales orders by when they were ordered — each
        within the chosen range. The conversions compare those counts, so a
        quote made this month against last month&apos;s enquiry shows in its own
        column, not the arrow.
      </p>
    </div>
  );
}

function Station({ label, n, strong }: { label: string; n: number; strong?: boolean }) {
  return (
    <div
      className="rounded px-4 py-2 text-center"
      style={{ background: strong ? NAVY : NAVY_SOFT, minWidth: 130 }}
    >
      <div className="tnum font-extrabold" style={{ fontSize: 20, color: strong ? "#fff" : NAVY }}>
        {n.toLocaleString("en-IN")}
      </div>
      <div className="text-xs font-bold" style={{ color: strong ? "#C8D2EC" : MUTED, letterSpacing: 0.4 }}>
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
