"use client";
/**
 * THE SALARY MIS, ON PAPER (Dr Raghu, 7 Oct 2026) — the pages between the
 * month's summary and the register: three months of every head, the
 * deliveries beside them, three pictures, and the commentary. Inline SVG,
 * so it prints exactly as it shows. See src/lib/salary-mis.ts for the
 * arithmetic.
 */
import type { Mis } from "@/lib/salary-mis";

const INK = "#16232F", MUTED = "#8B8F87", LINE = "#DCD8CC";
const lakh = (n: number) => (Math.abs(n) >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : Math.abs(n) >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${Math.round(n).toLocaleString("en-IN")}`);
const fmt = (v: number | null, money: boolean, decimals?: number, pct?: boolean) => {
  if (v == null) return "—";
  if (pct) return `${v.toFixed(decimals ?? 1)}%`;
  if (money) return lakh(v);
  return decimals ? v.toLocaleString("en-IN", { maximumFractionDigits: decimals, minimumFractionDigits: 0 }) : Math.round(v).toLocaleString("en-IN");
};
const GROUP_LABEL: Record<string, string> = { people: "PEOPLE", attendance: "ATTENDANCE", earning: "EARNINGS", deduction: "DEDUCTIONS", net: "NET AND UNIT COST", delivery: "WHAT THE FACTORY DELIVERED", ratio: "SALARY AGAINST OUTPUT" };
const COLORS = ["#1B3A5C", "#3E6A96", "#7FA3C5", "#0D6E39", "#7FB89A", "#8A5B00", "#C79A3B", "#5B3FA8", "#B3392E", "#8B8F87"];

/** grouped bars: one group per month, one bar per series */
function GroupedBars({ months, series, height = 150 }: { months: string[]; series: { label: string; color: string; values: (number | null)[] }[]; height?: number }) {
  const W = 480, padL = 8, padB = 22, padT = 14;
  const max = Math.max(1, ...series.flatMap((s) => s.values.map((v) => v ?? 0)));
  const gw = (W - padL * 2) / months.length, bw = Math.min(42, (gw - 16) / series.length);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" style={{ display: "block" }}>
      {months.map((m, i) => (
        <g key={m}>
          {series.map((s, j) => {
            const v = s.values[i] ?? 0, h = (v / max) * (height - padB - padT);
            const x = padL + i * gw + (gw - bw * series.length) / 2 + j * bw;
            return (
              <g key={s.label}>
                <rect x={x} y={height - padB - h} width={bw - 3} height={h} rx={2} fill={s.color} />
                {v > 0 && <text x={x + (bw - 3) / 2} y={height - padB - h - 3} fontSize={8} textAnchor="middle" fill={INK}>{lakh(v)}</text>}
              </g>
            );
          })}
          <text x={padL + i * gw + gw / 2} y={height - 6} fontSize={9} textAnchor="middle" fill={MUTED}>{m}</text>
        </g>
      ))}
    </svg>
  );
}

/** stacked composition per month */
function Stacked({ months, parts, height = 150 }: { months: string[]; parts: { label: string; values: (number | null)[] }[]; height?: number }) {
  const W = 480, padL = 8, padB = 22, padT = 8;
  const totals = months.map((_, i) => parts.reduce((a, p) => a + (p.values[i] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const gw = (W - padL * 2) / months.length, bw = Math.min(70, gw - 24);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" style={{ display: "block" }}>
      {months.map((m, i) => {
        let y = height - padB;
        return (
          <g key={m}>
            {parts.map((p, j) => {
              const v = p.values[i] ?? 0; if (v <= 0) return null;
              const h = (v / max) * (height - padB - padT); y -= h;
              return <rect key={p.label} x={padL + i * gw + (gw - bw) / 2} y={y} width={bw} height={h} fill={COLORS[j % COLORS.length]}><title>{`${p.label} ${lakh(v)}`}</title></rect>;
            })}
            <text x={padL + i * gw + gw / 2} y={height - 6} fontSize={9} textAnchor="middle" fill={MUTED}>{m}</text>
            <text x={padL + i * gw + gw / 2} y={y - 3} fontSize={8} textAnchor="middle" fill={INK}>{lakh(totals[i])}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function SalaryMis({ mis }: { mis: Mis }) {
  const months = mis.months.map((m) => m.label);
  const H = (k: string) => mis.heads.find((h) => h.key === k);
  const earned = H("earned")?.values ?? [], net = H("net")?.values ?? [], value = H("deliv_value")?.values ?? [], tp = H("throughput")?.values ?? [], share = H("salary_pct_value")?.values ?? [];
  const groups: (keyof typeof GROUP_LABEL)[] = ["people", "attendance", "earning", "deduction", "net", "delivery", "ratio"];
  const cell: React.CSSProperties = { border: `1px solid ${LINE}`, padding: "2.5px 8px", fontSize: 9.5, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  const labelCell: React.CSSProperties = { ...cell, textAlign: "left", whiteSpace: "normal" };
  return (
    <>
      <div className="pagebreak" />
      {/* ═══ MIS page 1 · the three months, every head ═══ */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: `2px solid ${INK}`, paddingBottom: 6, marginBottom: 10 }}>
        <b style={{ fontSize: 15 }}>SALARY MIS — {months.join(" · ")}</b>
        <span style={{ fontSize: 10, color: MUTED }}>every head by month, beside what the factory delivered · {mis.months.map((m) => `${m.label}: ${m.status}`).join(" · ")}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {[groups.slice(0, 4), groups.slice(4)].map((half, hi) => (
          <table key={hi} style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ ...labelCell, background: "#16232F", color: "#fff", fontWeight: 700 }}>Head</th>
                {months.map((m) => <th key={m} style={{ ...cell, background: "#16232F", color: "#fff", fontWeight: 700 }}>{m}</th>)}
                {months.length > 1 && <th style={{ ...cell, background: "#16232F", color: "#fff", fontWeight: 700 }}>Δ vs prev</th>}
              </tr>
            </thead>
            <tbody>
              {half.map((g) => (
                <GroupRows key={g} group={g} heads={mis.heads.filter((h) => h.group === g)} cell={cell} labelCell={labelCell} nMonths={months.length} />
              ))}
            </tbody>
          </table>
        ))}
      </div>
      <div style={{ fontSize: 9, color: MUTED, marginTop: 6 }}>A dash means the month&apos;s sheet never carried that column. Deliveries and value are the delivered ledger&apos;s; throughput is the ERP&apos;s throughput value on each delivered job.</div>

      <div className="pagebreak" />
      {/* ═══ MIS page 2 · the pictures and the commentary ═══ */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: `2px solid ${INK}`, paddingBottom: 6, marginBottom: 10 }}>
        <b style={{ fontSize: 15 }}>SALARY MIS — THE PICTURE</b>
        <span style={{ fontSize: 10, color: MUTED }}>{months.join(" · ")}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <div>
          <b style={{ fontSize: 11 }}>THE BILL — earned and net</b>
          <GroupedBars months={months} series={[{ label: "Earned", color: "#1B3A5C", values: earned }, { label: "Net paid", color: "#0D6E39", values: net }]} />
          <div style={{ fontSize: 9, color: MUTED }}><span style={{ color: "#1B3A5C" }}>■</span> earned &nbsp; <span style={{ color: "#0D6E39" }}>■</span> net payable</div>
        </div>
        <div>
          <b style={{ fontSize: 11 }}>WHERE THE EARNINGS SIT</b>
          <Stacked months={months} parts={mis.earnParts.filter((p) => p.values.some((v) => (v ?? 0) > 0))} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 8.5, color: "#46545F" }}>
            {mis.earnParts.filter((p) => p.values.some((v) => (v ?? 0) > 0)).map((p, j) => <span key={p.key}><span style={{ color: COLORS[j % COLORS.length] }}>■</span> {p.label}</span>)}
          </div>
        </div>
        <div>
          <b style={{ fontSize: 11 }}>SALARY AGAINST WHAT WAS DELIVERED</b>
          <GroupedBars months={months} series={[{ label: "Value delivered", color: "#7FA3C5", values: value }, { label: "Throughput", color: "#C79A3B", values: tp }, { label: "Salary", color: "#B3392E", values: earned }]} />
          <div style={{ fontSize: 9, color: MUTED }}><span style={{ color: "#7FA3C5" }}>■</span> value delivered &nbsp; <span style={{ color: "#C79A3B" }}>■</span> throughput &nbsp; <span style={{ color: "#B3392E" }}>■</span> salary · salary as % of value: {share.map((v, i) => `${months[i]} ${v == null ? "—" : `${v.toFixed(1)}%`}`).join(" · ")}</div>
        </div>
      </div>

      <div style={{ marginTop: 14, border: `1px solid ${LINE}`, borderLeft: "4px solid #1B3A5C", borderRadius: 6, padding: "8px 12px" }}>
        <b style={{ fontSize: 11.5, letterSpacing: ".04em" }}>WHAT THE NUMBERS SAY</b>
        <ol style={{ margin: "6px 0 0 16px", padding: 0, fontSize: 10.5, lineHeight: 1.5, color: INK }}>
          {mis.commentary.map((c, i) => <li key={i} style={{ marginBottom: 3 }}>{c}</li>)}
        </ol>
        <div style={{ fontSize: 9, color: MUTED, marginTop: 6 }}>Written from the register and the delivered ledger alone, the moment this page is printed. Nothing here is typed.</div>
      </div>
    </>
  );
}

function GroupRows({ group, heads, cell, labelCell, nMonths }: { group: string; heads: Mis["heads"]; cell: React.CSSProperties; labelCell: React.CSSProperties; nMonths: number }) {
  if (!heads.length) return null;
  return (
    <>
      <tr><td colSpan={nMonths + (nMonths > 1 ? 2 : 1)} style={{ ...labelCell, background: "#F4F2EC", fontWeight: 800, fontSize: 8.5, letterSpacing: ".06em", color: "#46545F" }}>{GROUP_LABEL[group]}</td></tr>
      {heads.map((h) => {
        const strong = /^(TOTAL|NET)/.test(h.label);
        const last = h.values[nMonths - 1], prev = nMonths > 1 ? h.values[nMonths - 2] : null;
        const d = last == null || prev == null || !prev ? null : ((last - prev) / Math.abs(prev)) * 100;
        return (
          <tr key={h.key} style={{ background: strong ? "#FBFAF6" : undefined }}>
            <td style={{ ...labelCell, fontWeight: strong ? 800 : 500, paddingLeft: h.label.startsWith("—") ? 16 : 8 }}>{h.label.replace(/^— /, "")}</td>
            {h.values.map((v, i) => <td key={i} style={{ ...cell, fontWeight: strong ? 800 : 500 }}>{fmt(v, h.money, h.decimals, h.pct)}</td>)}
            {nMonths > 1 && <td style={{ ...cell, color: d == null ? "#C9C6BD" : d > 0 ? (h.group === "deduction" || h.key === "salary_pct_value" || h.key === "salary_pct_tp" ? "#B3392E" : "#0D6E39") : (h.group === "deduction" || h.key === "salary_pct_value" || h.key === "salary_pct_tp" ? "#0D6E39" : "#B3392E") }}>{d == null ? "—" : `${d > 0 ? "+" : ""}${d.toFixed(1)}%`}</td>}
          </tr>
        );
      })}
    </>
  );
}
