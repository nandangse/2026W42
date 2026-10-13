"use client";
/**
 * KUBER → OE REGISTER (Dr Raghu, 13 Oct 2026: "make an OE Register. This will
 * help to know the OE"). On top, the twelve OE heads by month — the latest
 * month on the left — with OE as a share of sales; under it every voucher line
 * behind them. Click a head, or a month, and the lines narrow to it. The same
 * rules and signs as the P&L, so the total is the P&L's OE for the same dates.
 */
import { useEffect, useMemo, useState } from "react";
import { useMoneyFmt, fmtPct } from "@/components/kuber/money";

type Row = { date: string; vtype: string; vno: string; party: string; narration: string; ledger: string; group: string; head: string; amount: number };
type D = { empty?: boolean; from: string; to: string; total: number; sales: number; heads: string[]; months: string[]; byHead: Record<string, Record<string, number>>; salesByMonth: Record<string, number>; says: Record<string, string>; rows: Row[] };
const INK = "var(--ink)", MUTED = "var(--muted)", LINE = "var(--line)";
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const fyStart = (t: string) => (t.slice(5, 7) >= "04" ? `${t.slice(0, 4)}-04-01` : `${Number(t.slice(0, 4)) - 1}-04-01`);
const mon = (m: string) => new Date(m + "-01T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
const dmy = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
const ctl: React.CSSProperties = { border: `1px solid ${LINE}`, borderRadius: 6, padding: "4px 8px", fontSize: 12, background: "#fff" };

export default function OeRegister() {
  const t0 = today();
  const [from, setFrom] = useState(fyStart(t0)); const [to, setTo] = useState(t0);
  const [d, setD] = useState<D | null>(null); const [err, setErr] = useState<string | null>(null);
  const [head, setHead] = useState(""); const [month, setMonth] = useState(""); const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ k: keyof Row; dir: 1 | -1 }>({ k: "date", dir: -1 });
  const { fmt, num, label } = useMoneyFmt();
  useEffect(() => { setD(null); setErr(null); fetch(`/api/kuber/oe-register?from=${from}&to=${to}`, { cache: "no-store" }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); }).catch((e) => setErr(String(e.message || e))); }, [from, to]);
  const win = (k: "12m" | "ytd" | "qtd" | "mtd") => {
    const y = Number(t0.slice(0, 4)), m = Number(t0.slice(5, 7));
    if (k === "ytd") setFrom(fyStart(t0));
    if (k === "mtd") setFrom(t0.slice(0, 8) + "01");
    if (k === "qtd") { const qm = Math.floor((m - 1) / 3) * 3 + 1; setFrom(`${y}-${String(qm).padStart(2, "0")}-01`); }
    if (k === "12m") { const x = new Date(t0 + "T00:00:00Z"); x.setUTCFullYear(x.getUTCFullYear() - 1); x.setUTCDate(x.getUTCDate() + 1); setFrom(x.toISOString().slice(0, 10)); }
    setTo(t0);
  };
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (d?.rows || []).filter((r) => (!head || r.head === head) && (!month || r.date.startsWith(month)) && (!n || [r.vno, r.party, r.narration, r.ledger, r.group].some((v) => v.toLowerCase().includes(n))))
      .sort((a, b) => { const x = a[sort.k], y = b[sort.k]; return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir; });
  }, [d, head, month, q, sort]);
  if (err) return <div className="text-sm" style={{ color: "var(--red)" }}>{err}</div>;
  if (d?.empty) return <div className="text-sm" style={{ color: MUTED }}>No books yet — upload the Tally masters and transactions first.</div>;
  const headTotal = (h: string) => Object.values(d?.byHead[h] || {}).reduce((s, v) => s + v, 0);
  const monthTotal = (m: string) => (d?.heads || []).reduce((s, h) => s + (d?.byHead[h]?.[m] || 0), 0);
  const pct = (a: number, b: number) => (b ? fmtPct((a / b) * 100) : "—");
  const shown = rows.reduce((s, r) => s + r.amount, 0);
  const Th = ({ k, l, right }: { k: keyof Row; l: string; right?: boolean }) => <th onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : k === "amount" || k === "date" ? -1 : 1 }))} style={{ cursor: "pointer", whiteSpace: "nowrap", textAlign: right ? "right" : "left" }}>{l}<span style={{ opacity: sort.k === k ? 1 : 0.35, marginLeft: 4, fontSize: 10 }}>{sort.k === k ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span></th>;
  return (
    <div>
      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <div className="text-lg font-bold" style={{ color: INK }}>OE Register</div>
        <span className="text-xs" style={{ color: MUTED }}>every operating-expense line in the books, by the twelve OE heads — the same rules as the P&amp;L</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {(["12m", "ytd", "qtd", "mtd"] as const).map((k) => <button key={k} onClick={() => win(k)} style={{ ...ctl, fontWeight: 700 }}>{k === "12m" ? "12 M" : k.toUpperCase()}</button>)}
        <span className="text-xs font-bold" style={{ color: MUTED }}>From</span><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={ctl} />
        <span className="text-xs font-bold" style={{ color: MUTED }}>To</span><input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} style={ctl} />
        {!d && <span className="text-xs" style={{ color: MUTED }}>reading the books…</span>}
      </div>
      {d && (
        <>
          <div className="flex gap-2 flex-wrap mb-3">
            {[["OE", fmt(d.total)], ["Sales", fmt(d.sales)], ["OE % of sales", pct(d.total, d.sales)], ["Lines", d.rows.length.toLocaleString("en-IN")]].map(([l, v]) => (
              <div key={l} className="bg-white rounded-lg px-3 py-2" style={{ border: `1px solid ${LINE}`, minWidth: 150 }}><div className="text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.6 }}>{l}</div><div className="font-bold tnum" style={{ fontSize: 20, color: INK }}>{v}</div></div>
            ))}
          </div>
          {/* THE HEADS BY MONTH — the latest on the left */}
          <div className="rounded-lg bg-white mb-3" style={{ border: `1px solid ${LINE}`, overflow: "auto" }}>
            <table className="genie-table" style={{ minWidth: 640 }}>
              <thead><tr><th style={{ position: "sticky", left: 0, zIndex: 3, minWidth: 200 }}>OE head · {label}</th><th style={{ textAlign: "right" }}>Total</th><th style={{ textAlign: "right" }}>% of sales</th>{d.months.map((m) => <th key={m} onClick={() => setMonth(month === m ? "" : m)} style={{ textAlign: "right", cursor: "pointer", background: month === m ? "var(--accent)" : undefined }}>{mon(m)}</th>)}</tr></thead>
              <tbody>
                {d.heads.filter((h) => headTotal(h)).map((h) => (
                  <tr key={h} style={{ background: head === h ? "#FFF7ED" : undefined }}>
                    <td style={{ position: "sticky", left: 0, background: head === h ? "#FFF7ED" : "#fff" }}><button onClick={() => setHead(head === h ? "" : h)} className="font-bold text-left hover:underline" style={{ color: INK }} title={d.says[h]}>{h}</button></td>
                    <td className="tnum text-right font-bold">{num(headTotal(h))}</td>
                    <td className="tnum text-right" style={{ color: MUTED }}>{pct(headTotal(h), d.sales)}</td>
                    {d.months.map((m) => <td key={m} className="tnum text-right">{d.byHead[h][m] ? num(d.byHead[h][m]) : <span style={{ color: "#CBD5E1" }}>·</span>}</td>)}
                  </tr>
                ))}
                <tr style={{ background: "#F1F5F9" }}>
                  <td className="font-bold" style={{ position: "sticky", left: 0, background: "#F1F5F9" }}>Total OE</td>
                  <td className="tnum text-right font-bold">{num(d.total)}</td><td className="tnum text-right font-bold">{pct(d.total, d.sales)}</td>
                  {d.months.map((m) => <td key={m} className="tnum text-right font-bold">{num(monthTotal(m))}</td>)}
                </tr>
                <tr>
                  <td style={{ position: "sticky", left: 0, background: "#fff", color: MUTED }}>Sales · OE %</td><td className="tnum text-right" style={{ color: MUTED }}>{num(d.sales)}</td><td />
                  {d.months.map((m) => <td key={m} className="tnum text-right text-xs" style={{ color: MUTED }}>{pct(monthTotal(m), d.salesByMonth[m] || 0)}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search voucher, party, ledger, narration…" style={{ ...ctl, width: 280 }} />
            <select value={head} onChange={(e) => setHead(e.target.value)} style={ctl}><option value="">Head — all</option>{d.heads.filter((h) => headTotal(h)).map((h) => <option key={h}>{h}</option>)}</select>
            <select value={month} onChange={(e) => setMonth(e.target.value)} style={ctl}><option value="">Month — all</option>{d.months.map((m) => <option key={m} value={m}>{mon(m)}</option>)}</select>
            {(head || month || q) && <button onClick={() => { setHead(""); setMonth(""); setQ(""); }} className="text-xs font-bold" style={{ color: "var(--accent)" }}>✕ clear</button>}
            <span className="text-xs" style={{ color: MUTED }}>{rows.length.toLocaleString("en-IN")} lines · {fmt(shown)}</span>
          </div>
          <div className="rounded-lg bg-white" style={{ border: `1px solid ${LINE}`, overflow: "auto", maxHeight: "60vh" }}>
            <table className="genie-table" style={{ minWidth: 1100 }}>
              <thead><tr><Th k="date" l="Date" /><Th k="vtype" l="Type" /><Th k="vno" l="Voucher" /><Th k="head" l="OE head" /><Th k="ledger" l="Ledger" /><Th k="party" l="Party" /><Th k="narration" l="Narration" /><Th k="amount" l="Amount" right /></tr></thead>
              <tbody>
                {rows.slice(0, 3000).map((r, i) => (
                  <tr key={i}>
                    <td className="tnum text-xs" style={{ whiteSpace: "nowrap" }}>{dmy(r.date)}</td>
                    <td className="text-xs">{r.vtype}</td>
                    <td className="tnum text-xs">{r.vno}</td>
                    <td className="text-xs font-semibold">{r.head}</td>
                    <td className="text-xs" style={{ maxWidth: 220 }}>{r.ledger}<div style={{ color: MUTED }}>{r.group}</div></td>
                    <td className="text-xs" style={{ maxWidth: 200 }}>{r.party}</td>
                    <td className="text-xs" style={{ maxWidth: 300, color: MUTED }}>{r.narration}</td>
                    <td className="tnum text-right" style={{ color: r.amount < 0 ? "var(--green)" : INK }}>{fmt(r.amount)}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={8} style={{ color: MUTED, padding: 16 }}>No line.</td></tr>}
              </tbody>
            </table>
          </div>
          {rows.length > 3000 && <div className="text-xs mt-1" style={{ color: MUTED }}>Showing 3,000 — pick a head or a month to narrow.</div>}
          <div className="text-xs mt-1" style={{ color: MUTED }}>A credit to an expense ledger (a reversal, a refund) shows in green and reduces the head.</div>
        </>
      )}
    </div>
  );
}
