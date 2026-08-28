"use client";

/**
 * The Pipeline Forecast — Deals' third view (Dr Raghu, 28 Aug 2026, from the
 * OnePageCRM screenshot): stage rows carrying a probability %, month columns
 * from the expected close date, EXPECTED TOTAL (weighted) against an editable
 * TARGET per month, and a team-member filter. Slipped deals sit in the
 * current month — a forecast that hides the overdue is a bedtime story.
 */

import { useCallback, useEffect, useState } from "react";
import { NAVY, MUTED, BORDER, ORANGE, GREEN, INK } from "./palette";

const RED = "#C43025";
const lakhCr = (n: number) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : n > 0 ? `₹${Math.round(n).toLocaleString("en-IN")}` : "·";

interface Lane { id: string; name: string; colour: string | null; weight: number; months: Record<string, { value: number; n: number }> }
interface Data {
  months: string[]; lanes: Lane[];
  expected: Record<string, number>; raw: Record<string, number>;
  targets: Record<string, number>; owners: { id: string; name: string }[];
  mayEdit: boolean; dealsCount: number;
}

const monthLabel = (m: string) => {
  if (m === "later") return "Later";
  if (m === "none") return "No date";
  const [y, mo] = m.split("-");
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(mo) - 1]} ${y.slice(2)}`;
};

export default function ForecastView() {
  const [owner, setOwner] = useState("all");
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [editTargets, setEditTargets] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setErr("");
    fetch(`/api/crm/forecast?owner=${owner}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not read the forecast");
        setData(j);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [owner]);
  useEffect(() => { load(); }, [load]);

  const saveWeight = async (id: string, weight: number) => {
    await fetch("/api/crm/forecast", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ weights: { [id]: Math.max(0, Math.min(100, weight)) } }),
    });
    load();
  };
  const saveTargets = async () => {
    const targets: Record<string, number> = {};
    for (const [m, v] of Object.entries(draft)) if (v !== "") targets[m] = Number(v) * 1e5; // typed in lakhs
    await fetch("/api/crm/forecast", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ targets }),
    });
    setEditTargets(false); setDraft({});
    load();
  };

  if (err) return <div className="rounded p-3 text-sm" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>;
  if (!data) return <div className="text-sm" style={{ color: MUTED }}>loading…</div>;

  const cols = [...data.months, "later", "none"];

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <select value={owner} onChange={(e) => setOwner(e.target.value)}
          className="px-2 py-1 rounded border text-sm font-semibold bg-white" style={{ borderColor: owner === "all" ? BORDER : ORANGE }}>
          <option value="all">All team members</option>
          {data.owners.map((o) => (<option key={o.id} value={o.id}>{o.name}</option>))}
        </select>
        <span className="text-xs" style={{ color: MUTED }}>
          {data.dealsCount} open deals · weighted by stage probability · slipped dates count in this month
        </span>
        {data.mayEdit && (
          <button onClick={() => { setEditTargets((v) => !v); setDraft({}); }}
            className="ml-auto text-xs font-bold rounded px-3 py-1 border"
            style={editTargets ? { background: NAVY, color: "#fff", borderColor: NAVY } : { color: NAVY, borderColor: BORDER, background: "#fff" }}>
            {editTargets ? "✕ Cancel" : "✎ Set targets"}
          </button>
        )}
        {editTargets && (
          <button onClick={saveTargets} className="text-xs font-bold rounded px-3 py-1 text-white" style={{ background: ORANGE }}>
            💾 Save targets
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER }}>
        <table className="text-xs" style={{ minWidth: 900, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: "#22303C", color: "#fff" }}>
              <th className="px-3 py-2 text-left" style={{ position: "sticky", left: 0, background: "#22303C", minWidth: 190 }}>Stage · probability</th>
              {cols.map((m) => (
                <th key={m} className="px-2 py-2 text-right whitespace-nowrap" style={{ minWidth: 96, opacity: m === "later" || m === "none" ? 0.7 : 1 }}>
                  {monthLabel(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* expected (weighted) vs target — the two rows the eye reads first */}
            <tr style={{ background: "#EEF1FA" }}>
              <td className="px-3 py-2 font-bold" style={{ position: "sticky", left: 0, background: "#EEF1FA", color: NAVY }}>
                Expected total <span style={{ fontWeight: 400, color: MUTED }}>(weighted)</span>
              </td>
              {cols.map((m) => {
                const t = data.targets[m];
                const v = data.expected[m] || 0;
                const short = t != null && m !== "later" && m !== "none" && v < t;
                return (
                  <td key={m} className="px-2 py-2 text-right tnum font-bold" style={{ color: short ? RED : NAVY }}>
                    {lakhCr(v)}
                  </td>
                );
              })}
            </tr>
            <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
              <td className="px-3 py-2 font-bold" style={{ position: "sticky", left: 0, background: "#fff", color: MUTED }}>
                Target {editTargets && <span style={{ fontWeight: 400 }}>(in ₹ lakhs)</span>}
              </td>
              {cols.map((m) => (
                <td key={m} className="px-2 py-1.5 text-right tnum" style={{ color: MUTED }}>
                  {m === "later" || m === "none" ? "—" : editTargets ? (
                    <input
                      value={draft[m] ?? (data.targets[m] != null ? String(data.targets[m] / 1e5) : "")}
                      onChange={(e) => setDraft({ ...draft, [m]: e.target.value })}
                      className="border rounded px-1 py-0.5 text-right tnum" style={{ borderColor: ORANGE, width: 72 }} placeholder="lakhs"
                    />
                  ) : data.targets[m] != null ? lakhCr(data.targets[m]) : "—"}
                </td>
              ))}
            </tr>

            {data.lanes.map((l) => (
              <tr key={l.id} className="border-t" style={{ borderColor: "#EFEDE7" }}>
                <td className="px-3 py-1.5" style={{ position: "sticky", left: 0, background: "#fff" }}>
                  <span className="font-semibold" style={{ color: INK }}>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: l.colour || MUTED, marginRight: 6 }} />
                    {l.name}
                  </span>
                  {data.mayEdit ? (
                    <input
                      type="number" defaultValue={l.weight} key={`${l.id}-${l.weight}`}
                      onBlur={(e) => { const v = Number(e.target.value); if (v !== l.weight) saveWeight(l.id, v); }}
                      className="border rounded px-1 py-0 text-right tnum ml-2" style={{ borderColor: BORDER, width: 46, fontSize: 11 }}
                      title="This stage's probability % — the Expected row multiplies by it"
                    />
                  ) : (
                    <span className="tnum ml-2" style={{ color: MUTED }}>{l.weight}%</span>
                  )}
                  <span style={{ color: MUTED, fontSize: 10 }}> %</span>
                </td>
                {cols.map((m) => {
                  const c = l.months[m];
                  return (
                    <td key={m} className="px-2 py-1.5 text-right tnum" style={{ color: c.value ? INK : "#D5D2C8" }}>
                      {c.value ? <>{lakhCr(c.value)} <span style={{ color: MUTED }}>({c.n})</span></> : "·"}
                    </td>
                  );
                })}
              </tr>
            ))}

            <tr className="border-t" style={{ borderColor: "#22303C", background: "#FAF9F5" }}>
              <td className="px-3 py-2 font-bold" style={{ position: "sticky", left: 0, background: "#FAF9F5", color: INK }}>Total pending (unweighted)</td>
              {cols.map((m) => (
                <td key={m} className="px-2 py-2 text-right tnum font-bold" style={{ color: data.raw[m] ? GREEN : "#D5D2C8" }}>
                  {lakhCr(data.raw[m] || 0)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs mt-2" style={{ color: MUTED, maxWidth: "84ch", lineHeight: 1.6 }}>
        A deal is here until a sales order exists on it or its stage says lost. Its value is the opportunity&apos;s own,
        falling back to its newest quotation; its month is the expected close date. Stage probabilities and monthly
        targets are the Sales Head&apos;s to set — everyone reads the same forecast.
      </p>
    </div>
  );
}
