"use client";

/**
 * DEALS — the one live view of the pipeline, as Dr Raghu drew it from the
 * OnePageCRM board (26 Aug 2026): ten chevron columns from Opportunity
 * Received to Order Received, each carrying its weight and its money, every
 * card the deal wherever it currently breathes — opportunity, quotation or
 * sales order. This is the velocity instrument.
 *
 * The Flow tab keeps the came-in / went-out / sitting table per rung.
 */

import { useEffect, useRef, useState } from "react";
import ForecastView from "./Forecast";
import { NAVY, NAVY_SOFT, INK, MUTED, BORDER, ORANGE, GREEN } from "./palette";
import { DateRangeBar, DEFAULT_RANGE, type DateRange } from "./DateRange";

type Card = {
  kind: "opportunity" | "quotation" | "sales_order"; id: string; col: string;
  title: string; company: string | null; owner_id: string | null;
  sector_id: number | null; amount: number; weight: number;
};
type Owner = { id: string; name: string; initials: string | null };
type Sector = { id: number; code: string; name: string };
type Col = { key: string; label: string };

const fmtMoney = (n: number): string =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr`
  : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L`
  : `₹${Math.round(n).toLocaleString("en-IN")}`;

export default function DealsScreen({ onOpen }: { onOpen: (target: string, id: string) => void }) {
  const [view, setView] = useState<"board" | "flow" | "forecast">("board");
  return (
    <div>
      <div className="flex gap-1 rounded p-1 mb-3" style={{ background: "#fff", border: `1px solid ${BORDER}`, width: "fit-content" }}>
        {([["board", "The Board"], ["forecast", "Forecast"], ["flow", "Stage Flow"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setView(k)}
            className="px-3 py-1 rounded text-sm font-bold"
            style={view === k ? { background: NAVY, color: "#fff" } : { color: MUTED }}>
            {l}
          </button>
        ))}
      </div>
      {view === "board" ? <Board onOpen={onOpen} /> : view === "forecast" ? <ForecastView /> : <FlowTable />}
    </div>
  );
}

// ============================================================ THE BOARD ====
function Board({ onOpen }: { onOpen: (target: string, id: string) => void }) {
  const [range, setRange] = useState<DateRange>(DEFAULT_RANGE);
  const [owner, setOwner] = useState("");
  const [sector, setSector] = useState("");
  const [mode, setMode] = useState<"amount" | "weighted">("amount");
  const [lane, setLane] = useState<"none" | "owner" | "sector">("none");
  const [data, setData] = useState<{ columns: Col[]; cards: Card[]; owners: Owner[]; sectors: Sector[] } | null>(null);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  /** deal → its place in MY queue: waiting lights the icon red, handled green. */
  const [marks, setMarks] = useState<{ open: Set<string>; done: Set<string> }>({ open: new Set(), done: new Set() });
  const loadMarks = () => {
    fetch("/api/crm/prospect?marks=1").then(async (r) => {
      const j = await r.json();
      setMarks({ open: new Set(j.open || []), done: new Set(j.done || []) });
    }).catch(() => {});
  };
  useEffect(() => { loadMarks(); }, []);
  const [overCol, setOverCol] = useState<string | null>(null);
  const drag = useRef<{ kind: Card["kind"]; id: string; from: string } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const say = (t: string) => {
    setToast(t);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  };

  /**
   * A drop writes the stage. Optimistic — the card lands where the hand put
   * it — and honest: if the server refuses (the rules live there, not in the
   * mouse), the card snaps back and the refusal is shown in its own words.
   */
  const moveCard = async (toCol: string) => {
    const d = drag.current;
    drag.current = null; setOverCol(null);
    if (!d || d.from === toCol) return;
    setData((prev) => prev && ({ ...prev, cards: prev.cards.map((c) => (c.kind === d.kind && c.id === d.id ? { ...c, col: toCol } : c)) }));
    try {
      const r = await fetch("/api/crm/board", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: d.kind, id: d.id, toCol }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(String(j.error || r.status));
      say("Moved ✓");
    } catch (e) {
      setData((prev) => prev && ({ ...prev, cards: prev.cards.map((c) => (c.kind === d.kind && c.id === d.id ? { ...c, col: d.from } : c)) }));
      say(e instanceof Error ? e.message : String(e));
    }
  };

  /** The save icon: this deal into MY prospecting queue, for the call list. */
  const queueCard = async (c: Card) => {
    try {
      const r = await fetch("/api/crm/prospect", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add", kind: c.kind, id: c.id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(String(j.error || r.status));
      say(j.already ? "Already in your prospecting queue" : "Added to your prospecting queue ✓");
      loadMarks();
    } catch (e) {
      say(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    setErr("");
    const p = new URLSearchParams({ from: range.from, to: range.to });
    if (owner) p.set("owner", owner);
    if (sector) p.set("sector", sector);
    fetch(`/api/crm/board?${p}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not load the board");
        setData(j);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [range.from, range.to, owner, sector]);

  if (err) return <div className="rounded p-3 text-sm" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>;
  if (!data) return <div className="text-sm" style={{ color: MUTED }}>loading the board…</div>;

  const val = (c: Card) => (mode === "weighted" ? (c.amount * c.weight) / 100 : c.amount);
  const ownerName = new Map(data.owners.map((o) => [o.id, o]));
  const sectorName = new Map(data.sectors.map((s) => [s.id, s]));

  const lanes: { key: string; label: string; cards: Card[] }[] =
    lane === "none"
      ? [{ key: "all", label: "", cards: data.cards }]
      : lane === "owner"
        ? [
            ...data.owners.map((o) => ({ key: o.id, label: o.name, cards: data.cards.filter((c) => c.owner_id === o.id) })),
            { key: "none", label: "No salesperson", cards: data.cards.filter((c) => !c.owner_id || !ownerName.has(c.owner_id)) },
          ].filter((l) => l.cards.length)
        : [
            ...data.sectors.map((s) => ({ key: String(s.id), label: `${s.code} · ${s.name}`, cards: data.cards.filter((c) => c.sector_id === s.id) })),
            { key: "none", label: "No sector", cards: data.cards.filter((c) => c.sector_id === null) },
          ].filter((l) => l.cards.length);

  return (
    <div>
      <DateRangeBar value={range} onChange={setRange} />
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <select value={owner} onChange={(e) => setOwner(e.target.value)}
          className="px-2 py-1 rounded text-xs border font-semibold"
          style={{ borderColor: owner ? ORANGE : BORDER, background: "#fff", color: owner ? INK : MUTED }}>
          <option value="">Salesperson: all</option>
          {data.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select value={sector} onChange={(e) => setSector(e.target.value)}
          className="px-2 py-1 rounded text-xs border font-semibold"
          style={{ borderColor: sector ? ORANGE : BORDER, background: "#fff", color: sector ? INK : MUTED }}>
          <option value="">Sector: all</option>
          {data.sectors.map((s) => <option key={s.id} value={String(s.id)}>{s.code} · {s.name}</option>)}
        </select>
        <span style={{ width: 8 }} />
        {(["amount", "weighted"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className="px-3 py-1 rounded-full text-xs font-bold border"
            style={mode === m ? { background: NAVY, borderColor: NAVY, color: "#fff" } : { background: "#fff", borderColor: BORDER, color: MUTED }}>
            {m === "amount" ? "Deal amount" : "Weighted"}
          </button>
        ))}
        <span style={{ width: 8 }} />
        <span className="text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.6 }}>SWIMLANE</span>
        {(["none", "owner", "sector"] as const).map((l) => (
          <button key={l} onClick={() => setLane(l)}
            className="px-3 py-1 rounded-full text-xs font-bold border"
            style={lane === l ? { background: ORANGE, borderColor: ORANGE, color: "#fff" } : { background: "#fff", borderColor: BORDER, color: MUTED }}>
            {l === "none" ? "None" : l === "owner" ? "Salesperson" : "Sector"}
          </button>
        ))}
      </div>

      {lanes.map((l) => (
        <div key={l.key} className="mb-4">
          {l.label && (
            <div className="text-sm font-bold mb-1.5" style={{ color: NAVY }}>
              {l.label}
              <span className="text-xs font-semibold" style={{ color: MUTED }}>
                {" "}· {l.cards.length} deal{l.cards.length === 1 ? "" : "s"} · {fmtMoney(l.cards.reduce((n, c) => n + val(c), 0))}
              </span>
            </div>
          )}
          <div style={{ overflowX: "auto", paddingBottom: 6 }}>
            <div className="flex gap-1" style={{ minWidth: "fit-content" }}>
              {data.columns.map((col) => {
                const cs = l.cards.filter((c) => c.col === col.key).sort((a, b) => b.amount - a.amount);
                const total = cs.reduce((n, c) => n + val(c), 0);
                const w = cs.length ? Math.round(cs.reduce((n, c) => n + c.weight, 0) / cs.length) : 0;
                const cap = lane === "none" ? 30 : 8;
                return (
                  <div key={col.key} style={{ width: 200, flexShrink: 0, borderRadius: 6, outline: overCol === col.key ? `2px dashed ${ORANGE}` : "none", outlineOffset: 2 }}
                    onDragOver={(e) => { e.preventDefault(); setOverCol(col.key); }}
                    onDragLeave={(e) => { if (e.currentTarget === e.target) setOverCol((v) => (v === col.key ? null : v)); }}
                    onDrop={(e) => { e.preventDefault(); moveCard(col.key); }}>
                    <div
                      title={`${col.label} — avg weight ${w}%`}
                      style={{
                        background: col.key === "order_received" ? "#E6F4EB" : NAVY_SOFT,
                        clipPath: "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)",
                        padding: "7px 18px 7px 22px", marginBottom: 6,
                      }}
                    >
                      <div className="font-bold" style={{ fontSize: 12, color: col.key === "order_received" ? GREEN : NAVY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {col.label}
                      </div>
                      <div className="tnum" style={{ fontSize: 11, color: MUTED }}>
                        <b style={{ color: INK }}>{w}%</b> | {fmtMoney(total)} ({cs.length})
                      </div>
                    </div>
                    {cs.slice(0, cap).map((c) => (
                      <div
                        key={c.kind + c.id}
                        draggable={c.kind !== "sales_order"}
                        onDragStart={(e) => { drag.current = { kind: c.kind, id: c.id, from: c.col }; e.dataTransfer.effectAllowed = "move"; }}
                        onDragEnd={() => { drag.current = null; setOverCol(null); }}
                        onClick={() => onOpen(c.kind, c.id)}
                        className="w-full text-left rounded border px-2 py-1.5 mb-1"
                        style={{
                          position: "relative", background: "#fff", borderColor: BORDER, cursor: c.kind === "sales_order" ? "pointer" : "grab",
                          borderLeft: `3px solid ${c.kind === "sales_order" ? GREEN : c.kind === "quotation" ? ORANGE : NAVY}`,
                          paddingBottom: 20,
                        }}
                        title={`${c.kind === "opportunity" ? "Opportunity" : c.kind === "quotation" ? "Quotation" : "Sales Order"} — click to open${c.kind === "sales_order" ? "" : ", drag to move stage"}`}
                      >
                        <div className="font-bold" style={{ fontSize: 12, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {c.company ?? c.title}
                        </div>
                        {c.company && (
                          <div style={{ fontSize: 10.5, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</div>
                        )}
                        <div className="flex items-baseline justify-between gap-1">
                          <span className="tnum" style={{ fontSize: 11.5, fontWeight: 700, color: c.amount ? INK : "#C9CDD6" }}>
                            {c.amount ? fmtMoney(val(c)) : "—"}
                          </span>
                          {c.owner_id && ownerName.get(c.owner_id)?.initials && (
                            <span style={{ fontSize: 9.5, fontWeight: 800, color: NAVY, background: NAVY_SOFT, borderRadius: 8, padding: "0 6px" }}>
                              {ownerName.get(c.owner_id)?.initials}
                            </span>
                          )}
                          {lane !== "sector" && c.sector_id !== null && sectorName.get(c.sector_id) && (
                            <span style={{ fontSize: 9.5, color: MUTED }}>{sectorName.get(c.sector_id)?.code}</span>
                          )}
                        </div>
                        {(() => {
                          const mk = `${c.kind}:${c.id}`;
                          const inQueue = marks.open.has(mk);
                          const handled = !inQueue && marks.done.has(mk);
                          return (
                            <button
                              onClick={(e) => { e.stopPropagation(); queueCard(c); }}
                              title={inQueue ? "In your Prospecting Queue — waiting for the call"
                                : handled ? "Handled — this one was called from the queue"
                                : "Save to my Prospecting Queue — it appears on the Dashboard, to dial one by one"}
                              aria-label="Prospecting queue"
                              style={{
                                position: "absolute", right: 4, bottom: 3, width: 20, height: 20,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                borderRadius: 5, lineHeight: 1, cursor: "pointer", fontSize: 11,
                                border: `1px solid ${inQueue ? "var(--red)" : handled ? GREEN : BORDER}`,
                                background: inQueue ? "var(--red)" : handled ? GREEN : "#F7F8FB",
                                color: inQueue || handled ? "#fff" : NAVY,
                              }}
                            >
                              ☎
                            </button>
                          );
                        })()}
                      </div>
                    ))}
                    {cs.length > cap && (
                      <div className="text-xs text-center" style={{ color: MUTED }}>+ {cs.length - cap} more</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
      <p className="text-xs" style={{ color: MUTED, maxWidth: "80ch", lineHeight: 1.6 }}>
        One live view: an opportunity whose quotation is out shows as its quote; Order
        Received shows the sales orders of the chosen dates. Weighted = each deal ×
        its own stage weight. Click a card to open it · drag it to move its stage ·
        ☎ saves it to your Prospecting Queue on the home screen.
      </p>
      {toast && (
        <div style={{
          position: "fixed", bottom: 18, right: 18, zIndex: 60, background: "var(--navy)", color: "#fff",
          borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 600, boxShadow: "0 4px 18px rgba(0,0,0,.25)",
        }}>{toast}</div>
      )}
    </div>
  );
}

// ===================================================== THE FLOW TABLE =====
function FlowTable() {
  type FlowRow = {
    entity: string; stage_id: number; name: string;
    came_in: number; went_out: number; sitting: number; colour: string | null;
  };
  const [range, setRange] = useState<DateRange>(DEFAULT_RANGE);
  const [flow, setFlow] = useState<FlowRow[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setFlow(null); setErr("");
    fetch(`/api/crm/pipeline?from=${range.from}&to=${range.to}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not load the pipeline");
        setFlow(j.flow);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [range.from, range.to]);

  const ladders = [
    { key: "opportunity", title: "Opportunities", note: "New enquiries being worked toward a quote." },
    { key: "quotation", title: "Quotations — hotness", note: "Sent through the buckets to Order Received." },
  ];

  return (
    <div>
      <DateRangeBar value={range} onChange={setRange} />
      {err && <div className="rounded p-3 text-sm" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>}
      {!err && !flow && <div className="text-sm" style={{ color: MUTED }}>loading…</div>}
      {flow && (
        <div className="flex gap-4 flex-wrap" style={{ alignItems: "flex-start" }}>
          {ladders.map((l) => {
            const rows = flow.filter((r) => r.entity === l.key);
            const tot = (k: "came_in" | "went_out" | "sitting") => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
            return (
              <div key={l.key} className="rounded border" style={{ borderColor: BORDER, background: "#fff", minWidth: 360, flex: "1 1 420px", maxWidth: 620 }}>
                <div className="px-4 pt-3 pb-1">
                  <div className="font-bold" style={{ fontSize: 15 }}>{l.title}</div>
                  <div className="text-xs" style={{ color: MUTED }}>{l.note}</div>
                </div>
                <table className="genie-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["STAGE", "CAME IN", "WENT OUT", "SITTING"].map((h, i) => (
                        <th key={h} style={{
                          textAlign: i === 0 ? "left" : "right", padding: "6px 16px", fontSize: 10,
                          letterSpacing: 0.6, color: MUTED, borderBottom: `2px solid ${BORDER}`,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.stage_id}>
                        <td style={{ padding: "7px 16px", fontSize: 13, borderBottom: "1px solid #F0F1F6" }}>
                          <span style={{
                            display: "inline-block", width: 9, height: 9, borderRadius: 2,
                            background: r.colour || "var(--muted)", marginRight: 8,
                          }} />
                          {r.name}
                        </td>
                        {(["came_in", "went_out", "sitting"] as const).map((k) => (
                          <td key={k} className="tnum" style={{
                            textAlign: "right", padding: "7px 16px", fontSize: 13,
                            borderBottom: "1px solid #F0F1F6",
                            fontWeight: k === "sitting" && Number(r[k]) > 0 ? 700 : 400,
                            color: Number(r[k]) === 0 ? "#C7CCD2" : undefined,
                          }}>{Number(r[k]).toLocaleString("en-IN")}</td>
                        ))}
                      </tr>
                    ))}
                    <tr>
                      <td style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700 }}>Total</td>
                      {(["came_in", "went_out", "sitting"] as const).map((k) => (
                        <td key={k} className="tnum" style={{ textAlign: "right", padding: "8px 16px", fontSize: 12, fontWeight: 700 }}>
                          {tot(k).toLocaleString("en-IN")}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
