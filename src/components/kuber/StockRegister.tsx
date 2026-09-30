"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * THE STOCK REGISTER — the one number the books cannot supply.
 *
 * Dr Raghu, 30 Sep 2026: "make the stock entry here. Opening stock as of
 * 1/4/2026, then April 30 <>, May 31 <> etc. This will help me understand
 * better. No entries put inside in line."
 *
 * WHY IT MATTERS MORE THAN IT LOOKS. Tally carries no stock value — the
 * Stock-in-hand group exists and every ledger under it is zero. Without a
 * figure here, purchases cannot be turned into cost of sales, and a company
 * that bought Rs 15 Cr against Rs 29 Cr of billing while its order book grew
 * shows a loss it has not made. One number a month is the difference between
 * a cash picture and a profit.
 *
 * ONE VALUE A MONTH, NOT A STOCK SHEET. Suresh values the stock; Genie needs
 * the number, not the workings. The note is for how it was arrived at.
 */

const INK = "var(--ink)", MUTED = "var(--muted)", BORDER = "var(--line)";
const CR = 1e7;

interface Row { as_on: string; amount: number | null; note: string | null; by: string | null; at: string | null; opening: boolean }

const dmy = (s: string) => s.split("-").reverse().join("-");
const monthName = (s: string) =>
  new Date(`${s}T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

export default function StockRegister() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [installed, setInstalled] = useState(true);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/kuber/stock", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "could not read the register");
      setRows(j.rows || []);
      setInstalled(j.installed !== false);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setRows([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async (as_on: string, raw: string, note?: string) => {
    const v = raw.replace(/[, ]/g, "").trim();
    setBusy(as_on); setMsg("");
    try {
      const r = await fetch("/api/kuber/stock", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ as_on, amount: v === "" ? null : Number(v), note }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "that did not save");
      setMsg(`${dmy(as_on)} saved ✓`);
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  };

  if (!rows) return <div className="text-sm" style={{ color: MUTED }}>Reading the register…</div>;

  const filled = rows.filter((r) => r.amount != null);
  const latest = filled[filled.length - 1];
  /* The movement month on month — the thing the register is really for: a
     stock that only ever rises is a stock nobody is consuming. */
  const move = (i: number) => {
    const prev = [...rows.slice(0, i)].reverse().find((r) => r.amount != null);
    return prev && rows[i].amount != null ? (rows[i].amount as number) - (prev.amount as number) : null;
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="text-lg font-bold mb-1" style={{ color: INK }}>📦 Stock register</div>
      <div className="text-sm mb-3" style={{ color: "var(--dim)", lineHeight: 1.6, maxWidth: 680 }}>
        Stock in hand at each month end, as Suresh counts it: <b>the closing of 31 March</b> &mdash; which opens the year &mdash;
        then 30 April, 31 May and on. <b>Tally carries no stock value</b> — the Stock-in-hand group is there and every
        ledger under it is zero — so without these figures the P&amp;L can show purchases but not cost of sales, and the
        gross profit of a build-to-order business reads as a loss. The <b>Statement of Profit &amp; Loss reads this
        register</b>: opening from 1 April, closing from the latest month end on or before the period&rsquo;s last day.
      </div>

      {!installed && (
        <div className="text-xs rounded px-3 py-2 mb-3" style={{ background: "#FBEAE8", color: "#8A2B20" }}>
          Run <b>migration 0179</b> — the register has nowhere to live yet.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
        <Card label="MONTHS VALUED" value={`${filled.length} of ${rows.length}`} sub="31 March, then each month end" />
        <Card label="LATEST VALUATION" value={latest?.amount != null ? `₹${(latest.amount / CR).toFixed(2)} Cr` : "—"}
          sub={latest ? `as at ${dmy(latest.as_on)}` : "nothing entered yet"} />
        <Card label="MOVEMENT SINCE 31 MARCH"
          value={filled.length > 1 && filled[0].amount != null && latest?.amount != null
            ? `${latest.amount - filled[0].amount >= 0 ? "+" : "−"}₹${(Math.abs(latest.amount - filled[0].amount) / CR).toFixed(2)} Cr` : "—"}
          sub="31 March to the latest month end" />
      </div>

      <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: BORDER }}>
        <table className="w-full text-sm genie-table">
          <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
            <th className="px-3 py-2 text-left">As at</th>
            <th className="px-2 py-2 text-right" style={{ width: 170 }}>Stock value ₹</th>
            <th className="px-2 py-2 text-right" style={{ width: 110 }}>₹ Cr</th>
            <th className="px-2 py-2 text-right" style={{ width: 120 }}>Movement</th>
            <th className="px-3 py-2 text-left">How it was arrived at</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const m = move(i);
              const key = r.as_on;
              return (
                <tr key={key} className="border-t" style={{ borderColor: "var(--line-soft)", background: r.opening ? "#F7F5EF" : "#fff" }}>
                  <td className="px-3 py-1.5" style={{ fontWeight: r.opening ? 800 : 500, color: INK }}>
                    {/* HIS WORDS: "closing stock of 31st march, then stock of
                        30th april, etc." One closing after another, which is
                        how a stock register reads in any office. */}
                    Closing stock &mdash; {dmy(r.as_on)}
                    <span style={{ color: MUTED, fontWeight: 400 }}>
                      {r.opening ? " \u00b7 opens the year" : ` \u00b7 ${monthName(r.as_on)}`}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      inputMode="numeric"
                      value={draft[key] ?? (r.amount == null ? "" : String(r.amount))}
                      placeholder="not valued"
                      disabled={busy === key}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value.replace(/[^0-9.]/g, "") }))}
                      onBlur={(e) => {
                        const now = e.target.value.replace(/[, ]/g, "");
                        const was = r.amount == null ? "" : String(r.amount);
                        if (now !== was) void save(key, now, noteDraft[key] ?? r.note ?? "");
                      }}
                      className="border rounded px-2 py-1 text-right tnum w-full"
                      style={{ borderColor: r.amount == null ? "var(--accent)" : BORDER }} />
                  </td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ color: MUTED }}>
                    {r.amount == null ? "—" : (r.amount / CR).toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ color: m == null ? MUTED : m >= 0 ? "var(--green)" : "var(--red)" }}>
                    {m == null ? "—" : `${m >= 0 ? "+" : "−"}${(Math.abs(m) / CR).toFixed(2)}`}
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      value={noteDraft[key] ?? r.note ?? ""}
                      placeholder={r.amount == null ? "" : "physical count · valuation basis · who"}
                      disabled={busy === key || r.amount == null}
                      onChange={(e) => setNoteDraft((d) => ({ ...d, [key]: e.target.value }))}
                      onBlur={(e) => { if (r.amount != null && e.target.value !== (r.note ?? "")) void save(key, String(r.amount), e.target.value); }}
                      className="border rounded px-2 py-1 text-xs w-full" style={{ borderColor: BORDER }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!!msg && (
        <div className="text-xs font-bold mt-2" style={{ color: msg.includes("✓") ? "var(--green)" : "var(--red)" }}>{msg}</div>
      )}
      <div className="text-xs mt-3" style={{ color: MUTED, lineHeight: 1.6, maxWidth: 680 }}>
        A month left blank falls back to the last month that has a figure, and the P&amp;L says which date it used —
        a gross profit struck against a stock value four months stale is a fiction nobody can see unless the statement
        admits it. Clear a value by emptying the box.
      </div>
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-lg border px-3 py-2" style={{ borderColor: BORDER }}>
      <div className="text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.6 }}>{label}</div>
      <div className="text-xl font-bold tnum" style={{ color: INK }}>{value}</div>
      <div className="text-xs" style={{ color: MUTED }}>{sub}</div>
    </div>
  );
}
