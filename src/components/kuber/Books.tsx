"use client";

/**
 * Kuber reads the books — the screens over the parsed Tally snapshot
 * (Dr Raghu, 28 Aug 2026). Ageing in the management review's own buckets
 * (<30 / 31-90 / 91-180 / >180), the supplier report card, and the 13-week
 * cash flow whose row names come from his own Cash Flow sheet.
 */

import { useCallback, useEffect, useState } from "react";
import { fmtD } from "./Registers";
import { useMoneyFmt } from "./money";

const INK = "#16232F", MUTED = "#8A94A0", BORDER = "#E2E0DA", RED = "#B3261E", GREEN = "#0D7A3F";

function useBooks<T>(view: string, extra = ""): [T | null, () => void] {
  const [data, setData] = useState<T | null>(null);
  const load = useCallback(() => {
    fetch(`/api/kuber/books?view=${view}${extra}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setData(j))
      .catch(() => setData(null));
  }, [view, extra]);
  useEffect(() => { load(); }, [load]);
  return [data, load];
}

const Card = ({ label, value, sub, color = INK }: { label: string; value: string; sub?: string; color?: string }) => (
  <div className="bg-white rounded-lg border p-3" style={{ borderColor: BORDER }}>
    <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.8 }}>{label}</div>
    <div className="text-xl font-bold tnum" style={{ color }}>{value}</div>
    {sub && <div className="text-xs mt-0.5" style={{ color: MUTED }}>{sub}</div>}
  </div>
);

// ---------------- Dashboard ----------------
interface Summary {
  today: string; loadedAt: string | null; since: string; period: string; bankCash?: number;
  flows: Record<string, { value: number; count: number }>;
  receivable: { total: number; gross: number; overdue: number; due30: number; parties: number; unadjusted: number };
  payable: { total: number; gross: number; overdue: number; due30: number; parties: number; unadjusted: number };
  bg: { count: number; amount: number; expiring: number };
  fd: { count: number; amount: number; expiring: number };
  insurance: { count: number; amount: number; expiring: number };
}

/**
 * The dashboard, shaped like the management review's own top block
 * (Dr Raghu, 28 Aug 2026): receivables as the GROSS truly due to come, the
 * advances beside it named for what they are — a liability; payables with
 * the advances PAID next to them; no overdue tiles (the ageing tracks that);
 * and the period flows — Billing · Collections · Purchases · Payments — on
 * a YTD / days slider.
 */
export function KuberDashboard({ go }: { go: (key: string) => void }) {
  const [period, setPeriod] = useState("ytd");
  const [s, setS] = useState<Summary | null>(null);
  const { fmt: fmtMoney } = useMoneyFmt();
  useEffect(() => {
    setS(null);
    fetch(`/api/kuber/books?view=summary&period=${period}`, { cache: "no-store" })
      .then((r) => r.json()).then(setS).catch(() => setS(null));
  }, [period]);
  if (!s) return <div className="text-sm" style={{ color: MUTED }}>Reading the books…</div>;
  const stale = !s.loadedAt;
  const days = Math.max(1, Math.round((new Date(s.today).getTime() - new Date(s.since).getTime()) / 86400000));
  const FLOW_ROWS: [string, string, string][] = [
    ["billing", "Billing", "GST Sales vouchers"],
    ["collections", "Collections", "Receipt vouchers"],
    ["purchases", "Purchases", "Purchase · Cap-Ex · Import"],
    ["supplier_payments", "Payments to suppliers", "Payment vouchers"],
  ];
  return (
    <div style={{ maxWidth: 1100 }}>
      {stale && (
        <div className="rounded p-3 text-sm font-semibold mb-3" style={{ background: "#FCF6E8", color: "#8A6D1A" }}>
          No Tally snapshot is loaded yet — Upload Files brings the books in, and every number below lights up.
        </div>
      )}
      {!stale && (
        <div className="text-xs mb-2" style={{ color: MUTED }}>
          Books as of the last upload: {new Date(s.loadedAt as string).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          {" · "}the registers are live always.
        </div>
      )}

      {/* money owed and owing — gross first, advances named as what they are */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
        <Card label="RECEIVABLES — DUE TO COME" value={fmtMoney(s.receivable.gross)} sub={`${s.receivable.parties} customers · gross bills`} color="#1B3A5C" />
        <Card label="ADVANCES RECEIVED" value={fmtMoney(-s.receivable.unadjusted)} sub="a liability — work owed against money held" color="#1B6B93" />
        <Card label="NET RECEIVABLE" value={fmtMoney(s.receivable.total)} sub="bills less advances" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
        <Card label="PAYABLES — TO PAY" value={fmtMoney(s.payable.gross)} sub={`${s.payable.parties} suppliers · gross bills`} color="#1B3A5C" />
        <Card label="ADVANCES PAID TO SUPPLIERS" value={fmtMoney(-s.payable.unadjusted)} sub="money out, goods awaited" color="#1B6B93" />
        <Card label="NET PAYABLE" value={fmtMoney(s.payable.total)} sub="bills less advances" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
        <Card label="BANK & CASH" value={fmtMoney(s.bankCash || 0)} sub="every bank, OD and cash ledger — as of the last upload" color={(s.bankCash || 0) >= 0 ? GREEN : RED} />
      </div>

      {/* the period flows — the review sheet's own rows, on a slider */}
      <div className="bg-white rounded-lg border p-3 mb-3" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.8 }}>THE FLOWS</span>
          {(["7", "30", "90", "mtd", "qtd", "ytd"] as const).map((k) => (
            <button key={k} onClick={() => setPeriod(k)}
              className="rounded-full border px-2.5 py-0.5 text-xs font-bold"
              style={period === k ? { background: "#22303C", color: "#fff", borderColor: "#22303C" } : { color: MUTED, borderColor: BORDER, background: "#fff" }}>
              {k === "ytd" ? "YTD" : k === "mtd" ? "MTD" : k === "qtd" ? "QTD" : `${k} days`}
            </button>
          ))}
          <input type="range" min={1} max={365} value={/^\d+$/.test(period) ? Number(period) : days}
            onChange={(e) => setPeriod(e.target.value)}
            style={{ width: 160, accentColor: "#E8600A" }}
            title="Slide for any number of days" />
          <span className="text-xs tnum font-bold" style={{ color: INK }}>
            {period === "ytd" ? `since 1 April (${days} days)` : period === "mtd" ? `this month (${days} days)` : period === "qtd" ? `this quarter (${days} days)` : `last ${period} days`}
          </span>
        </div>
        <table className="w-full text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: "#22303C", color: "#fff" }}>
              <th className="px-2 py-2 text-left">Flow</th>
              <th className="px-2 py-2 text-right">Value</th>
              <th className="px-2 py-2 text-right">Vouchers</th>
              <th className="px-2 py-2 text-right">Per day</th>
              <th className="px-2 py-2 text-left" style={{ color: "#8FA1B3" }}>from</th>
            </tr>
          </thead>
          <tbody>
            {FLOW_ROWS.map(([k, label, src], i) => {
              const f = s.flows?.[k] ?? { value: 0, count: 0 };
              return (
                <tr key={k} className="border-t" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                  <td className="px-2 py-1.5 font-bold" style={{ color: k === "collections" ? GREEN : k === "supplier_payments" ? RED : INK }}>{label}</td>
                  <td className="px-2 py-1.5 text-right tnum font-bold">{f.value ? fmtMoney(f.value) : "·"}</td>
                  <td className="px-2 py-1.5 text-right tnum">{f.count || "·"}</td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ color: MUTED }}>{f.value ? fmtMoney(f.value / days) : "·"}</td>
                  <td className="px-2 py-1.5" style={{ color: MUTED }}>{src}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(!s.flows || Object.values(s.flows).every((f) => !f.count)) && (
          <div className="text-xs mt-2" style={{ color: "#8A6D1A" }}>
            The flows read the vouchers&apos; own values — run migration 0083 and re-upload Transactions once, and they fill.
          </div>
        )}
      </div>

      {/* the instruments, verified right today */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
        <Card label="BGs LIVE" value={`${s.bg.count} · ${fmtMoney(s.bg.amount)}`} sub={s.bg.expiring ? `${s.bg.expiring} expiring in 60 days` : "none expiring soon"} color={s.bg.expiring ? "#D97706" : INK} />
        <Card label="FDs LIVE" value={`${s.fd.count} · ${fmtMoney(s.fd.amount)}`} sub={s.fd.expiring ? `${s.fd.expiring} maturing in 60 days` : "none maturing soon"} />
        <Card label="INSURANCE LIVE" value={`${s.insurance.count} policies`} sub={s.insurance.expiring ? `${s.insurance.expiring} expiring in 60 days` : "none expiring soon"} color={s.insurance.expiring ? "#D97706" : INK} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <button onClick={() => go("cashflow")} className="bg-white rounded-lg border p-3 text-left hover:shadow" style={{ borderColor: BORDER }}>
          <div className="text-xs font-bold mb-1" style={{ color: MUTED }}>13-WEEK CASH FLOW</div>
          <div className="text-sm font-bold" style={{ color: "#1B3A5C" }}>Open the plan →</div>
        </button>
        <button onClick={() => go("payplan")} className="bg-white rounded-lg border p-3 text-left hover:shadow" style={{ borderColor: BORDER }}>
          <div className="text-xs font-bold mb-1" style={{ color: MUTED }}>PAYMENT PLANNING</div>
          <div className="text-sm font-bold" style={{ color: "#1B3A5C" }}>Decide the week →</div>
        </button>
        <button onClick={() => go("reportcard")} className="bg-white rounded-lg border p-3 text-left hover:shadow" style={{ borderColor: BORDER }}>
          <div className="text-xs font-bold mb-1" style={{ color: MUTED }}>SUPPLIER REPORT CARD</div>
          <div className="text-sm font-bold" style={{ color: "#1B3A5C" }}>Read the grades →</div>
        </button>
      </div>
    </div>
  );
}

// ---------------- Ageing ----------------
interface AgeingParty { party: string; group: string | null; total: number; gross: number; unadjusted: number; not_due: number; d0_30: number; d31_90: number; d91_180: number; d180p: number; bills: { bill: string; bill_date: string | null; due_date: string | null; amount: number; original: number; received: number }[] }

export function AgeingScreen({ kind }: { kind: "receivable" | "payable" }) {
  const [data] = useBooks<{ rows: AgeingParty[]; total: number; gross: number; overdue: number; unadjusted: number; count: number; today: string }>("ageing", `&kind=${kind}`);
  const { fmt: fmtMoney } = useMoneyFmt();
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<string>("");
  const [dir, setDir] = useState<1 | -1>(-1);
  if (!data) return <div className="text-sm" style={{ color: MUTED }}>Reading the books…</div>;

  const rec = kind === "receivable";
  const words = rec
    ? { title: "Customer Receivables", adv: "Advance received", bills: "Bills receivable", net: "Net receivable" }
    : { title: "Supplier Payables", adv: "Advance paid", bills: "Bills payable", net: "Net payable" };

  // the sortable columns — amount or any other way (Dr Raghu, 28 Aug 2026)
  const COLS: { key: string; label: string; pick: (r: AgeingParty) => string | number }[] = [
    { key: "party", label: "Party", pick: (r) => r.party.toLowerCase() },
    { key: "adv", label: words.adv, pick: (r) => -r.unadjusted },
    { key: "gross", label: words.bills, pick: (r) => r.gross },
    { key: "total", label: words.net, pick: (r) => r.total },
    { key: "not_due", label: "Not due", pick: (r) => r.not_due },
    { key: "d0_30", label: "<30 days", pick: (r) => r.d0_30 },
    { key: "d31_90", label: "31–90", pick: (r) => r.d31_90 },
    { key: "d91_180", label: "91–180", pick: (r) => r.d91_180 },
    { key: "d180p", label: ">180 days", pick: (r) => r.d180p },
  ];
  let rows = data.rows.filter((r) => !q || r.party.toLowerCase().includes(q.toLowerCase()));
  const col = COLS.find((c) => c.key === sortKey);
  if (col) {
    rows = [...rows].sort((a, b) => {
      const x = col.pick(a), y = col.pick(b);
      return dir * (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y)));
    });
  }
  const clickSort = (k: string) => {
    if (sortKey === k) { if (dir === -1) setDir(1); else { setSortKey(""); setDir(-1); } }
    else { setSortKey(k); setDir(k === "party" ? 1 : -1); }
  };

  return (
    <div style={{ maxWidth: 1250 }}>
      <div className="flex items-baseline gap-3 mb-2 flex-wrap">
        <div className="text-lg font-bold" style={{ color: INK }}>{words.title}</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 party"
          className="px-2 py-1 rounded border text-sm ml-auto" style={{ borderColor: BORDER }} />
      </div>
      {/* gross first — the money truly due; advances named as what they are.
          No overdue tile: the buckets below already track it (28 Aug 2026). */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
        <Card label={words.bills.toUpperCase() + (rec ? " — DUE TO COME" : " — TO PAY")} value={fmtMoney(data.gross)} sub={`${data.count} open bills`} color="#1B3A5C" />
        <Card label={words.adv.toUpperCase()} value={fmtMoney(-data.unadjusted)} sub={rec ? "a liability — work owed against money held" : "money out, goods awaited"} color="#1B6B93" />
        <Card label={words.net.toUpperCase()} value={fmtMoney(data.total)} sub="bills less advances" color={INK} />
      </div>
      <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxHeight: "70vh" }}>
        <table className="w-full text-xs" style={{ minWidth: 1100, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: "#22303C", color: "#fff" }}>
              {COLS.map((c, i) => (
                <th key={c.key}
                  className={`px-2 py-2 ${i === 0 ? "text-left" : "text-right"} whitespace-nowrap`}
                  style={{ position: "sticky", top: 0, background: "#22303C", cursor: "pointer" }}
                  onClick={() => clickSort(c.key)}
                  title="Click to sort — again to flip, a third time to clear">
                  {c.label}{sortKey === c.key ? (dir === -1 ? " ▼" : " ▲") : ""}
                </th>
              ))}
              <th className="px-2 py-2" style={{ position: "sticky", top: 0, background: "#22303C" }} />
            </tr>
          </thead>
          <tbody>
            {/* each column's own total, pinned under the heading (28 Aug 2026) */}
            {rows.length > 0 && (() => {
              const sum = (pick: (r: AgeingParty) => number) => rows.reduce((s2, r) => s2 + pick(r), 0);
              const cellCss = { position: "sticky" as const, top: 33, background: "#F7F5EF", zIndex: 3, borderBottom: "2px solid #22303C" };
              return (
                <tr className="font-bold text-xs">
                  <td className="px-2 py-1.5" style={cellCss}>TOTAL — {rows.length} shown</td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ ...cellCss, color: "#1B6B93" }}>{fmtMoney(sum((r) => -r.unadjusted))}</td>
                  <td className="px-2 py-1.5 text-right tnum" style={cellCss}>{fmtMoney(sum((r) => r.gross))}</td>
                  <td className="px-2 py-1.5 text-right tnum" style={cellCss}>{fmtMoney(sum((r) => r.total))}</td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ ...cellCss, color: MUTED }}>{fmtMoney(sum((r) => r.not_due))}</td>
                  <td className="px-2 py-1.5 text-right tnum" style={cellCss}>{fmtMoney(sum((r) => r.d0_30))}</td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ ...cellCss, color: "#D97706" }}>{fmtMoney(sum((r) => r.d31_90))}</td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ ...cellCss, color: RED }}>{fmtMoney(sum((r) => r.d91_180))}</td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ ...cellCss, color: RED }}>{fmtMoney(sum((r) => r.d180p))}</td>
                  <td className="px-2 py-1.5 text-right" style={{ ...cellCss, color: MUTED }}>{rows.reduce((s2, r) => s2 + r.bills.length, 0)}</td>
                </tr>
              );
            })()}
            {rows.length === 0 && (<tr><td colSpan={10} className="px-3 py-5 text-center" style={{ color: MUTED }}>Nothing here — upload the Tally files first.</td></tr>)}
            {rows.map((r, i) => (
              <>
                <tr key={r.party} className="border-t" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff", cursor: "pointer" }}
                  onClick={() => setOpen(open === r.party ? null : r.party)}>
                  <td className="px-2 py-1.5 font-semibold" style={{ color: INK, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.party}>
                    {open === r.party ? "▾ " : "▸ "}{r.party}
                  </td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ color: "#1B6B93" }}>{r.unadjusted ? fmtMoney(-r.unadjusted) : "·"}</td>
                  <td className="px-2 py-1.5 text-right tnum">{r.gross ? fmtMoney(r.gross) : "·"}</td>
                  <td className="px-2 py-1.5 text-right tnum font-bold">{fmtMoney(r.total)}</td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ color: MUTED }}>{r.not_due ? fmtMoney(r.not_due) : "·"}</td>
                  <td className="px-2 py-1.5 text-right tnum">{r.d0_30 ? fmtMoney(r.d0_30) : "·"}</td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ color: "#D97706" }}>{r.d31_90 ? fmtMoney(r.d31_90) : "·"}</td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ color: RED }}>{r.d91_180 ? fmtMoney(r.d91_180) : "·"}</td>
                  <td className="px-2 py-1.5 text-right tnum font-bold" style={{ color: RED }}>{r.d180p ? fmtMoney(r.d180p) : "·"}</td>
                  <td className="px-2 py-1.5 text-right" style={{ color: MUTED }}>{r.bills.length}</td>
                </tr>
                {open === r.party && r.bills.map((b, j) => {
                  const overdueDays = b.due_date
                    ? Math.round((new Date(data.today + "T00:00:00Z").getTime() - new Date(b.due_date + "T00:00:00Z").getTime()) / 86400000)
                    : null;
                  return (
                    <tr key={r.party + j} style={{ background: "#F4F6F9" }}>
                      <td className="px-2 py-1 pl-7" style={{ color: "#5A6672" }}>{b.bill}</td>
                      <td className="px-2 py-1 text-right tnum" style={{ color: MUTED }} title={kind === "receivable" ? "Original bill amount" : "Original invoice amount"}>
                        {b.original ? fmtMoney(b.original) : "·"}
                      </td>
                      <td className="px-2 py-1 text-right tnum" style={{ color: GREEN }} title={kind === "receivable" ? "Received against this bill" : "Paid against this bill"}>
                        {b.received ? fmtMoney(b.received) : "·"}
                      </td>
                      <td className="px-2 py-1 text-right tnum font-bold" style={{ color: b.amount < 0 ? "#1B6B93" : INK }} title="Pending">
                        {b.amount < 0 ? "−" + fmtMoney(-b.amount) : fmtMoney(b.amount)}
                      </td>
                      <td colSpan={5} className="px-2 py-1 text-right tnum" style={{ color: overdueDays !== null && overdueDays > 0 ? RED : MUTED }}>
                        billed {fmtD(b.bill_date)}
                        {overdueDays === null ? " · no due date"
                          : overdueDays > 0 ? ` · ${overdueDays} days overdue`
                          : overdueDays === 0 ? " · due today"
                          : ` · due in ${-overdueDays} days`}
                      </td>
                      <td />
                    </tr>
                  );
                })}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- Supplier report card ----------------
interface CardRow { party: string; outstanding: number; overdue: number; oldest: string | null; nbills: number; vouchers: number; avg_delay_days: number; overdue_pct: number; grade: string }
interface CardStats { net: number; gross: number; nbills: number; parties: number; avg_age_days: number; overdue: number; overdue_pct: number }
const gradeColor: Record<string, string> = { A: GREEN, B: "#7A8A1E", C: "#D97706", D: RED };

export function ReportCardScreen() {
  const [data] = useBooks<{ rows: CardRow[]; stats: CardStats; today: string }>("reportcard");
  const { fmt: fmtMoney } = useMoneyFmt();
  const [q, setQ] = useState("");
  const [openParty, setOpenParty] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState("");
  const [dir, setDir] = useState<1 | -1>(-1);
  if (!data) return <div className="text-sm" style={{ color: MUTED }}>Reading the books…</div>;
  const PICK: Record<string, (r: CardRow) => string | number> = {
    grade: (r) => r.grade, party: (r) => r.party.toLowerCase(), outstanding: (r) => r.outstanding,
    overdue: (r) => r.overdue, pct: (r) => r.overdue_pct, delay: (r) => r.avg_delay_days,
    oldest: (r) => r.oldest || "9999", nbills: (r) => r.nbills, vouchers: (r) => r.vouchers,
  };
  let rows = data.rows.filter((r) => !q || r.party.toLowerCase().includes(q.toLowerCase()));
  if (PICK[sortKey]) {
    const pk = PICK[sortKey];
    rows = [...rows].sort((a, b2) => {
      const x = pk(a), y = pk(b2);
      return dir * (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y)));
    });
  }
  const clickSort = (k: string) => {
    if (sortKey === k) { if (dir === -1) setDir(1); else { setSortKey(""); setDir(-1); } }
    else { setSortKey(k); setDir(k === "party" || k === "grade" ? 1 : -1); }
  };
  const st = data.stats;
  return (
    <div style={{ maxWidth: 1100 }}>
      {st && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          <Card label="TOTAL O/S — NET" value={fmtMoney(st.net)} sub={`${st.nbills} open bills · ${st.parties} suppliers`} color="#1B3A5C" />
          <Card label="GROSS OPEN BILLS" value={fmtMoney(st.gross)} sub="before unadjusted credits" />
          <Card label="AVERAGE AGE OF O/S" value={`${st.avg_age_days} days`} sub="rupee-weighted, since bill date" color={st.avg_age_days > 90 ? RED : INK} />
          <Card label="BEYOND CREDIT PERIOD" value={fmtMoney(st.overdue)} sub={`${st.overdue_pct}% of gross`} color={st.overdue ? RED : GREEN} />
        </div>
      )}
      <div className="flex items-baseline gap-3 mb-2 flex-wrap">
        <div className="text-lg font-bold" style={{ color: INK }}>Supplier Report Card</div>
        <span className="text-xs" style={{ color: MUTED }}>
          The grade reads the relationship's health — A means current, D means old and mostly overdue. Weighted delay is rupee-weighted, the sheet's own measure.
        </span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 supplier"
          className="px-2 py-1 rounded border text-sm ml-auto" style={{ borderColor: BORDER }} />
      </div>
      <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxHeight: "72vh" }}>
        <table className="w-full text-xs" style={{ minWidth: 860, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: "#22303C", color: "#fff" }}>
              {([["grade", "Grade"], ["party", "Supplier"], ["outstanding", "Outstanding"], ["overdue", "Overdue"], ["pct", "Overdue %"], ["delay", "Weighted delay"], ["oldest", "Oldest due"], ["nbills", "Open bills"], ["vouchers", "Vouchers FY"]] as const).map(([k, h], i) => (
                <th key={k} className={`px-2 py-2 ${i <= 1 ? "text-left" : "text-right"} whitespace-nowrap`}
                  style={{ position: "sticky", top: 0, background: "#22303C", cursor: "pointer" }}
                  onClick={() => clickSort(k)}
                  title="Click to sort — again to flip, a third time to clear">
                  {h}{sortKey === k ? (dir === -1 ? " ▼" : " ▲") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 && (() => {
              const cellCss = { position: "sticky" as const, top: 33, background: "#F7F5EF", zIndex: 3, borderBottom: "2px solid #22303C" };
              return (
                <tr className="font-bold text-xs">
                  <td className="px-2 py-1.5" style={cellCss} />
                  <td className="px-2 py-1.5" style={cellCss}>TOTAL — {rows.length} shown</td>
                  <td className="px-2 py-1.5 text-right tnum" style={cellCss}>{fmtMoney(rows.reduce((s2, r) => s2 + r.outstanding, 0))}</td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ ...cellCss, color: RED }}>{fmtMoney(rows.reduce((s2, r) => s2 + r.overdue, 0))}</td>
                  <td className="px-2 py-1.5" style={cellCss} colSpan={3} />
                  <td className="px-2 py-1.5 text-right tnum" style={cellCss}>{rows.reduce((s2, r) => s2 + r.nbills, 0)}</td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ ...cellCss, color: MUTED }}>{rows.reduce((s2, r) => s2 + r.vouchers, 0)}</td>
                </tr>
              );
            })()}
            {rows.map((r, i) => (
              <tr key={r.party} className="border-t" onClick={() => setOpenParty(r.party)}
                style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff", cursor: "pointer" }}
                title="Open this supplier's report card">
                <td className="px-2 py-1.5"><span className="rounded px-2 py-0.5 font-bold text-white" style={{ background: gradeColor[r.grade] }}>{r.grade}</span></td>
                <td className="px-2 py-1.5 font-semibold" style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#1B3A5C" }} title={r.party}>{r.party}</td>
                <td className="px-2 py-1.5 text-right tnum font-bold">{fmtMoney(r.outstanding)}</td>
                <td className="px-2 py-1.5 text-right tnum" style={{ color: r.overdue ? RED : GREEN }}>{fmtMoney(r.overdue)}</td>
                <td className="px-2 py-1.5 text-right tnum">{r.overdue_pct}%</td>
                <td className="px-2 py-1.5 text-right tnum">{r.avg_delay_days ? `${r.avg_delay_days} days` : "—"}</td>
                <td className="px-2 py-1.5 text-right tnum" style={{ color: MUTED }}>{fmtD(r.oldest)}</td>
                <td className="px-2 py-1.5 text-right tnum">{r.nbills}</td>
                <td className="px-2 py-1.5 text-right tnum" style={{ color: MUTED }}>{r.vouchers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {openParty && <SupplierCard party={openParty} grade={rows.find((r) => r.party === openParty)?.grade ?? "—"} onClose={() => setOpenParty(null)} />}
    </div>
  );
}

/**
 * One supplier's FULL dossier (Dr Raghu, 28 Aug 2026) — tabs: the overview
 * with TO PAY NOW and his fine ageing (0-15 … 360+), the outstanding bills,
 * the invoices and payments as lists, the planned payments from the cash
 * flow, the RECO STATUS grid (our Tally vs his ledger, FY by FY), and the
 * ITEMS he supplies, read off his own vouchers.
 */
const FY_LIST = ["2025-26", "2024-25", "2023-24", "2022-23", "2021-22", "2020-21", "2019-20", "2018-19", "2017-18", "2016-17"];
const FINE_LABELS: [string, string][] = [
  ["d0_15", "0–15"], ["d16_30", "16–30"], ["d31_60", "31–60"], ["d61_90", "61–90"],
  ["d91_120", "91–120"], ["d121_180", "121–180"], ["d181_240", "181–240"],
  ["d241_360", "241–360"], ["d360p", "360+"],
];

interface Dossier {
  net: number; gross: number; unadjusted: number; overdue: number; overdue_pct: number;
  weighted_delay: number; oldest_due: string | null; credit_days: number | null;
  buckets: Record<string, number>;
  paid: { d7: number; d30: number; d45: number; d90: number };
  invoiced: { d7: number; d30: number; d45: number; d90: number };
  vouchers: number; today: string;
  payments: { date: string | null; amount: number; bill: string; vtype: string; vno: string }[];
  invoices: { date: string | null; amount: number; bill: string; vtype: string; vno: string }[];
  plans: { plan_date: string; amount: number; status: string; purpose: string; bill_ref: string }[];
  items: { item: string; times: number; total: number; qty: string; last: string | null }[];
  bills: { bill: string; bill_date: string | null; due_date: string | null; amount: number }[];
}
type RecoRow = { id?: string; party: string; fy: string; our_closing: number | null; their_closing: number | null; status: string; upto: string | null; note: string };

function SupplierCard({ party, grade, onClose }: { party: string; grade: string; onClose: () => void }) {
  const { fmt: fmtMoney } = useMoneyFmt();
  const [d, setD] = useState<Dossier | null>(null);
  const [tab, setTab] = useState<"overview" | "bills" | "invoices" | "payments" | "plan" | "reco" | "items">("overview");
  const [reco, setReco] = useState<RecoRow[] | null>(null);
  const [recoMsg, setRecoMsg] = useState("");

  useEffect(() => {
    fetch(`/api/kuber/books?view=supplier&party=${encodeURIComponent(party)}`, { cache: "no-store" })
      .then((r) => r.json()).then(setD).catch(() => setD(null));
  }, [party]);
  const loadReco = useCallback(() => {
    fetch("/api/kuber/register?kind=reco", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setReco(((j.rows || []) as RecoRow[]).filter((r) => r.party === party)))
      .catch(() => setReco([]));
  }, [party]);
  useEffect(() => { if (tab === "reco" && reco === null) loadReco(); }, [tab, reco, loadReco]);

  const saveReco = async (row: RecoRow) => {
    setRecoMsg("");
    const r = await fetch("/api/kuber/register", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "reco", action: row.id ? "update" : "add", id: row.id, row }),
    });
    if (!r.ok) { setRecoMsg((await r.json()).error || "Could not save"); return; }
    loadReco();
  };

  const Fact = ({ k, v, c }: { k: string; v: string; c?: string }) => (
    <div><div className="text-xs font-bold" style={{ color: MUTED }}>{k}</div><div className="text-sm font-bold tnum" style={{ color: c || INK }}>{v}</div></div>
  );
  const MiniTable = ({ head, children }: { head: string[]; children: React.ReactNode }) => (
    <table className="w-full text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
      <thead><tr style={{ background: "#22303C", color: "#fff" }}>
        {head.map((h, i) => (<th key={h} className={`px-2 py-1.5 text-${i === head.length - 1 ? "right" : "left"}`} style={{ position: "sticky", top: 0, background: "#22303C" }}>{h}</th>))}
      </tr></thead>
      <tbody>{children}</tbody>
    </table>
  );
  const TABS: [typeof tab, string][] = [
    ["overview", "Overview"], ["bills", "Outstanding"], ["invoices", "Invoices"],
    ["payments", "Payments"], ["plan", "Payment Plan"], ["reco", "Reco Status"], ["items", "Items Supplied"],
  ];

  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-3" style={{ background: "rgba(0,0,0,0.45)", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg w-full" style={{ maxWidth: 920, height: "calc(100vh - 40px)", display: "flex", flexDirection: "column" }}>
        <div className="flex items-center gap-3 px-4 py-3" style={{ background: "#22303C", borderRadius: "8px 8px 0 0" }}>
          <span className="rounded px-2 py-0.5 font-bold text-white" style={{ background: gradeColor[grade] ?? MUTED }}>{grade}</span>
          <div className="font-bold text-white" style={{ fontSize: 15 }}>{party}</div>
          <button onClick={onClose} className="ml-auto" style={{ color: "#8FA1B3" }}>✕</button>
        </div>
        <div className="flex gap-1 px-3 pt-2 flex-wrap" style={{ borderBottom: `1px solid ${BORDER}` }}>
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className="px-3 py-1.5 text-xs font-bold rounded-t"
              style={tab === k ? { background: "#22303C", color: "#fff" } : { color: MUTED }}>
              {l}
            </button>
          ))}
        </div>
        <div className="p-4 overflow-auto" style={{ flex: 1 }}>
          {!d ? <div className="text-sm" style={{ color: MUTED }}>Reading this supplier…</div> : (
            <>
              {tab === "overview" && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <Fact k="O/S — NET" v={fmtMoney(d.net)} c="#1B3A5C" />
                    <Fact k="TO PAY NOW (BEYOND CREDIT)" v={`${fmtMoney(d.overdue)} · ${d.overdue_pct}%`} c={d.overdue ? RED : GREEN} />
                    <Fact k="WEIGHTED DELAY" v={d.weighted_delay ? `${d.weighted_delay} days` : "—"} />
                    <Fact k="CREDIT PERIOD (HIS BILLS)" v={d.credit_days != null ? `${d.credit_days} days` : "—"} />
                    <Fact k="OLDEST DUE" v={fmtD(d.oldest_due)} c={d.oldest_due ? RED : INK} />
                    <Fact k="UNADJUSTED" v={d.unadjusted ? "−" + fmtMoney(-d.unadjusted) : "—"} c="#1B6B93" />
                    <Fact k="PAID — 7/30/45/90 DAYS" v={`${fmtMoney(d.paid.d7)} · ${fmtMoney(d.paid.d30)} · ${fmtMoney(d.paid.d45)} · ${fmtMoney(d.paid.d90)}`} c={GREEN} />
                    <Fact k="INVOICED — 7/30/45/90 DAYS" v={`${fmtMoney(d.invoiced.d7)} · ${fmtMoney(d.invoiced.d30)} · ${fmtMoney(d.invoiced.d45)} · ${fmtMoney(d.invoiced.d90)}`} />
                  </div>
                  <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.8 }}>AGEING OF OUTSTANDING — DAYS SINCE BILL</div>
                  <div className="flex gap-2 flex-wrap mb-3">
                    {FINE_LABELS.map(([k, l]) => (
                      <span key={k} className="rounded border px-2 py-1 text-xs font-semibold"
                        style={{ borderColor: BORDER, color: ["d91_120", "d121_180"].includes(k) ? "#D97706" : ["d181_240", "d241_360", "d360p"].includes(k) ? RED : INK }}>
                        {l}: <b className="tnum">{d.buckets[k] ? fmtMoney(d.buckets[k]) : "·"}</b>
                      </span>
                    ))}
                    {d.buckets.undated > 0 && (
                      <span className="rounded border px-2 py-1 text-xs font-semibold" style={{ borderColor: BORDER, color: MUTED }}>
                        undated: <b className="tnum">{fmtMoney(d.buckets.undated)}</b>
                      </span>
                    )}
                  </div>
                  {d.plans.length > 0 && (
                    <div className="rounded p-2 text-xs font-semibold" style={{ background: "#E9F5EC", color: "#0D7A3F" }}>
                      Planned in the cash flow: {d.plans.map((pl) => `${fmtD(pl.plan_date)} — ${fmtMoney(pl.amount)} (${pl.status})`).join(" · ")}
                    </div>
                  )}
                </>
              )}

              {tab === "bills" && (
                <MiniTable head={["Bill", "Billed", "Due", "Amount"]}>
                  {d.bills.map((b, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                      <td className="px-2 py-1">{b.bill}</td>
                      <td className="px-2 py-1 tnum">{fmtD(b.bill_date)}</td>
                      <td className="px-2 py-1 tnum" style={{ color: b.due_date && b.due_date < d.today ? RED : MUTED }}>{fmtD(b.due_date)}</td>
                      <td className="px-2 py-1 text-right tnum" style={{ color: b.amount < 0 ? "#1B6B93" : INK }}>{b.amount < 0 ? "−" + fmtMoney(-b.amount) : fmtMoney(b.amount)}</td>
                    </tr>
                  ))}
                </MiniTable>
              )}

              {tab === "invoices" && (
                <MiniTable head={["Date", "Bill / Ref", "Voucher", "Amount"]}>
                  {d.invoices.length === 0 && (<tr><td colSpan={4} className="px-3 py-4" style={{ color: MUTED }}>No invoices inside this book&apos;s window.</td></tr>)}
                  {d.invoices.map((x, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                      <td className="px-2 py-1 tnum">{fmtD(x.date)}</td>
                      <td className="px-2 py-1">{x.bill}</td>
                      <td className="px-2 py-1" style={{ color: MUTED }}>{x.vtype} {x.vno}</td>
                      <td className="px-2 py-1 text-right tnum">{fmtMoney(x.amount)}</td>
                    </tr>
                  ))}
                </MiniTable>
              )}

              {tab === "payments" && (
                <MiniTable head={["Date", "Against bill", "Voucher", "Amount"]}>
                  {d.payments.length === 0 && (<tr><td colSpan={4} className="px-3 py-4" style={{ color: MUTED }}>No payments inside this book&apos;s window.</td></tr>)}
                  {d.payments.map((x, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                      <td className="px-2 py-1 tnum">{fmtD(x.date)}</td>
                      <td className="px-2 py-1">{x.bill}</td>
                      <td className="px-2 py-1" style={{ color: MUTED }}>{x.vtype} {x.vno}</td>
                      <td className="px-2 py-1 text-right tnum" style={{ color: GREEN }}>{fmtMoney(x.amount)}</td>
                    </tr>
                  ))}
                </MiniTable>
              )}

              {tab === "plan" && (
                <>
                  <div className="text-xs mb-2" style={{ color: MUTED }}>
                    His rows from Payment Planning — the cash flow obeys these over his raw bills. Add and edit them on Kuber → Payment Planning with the party exactly as spelled here.
                  </div>
                  <MiniTable head={["Pay on", "Purpose", "Bill ref", "Status", "Amount"]}>
                    {d.plans.length === 0 && (<tr><td colSpan={5} className="px-3 py-4" style={{ color: MUTED }}>Nothing planned for this supplier yet.</td></tr>)}
                    {d.plans.map((x, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                        <td className="px-2 py-1 tnum">{fmtD(x.plan_date)}</td>
                        <td className="px-2 py-1">{x.purpose || "—"}</td>
                        <td className="px-2 py-1" style={{ color: MUTED }}>{x.bill_ref || "—"}</td>
                        <td className="px-2 py-1 font-semibold">{x.status}</td>
                        <td className="px-2 py-1 text-right tnum">{fmtMoney(x.amount)}</td>
                      </tr>
                    ))}
                  </MiniTable>
                </>
              )}

              {tab === "reco" && (
                <>
                  <div className="text-xs mb-2" style={{ color: MUTED }}>
                    Our Tally closing against the ledger THE SUPPLIER sent, year by year — his side is typed here, never guessed. Positive difference = books disagree.
                  </div>
                  {recoMsg && <div className="text-xs font-bold mb-1" style={{ color: RED }}>{recoMsg}</div>}
                  <MiniTable head={["FY", "Ours (Tally)", "His ledger", "Difference", "Status", "Upto", ""]}>
                    {FY_LIST.map((fy, i) => {
                      const row = reco?.find((r) => r.fy === fy) ?? { party, fy, our_closing: null, their_closing: null, status: "", upto: null, note: "" };
                      return <RecoLine key={fy} row={row} zebra={i % 2 === 1} onSave={saveReco} fmtMoney={fmtMoney} />;
                    })}
                  </MiniTable>
                </>
              )}

              {tab === "items" && (
                <MiniTable head={["Item", "Times", "Last supplied", "Last qty", "Total value"]}>
                  {d.items.length === 0 && (<tr><td colSpan={5} className="px-3 py-4" style={{ color: MUTED }}>No item lines on his vouchers in this book — service and expense suppliers show nothing here (run migration 0081 and re-upload Transactions once, if not done).</td></tr>)}
                  {d.items.map((x, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                      <td className="px-2 py-1 font-semibold">{x.item}</td>
                      <td className="px-2 py-1 tnum">{x.times}</td>
                      <td className="px-2 py-1 tnum">{fmtD(x.last)}</td>
                      <td className="px-2 py-1" style={{ color: MUTED }}>{x.qty || "—"}</td>
                      <td className="px-2 py-1 text-right tnum font-bold">{fmtMoney(x.total)}</td>
                    </tr>
                  ))}
                </MiniTable>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** One FY row of the reco grid — editable in place, saved per line. */
function RecoLine({ row, zebra, onSave, fmtMoney }: {
  row: RecoRow; zebra: boolean; onSave: (r: RecoRow) => void; fmtMoney: (v: number | null | undefined) => string;
}) {
  const [f, setF] = useState(row);
  useEffect(() => { setF(row); }, [row]);
  const dirty = JSON.stringify(f) !== JSON.stringify(row);
  const diff = (Number(f.our_closing) || 0) - (Number(f.their_closing) || 0);
  const has = f.our_closing != null || f.their_closing != null || f.status;
  return (
    <tr className="border-t" style={{ borderColor: "#EFEDE7", background: zebra ? "#FAF9F5" : "#fff" }}>
      <td className="px-2 py-1 font-bold">{f.fy}</td>
      <td className="px-2 py-1"><input type="number" value={f.our_closing ?? ""} onChange={(e) => setF({ ...f, our_closing: e.target.value === "" ? null : Number(e.target.value) })} className="border rounded px-1 py-0.5 text-right tnum w-28" style={{ borderColor: BORDER }} /></td>
      <td className="px-2 py-1"><input type="number" value={f.their_closing ?? ""} onChange={(e) => setF({ ...f, their_closing: e.target.value === "" ? null : Number(e.target.value) })} className="border rounded px-1 py-0.5 text-right tnum w-28" style={{ borderColor: BORDER }} /></td>
      <td className="px-2 py-1 text-right tnum font-bold" style={{ color: has && Math.abs(diff) > 0.5 ? RED : GREEN }}>{has ? fmtMoney(diff) : "·"}</td>
      <td className="px-2 py-1"><input value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} placeholder="Reco till… / Mismatch / Not received" className="border rounded px-1 py-0.5 w-44" style={{ borderColor: BORDER }} /></td>
      <td className="px-2 py-1"><input type="date" value={f.upto ?? ""} onChange={(e) => setF({ ...f, upto: e.target.value || null })} className="border rounded px-1 py-0.5" style={{ borderColor: BORDER }} /></td>
      <td className="px-2 py-1 text-right">
        {dirty && <button onClick={() => onSave(f)} className="text-xs font-bold rounded px-2 py-0.5 text-white" style={{ background: "#E8600A" }}>💾</button>}
      </td>
    </tr>
  );
}

// ---------------- 13-week cash flow ----------------
interface Flow { start: string; weeks: string[]; flows: Record<string, number[]>; net: number[]; cumulative: number[]; today: string }
export function CashFlowScreen({ go }: { go: (key: string) => void }) {
  const [data] = useBooks<Flow>("cashflow");
  const { num, label } = useMoneyFmt();
  if (!data) return <div className="text-sm" style={{ color: MUTED }}>Reading the books…</div>;
  const F = data.flows;
  const ROWS: { key: string; label: string; dir: 1 | -1 }[] = [
    { key: "collections", label: "Collections — bills falling due", dir: 1 },
    { key: "fd_maturity", label: "FD maturities", dir: 1 },
    { key: "other_in", label: "Other inflow (cash items)", dir: 1 },
    { key: "planned_payments", label: "Supplier payments — planned", dir: -1 },
    { key: "unplanned_bills", label: "Supplier bills due — unplanned", dir: -1 },
    { key: "other_out", label: "Salaries · EMI · Statutory · Regular (cash items)", dir: -1 },
  ];
  const wk = (iso: string) => {
    const d = new Date(iso + "T00:00:00Z");
    return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const cell = (v: number, neg = false) =>
    v ? <span className="tnum" style={{ color: neg ? RED : INK }}>{num(v)}</span> : <span style={{ color: "#D5D2C8" }}>·</span>;
  return (
    <div style={{ maxWidth: 1200 }}>
      <div className="flex items-baseline gap-3 mb-1 flex-wrap">
        <div className="text-lg font-bold" style={{ color: INK }}>13-Week Cash Flow</div>
        <span className="text-xs font-bold" style={{ color: "#7A5E1E", letterSpacing: 0.5 }}>SALES IS VANITY · PROFIT IS SANITY · CASH FLOW IS KING</span>
      </div>
      <div className="text-xs mb-2" style={{ color: MUTED, lineHeight: 1.5 }}>
        Figures in {label}. Overdue money sits in week 1. A party planned in{" "}
        <button onClick={() => go("payplan")} className="font-bold" style={{ color: "#1B3A5C" }}>Payment Planning</button> replaces its raw bills —
        the plan is the decision. Salaries, EMIs and statutory ride{" "}
        <button onClick={() => go("cashitem")} className="font-bold" style={{ color: "#1B3A5C" }}>Cash Flow Items</button>.
      </div>
      <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER }}>
        <table className="text-xs" style={{ minWidth: 1150, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: "#22303C", color: "#fff" }}>
              <th className="px-2 py-2 text-left" style={{ position: "sticky", left: 0, background: "#22303C", minWidth: 230 }}>{label}</th>
              {data.weeks.map((w, i) => (
                <th key={w} className="px-2 py-2 text-right whitespace-nowrap">
                  W{i + 1}<div style={{ fontWeight: 400, fontSize: 10, color: "#8FA1B3" }}>{wk(w)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.key} className="border-t" style={{ borderColor: "#EFEDE7" }}>
                <td className="px-2 py-1.5 font-semibold" style={{ position: "sticky", left: 0, background: "#fff", color: r.dir > 0 ? GREEN : RED }}>
                  {r.dir > 0 ? "+ " : "− "}{r.label}
                </td>
                {F[r.key].map((v, i) => (<td key={i} className="px-2 py-1.5 text-right">{cell(v, r.dir < 0)}</td>))}
              </tr>
            ))}
            <tr className="border-t" style={{ borderColor: "#22303C", background: "#F7F5EF" }}>
              <td className="px-2 py-1.5 font-bold" style={{ position: "sticky", left: 0, background: "#F7F5EF", color: INK }}>Net cash generation</td>
              {data.net.map((v, i) => (
                <td key={i} className="px-2 py-1.5 text-right tnum font-bold" style={{ color: v < 0 ? RED : GREEN }}>{num(v)}</td>
              ))}
            </tr>
            <tr style={{ background: "#F7F5EF" }}>
              <td className="px-2 py-1.5 font-bold" style={{ position: "sticky", left: 0, background: "#F7F5EF", color: INK }}>Cumulative</td>
              {data.cumulative.map((v, i) => (
                <td key={i} className="px-2 py-1.5 text-right tnum font-bold" style={{ color: v < 0 ? RED : "#1B3A5C" }}>{num(v)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="text-xs mt-2" style={{ color: MUTED }}>
        The opening bank balance and the plan-vs-actual track record join once Bank &amp; Cash is built — the sheet's signature block becomes a Freeze, the HRMS way.
      </div>
    </div>
  );
}

// ---------------- ledger & voucher browsers ----------------
export function LedgerBrowser() {
  const [q, setQ] = useState("");
  const { fmt: fmtMoney } = useMoneyFmt();
  const [data] = useBooks<{ rows: { name: string; parent: string; opening: number; closing: number }[] }>("ledgers", q ? `&q=${encodeURIComponent(q)}` : "");
  const [sortKey, setSortKey] = useState("");
  const [dir, setDir] = useState<1 | -1>(1);
  return (
    <div style={{ maxWidth: 950 }}>
      <div className="flex items-baseline gap-3 mb-2">
        <div className="text-lg font-bold" style={{ color: INK }}>Ledgers</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 search a ledger" className="px-2 py-1 rounded border text-sm" style={{ borderColor: BORDER, minWidth: 240 }} />
        <span className="text-xs" style={{ color: MUTED }}>first 500 — search to narrow</span>
      </div>
      <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxHeight: "72vh" }}>
        <table className="w-full text-xs" style={{ minWidth: 700, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead><tr style={{ background: "#22303C", color: "#fff" }}>
            {(["name", "parent", "opening", "closing"] as const).map((k, i) => (
              <th key={k} className={`px-2 py-2 ${i <= 1 ? "text-left" : "text-right"}`}
                style={{ position: "sticky", top: 0, background: "#22303C", cursor: "pointer" }}
                onClick={() => { if (sortKey === k) { if (dir === 1) setDir(-1); else { setSortKey(""); setDir(1); } } else { setSortKey(k); setDir(1); } }}>
                {["Ledger", "Group", "Opening", "Closing"][i]}{sortKey === k ? (dir === 1 ? " ▲" : " ▼") : ""}
              </th>
            ))}
          </tr></thead>
          <tbody>
            {[...(data?.rows || [])].sort((a, b) => {
              if (!sortKey) return 0;
              const x = a[sortKey as "name"], y = b[sortKey as "name"];
              return dir * (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y)));
            }).map((l, i) => (
              <tr key={l.name + i} className="border-t" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                <td className="px-2 py-1.5">{l.name}</td>
                <td className="px-2 py-1.5" style={{ color: MUTED }}>{l.parent}</td>
                <td className="px-2 py-1.5 text-right tnum">{l.opening ? fmtMoney(Math.abs(l.opening)) + (l.opening < 0 ? " Dr" : " Cr") : "·"}</td>
                <td className="px-2 py-1.5 text-right tnum">{l.closing ? fmtMoney(Math.abs(l.closing)) + (l.closing < 0 ? " Dr" : " Cr") : "·"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function VoucherBrowser() {
  const [q, setQ] = useState("");
  const [data] = useBooks<{ rows: { id: string; date: string; vtype: string; vno: string; party: string; narration: string }[] }>("vouchers", q ? `&q=${encodeURIComponent(q)}` : "");
  return (
    <div style={{ maxWidth: 1100 }}>
      <div className="flex items-baseline gap-3 mb-2">
        <div className="text-lg font-bold" style={{ color: INK }}>Vouchers</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 party, narration, number, type" className="px-2 py-1 rounded border text-sm" style={{ borderColor: BORDER, minWidth: 280 }} />
        <span className="text-xs" style={{ color: MUTED }}>latest 500 — search to narrow</span>
      </div>
      <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxHeight: "72vh" }}>
        <table className="w-full text-xs" style={{ minWidth: 860, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead><tr style={{ background: "#22303C", color: "#fff" }}>
            {["Date", "Type", "No", "Party", "Narration"].map((h) => (<th key={h} className="px-2 py-2 text-left" style={{ position: "sticky", top: 0, background: "#22303C" }}>{h}</th>))}
          </tr></thead>
          <tbody>
            {(data?.rows || []).map((v, i) => (
              <tr key={v.id} className="border-t" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                <td className="px-2 py-1.5 tnum whitespace-nowrap">{fmtD(v.date)}</td>
                <td className="px-2 py-1.5 font-semibold whitespace-nowrap">{v.vtype}</td>
                <td className="px-2 py-1.5" style={{ color: MUTED }}>{v.vno}</td>
                <td className="px-2 py-1.5" style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v.party}>{v.party}</td>
                <td className="px-2 py-1.5" style={{ color: MUTED, maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v.narration}>{v.narration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- P&L and Balance Sheet ----------------
// (Dr Raghu, 28 Aug 2026: "Add above Correspondence P&L and BS.") Both are
// computed from first principles — group tree, ledger openings, every voucher
// line — never typed. Totals stand at the top; sections open on click.

interface FinSec { root: string; total: number; groups: { name: string; total: number; ledgers: { name: string; amount: number }[] }[] }
interface Financials {
  empty?: boolean; from: string; to: string; asof: string;
  pnl: { trading: FinSec[]; indirect: FinSec[]; grossProfit: number; netProfit: number };
  bs: { liabilities: FinSec[]; assets: FinSec[]; profit: number; totalL: number; totalA: number; gap: number };
}

function FinSection({ s, flip, fmtMoney }: { s: FinSec; flip: boolean; fmtMoney: (n: number) => string }) {
  const [open, setOpen] = useState(false);
  const [openGrp, setOpenGrp] = useState<string | null>(null);
  const v = (n: number) => fmtMoney(flip ? -n : n);
  return (
    <div className="border-t" style={{ borderColor: "#EFEDE7" }}>
      <div onClick={() => setOpen(!open)} className="flex items-center justify-between px-3 py-2" style={{ cursor: "pointer" }}>
        <span className="font-bold text-sm" style={{ color: INK }}>{open ? "▾" : "▸"} {s.root}</span>
        <span className="font-bold tnum text-sm">{v(s.total)}</span>
      </div>
      {open && s.groups.map((g) => (
        <div key={g.name}>
          <div onClick={() => setOpenGrp(openGrp === g.name ? null : g.name)}
            className="flex items-center justify-between px-3 py-1 text-xs" style={{ cursor: "pointer", paddingLeft: 26 }}>
            <span className="font-semibold" style={{ color: "#5A6672" }}>{g.name}</span>
            <span className="tnum font-semibold">{v(g.total)}</span>
          </div>
          {openGrp === g.name && g.ledgers.map((l) => (
            <div key={l.name} className="flex items-center justify-between px-3 py-0.5 text-xs" style={{ paddingLeft: 42, color: MUTED }}>
              <span>{l.name}</span><span className="tnum">{v(l.amount)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function PnLScreen() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const fyStart = today.slice(5, 7) >= "04" ? today.slice(0, 4) + "-04-01" : String(Number(today.slice(0, 4)) - 1) + "-04-01";
  const [from, setFrom] = useState(fyStart);
  const [to, setTo] = useState(today);
  const [data] = useBooks<Financials>("financials", `&from=${from}&to=${to}`);
  const { fmt: fmtMoney } = useMoneyFmt();
  // the three the eye wants first (Dr Raghu, 28 Aug 2026): YTD · QTD · MTD
  const mtdStart = today.slice(0, 8) + "01";
  const qm = Math.floor(((Number(today.slice(5, 7)) + 8) % 12) / 3) * 3;
  const qMonth = ((3 + qm) % 12) + 1;
  const qYear = qMonth > Number(today.slice(5, 7)) ? Number(today.slice(0, 4)) - 1 : Number(today.slice(0, 4));
  const qtdStart = `${qYear}-${String(qMonth).padStart(2, "0")}-01`;
  const CHIPS: [string, string][] = [["YTD", fyStart], ["QTD", qtdStart], ["MTD", mtdStart]];
  if (data?.empty) return <div className="text-sm" style={{ color: MUTED }}>No books yet — upload the Tally masters and transactions first.</div>;
  return (
    <div style={{ maxWidth: 860 }}>
      <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="text-lg font-bold" style={{ color: INK }}>Profit &amp; Loss</div>
          <div className="text-sm" style={{ color: "#5A6672" }}>Computed from every voucher line in the period — Tally&apos;s own arithmetic, nothing typed.</div>
        </div>
        <div className="flex gap-2 items-center text-xs font-semibold flex-wrap" style={{ color: MUTED }}>
          {CHIPS.map(([lbl, start]) => (
            <button key={lbl} onClick={() => { setFrom(start); setTo(today); }}
              className="rounded-full border px-2.5 py-0.5 font-bold"
              style={from === start && to === today ? { background: "#22303C", color: "#fff", borderColor: "#22303C" } : { color: MUTED, borderColor: BORDER, background: "#fff" }}>
              {lbl}
            </button>
          ))}
          from <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded px-2 py-1" style={{ borderColor: BORDER }} />
          to <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded px-2 py-1" style={{ borderColor: BORDER }} />
        </div>
      </div>
      {!data ? <div className="text-sm" style={{ color: MUTED }}>computing…</div> : (
        <>
          <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <Card label="GROSS PROFIT" value={fmtMoney(data.pnl.grossProfit)} sub="sales + direct incomes − purchases − direct expenses" color={data.pnl.grossProfit >= 0 ? GREEN : RED} />
            <Card label="NET PROFIT" value={fmtMoney(data.pnl.netProfit)} sub="after the indirect heads" color={data.pnl.netProfit >= 0 ? GREEN : RED} />
          </div>
          <div className="bg-white rounded-lg border mb-3" style={{ borderColor: BORDER }}>
            <div className="px-3 py-2 text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.8 }}>TRADING — TO GROSS PROFIT</div>
            {data.pnl.trading.map((s) => (<FinSection key={s.root} s={s} flip={/expense|purchase/i.test(s.root)} fmtMoney={fmtMoney} />))}
          </div>
          <div className="bg-white rounded-lg border" style={{ borderColor: BORDER }}>
            <div className="px-3 py-2 text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.8 }}>INDIRECT — TO NET PROFIT</div>
            {data.pnl.indirect.map((s) => (<FinSection key={s.root} s={s} flip={/expense/i.test(s.root)} fmtMoney={fmtMoney} />))}
          </div>
          <p className="text-xs mt-2" style={{ color: MUTED, maxWidth: "80ch", lineHeight: 1.6 }}>
            Incomes read positive, expenses read positive under their own heads and subtract in the totals. A head opens
            to its groups, a group to its ledgers. The books are only as current as the last Tally upload.
          </p>
        </>
      )}
    </div>
  );
}

export function BalanceSheetScreen() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [asof, setAsof] = useState(today);
  const [data] = useBooks<Financials>("financials", `&asof=${asof}`);
  const { fmt: fmtMoney } = useMoneyFmt();
  if (data?.empty) return <div className="text-sm" style={{ color: MUTED }}>No books yet — upload the Tally masters and transactions first.</div>;
  return (
    <div style={{ maxWidth: 980 }}>
      <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="text-lg font-bold" style={{ color: INK }}>Balance Sheet</div>
          <div className="text-sm" style={{ color: "#5A6672" }}>Every ledger&apos;s opening plus every line to the date — as-of, not a snapshot typed in.</div>
        </div>
        <div className="flex gap-2 items-center text-xs font-semibold" style={{ color: MUTED }}>
          as of <input type="date" value={asof} onChange={(e) => setAsof(e.target.value)} className="border rounded px-2 py-1" style={{ borderColor: BORDER }} />
        </div>
      </div>
      {!data ? <div className="text-sm" style={{ color: MUTED }}>computing…</div> : (
        <>
          <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <Card label="LIABILITIES + P&L" value={fmtMoney(data.bs.totalL)} sub={`incl. profit to date ${fmtMoney(data.bs.profit)}`} />
            <Card label="ASSETS" value={fmtMoney(-data.bs.totalA)} />
            {Math.round(Math.abs(data.bs.gap)) > 1 && (
              <Card label="GAP" value={fmtMoney(data.bs.gap)} sub="the two sides disagree by this — usually an opening-balance difference in Tally" color={RED} />
            )}
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))" }}>
            <div className="bg-white rounded-lg border" style={{ borderColor: BORDER }}>
              <div className="px-3 py-2 text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.8 }}>LIABILITIES</div>
              {data.bs.liabilities.map((s) => (<FinSection key={s.root} s={s} flip={false} fmtMoney={fmtMoney} />))}
              <div className="flex items-center justify-between px-3 py-2 border-t text-sm font-bold" style={{ borderColor: "#22303C" }}>
                <span>Profit &amp; Loss (to date)</span><span className="tnum" style={{ color: data.bs.profit >= 0 ? GREEN : RED }}>{fmtMoney(data.bs.profit)}</span>
              </div>
            </div>
            <div className="bg-white rounded-lg border" style={{ borderColor: BORDER }}>
              <div className="px-3 py-2 text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.8 }}>ASSETS</div>
              {data.bs.assets.map((s) => (<FinSection key={s.root} s={s} flip fmtMoney={fmtMoney} />))}
            </div>
          </div>
          <p className="text-xs mt-2" style={{ color: MUTED, maxWidth: "84ch", lineHeight: 1.6 }}>
            Credit balances carry the liabilities side, debit balances the assets side — Tally&apos;s own convention. The
            profit line is the P&amp;L heads&apos; whole movement to the date, so the sheet balances the way the books do.
          </p>
        </>
      )}
    </div>
  );
}

// ---------------- TVC / OE / Expenses registers ----------------
// (Dr Raghu, 28 Aug 2026, the TOC cut): TVC = Truly Variable Cost — RM,
// process, what rises with every unit. OE = Operating Expenses — any cost
// that is NOT variable. THROUGHPUT = Sales − TVC; NET = Throughput − OE.
// Genie seeds the classification; the CFO's flip outranks the seed.

interface ExpRow { ledger: string; group: string; root: string; cls: string; seeded: boolean; amount: number }
interface ExpData { empty?: boolean; from: string; to: string; rows: ExpRow[]; totals: { sales: number; tvc: number; oe: number; throughput: number; net: number } }

export function ExpensesScreen({ mode }: { mode: "all" | "tvc" | "oe" }) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const fyStart = today.slice(5, 7) >= "04" ? today.slice(0, 4) + "-04-01" : String(Number(today.slice(0, 4)) - 1) + "-04-01";
  const mtdStart = today.slice(0, 8) + "01";
  const qm = Math.floor(((Number(today.slice(5, 7)) + 8) % 12) / 3) * 3;
  const qMonth = ((3 + qm) % 12) + 1;
  const qYear = qMonth > Number(today.slice(5, 7)) ? Number(today.slice(0, 4)) - 1 : Number(today.slice(0, 4));
  const qtdStart = `${qYear}-${String(qMonth).padStart(2, "0")}-01`;
  const [from, setFrom] = useState(fyStart);
  const [to, setTo] = useState(today);
  const [data, reload] = useBooks<ExpData>("expenses", `&from=${from}&to=${to}`);
  const { fmt: fmtMoney } = useMoneyFmt();
  const [sortK, setSortK] = useState<"amount" | "ledger" | "group">("amount");
  const [dir, setDir] = useState<1 | -1>(-1);

  const TITLES = {
    all: ["Expenses Register", "Every expense ledger for the period, with its TOC class — flip a wrong one and every register follows."],
    tvc: ["TVC Register", "Truly Variable Cost — RM, process, freight: what rises with every unit. Throughput = Sales − TVC."],
    oe: ["OE Register", "Operating Expenses — by the TOC definition, every cost that is NOT variable. Net = Throughput − OE."],
  } as const;
  const [title, blurb] = TITLES[mode];

  if (data?.empty) return <div className="text-sm" style={{ color: MUTED }}>No books yet — upload the Tally masters and transactions first.</div>;

  const rows = (data?.rows || [])
    .filter((r) => mode === "all" || r.cls === mode)
    .sort((a, b) => (sortK === "amount" ? a.amount - b.amount : String(a[sortK]).localeCompare(String(b[sortK]))) * dir);
  const shown = rows.reduce((s2, r) => s2 + r.amount, 0);
  const t = data?.totals;
  const flip = async (ledger: string, cls: string) => {
    await fetch("/api/kuber/books", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "classify", ledger, cls }),
    });
    reload();
  };
  const Hd = ({ k, children, right }: { k: typeof sortK; children: React.ReactNode; right?: boolean }) => (
    <th className={`px-2 py-2 text-${right ? "right" : "left"} whitespace-nowrap`}
      onClick={() => { if (sortK === k) setDir((d) => (d === 1 ? -1 : 1)); else { setSortK(k); setDir(k === "amount" ? -1 : 1); } }}
      style={{ position: "sticky", top: 0, background: "#22303C", cursor: "pointer" }}>
      {children}{sortK === k ? (dir === 1 ? " ▲" : " ▼") : ""}
    </th>
  );

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="text-lg font-bold" style={{ color: INK }}>{title}</div>
          <div className="text-sm" style={{ color: "#5A6672", maxWidth: 640, lineHeight: 1.5 }}>{blurb}</div>
        </div>
        <div className="flex gap-2 items-center text-xs font-semibold flex-wrap" style={{ color: MUTED }}>
          {([["YTD", fyStart], ["QTD", qtdStart], ["MTD", mtdStart]] as [string, string][]).map(([lbl, start]) => (
            <button key={lbl} onClick={() => { setFrom(start); setTo(today); }}
              className="rounded-full border px-2.5 py-0.5 font-bold"
              style={from === start && to === today ? { background: "#22303C", color: "#fff", borderColor: "#22303C" } : { color: MUTED, borderColor: BORDER, background: "#fff" }}>
              {lbl}
            </button>
          ))}
          from <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded px-2 py-1" style={{ borderColor: BORDER }} />
          to <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded px-2 py-1" style={{ borderColor: BORDER }} />
        </div>
      </div>
      {!data ? <div className="text-sm" style={{ color: MUTED }}>computing…</div> : (
        <>
          <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            {mode !== "oe" && <Card label="SALES" value={fmtMoney(t!.sales)} />}
            <Card label="TVC" value={fmtMoney(t!.tvc)} color="#1B6B93" />
            {mode !== "oe" && <Card label="THROUGHPUT" value={fmtMoney(t!.throughput)} sub={t!.sales ? `${Math.round((t!.throughput / t!.sales) * 100)}% of sales` : undefined} color={t!.throughput >= 0 ? GREEN : RED} />}
            <Card label="OE" value={fmtMoney(t!.oe)} color="#1B6B93" />
            <Card label="NET (T − OE)" value={fmtMoney(t!.net)} sub="ties to the P&L" color={t!.net >= 0 ? GREEN : RED} />
          </div>
          <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxHeight: "62vh" }}>
            <table className="w-full text-xs" style={{ minWidth: 680, borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr style={{ background: "#22303C", color: "#fff" }}>
                  <Hd k="ledger">Ledger</Hd><Hd k="group">Group</Hd>
                  <th className="px-2 py-2 text-left" style={{ position: "sticky", top: 0, background: "#22303C" }}>Class</th>
                  <Hd k="amount" right>Amount</Hd>
                </tr>
                <tr style={{ background: "#F3F1EB" }}>
                  <td className="px-2 py-1.5 font-bold" colSpan={3} style={{ position: "sticky", top: 33, background: "#F3F1EB" }}>TOTAL — {rows.length} shown</td>
                  <td className="px-2 py-1.5 text-right tnum font-bold" style={{ position: "sticky", top: 33, background: "#F3F1EB" }}>{fmtMoney(shown)}</td>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (<tr><td colSpan={4} className="px-3 py-5 text-center" style={{ color: MUTED }}>Nothing in the period.</td></tr>)}
                {rows.map((r, i) => (
                  <tr key={r.ledger} className="border-t" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                    <td className="px-2 py-1.5 font-semibold">{r.ledger}</td>
                    <td className="px-2 py-1.5" style={{ color: MUTED }}>{r.group}</td>
                    <td className="px-2 py-1.5">
                      <select value={r.cls} onChange={(e) => void flip(r.ledger, e.target.value)}
                        className="border rounded px-1 py-0.5 text-xs bg-white font-bold"
                        style={{ borderColor: r.seeded ? BORDER : "#7C3AED", color: r.cls === "tvc" ? "#1B6B93" : INK }}
                        title={r.seeded ? "Genie's seed — flip it and your word sticks" : "Set by hand — outranks the seed"}>
                        <option value="tvc">TVC</option><option value="oe">OE</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-right tnum font-bold">{fmtMoney(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs mt-2" style={{ color: MUTED, maxWidth: "84ch", lineHeight: 1.6 }}>
            Genie seeds the class — purchase heads and process-like direct expenses as TVC, the rest as OE. A purple
            border marks a class set by hand; the flip is remembered and every register and total follows it.
          </p>
        </>
      )}
    </div>
  );
}
