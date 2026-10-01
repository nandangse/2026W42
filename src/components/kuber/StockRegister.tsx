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

interface Row {
  as_on: string; amount: number | null; note: string | null; by: string | null; at: string | null; opening: boolean;
  /** the month this row closes, what was bought in it, and what it consumed */
  month: string | null; purchases: number | null; cogs: number | null;
}

const dmy = (s: string) => s.split("-").reverse().join("-");
const monthName = (s: string) =>
  new Date(`${s}T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

export default function StockRegister() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [installed, setInstalled] = useState(true);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  /* READ-ONLY NUMBERS, ONE BUTTON TO ADD (Dr Raghu, 1 Oct 2026: "make this
     read only numbers. Have a button — Add closing stock — in that put month
     and year and closing stock"). Seven editable boxes in a column looked
     like a form waiting to be filled, and a stray keystroke in one of them
     restated the gross profit. The register now reads like a register; the
     entry is a deliberate act in a box of its own. */
  const [adding, setAdding] = useState<null | { y: number; m: number; amount: string; note: string }>(null);

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
  const today = new Date();
  const openAdd = (as_on?: string) => {
    const d = as_on ? new Date(`${as_on}T00:00:00`) : new Date(today.getFullYear(), today.getMonth(), 0);
    const have = as_on ? rows.find((r) => r.as_on === as_on) : undefined;
    setAdding({ y: d.getFullYear(), m: d.getMonth() + 1, amount: have?.amount != null ? String(have.amount) : "", note: have?.note ?? "" });
  };
  const monthEndOf = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  const inr = (n: number) => n.toLocaleString("en-IN");

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

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button onClick={() => openAdd()} className="rounded px-3 py-2 text-sm font-bold text-white" style={{ background: "var(--accent)" }}>
          + Add closing stock
        </button>
        <span className="text-xs" style={{ color: MUTED }}>month, year and the closing value — the rest of the register is read from the books</span>
      </div>
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
            <th className="px-2 py-2 text-right" style={{ width: 110 }}>Movement</th>
            <th className="px-2 py-2 text-right" style={{ width: 130 }}>Purchases ₹ Cr</th>
            <th className="px-2 py-2 text-right" style={{ width: 130 }}>COGS ₹ Cr</th>
            <th className="px-3 py-2 text-left">How it was arrived at</th>
          </tr></thead>
          <tbody>
            {/* NEWEST ON TOP (Dr Raghu, 1 Oct 2026: "show this reverse, latest on
                top"). The movement is struck in date order — each month against
                the one before it — and only the reading is turned round. */}
            {rows.map((r, i) => ({ r, m: move(i) })).reverse().map(({ r, m }) => {
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
                  <td className="px-2 py-1.5 text-right tnum" style={{ fontWeight: 700, color: r.amount == null ? MUTED : INK }}>
                    {r.amount == null
                      ? <button onClick={() => openAdd(key)} className="text-xs font-bold" style={{ color: "var(--accent)" }}>not valued — add</button>
                      : <span title="Change it through + Add closing stock">{inr(r.amount)}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ color: MUTED }}>
                    {r.amount == null ? "—" : (r.amount / CR).toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ color: m == null ? MUTED : m >= 0 ? "var(--green)" : "var(--red)" }}>
                    {m == null ? "—" : `${m >= 0 ? "+" : "−"}${(Math.abs(m) / CR).toFixed(2)}`}
                  </td>
                  {/* WHAT WAS BOUGHT, AND WHAT THE MONTH THEREFORE CONSUMED
                      (his instruction). The purchases come from the books and
                      need nobody; the COGS only appears once both ends of the
                      month are valued, because a cost of sales struck against
                      a missing stock figure is a guess with a decimal point. */}
                  <td className="px-2 py-1.5 text-right tnum" style={{ color: r.purchases == null ? MUTED : "var(--dim)" }}
                    title={r.month ? "Bought in this month, from the Tally vouchers" : "The opening row closes no month"}>
                    {r.purchases == null ? "—" : (r.purchases / CR).toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5 text-right tnum font-bold"
                    style={{ color: r.cogs == null ? MUTED : r.cogs < 0 ? "var(--red)" : INK }}
                    title="Opening stock + purchases − closing stock">
                    {r.cogs == null ? "—" : (r.cogs / CR).toFixed(2)}
                  </td>
                  <td className="px-3 py-1.5 text-xs" style={{ color: r.note ? "var(--dim)" : MUTED }}>
                    {r.note || (r.amount == null ? "" : "—")}
                    {r.amount != null && (
                      <button onClick={() => openAdd(key)} title="Correct this month" className="ml-2 rounded"
                        style={{ border: `1px solid ${BORDER}`, background: "#fff", color: INK, padding: "0 5px", fontSize: 11 }}>&#9998;</button>
                    )}
                    {r.by && <div style={{ color: MUTED, fontSize: 10 }}>{String(r.by).split("@")[0]}{r.at ? ` · ${dmy(String(r.at).slice(0, 10))}` : ""}</div>}
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
      <div className="text-xs mt-3" style={{ color: MUTED, lineHeight: 1.6, maxWidth: 760 }}>
        <b>COGS is the previous month&rsquo;s stock, plus what was bought, less this month&rsquo;s stock</b> — what the month
        actually consumed. It appears only where both ends are valued: a cost of sales struck against a missing stock
        figure is a guess with a decimal point. Purchases are read from the Tally vouchers and need nobody.
      </div>
      <div className="text-xs mt-2" style={{ color: MUTED, lineHeight: 1.6, maxWidth: 760 }}>
        A month left blank falls back to the last month that has a figure, and the P&amp;L says which date it used —
        a gross profit struck against a stock value four months stale is a fiction nobody can see unless the statement
        admits it. To clear a month, open it with the pencil and save it empty.
      </div>

      {adding && (
        <div onClick={() => setAdding(null)} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)", zIndex: 70 }}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg" style={{ width: "min(440px,100%)" }}>
            <div className="px-4 py-3 flex items-center" style={{ background: "var(--navy)", borderRadius: "8px 8px 0 0" }}>
              <b className="text-white" style={{ fontSize: 14 }}>Add closing stock</b>
              <div className="flex-1" />
              <button onClick={() => setAdding(null)} className="font-bold" style={{ color: "#8FA1B3" }}>✕</button>
            </div>
            <div className="p-4">
              <div className="text-xs font-bold mb-1" style={{ color: MUTED }}>MONTH · YEAR</div>
              <div className="flex gap-2 mb-3">
                <select value={adding.m} onChange={(e) => setAdding({ ...adding, m: Number(e.target.value) })} className="border rounded px-2 py-1.5 text-sm" style={{ borderColor: BORDER }}>
                  {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
                </select>
                <select value={adding.y} onChange={(e) => setAdding({ ...adding, y: Number(e.target.value) })} className="border rounded px-2 py-1.5 text-sm" style={{ borderColor: BORDER }}>
                  {Array.from({ length: 6 }, (_, i) => today.getFullYear() + 1 - i).map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <span className="text-xs self-center" style={{ color: MUTED }}>closes on {dmy(monthEndOf(adding.y, adding.m))}</span>
              </div>
              <div className="text-xs font-bold mb-1" style={{ color: MUTED }}>CLOSING STOCK ₹</div>
              <input inputMode="numeric" autoFocus value={adding.amount ? inr(Number(adding.amount)) : ""}
                onChange={(e) => setAdding({ ...adding, amount: e.target.value.replace(/[^0-9]/g, "") })}
                placeholder="as valued, in rupees" className="border rounded px-2 py-1.5 text-sm text-right tnum w-full mb-1" style={{ borderColor: BORDER }} />
              <div className="text-xs mb-3" style={{ color: MUTED }}>{adding.amount ? `₹${(Number(adding.amount) / CR).toFixed(2)} Cr` : "\u00a0"}</div>
              <div className="text-xs font-bold mb-1" style={{ color: MUTED }}>HOW IT WAS ARRIVED AT</div>
              <input value={adding.note} onChange={(e) => setAdding({ ...adding, note: e.target.value })} placeholder="physical count · valuation basis · who"
                className="border rounded px-2 py-1.5 text-sm w-full mb-3" style={{ borderColor: BORDER }} />
              <div className="flex gap-2">
                <button onClick={() => { const k = monthEndOf(adding.y, adding.m); void save(k, adding.amount, adding.note).then(() => setAdding(null)); }}
                  disabled={!!busy} className="rounded px-4 py-2 text-sm font-bold text-white" style={{ background: "var(--green)" }}>
                  {busy ? "Saving…" : adding.amount ? "Save" : "Save empty (clears the month)"}
                </button>
                <button onClick={() => setAdding(null)} className="rounded px-3 py-2 text-sm" style={{ color: MUTED }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
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
