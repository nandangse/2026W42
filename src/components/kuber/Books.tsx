"use client";

/**
 * Kuber reads the books — the screens over the parsed Tally snapshot
 * (Dr Raghu, 28 Aug 2026). Ageing in the management review's own buckets
 * (<30 / 31-90 / 91-180 / >180), the supplier report card, and the 13-week
 * cash flow whose row names come from his own Cash Flow sheet.
 */

import { useCallback, useEffect, useState } from "react";
import RegisterScreen, { fmtD } from "./Registers";
import { useMoneyFmt, fmtPct } from "./money";

const INK = "var(--navy)", MUTED = "var(--muted)", BORDER = "var(--line)", RED = "var(--red)", GREEN = "var(--green)", ORANGE = "var(--accent)";

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
  today: string; loadedAt: string | null; since: string; period: string; bankCash?: number; bankOd?: number;
  flows: Record<string, { value: number; count: number }>;
  /** owed = parties in debit; held = parties in credit. Never netted across parties. */
  receivable: { total: number; gross: number; overdue: number; due30: number; parties: number; unadjusted: number; owed: number; held: number; owingParties: number; creditParties: number };
  payable: { total: number; gross: number; overdue: number; due30: number; parties: number; unadjusted: number; owed: number; held: number; owingParties: number; creditParties: number };
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
  /* the period in words, so a Sales card cannot be read for the wrong months */
  const periodWords = period === "ytd" ? `since 1 April (${days} days)`
    : period === "mtd" ? `this month (${days} days)`
    : period === "qtd" ? `this quarter (${days} days)`
    : `last ${period} days`;
  const FLOW_ROWS: [string, string, string][] = [
    ["billing", "Billing", "GST Sales invoices — proformas excluded"],
    ["collections", "Collections", "receipts landing on customer accounts"],
    ["purchases", "Purchases", "Purchase · Cap-Ex · Import vouchers"],
    ["supplier_payments", "Payments to suppliers", "payments clearing supplier bills"],
    ["money_in", "Money in — everything", "the bank side of every Receipt"],
    ["money_out", "Money out — everything", "the bank side of every Payment"],
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
          Books as of the last upload: {new Date(s.loadedAt as string).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          {" · "}the registers are live always.
        </div>
      )}

      {/* THE TWO CHAINS, EACH READ LEFT TO RIGHT (Dr Raghu, 30 Sep 2026:
          "show first cell as Sales, then Receivables and then advances \u2014
          The Purchase then Payables and then Advance to suppliers").

          The cards were ordered by what they were: money owed, then money
          held, then the bank. Read that way, the customer story and the
          supplier story were interleaved and neither could be followed. In
          his order each row is one chain from beginning to end \u2014 what we
          billed, what is still to come in, what came in early; what we
          bought, what is still to go out, what went out early. */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
        <Card label={`SALES \u2014 ${periodWords.toUpperCase()}`} value={fmtMoney(s.flows?.billing?.value || 0)}
          sub={`${s.flows?.billing?.count || 0} GST Sales invoices \u00b7 proformas excluded \u00b7 follows the period chips below`} color={INK} />
        {/* TWO SEPARATE THINGS, NO NET (Dr Raghu, 30 Sep 2026: "there is no
            purpose of nett recievable!!!"). Netting a customer who owes us
            against a different customer whose money we hold describes
            nobody's position. */}
        <Card label="RECEIVABLES" value={fmtMoney(s.receivable.owed)}
          sub={`${s.receivable.owingParties} customers in debit · real invoices only, proformas excluded`} color="var(--blue)" />
        <Card label="ADVANCES FROM CUSTOMERS" value={fmtMoney(s.receivable.held)}
          sub={`${s.receivable.creditParties} customers in credit · work owed against money held`} color="#1B6B93" />

        <Card label={`PURCHASES \u2014 ${periodWords.toUpperCase()}`} value={fmtMoney(s.flows?.purchases?.value || 0)}
          sub={`${s.flows?.purchases?.count || 0} Purchase \u00b7 Cap-Ex \u00b7 Import vouchers \u00b7 follows the period chips below`} color={INK} />
        <Card label="PAYABLES" value={fmtMoney(s.payable.owed)}
          sub={`${s.payable.owingParties} suppliers in credit · what we owe`} color="var(--blue)" />
        <Card label="ADVANCES PAID TO SUPPLIERS" value={fmtMoney(s.payable.held)}
          sub={`${s.payable.creditParties} suppliers · money out, goods awaited`} color="#1B6B93" />

        {/* AN OVERDRAFT IS NOT CASH. The CC account carried 5.39 Cr of the
            5.44 Cr this card used to show. */}
        <Card label="BANK & CASH" value={fmtMoney(s.bankCash || 0)} sub="bank and cash ledgers only — the overdraft is borrowing, not cash" color={(s.bankCash || 0) >= 0 ? GREEN : RED} />
        {!!s.bankOd && (
          <Card label="OVERDRAFT DRAWN" value={fmtMoney(Math.abs(s.bankOd))} sub="cash credit utilised — money borrowed, shown apart" color={"var(--warn)"} />
        )}
      </div>

      {/* the day ratios (Dr Raghu, 28 Aug 2026) — each card SAYS its own
          arithmetic AND its upto date: last month's last day, a settled cut,
          never a moving mid-month figure */}
      <DayRatios receivableNet={s.receivable.total} payableNet={s.payable.total} />


      {/* the period flows — the review sheet's own rows, on a slider */}
      <div className="bg-white rounded-lg border p-3 mb-3" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.8 }}>THE FLOWS</span>
          {(["7", "30", "90", "mtd", "qtd", "ytd"] as const).map((k) => (
            <button key={k} onClick={() => setPeriod(k)}
              className="rounded-full border px-2.5 py-0.5 text-xs font-bold"
              style={period === k ? { background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" } : { color: MUTED, borderColor: BORDER, background: "#fff" }}>
              {k === "ytd" ? "YTD" : k === "mtd" ? "MTD" : k === "qtd" ? "QTD" : `${k} days`}
            </button>
          ))}
          <input type="range" min={1} max={365} value={/^\d+$/.test(period) ? Number(period) : days}
            onChange={(e) => setPeriod(e.target.value)}
            style={{ width: 160, accentColor: "var(--accent)" }}
            title="Slide for any number of days" />
          <span className="text-xs tnum font-bold" style={{ color: INK }}>
            {periodWords}
          </span>
        </div>
        <table className="w-full text-xs genie-table" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: "var(--ink)", color: "#fff" }}>
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
                <tr key={k} className="border-t" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                  <td className="px-2 py-1.5 font-bold" style={{ color: k === "collections" || k === "money_in" ? GREEN : k === "supplier_payments" || k === "money_out" ? RED : INK }}>{label}</td>
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
        <Card label="BGs LIVE" value={`${s.bg.count} · ${fmtMoney(s.bg.amount)}`} sub={s.bg.expiring ? `${s.bg.expiring} expiring in 60 days` : "none expiring soon"} color={s.bg.expiring ? "var(--warn)" : INK} />
        <Card label="FDs LIVE" value={`${s.fd.count} · ${fmtMoney(s.fd.amount)}`} sub={s.fd.expiring ? `${s.fd.expiring} maturing in 60 days` : "none maturing soon"} />
        <Card label="INSURANCE LIVE" value={`${s.insurance.count} policies`} sub={s.insurance.expiring ? `${s.insurance.expiring} expiring in 60 days` : "none expiring soon"} color={s.insurance.expiring ? "var(--warn)" : INK} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <button onClick={() => go("cashflow")} className="bg-white rounded-lg border p-3 text-left hover:shadow" style={{ borderColor: BORDER }}>
          <div className="text-xs font-bold mb-1" style={{ color: MUTED }}>13-WEEK CASH FLOW</div>
          <div className="text-sm font-bold" style={{ color: "var(--blue)" }}>Open the plan →</div>
        </button>
        <button onClick={() => go("payplan")} className="bg-white rounded-lg border p-3 text-left hover:shadow" style={{ borderColor: BORDER }}>
          <div className="text-xs font-bold mb-1" style={{ color: MUTED }}>PAYMENT PLANNING</div>
          <div className="text-sm font-bold" style={{ color: "var(--blue)" }}>Decide the week →</div>
        </button>
        <button onClick={() => go("reportcard")} className="bg-white rounded-lg border p-3 text-left hover:shadow" style={{ borderColor: BORDER }}>
          <div className="text-xs font-bold mb-1" style={{ color: MUTED }}>SUPPLIER REPORT CARD</div>
          <div className="text-sm font-bold" style={{ color: "var(--blue)" }}>Read the grades →</div>
        </button>
      </div>
    </div>
  );
}

/** The dashboard's day ratios, computed on the flows UPTO LAST MONTH'S LAST
 *  DAY (Dr Raghu, 28 Aug 2026: "mention this upto when — pref last month's
 *  last day") — the upto date stands on every card. */
function DayRatios({ receivableNet, payableNet }: { receivableNet: number; payableNet: number }) {
  const [f, setF] = useState<Summary | null>(null);
  const { fmt: fmtMoney } = useMoneyFmt();
  const upto = lastMonthEndIso();
  useEffect(() => {
    fetch(`/api/kuber/books?view=summary&period=ytd&until=${upto}`, { cache: "no-store" })
      .then((r) => r.json()).then(setF).catch(() => setF(null));
  }, [upto]);
  if (!f) return null;
  const days = Math.max(1, Math.round((new Date(upto).getTime() - new Date(f.since).getTime()) / 86400000) + 1);
  const perDaySales = (f.flows?.billing?.value || 0) / days;
  const perDayPurch = (f.flows?.purchases?.value || 0) / days;
  const dso = perDaySales > 0 ? receivableNet / perDaySales : null;
  const dpo = perDayPurch > 0 ? payableNet / perDayPurch : null;
  const wcd = dso != null && dpo != null ? dso - dpo : null;
  const dd = (n: number | null) => (n == null ? "—" : `${Math.round(n)} days`);
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
      <Card label={`CUSTOMER RECEIVABLE DAYS — UPTO ${fmtD(upto)}`} value={dd(dso)}
        sub={`net receivables ÷ per-day billing, 1 Apr → ${fmtD(upto)} (${fmtMoney(perDaySales)}/day)`}
        color={dso != null && dso > 90 ? "var(--warn)" : INK} />
      <Card label={`SUPPLIER PAYABLE DAYS — UPTO ${fmtD(upto)}`} value={dd(dpo)}
        sub={`net payables ÷ per-day purchases, 1 Apr → ${fmtD(upto)} (${fmtMoney(perDayPurch)}/day)`} />
      <Card label={`WORKING CAPITAL DAYS — UPTO ${fmtD(upto)}`} value={dd(wcd)}
        sub="receivable days − payable days; inventory days join when stock is typed on the P&L"
        color={wcd != null && wcd > 0 ? "var(--warn)" : GREEN} />
    </div>
  );
}

// ---------------- Ageing ----------------
interface AgeingParty { party: string; group: string | null; total: number; gross: number; unadjusted: number; applied: number; credit: number; not_due: number; d0_30: number; d31_90: number; d91_180: number; d180p: number; bills: { bill: string; bill_date: string | null; due_date: string | null; amount: number; original: number; received: number }[] }

export function AgeingScreen({ kind }: { kind: "receivable" | "payable" }) {
  const [data] = useBooks<{ rows: AgeingParty[]; total: number; gross: number; overdue: number; unadjusted: number; applied: number; credit: number; bothSides: number; count: number; today: string }>("ageing", `&kind=${kind}`);
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
    /* "what does Not due mean?" (Dr Raghu, 30 Sep 2026). It meant the part
       of the bills whose credit period has not run out — which the header
       never said. The columns after it are the overdue parts, split by how
       late, so this one plus those add back to Bills receivable. */
    { key: "not_due", label: "Within credit period", pick: (r) => r.not_due },
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
        <Card label={words.bills.toUpperCase() + (rec ? " — DUE TO COME" : " — TO PAY")} value={fmtMoney(data.gross)} sub={`${data.count} open bills`} color="var(--blue)" />
        <Card label={words.adv.toUpperCase()} value={fmtMoney(-data.unadjusted)} sub={rec ? "a liability — work owed against money held" : "money out, goods awaited"} color="#1B6B93" />
        <Card label={words.net.toUpperCase()} value={fmtMoney(data.total)} sub="bills less advances" color={INK} />
      </div>
      {/* THE AGEING IS NET NOW, AND SAYS SO (Dr Raghu, 30 Sep 2026: "if a
          customer has an outstanding and an advance same name it is wrong —
          it has to internally deduct"). */}
      {data.bothSides > 0 && (
        <div className="text-xs rounded px-2.5 py-2 mb-3" style={{ background: "#F1F6FA", color: "#1B4B66", lineHeight: 1.55 }}>
          <b>The ageing below is net.</b> {data.bothSides} {rec ? "customers carry" : "suppliers carry"} both a bill and an
          advance in the same name, and each one&rsquo;s advance has been applied against <b>its own bills, oldest first</b> —
          so the buckets add to <b>{fmtMoney(data.applied)}</b>, what is really {rec ? "collectable" : "payable"}, not to the
          gross. An advance is never applied to another party&rsquo;s bill.
          {data.credit > 0.5 && <> <b>{fmtMoney(data.credit)}</b> of advance is left over after every bill in those names is
          covered &mdash; {rec ? "money held against work not yet invoiced" : "our cash sitting with suppliers ahead of any bill"}.</>}
        </div>
      )}
      <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxHeight: "70vh" }}>
        <table className="w-full text-xs genie-table" style={{ minWidth: 1100, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: "var(--ink)", color: "#fff" }}>
              {COLS.map((c, i) => (
                <th key={c.key}
                  className={`px-2 py-2 ${i === 0 ? "text-left" : "text-right"} whitespace-nowrap`}
                  style={{ position: "sticky", top: 0, background: "var(--ink)", cursor: "pointer" }}
                  onClick={() => clickSort(c.key)}
                  title="Click to sort — again to flip, a third time to clear">
                  {c.label}{sortKey === c.key ? (dir === -1 ? " ▼" : " ▲") : ""}
                </th>
              ))}
              <th className="px-2 py-2" style={{ position: "sticky", top: 0, background: "var(--ink)" }} />
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
                  <td className="px-2 py-1.5 text-right tnum" style={{ ...cellCss, color: "var(--warn)" }}>{fmtMoney(sum((r) => r.d31_90))}</td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ ...cellCss, color: RED }}>{fmtMoney(sum((r) => r.d91_180))}</td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ ...cellCss, color: RED }}>{fmtMoney(sum((r) => r.d180p))}</td>
                  <td className="px-2 py-1.5 text-right" style={{ ...cellCss, color: MUTED }}>{rows.reduce((s2, r) => s2 + r.bills.length, 0)}</td>
                </tr>
              );
            })()}
            {rows.length === 0 && (<tr><td colSpan={10} className="px-3 py-5 text-center" style={{ color: MUTED }}>Nothing here — upload the Tally files first.</td></tr>)}
            {rows.map((r, i) => (
              <>
                <tr key={r.party} className="border-t" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff", cursor: "pointer" }}
                  role="button" tabIndex={0} onClick={() => setOpen(open === r.party ? null : r.party)}>
                  <td className="px-2 py-1.5 font-semibold" style={{ color: INK, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.party}>
                    {open === r.party ? "▾ " : "▸ "}{r.party}
                  </td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ color: "#1B6B93" }}>{r.unadjusted ? fmtMoney(-r.unadjusted) : "·"}</td>
                  <td className="px-2 py-1.5 text-right tnum">{r.gross ? fmtMoney(r.gross) : "·"}</td>
                  <td className="px-2 py-1.5 text-right tnum font-bold">{fmtMoney(r.total)}</td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ color: MUTED }}>{r.not_due ? fmtMoney(r.not_due) : "·"}</td>
                  <td className="px-2 py-1.5 text-right tnum">{r.d0_30 ? fmtMoney(r.d0_30) : "·"}</td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ color: "var(--warn)" }}>{r.d31_90 ? fmtMoney(r.d31_90) : "·"}</td>
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
                      <td className="px-2 py-1 pl-7" style={{ color: "var(--dim)" }}>{b.bill}</td>
                      <td className="px-2 py-1 text-right tnum" style={{ color: MUTED }} title={kind === "receivable" ? "Original bill amount" : "Original invoice amount"}>
                        {b.original ? fmtMoney(b.original) : "·"}
                      </td>
                      <td className="px-2 py-1 text-right tnum" style={{ color: GREEN }} title={kind === "receivable" ? "Received against this bill" : "Paid against this bill"}>
                        {b.received ? fmtMoney(b.received) : "·"}
                      </td>
                      <td className="px-2 py-1 text-right tnum font-bold" style={{ color: b.amount < 0 ? "#1B6B93" : INK }} title="Pending">
                        {b.amount < 0 ? "−" + fmtMoney(-b.amount) : fmtMoney(b.amount)}
                      </td>
                      {/* THE BILL DATE GETS ITS OWN COLUMN (Dr Raghu, 30 Sep
                          2026: "here can we have date of the bill please?").
                          It was in the sentence at the end of the row, where
                          it could not be read down a list or compared between
                          two bills — which is the only reason anybody looks at
                          a bill date. */}
                      <td className="px-2 py-1 text-right tnum" style={{ color: b.bill_date ? "var(--dim)" : MUTED }}
                        title={b.bill_date ? "The date the bill was raised" : "The ERP carries no date for this bill"}>
                        {b.bill_date ? fmtD(b.bill_date) : "no date"}
                      </td>
                      <td className="px-2 py-1 text-right tnum" style={{ color: b.due_date ? "var(--dim)" : MUTED }}
                        title="The date it falls due, bill date plus the credit days">
                        {b.due_date ? fmtD(b.due_date) : "·"}
                      </td>
                      <td colSpan={3} className="px-2 py-1 text-right" style={{ color: overdueDays !== null && overdueDays > 0 ? RED : MUTED }}>
                        {overdueDays === null ? "no due date"
                          : overdueDays > 0 ? `${overdueDays} days overdue`
                          : overdueDays === 0 ? "due today"
                          : `due in ${-overdueDays} days`}
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
const gradeColor: Record<string, string> = { A: GREEN, B: "#7A8A1E", C: "var(--warn)", D: RED };

export function ReportCardScreen() {
  /* AS AT ANY DATE (Dr Raghu, 30 Sep 2026: "put the date impacts please! I
     may want to see previous years too"). A month picker, month-end; today
     when nothing is chosen. The card says what a past date can and cannot
     honestly show. */
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [asof, setAsof] = useState(today);
  const dated = asof < today;
  const [data] = useBooks<{ rows: CardRow[]; stats: CardStats; today: string; asof?: string; dated?: boolean; caveat?: string | null }>("reportcard", dated ? `&asof=${asof}` : "");
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
          <Card label="TOTAL O/S — NET" value={fmtMoney(st.net)} sub={`${st.nbills} open bills · ${st.parties} suppliers`} color="var(--blue)" />
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
        <span className="text-xs font-semibold ml-auto flex items-center gap-1" style={{ color: MUTED }}>
          as at <MonthPick value={asof} onChange={setAsof} end />
          {dated && <button onClick={() => setAsof(today)} className="font-bold" style={{ color: "var(--blue)" }}>today</button>}
        </span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 supplier"
          className="px-2 py-1 rounded border text-sm" style={{ borderColor: BORDER }} />
      </div>
      {data.dated && data.caveat && (
        <div className="rounded px-3 py-2 text-xs mb-2" style={{ background: "#FBF3E4", color: "#8A6D3B", border: "1px solid #EED9B0", lineHeight: 1.55 }}>
          <b>As at {fmtD(data.asof || asof)}.</b> {data.caveat}
        </div>
      )}
      <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxHeight: "72vh" }}>
        <table className="w-full text-xs genie-table" style={{ minWidth: 860, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: "var(--ink)", color: "#fff" }}>
              {([["grade", "Grade"], ["party", "Supplier"], ["outstanding", "Outstanding"], ["overdue", "Overdue"], ["pct", "Overdue %"], ["delay", "Weighted delay"], ["oldest", "Oldest due"], ["nbills", "Open bills"], ["vouchers", "Vouchers FY"]] as const).map(([k, h], i) => (
                <th key={k} className={`px-2 py-2 ${i <= 1 ? "text-left" : "text-right"} whitespace-nowrap`}
                  style={{ position: "sticky", top: 0, background: "var(--ink)", cursor: "pointer", zIndex: 4 }}
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
              <tr key={r.party} className="border-t" role="button" tabIndex={0} onClick={() => setOpenParty(r.party)}
                style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff", cursor: "pointer" }}
                title="Open this supplier's report card">
                <td className="px-2 py-1.5"><span className="rounded px-2 py-0.5 font-bold text-white" style={{ background: gradeColor[r.grade] }}>{r.grade}</span></td>
                <td className="px-2 py-1.5 font-semibold" style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--blue)" }} title={r.party}>{r.party}</td>
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
  /** the coarse bands as a table: amount and share of outstanding */
  bands?: { label: string; amount: number; pct: number }[];
  /** twelve months of him — nulls before the books begin */
  months?: { key: string; label: string; purchases: number | null; payments: number | null;
             balance: number | null; invoices: number | null; pos: number | null }[];
  paid: { d7: number; d30: number; d45: number; d90: number };
  invoiced: { d7: number; d30: number; d45: number; d90: number };
  vouchers: number; today: string;
  payments: { date: string | null; amount: number; bill: string; vtype: string; vno: string }[];
  invoices: { date: string | null; amount: number; bill: string; vtype: string; vno: string }[];
  plans: { plan_date: string; amount: number; status: string; purpose: string; bill_ref: string }[];
  items: { item: string; times: number; total: number; qty: string; last: string | null }[];
  /** his purchase orders from the ERP, graded on the promise (30 Sep 2026) */
  pos?: { po: string; date: string | null; items: string; lines: number; value: number;
          due: string | null; done: string | null; late: number | null; grade: string; status: string }[];
  bills: { bill: string; bill_date: string | null; due_date: string | null; amount: number }[];
}
type RecoRow = { id?: string; party: string; fy: string; our_closing: number | null; their_closing: number | null; status: string; upto: string | null; note: string };

function SupplierCard({ party, grade, onClose }: { party: string; grade: string; onClose: () => void }) {
  const { fmt: fmtMoney } = useMoneyFmt();
  const [d, setD] = useState<Dossier | null>(null);
  const [tab, setTab] = useState<"overview" | "bills" | "invoices" | "payments" | "plan" | "reco" | "pos" | "items">("overview");
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
    <table className="w-full text-xs genie-table" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
      <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
        {head.map((h, i) => (<th key={h} className={`px-2 py-1.5 text-${i === head.length - 1 ? "right" : "left"}`} style={{ position: "sticky", top: 0, background: "var(--ink)" }}>{h}</th>))}
      </tr></thead>
      <tbody>{children}</tbody>
    </table>
  );
  const TABS: [typeof tab, string][] = [
    ["overview", "Overview"], ["bills", "Outstanding"], ["invoices", "Invoices"],
    ["payments", "Payments"], ["plan", "Payment Plan"], ["reco", "Reco Status"],
    ["pos", "Purchase Orders"], ["items", "Items Supplied"],
  ];

  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-3" style={{ background: "rgba(0,0,0,0.45)", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg w-full" style={{ maxWidth: 920, height: "calc(100vh - 40px)", display: "flex", flexDirection: "column" }}>
        <div className="flex items-center gap-3 px-4 py-3" style={{ background: "var(--ink)", borderRadius: "8px 8px 0 0" }}>
          <span className="rounded px-2 py-0.5 font-bold text-white" style={{ background: gradeColor[grade] ?? MUTED }}>{grade}</span>
          <div className="font-bold text-white" style={{ fontSize: 15 }}>{party}</div>
          <button onClick={onClose} className="ml-auto" style={{ color: "#8FA1B3" }}>✕</button>
        </div>
        <div className="flex gap-1 px-3 pt-2 flex-wrap" style={{ borderBottom: `1px solid ${BORDER}` }}>
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className="px-3 py-1.5 text-xs font-bold rounded-t"
              style={tab === k ? { background: "var(--ink)", color: "#fff" } : { color: MUTED }}>
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
                    <Fact k="O/S — NET" v={fmtMoney(d.net)} c="var(--blue)" />
                    <Fact k="TO PAY NOW (BEYOND CREDIT)" v={`${fmtMoney(d.overdue)} · ${d.overdue_pct}%`} c={d.overdue ? RED : GREEN} />
                    <Fact k="WEIGHTED DELAY" v={d.weighted_delay ? `${d.weighted_delay} days` : "—"} />
                    <Fact k="CREDIT PERIOD (HIS BILLS)" v={d.credit_days != null ? `${d.credit_days} days` : "—"} />
                    <Fact k="OLDEST DUE" v={fmtD(d.oldest_due)} c={d.oldest_due ? RED : INK} />
                    <Fact k="UNADJUSTED" v={d.unadjusted ? "−" + fmtMoney(-d.unadjusted) : "—"} c="#1B6B93" />
                    <Fact k="PAID — 7/30/45/90 DAYS" v={`${fmtMoney(d.paid.d7)} · ${fmtMoney(d.paid.d30)} · ${fmtMoney(d.paid.d45)} · ${fmtMoney(d.paid.d90)}`} c={GREEN} />
                    <Fact k="INVOICED — 7/30/45/90 DAYS" v={`${fmtMoney(d.invoiced.d7)} · ${fmtMoney(d.invoiced.d30)} · ${fmtMoney(d.invoiced.d45)} · ${fmtMoney(d.invoiced.d90)}`} />
                  </div>
                  {/* ONE TABLE, READ ACROSS (Dr Raghu, 30 Sep 2026: "show the
                      aging as a proper table ... below that amounts, below
                      that % of o/s"). Nine chips wrapping over two lines is a
                      shape the eye reads one at a time. */}
                  <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.8 }}>AGEING OF OUTSTANDING — DAYS SINCE BILL</div>
                  <div className="overflow-auto mb-3 rounded border" style={{ borderColor: BORDER }}>
                    <table className="w-full text-xs genie-table" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                      <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
                        {(d.bands ?? []).map((b) => <th key={b.label} className="px-2 py-1.5 text-right">{b.label}</th>)}
                        {d.buckets.undated > 0 && <th className="px-2 py-1.5 text-right">undated</th>}
                        <th className="px-2 py-1.5 text-right" style={{ borderLeft: "1px solid rgba(255,255,255,.25)" }}>Total</th>
                      </tr></thead>
                      <tbody>
                        <tr className="font-bold">
                          {(d.bands ?? []).map((b) => (
                            <td key={b.label} className="px-2 py-1.5 text-right tnum"
                              style={{ color: b.amount === 0 ? MUTED : /^(181|241|360)/.test(b.label) ? RED : /^(91|121)/.test(b.label) ? "var(--warn)" : INK }}>
                              {b.amount ? fmtMoney(b.amount) : "·"}
                            </td>
                          ))}
                          {d.buckets.undated > 0 && <td className="px-2 py-1.5 text-right tnum" style={{ color: MUTED }}>{fmtMoney(d.buckets.undated)}</td>}
                          <td className="px-2 py-1.5 text-right tnum" style={{ borderLeft: `1px solid ${BORDER}` }}>{fmtMoney(d.gross)}</td>
                        </tr>
                        <tr style={{ background: "#FAF9F5" }}>
                          {(d.bands ?? []).map((b) => (
                            <td key={b.label} className="px-2 py-1 text-right tnum" style={{ color: MUTED }}>
                              {b.amount ? `${b.pct.toFixed(1)}%` : "·"}
                            </td>
                          ))}
                          {d.buckets.undated > 0 && <td className="px-2 py-1 text-right tnum" style={{ color: MUTED }}>—</td>}
                          <td className="px-2 py-1 text-right tnum" style={{ color: MUTED, borderLeft: `1px solid ${BORDER}` }}>100%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* TWELVE MONTHS OF HIM — what he invoiced, what we paid, and
                      the balance he was left carrying at each month end. */}
                  {!!d.months?.length && (
                    <>
                      <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.8 }}>
                        MONTH BY MONTH — THE LAST 12
                      </div>
                      <div className="overflow-auto mb-1 rounded border" style={{ borderColor: BORDER }}>
                        <table className="w-full text-xs genie-table" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                          <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
                            <th className="px-2 py-1.5 text-left">Month</th>
                            <th className="px-2 py-1.5 text-right">Purchases</th>
                            <th className="px-2 py-1.5 text-right">Payments</th>
                            <th className="px-2 py-1.5 text-right">Closing balance</th>
                            <th className="px-2 py-1.5 text-right">POs</th>
                            <th className="px-2 py-1.5 text-right">Invoices</th>
                          </tr></thead>
                          <tbody>
                            {d.months.map((m) => (
                              <tr key={m.key} className="border-t" style={{ borderColor: "var(--line-soft)", background: m.purchases == null ? "#FAF9F5" : "#fff" }}>
                                <td className="px-2 py-1 font-semibold">{m.label}</td>
                                <td className="px-2 py-1 text-right tnum">{m.purchases == null ? <span style={{ color: MUTED }}>—</span> : m.purchases ? fmtMoney(m.purchases) : "·"}</td>
                                <td className="px-2 py-1 text-right tnum" style={{ color: m.payments ? GREEN : MUTED }}>{m.payments == null ? "—" : m.payments ? fmtMoney(m.payments) : "·"}</td>
                                <td className="px-2 py-1 text-right tnum font-bold">{m.balance == null ? <span style={{ color: MUTED, fontWeight: 400 }}>—</span> : fmtMoney(m.balance)}</td>
                                <td className="px-2 py-1 text-right tnum" style={{ color: MUTED }}>{m.pos == null ? "—" : m.pos || "·"}</td>
                                <td className="px-2 py-1 text-right tnum" style={{ color: MUTED }}>{m.invoices == null ? "—" : m.invoices || "·"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {d.months.some((m) => m.purchases == null) && (
                        <div className="text-xs mb-3" style={{ color: "var(--warn)", lineHeight: 1.5 }}>
                          A dash is <b>not a zero</b> — the books begin at 1 April 2026, so Genie does not know those months.
                          Load the 2025-26 Tally export and they fill in.
                        </div>
                      )}
                    </>
                  )}
                  {d.plans.length > 0 && (
                    <div className="rounded p-2 text-xs font-semibold" style={{ background: "#E9F5EC", color: "var(--green)" }}>
                      Planned in the cash flow: {d.plans.map((pl) => `${fmtD(pl.plan_date)} — ${fmtMoney(pl.amount)} (${pl.status})`).join(" · ")}
                    </div>
                  )}
                </>
              )}

              {tab === "bills" && (
                <MiniTable head={["Bill", "Billed", "Due", "Amount"]}>
                  {d.bills.map((b, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }}>
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
                    <tr key={i} className="border-t" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }}>
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
                    <tr key={i} className="border-t" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }}>
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
                      <tr key={i} className="border-t" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }}>
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

              {/* PURCHASE ORDERS (Dr Raghu, 30 Sep 2026: "in this also show
                  Purchase Orders — PO No, Date, Items, Value, Due Date,
                  Completion Date, Grade"). The completion date is not a field
                  anywhere; it is the last goods receipt posted against the PO.
                  An order not fully received carries no date and no grade,
                  because grading something that has not arrived would be
                  inventing the verdict. */}
              {tab === "pos" && (
                <>
                  <p className="text-xs mb-2" style={{ color: MUTED, lineHeight: 1.6 }}>
                    From the ERP&apos;s own register. <b>Completion</b> is the last goods receipt booked against the
                    order; <b>Grade</b> measures it against the due date on the PO — <b>A</b> on or before,
                    <b> B</b> within a week, <b>C</b> within a month, <b>D</b> beyond. An order still open is not graded.
                  </p>
                  <MiniTable head={["PO No", "Date", "Items", "Due", "Completed", "Grade", "Value"]}>
                    {(!d.pos || !d.pos.length) && (<tr><td colSpan={7} className="px-3 py-4" style={{ color: MUTED }}>No purchase orders in the ERP under this name.</td></tr>)}
                    {(d.pos || []).map((x, i) => (
                      <tr key={x.po} className="border-t" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                        <td className="px-2 py-1 font-semibold" style={{ whiteSpace: "nowrap" }}>{x.po}</td>
                        <td className="px-2 py-1 tnum" style={{ whiteSpace: "nowrap" }}>{fmtD(x.date)}</td>
                        <td className="px-2 py-1" style={{ color: MUTED, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={x.items}>{x.items || "—"}</td>
                        <td className="px-2 py-1 tnum" style={{ whiteSpace: "nowrap" }}>{fmtD(x.due)}</td>
                        <td className="px-2 py-1 tnum" style={{ whiteSpace: "nowrap", color: x.done ? INK : MUTED }}>{x.done ? fmtD(x.done) : "—"}</td>
                        <td className="px-2 py-1" style={{ whiteSpace: "nowrap" }}>
                          <b className="rounded px-1.5 py-0.5" style={{ fontSize: 11, ...gradeTone(x.grade) }}>{x.grade}</b>
                          {x.late != null && x.late > 0 && <span style={{ color: MUTED, fontSize: 11 }}> · {x.late}d late</span>}
                        </td>
                        <td className="px-2 py-1 text-right tnum font-bold">{fmtMoney(x.value)}</td>
                      </tr>
                    ))}
                  </MiniTable>
                </>
              )}
              {/* ITEMS SUPPLIED — biggest spend first, and it stays that way
                  (Dr Raghu, 30 Sep 2026: "keep this sorting"). The order is
                  struck on the server and nothing re-sorts it here. */}
              {tab === "items" && (
                <MiniTable head={["Item", "Times", "Last supplied", "Last qty", "Total value"]}>
                  {d.items.length === 0 && (<tr><td colSpan={5} className="px-3 py-4" style={{ color: MUTED }}>No item lines on his vouchers in this book — service and expense suppliers show nothing here (run migration 0081 and re-upload Transactions once, if not done).</td></tr>)}
                  {d.items.map((x, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }}>
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
    <tr className="border-t" style={{ borderColor: "var(--line-soft)", background: zebra ? "#FAF9F5" : "#fff" }}>
      <td className="px-2 py-1 font-bold">{f.fy}</td>
      <td className="px-2 py-1"><input type="number" value={f.our_closing ?? ""} onChange={(e) => setF({ ...f, our_closing: e.target.value === "" ? null : Number(e.target.value) })} className="border rounded px-1 py-0.5 text-right tnum w-28" style={{ borderColor: BORDER }} /></td>
      <td className="px-2 py-1"><input type="number" value={f.their_closing ?? ""} onChange={(e) => setF({ ...f, their_closing: e.target.value === "" ? null : Number(e.target.value) })} className="border rounded px-1 py-0.5 text-right tnum w-28" style={{ borderColor: BORDER }} /></td>
      <td className="px-2 py-1 text-right tnum font-bold" style={{ color: has && Math.abs(diff) > 0.5 ? RED : GREEN }}>{has ? fmtMoney(diff) : "·"}</td>
      <td className="px-2 py-1"><input value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} placeholder="Reco till… / Mismatch / Not received" className="border rounded px-1 py-0.5 w-44" style={{ borderColor: BORDER }} /></td>
      <td className="px-2 py-1"><input type="date" value={f.upto ?? ""} onChange={(e) => setF({ ...f, upto: e.target.value || null })} className="border rounded px-1 py-0.5" style={{ borderColor: BORDER }} /></td>
      <td className="px-2 py-1 text-right">
        {dirty && <button onClick={() => onSave(f)} className="text-xs font-bold rounded px-2 py-0.5 text-white" style={{ background: "var(--accent)" }}>💾</button>}
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
        <button onClick={() => go("payplan")} className="font-bold" style={{ color: "var(--blue)" }}>Payment Planning</button> replaces its raw bills —
        the plan is the decision. Salaries, EMIs and statutory ride{" "}
        <button onClick={() => go("cashitem")} className="font-bold" style={{ color: "var(--blue)" }}>Cash Flow Items</button>.
      </div>
      <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER }}>
        <table className="text-xs genie-table" style={{ minWidth: 1150, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: "var(--ink)", color: "#fff" }}>
              <th className="px-2 py-2 text-left" style={{ position: "sticky", left: 0, background: "var(--ink)", minWidth: 230 }}>{label}</th>
              {data.weeks.map((w, i) => (
                <th key={w} className="px-2 py-2 text-right whitespace-nowrap">
                  W{i + 1}<div style={{ fontWeight: 400, fontSize: 10, color: "#8FA1B3" }}>{wk(w)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.key} className="border-t" style={{ borderColor: "var(--line-soft)" }}>
                <td className="px-2 py-1.5 font-semibold" style={{ position: "sticky", left: 0, background: "#fff", color: r.dir > 0 ? GREEN : RED }}>
                  {r.dir > 0 ? "+ " : "− "}{r.label}
                </td>
                {F[r.key].map((v, i) => (<td key={i} className="px-2 py-1.5 text-right">{cell(v, r.dir < 0)}</td>))}
              </tr>
            ))}
            <tr className="border-t" style={{ borderColor: "var(--ink)", background: "#F7F5EF" }}>
              <td className="px-2 py-1.5 font-bold" style={{ position: "sticky", left: 0, background: "#F7F5EF", color: INK }}>Net cash generation</td>
              {data.net.map((v, i) => (
                <td key={i} className="px-2 py-1.5 text-right tnum font-bold" style={{ color: v < 0 ? RED : GREEN }}>{num(v)}</td>
              ))}
            </tr>
            <tr style={{ background: "#F7F5EF" }}>
              <td className="px-2 py-1.5 font-bold" style={{ position: "sticky", left: 0, background: "#F7F5EF", color: INK }}>Cumulative</td>
              {data.cumulative.map((v, i) => (
                <td key={i} className="px-2 py-1.5 text-right tnum font-bold" style={{ color: v < 0 ? RED : "var(--blue)" }}>{num(v)}</td>
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
        <table className="w-full text-xs genie-table" style={{ minWidth: 700, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
            {(["name", "parent", "opening", "closing"] as const).map((k, i) => (
              <th key={k} className={`px-2 py-2 ${i <= 1 ? "text-left" : "text-right"}`}
                style={{ position: "sticky", top: 0, background: "var(--ink)", cursor: "pointer" }}
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
              <tr key={l.name + i} className="border-t" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }}>
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
        <table className="w-full text-xs genie-table" style={{ minWidth: 860, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
            {["Date", "Type", "No", "Party", "Narration"].map((h) => (<th key={h} className="px-2 py-2 text-left" style={{ position: "sticky", top: 0, background: "var(--ink)" }}>{h}</th>))}
          </tr></thead>
          <tbody>
            {(data?.rows || []).map((v, i) => (
              <tr key={v.id} className="border-t" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }}>
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

// ---------------- the drill (ledger → its vouchers) ----------------
// (Dr Raghu, 28 Aug 2026: "make it drill downable") — every statement's
// bottom rung: click a ledger anywhere and its vouchers open.

interface DrillRow { date: string; vtype: string; vno: string; party: string; narration: string; amount: number }
function DrillModal({ ledger, from, to, onClose }: { ledger: string; from: string; to: string; onClose: () => void }) {
  const [rows, setRows] = useState<DrillRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const { fmt: fmtMoney } = useMoneyFmt();
  useEffect(() => {
    fetch(`/api/kuber/books?view=drill&ledger=${encodeURIComponent(ledger)}&from=${from}&to=${to}`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => { setRows(j.rows || []); setTotal(j.total || 0); })
      .catch(() => setRows([]));
  }, [ledger, from, to]);
  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)", zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg p-4 w-full" style={{ maxWidth: 760, maxHeight: "86vh", overflow: "auto" }}>
        <div className="flex items-center justify-between mb-1">
          <div className="font-bold text-sm" style={{ color: INK }}>{ledger}</div>
          <button onClick={onClose} style={{ color: MUTED }}>✕</button>
        </div>
        <div className="text-xs mb-2" style={{ color: MUTED }}>
          {fmtD(from)} → {fmtD(to)} · net movement <b className="tnum" style={{ color: INK }}>{fmtMoney(total)}</b> · credit positive, debit negative — Tally&apos;s own signs
        </div>
        {!rows ? <div className="text-sm" style={{ color: MUTED }}>reading the vouchers…</div> : (
          <table className="w-full text-xs genie-table" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
              {["Date", "Type", "No", "Party / narration", "Amount"].map((h, i) => (
                <th key={h} className={`px-2 py-1.5 text-${i === 4 ? "right" : "left"} whitespace-nowrap`} style={{ position: "sticky", top: 0, background: "var(--ink)" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.length === 0 && (<tr><td colSpan={5} className="px-3 py-4 text-center" style={{ color: MUTED }}>No vouchers in the period.</td></tr>)}
              {rows.map((r, i) => (
                <tr key={i} className="border-t align-top" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                  <td className="px-2 py-1 tnum whitespace-nowrap">{fmtD(r.date)}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{r.vtype}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{r.vno}</td>
                  <td className="px-2 py-1">{r.party || r.narration || "—"}{r.party && r.narration ? <span style={{ color: MUTED }}> · {r.narration}</span> : ""}</td>
                  <td className="px-2 py-1 text-right tnum font-bold" style={{ color: r.amount >= 0 ? GREEN : RED }}>{fmtMoney(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/** root → group → ledger, each rung opening on click, the ledger opening
 *  its vouchers. Every statement wears the same tree. */
interface TreeSec { root: string; total: number; ly?: number; groups: { name: string; total: number; ly?: number; ledgers: { name: string; amount: number; ly?: number }[] }[] }
function DrillTree({ secs, abs, fmtMoney, onLedger }: { secs: TreeSec[]; abs?: boolean; fmtMoney: (n: number) => string; onLedger: (l: string) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const v = (n: number) => fmtMoney(abs ? Math.abs(n) : n);
  return (
    <>
      {secs.map((s2) => (
        <div key={s2.root} className="border-t" style={{ borderColor: "var(--line-soft)" }}>
          <div onClick={() => setOpen((o) => ({ ...o, [s2.root]: !o[s2.root] }))} className="flex items-center justify-between px-3 py-1.5" style={{ cursor: "pointer" }}>
            <span className="font-bold text-sm" style={{ color: INK }}>{open[s2.root] ? "▾" : "▸"} {s2.root}</span>
            <span className="font-bold tnum text-sm">{v(s2.total)}</span>
          </div>
          {open[s2.root] && s2.groups.map((g) => (
            <div key={g.name}>
              <div onClick={() => setOpen((o) => ({ ...o, [s2.root + "|" + g.name]: !o[s2.root + "|" + g.name] }))}
                className="flex items-center justify-between px-3 py-1 text-xs" style={{ cursor: "pointer", paddingLeft: 26 }}>
                <span className="font-semibold" style={{ color: "var(--dim)" }}>{open[s2.root + "|" + g.name] ? "▾" : "▸"} {g.name}</span>
                <span className="tnum font-semibold">{v(g.total)}</span>
              </div>
              {open[s2.root + "|" + g.name] && g.ledgers.map((l) => (
                <div key={l.name} role="button" tabIndex={0} onClick={() => onLedger(l.name)}
                  className="flex items-center justify-between px-3 py-0.5 text-xs" style={{ paddingLeft: 42, cursor: "pointer" }}>
                  <span style={{ color: "#2C5B82", textDecoration: "underline" }}>{l.name}</span>
                  <span className="tnum" style={{ color: MUTED }}>{v(l.amount)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

/**
 * THE SAME COLUMNS, ALL THE WAY DOWN (Dr Raghu, 30 Sep 2026: "show the
 * details for each of the inside members on expanding also").
 *
 * The statement's own drill, rendered as a table that inherits the parent's
 * column widths, so a root, a group and a ledger each read across exactly
 * where the head above them reads: this period, its share of sales, its
 * monthly average, and the same three for last year. Opening a head that
 * moved now answers WHICH ledger moved it, without leaving the page.
 */
function PnlDrill({ secs, cols, bare, months, revenue, ly, onLedger }: {
  secs: TreeSec[]; cols: number; bare: (n: number) => string; months: number; revenue: number;
  ly: { months: number; revenue: number } | null; onLedger: (l: string) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const cells = (amount: number, lyAmt: number | undefined, dim: boolean) => (
    <>
      <td className="px-2 py-1 text-right tnum" style={{ color: dim ? MUTED : INK }}>{bare(amount)}</td>
      <td className="px-2 py-1 text-right tnum" style={{ color: MUTED }}>{fmtPct(revenue ? (amount / revenue) * 100 : null)}</td>
      <td className="px-2 py-1 text-right tnum" style={{ color: MUTED }}>{bare(amount / months)}</td>
      {!!ly && <>
        <td className="px-2 py-1 text-right tnum" style={{ color: "var(--dim)", borderLeft: `1px solid ${BORDER}` }}>{bare(lyAmt || 0)}</td>
        <td className="px-2 py-1 text-right tnum" style={{ color: MUTED, fontStyle: "italic" }}>{fmtPct(ly.revenue ? ((lyAmt || 0) / ly.revenue) * 100 : null)}</td>
        <td className="px-2 py-1 text-right tnum" style={{ color: MUTED, fontStyle: "italic" }}>{bare((lyAmt || 0) / ly.months)}</td>
      </>}
    </>
  );
  return (
    <table className="w-full text-xs" style={{ tableLayout: "fixed", borderCollapse: "separate", borderSpacing: 0 }}>
      <colgroup>
        <col style={{ width: 310 }} />
        {Array.from({ length: cols }, (_, i) => <col key={i} style={{ width: 102 }} />)}
      </colgroup>
      <tbody>
        {secs.map((s2) => (
          <FragRow key={s2.root}>
            <tr className="border-t" style={{ borderColor: "var(--line-soft)", cursor: "pointer" }}
              onClick={() => setOpen((o) => ({ ...o, [s2.root]: !o[s2.root] }))}>
              <td className="px-3 py-1" style={{ fontWeight: 700, color: INK }}>
                <span style={{ display: "inline-block", width: 13 }}>{open[s2.root] ? "▾" : "▸"}</span>{s2.root}
              </td>
              {cells(s2.total, s2.ly, false)}
            </tr>
            {open[s2.root] && s2.groups.map((g) => {
              const gk = s2.root + "|" + g.name;
              return (
                <FragRow key={gk}>
                  <tr className="border-t" style={{ borderColor: "var(--line-soft)", cursor: "pointer" }}
                    onClick={() => setOpen((o) => ({ ...o, [gk]: !o[gk] }))}>
                    <td className="px-3 py-1" style={{ paddingLeft: 26, color: "var(--dim)", fontWeight: 600 }}>
                      <span style={{ display: "inline-block", width: 13 }}>{open[gk] ? "▾" : "▸"}</span>{g.name}
                    </td>
                    {cells(g.total, g.ly, true)}
                  </tr>
                  {open[gk] && g.ledgers.map((l) => (
                    <tr key={gk + l.name} onClick={() => onLedger(l.name)} style={{ cursor: "pointer" }}>
                      <td className="px-3 py-0.5" style={{ paddingLeft: 46, color: "#2C5B82", textDecoration: "underline", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</td>
                      {cells(l.amount, l.ly, true)}
                    </tr>
                  ))}
                </FragRow>
              );
            })}
          </FragRow>
        ))}
      </tbody>
    </table>
  );
}

/** The YTD · QTD · MTD chips with free dates — every statement's head. */
/* ---------- the period, chosen by month (Dr Raghu, 30 Sep 2026: "for the
   date show month year as dropdown"). A management statement is drawn to a
   month end, never to the 17th, and a day picker invites exactly that
   mistake. Picking a month for `from` takes its first day; picking one for
   `to` takes its last. ---------- */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthEndIso = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
/** "Apr 26 – Sep 26" — the period named by its months, not by "Period" */
export const periodLabel = (from: string, to: string) => {
  const a = `${MON[Number(from.slice(5, 7)) - 1]} ${from.slice(2, 4)}`;
  const b = `${MON[Number(to.slice(5, 7)) - 1]} ${to.slice(2, 4)}`;
  return a === b ? a : `${a} – ${b}`;
};

function MonthPick({ value, onChange, end }: { value: string; onChange: (v: string) => void; end?: boolean }) {
  const y = Number(value.slice(0, 4)) || new Date().getFullYear();
  const m = Number(value.slice(5, 7)) || 1;
  const thisY = new Date().getFullYear();
  const years: number[] = [];
  for (let k = thisY + 1; k >= thisY - 7; k--) years.push(k);
  if (!years.includes(y)) years.push(y);
  const set = (yy: number, mm: number) => onChange(end ? monthEndIso(yy, mm) : `${yy}-${String(mm).padStart(2, "0")}-01`);
  const sty = { borderColor: BORDER, background: "#fff", color: INK } as React.CSSProperties;
  return (
    <span className="inline-flex gap-1">
      <select value={m} onChange={(e) => set(y, Number(e.target.value))} className="border rounded px-1.5 py-1 text-xs font-semibold" style={sty}>
        {MON.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
      </select>
      <select value={y} onChange={(e) => set(Number(e.target.value), m)} className="border rounded px-1.5 py-1 text-xs font-semibold" style={sty}>
        {years.sort((a, b) => b - a).map((k) => <option key={k} value={k}>{k}</option>)}
      </select>
    </span>
  );
}

function PeriodBar({ from, to, setFrom, setTo, onRefresh }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void; onRefresh?: () => void }) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const fyStart = today.slice(5, 7) >= "04" ? today.slice(0, 4) + "-04-01" : String(Number(today.slice(0, 4)) - 1) + "-04-01";
  const mtdStart = today.slice(0, 8) + "01";
  const qm = Math.floor(((Number(today.slice(5, 7)) + 8) % 12) / 3) * 3;
  const qMonth = ((3 + qm) % 12) + 1;
  const qYear = qMonth > Number(today.slice(5, 7)) ? Number(today.slice(0, 4)) - 1 : Number(today.slice(0, 4));
  const qtdStart = `${qYear}-${String(qMonth).padStart(2, "0")}-01`;
  return (
    <div className="flex gap-2 items-center text-xs font-semibold flex-wrap" style={{ color: MUTED }}>
      {([["YTD", fyStart], ["QTD", qtdStart], ["MTD", mtdStart]] as [string, string][]).map(([lbl, start]) => (
        <button key={lbl} onClick={() => { setFrom(start); setTo(today); }}
          className="rounded-full border px-2.5 py-0.5 font-bold"
          style={from === start && to === today ? { background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" } : { color: MUTED, borderColor: BORDER, background: "#fff" }}>
          {lbl}
        </button>
      ))}
      from <MonthPick value={from} onChange={setFrom} />
      to <MonthPick value={to} onChange={setTo} end />
      {/* A REFRESH, NEXT TO THE PERIOD (Dr Raghu, 30 Sep 2026: "next to this
          put a refresh icon"). Nothing on this screen changes on its own \u2014
          but the BOOKS do: an upload lands, Suresh types a month's stock,
          somebody presses Recompute. Without this the only way to see it was
          to move the period and move it back. */}
      {onRefresh && (
        <button onClick={onRefresh} title="Read the books again \u2014 after an upload, a stock entry or a recompute"
          className="rounded border font-bold"
          style={{ borderColor: BORDER, background: "#fff", color: INK, padding: "3px 8px", fontSize: 13, lineHeight: 1.2 }}>
          &#8635;
        </button>
      )}
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
    <div className="border-t" style={{ borderColor: "var(--line-soft)" }}>
      <div onClick={() => setOpen(!open)} className="flex items-center justify-between px-3 py-2" style={{ cursor: "pointer" }}>
        <span className="font-bold text-sm" style={{ color: INK }}>{open ? "▾" : "▸"} {s.root}</span>
        <span className="font-bold tnum text-sm">{v(s.total)}</span>
      </div>
      {open && s.groups.map((g) => (
        <div key={g.name}>
          <div onClick={() => setOpenGrp(openGrp === g.name ? null : g.name)}
            className="flex items-center justify-between px-3 py-1 text-xs" style={{ cursor: "pointer", paddingLeft: 26 }}>
            <span className="font-semibold" style={{ color: "var(--dim)" }}>{g.name}</span>
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

interface MisLine { key: string; label: string; amount: number; pct: number | null; avg: number;
  /** the same head over the same months a year back, and its own monthly average */
  ly?: number | null; lyPct?: number | null; lyAvg?: number | null; tree?: TreeSec[] }
interface MisRatio { key: string; label: string; value: number | null; ly?: number | null; unit: string; formula: string; target: string }

/**
 * WHICH WAY IS BETTER (Dr Raghu, 30 Sep 2026: "show the arrow of up or down
 * compared to last years numbers! green arrow for up and red arrow for down
 * for the positive things — for things like expenses, etc as a %, when down
 * is better make the down arrow green and up arrow red").
 *
 * The arrow is about DIRECTION; the colour is about whether that direction is
 * good, and the two are not the same thing. Sales up is green and up. Indirect
 * expenses up is red and up. Getting this backwards on one line would be worse
 * than having no arrows at all, so the polarity is declared per line rather
 * than inferred from the sign. A line whose polarity is genuinely ambiguous —
 * stock, creditor days — carries no arrow rather than a confident wrong one.
 */
const GOOD_UP = new Set(["sales", "revenue", "throughput", "gross_profit", "ebitda", "net_operating", "other_income", "npbt", "npat",
  "ebitda_sales", "pbt_sales", "pat_sales", "int_cover", "current_ratio", "quick_ratio", "dscr", "gp_cr", "productivity", "roce", "roi"]);
const GOOD_DOWN = new Set(["purchases", "tvc", "manuf", "indirect", "finance", "oe", "depreciation", "tax",
  "debt_equity", "tol_tnw", "expenses_cr", "debtor_days", "inventory_days", "ccc"]);

function Arrow({ now, before, k, dp = 2, suffix = " pts" }: { now: number | null | undefined; before: number | null | undefined; k: string; dp?: number; suffix?: string }) {
  const goodUp = GOOD_UP.has(k) ? true : GOOD_DOWN.has(k) ? false : null;
  if (goodUp == null || now == null || before == null || !isFinite(now) || !isFinite(before)) return null;
  const d = now - before;
  if (Math.abs(d) < 0.005) return null;
  const up = d > 0;
  return (
    <span title={`${up ? "+" : ""}${d.toFixed(dp)}${suffix} against last year`}
      style={{ color: up === goodUp ? "#1B7A43" : RED, fontWeight: 700, marginLeft: 4 }}>
      {up ? "\u25B2" : "\u25BC"}
    </span>
  );
}
interface MisData { empty?: boolean; from: string; to: string; months: number; stocksTyped: boolean;
  /** the last depreciation posting anywhere in the books — Tally carries one a year, not one a month */
  depNote?: { at: string; amount: number } | null;
  /** where the two stock figures came from, and whether the closing one is older than the period (0179) */
  stock?: { from: "register" | "typed" | "none"; openingAt: string | null; closingAt: string | null; stale: boolean };
  /** the comparative period, present only when last year is in the books (0182) */
  ly?: { from: string; to: string; months: number; openingAt: string | null; closingAt: string | null; stocked: boolean } | null;
  lines: MisLine[]; ratios: MisRatio[] }

const lastMonthEndIso = () => {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const t = new Date(today + "T00:00:00Z");
  t.setUTCDate(0);
  return t.toISOString().slice(0, 10);
};

/** The P&L in Dr Raghu's OWN sheet's shape (28 Aug 2026): Sales → Revenue →
 *  TVC via typed stocks → THROUGHPUT → Manufacturing → GROSS PROFIT →
 *  Indirect → EBITDA → Finance → Depreciation → NPBT → Tax → NPAT, with
 *  % of sales and average monthly, every head drillable to the voucher. */
export function PnLScreen({ go }: { go?: (k: string) => void }) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const fyStart = today.slice(5, 7) >= "04" ? today.slice(0, 4) + "-04-01" : String(Number(today.slice(0, 4)) - 1) + "-04-01";
  const lme = lastMonthEndIso();
  const [from, setFrom] = useState(fyStart);
  const [to, setTo] = useState(lme >= fyStart ? lme : today);
  const [data, reload] = useBooks<MisData>("mis", `&from=${from}&to=${to}`);
  /* THE UNIT IS SAID ONCE (Dr Raghu, 30 Sep 2026: "in this u dont need to
     write cr everywhere. just write all figures in lakhs or crores depending
     on what was chosen"). Nineteen rows x six columns of "Cr" is 114
     repetitions of a fact that belongs in the caption. The drill underneath
     keeps the full string, because there the figures stand alone. */
  const { fmt: fmtMoney, num: bare, label: unitLabel } = useMoneyFmt();
  const [drill, setDrill] = useState<string | null>(null);
  /* EXPAND ALL / COLLAPSE ALL (Dr Raghu, 30 Sep 2026). One head at a time
     meant closing the one you were comparing against to open the next. */
  const [openLines, setOpenLines] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpenLines((o) => ({ ...o, [k]: !o[k] }));
  if (data?.empty) return <div className="text-sm" style={{ color: MUTED }}>No books yet — upload the Tally masters and transactions first.</div>;

  const BOLD = new Set(["revenue", "tvc", "throughput", "gross_profit", "ebitda", "oe", "net_operating", "npbt", "npat"]);
  const TINT: Record<string, string> = { throughput: "#EEF1FA", gross_profit: "#FBF3E4", ebitda: "#E7F5EC", oe: "#F3F0FA", npat: "#E7F5EC" };

  return (
    <div style={{ maxWidth: 940 }}>
      <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="text-lg font-bold" style={{ color: INK }}>Statement of Profit &amp; Loss</div>
          <div className="text-sm" style={{ color: "var(--dim)", maxWidth: 640 }}>
            The MIS shape — <b>{data ? periodLabel(data.from, data.to) : "…"}</b>, {data?.months ?? "…"} months to {data ? fmtD(data.to) : "…"}.
            {data?.ly ? <> Last year&apos;s same months stand beside it.</> : null} Every head opens to its ledgers and their vouchers.
          </div>
        </div>
        <PeriodBar from={from} to={to} setFrom={setFrom} setTo={setTo} onRefresh={reload} />
      </div>
      {!!data && (
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <button onClick={() => setOpenLines(Object.fromEntries(data.lines.filter((l) => l.tree?.length).map((l) => [l.key, true])))}
            className="text-xs font-bold rounded px-2.5 py-1" style={{ background: "#fff", border: `1px solid ${BORDER}`, color: INK }}>
            ⊞ Expand all
          </button>
          <button onClick={() => setOpenLines({})}
            className="text-xs font-bold rounded px-2.5 py-1" style={{ background: "#fff", border: `1px solid ${BORDER}`, color: INK }}>
            ⊟ Collapse all
          </button>
          {/* WHERE THE STOCK CAME FROM. A gross profit struck against a stock
              value four months stale is a fiction nobody can see unless the
              statement says so. */}
          {/* THE ENTRY IS ONE CLICK AWAY (Dr Raghu, 30 Sep 2026: "in this the
              stock entry needs to have a button ... suresh will enter this").
              The statement says what is missing; the button goes and gets it. */}
          {go && (
            <button onClick={() => go("stock")}
              className="text-xs font-bold rounded px-2.5 py-1"
              style={{ background: data.stock?.from === "register" && !data.stock.stale ? "#fff" : ORANGE,
                       border: `1px solid ${data.stock?.from === "register" && !data.stock.stale ? BORDER : ORANGE}`,
                       color: data.stock?.from === "register" && !data.stock.stale ? INK : "#fff" }}
              title="Enter the 31 March closing and each month end">
              📦 Stock entry
            </button>
          )}
          <span className="text-xs font-bold rounded px-2 py-1" style={{ background: "#EEF1FA", color: INK }}
            title="Change it on the Lakhs / Crores picker at the top of Kuber">
            figures in {unitLabel}
          </span>
          {data.stock?.from === "register" ? (
            <span className="text-xs" style={{ color: data.stock.stale ? "#B45309" : MUTED }}>
              Stock read from the register{data.stock.stale ? ` — the latest valuation is ${fmtD(data.stock.closingAt || "")}, before this period ends. Enter ${fmtD(data.to)}'s closing and this statement corrects itself.` : "."}
            </span>
          ) : (
            <span className="text-xs" style={{ color: "#B45309" }}>
              No stock valued yet — the gross profit cannot be struck until the 31 March closing and the month ends are entered.
            </span>
          )}
        </div>
      )}
      {!data ? <div className="text-sm" style={{ color: MUTED }}>computing…</div> : (
        <>
          <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER }}>
            {/* THE NAMES STOP WHERE THE LONGEST ONE DOES (Dr Raghu, 30 Sep
                2026: "make the width till maybe where its showing except
                finance charges"). A particulars column that stretches to fill
                the page pushes last year's figures off the right edge, which
                is the one place they need to be. */}
            <table className="w-full text-xs genie-table" style={{ minWidth: data?.ly ? 940 : 700, borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 330 }} />
                {(data?.ly ? [0, 1, 2, 3, 4, 5] : [0, 1, 2]).map((i) => <col key={i} style={{ width: 102 }} />)}
              </colgroup>
              <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
                <th className="px-3 py-2 text-left" style={{ position: "sticky", top: 0, background: "var(--ink)" }}>Particulars</th>
                {/* THE PERIOD IS NAMED, NOT CALLED "Period" (Dr Raghu,
                    30 Sep 2026: "Instead of period show the April 26 to Sept
                    26"). A column headed by its own months needs no caption
                    underneath to say which months it is. */}
                <th className="px-2 py-2 text-right" style={{ position: "sticky", top: 0, background: "var(--ink)", whiteSpace: "nowrap" }}>{periodLabel(data.from, data.to)}</th>
                <th className="px-2 py-2 text-right" style={{ position: "sticky", top: 0, background: "var(--ink)", whiteSpace: "nowrap" }}>% of Sales</th>
                <th className="px-2 py-2 text-right" style={{ position: "sticky", top: 0, background: "var(--ink)", whiteSpace: "nowrap" }}>Avg Monthly</th>
                {/* LAST YEAR, THE SAME MONTHS (his ask, same day: "can we see
                    last years data in the side on the like to like basis?
                    same months?") — with its own monthly average in italics,
                    beside this year's. */}
                {!!data.ly && <>
                  <th className="px-2 py-2 text-right" style={{ position: "sticky", top: 0, background: "#3D4A5C", whiteSpace: "nowrap" }}>{periodLabel(data.ly.from, data.ly.to)}</th>
                  <th className="px-2 py-2 text-right" style={{ position: "sticky", top: 0, background: "#3D4A5C", whiteSpace: "nowrap", fontStyle: "italic", fontWeight: 500 }}>% of Sales</th>
                  <th className="px-2 py-2 text-right" style={{ position: "sticky", top: 0, background: "#3D4A5C", whiteSpace: "nowrap", fontStyle: "italic", fontWeight: 500 }}>Avg Monthly</th>
                </>}
              </tr></thead>
              <tbody>
                {data.lines.map((l) => {
                  const stock = l.key === "opening_stock" || l.key === "closing_stock";
                  const openable = !!l.tree?.length;
                  return (
                    <FragRow key={l.key}>
                      <tr className="border-t" role="button" tabIndex={0} onClick={() => openable && toggle(l.key)}
                        style={{ borderColor: "var(--line-soft)", background: TINT[l.key] || "#fff", cursor: openable ? "pointer" : "default" }}>
                        <td className="px-3 py-1.5" style={{ fontWeight: BOLD.has(l.key) ? 800 : 500, color: INK }}>
                          {openable && <span style={{ display: "inline-block", width: 14 }}>{openLines[l.key] ? "▾" : "▸"}</span>}
                          {l.label}
                          {stock && !data.stocksTyped && <span style={{ color: "#B45309", fontWeight: 400 }}> — nothing valued yet</span>}
                          {/* A zero that means "nobody has written it yet" and
                              a zero that means "there is none" look the same
                              on a statement, so this one says which. */}
                          {l.key === "depreciation" && !l.amount && data.depNote && (
                            <span style={{ color: "#B45309", fontWeight: 400 }}> — nothing posted in this period; the last entry in the books is {fmtD(data.depNote.at)} ({fmtMoney(data.depNote.amount)}), a year-end journal</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right tnum" style={{ fontWeight: BOLD.has(l.key) ? 800 : 500, color: /profit|throughput|ebitda|npat/.test(l.key) && l.amount < 0 ? RED : INK }}>
                          {/* NO ENTRIES INSIDE IN LINE (his instruction, 30 Sep
                              2026). A statement is an output; the stock values
                              are typed in the register and read here. */}
                          {bare(l.amount)}
                        </td>
                        <td className="px-2 py-1.5 text-right tnum" style={{ color: MUTED, whiteSpace: "nowrap" }}>
                          {fmtPct(l.pct)}<Arrow now={l.pct} before={l.lyPct} k={l.key} />
                        </td>
                        <td className="px-2 py-1.5 text-right tnum" style={{ color: MUTED }}>{stock ? "—" : bare(l.avg)}</td>
                        {!!data.ly && <>
                          <td className="px-2 py-1.5 text-right tnum" style={{ fontWeight: BOLD.has(l.key) ? 800 : 500, color: l.ly == null ? MUTED : "var(--dim)", borderLeft: `1px solid ${BORDER}` }}>
                            {l.ly == null ? "—" : bare(l.ly)}
                          </td>
                          {/* last year's share of last year's sales — the
                              only way a like-for-like reads as a trend */}
                          <td className="px-2 py-1.5 text-right tnum" style={{ color: MUTED, fontStyle: "italic" }}>{fmtPct(l.lyPct)}</td>
                          <td className="px-2 py-1.5 text-right tnum" style={{ color: MUTED, fontStyle: "italic" }}>
                            {stock || l.lyAvg == null ? "—" : bare(l.lyAvg)}
                          </td>
                        </>}
                      </tr>
                      {openLines[l.key] && l.tree && (
                        <tr><td colSpan={data.ly ? 7 : 4} style={{ background: "#FAF9F5", padding: "0 0 0 20px" }}>
                          <PnlDrill secs={l.tree} cols={data.ly ? 6 : 3} bare={bare} months={data.months}
                            revenue={data.lines.find((x) => x.key === "revenue")?.amount || 0}
                            ly={data.ly ? { months: data.ly.months, revenue: data.lines.find((x) => x.key === "revenue")?.ly || 0 } : null}
                            onLedger={setDrill} />
                        </td></tr>
                      )}
                    </FragRow>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs mt-2" style={{ color: MUTED, maxWidth: "84ch", lineHeight: 1.6 }}>
            Computed from every voucher line by the group tree — finance charges, depreciation and tax step out of the
            indirect lump by their group names. Opening and closing stock are typed (the sheet types them too); TVC =
            purchases + opening − closing. The books are as current as the last upload.
            {data.ly && !data.ly.stocked && <> <b style={{ color: "#B45309" }}>Last year&apos;s column carries no stock</b> — the
            register does not reach back to {periodLabel(data.ly.from, data.ly.to)}, so its TVC is purchases alone and its
            gross profit is not comparable. Every line above gross profit is.</>}
          </p>
        </>
      )}
      {drill && <DrillModal ledger={drill} from={from} to={to} onClose={() => setDrill(null)} />}
    </div>
  );
}
const FragRow = ({ children }: { children: React.ReactNode }) => <>{children}</>;
/** A on time, B a week, C a month, D beyond — anything else is not a verdict. */
const gradeTone = (g: string): { background: string; color: string } =>
  g === "A" ? { background: "#E6F4EA", color: "#0D7A3F" }
  : g === "B" ? { background: "#FFF8E1", color: "#8A6D1A" }
  : g === "C" ? { background: "#FFF3E8", color: "#B4540A" }
  : g === "D" ? { background: "#FBEAE8", color: "#B3392E" }
  : g.startsWith("overdue") ? { background: "#FBEAE8", color: "#B3392E" }
  : { background: "#F2F2EE", color: "#6B7783" };


/* ------------------------------------------------------------------ *
 *  HOW THE BOOKS ARE READ
 * ------------------------------------------------------------------ */

interface RuleRow { id: string; lands: string; says: string; why: string | null; sign: number; ledgers: number; moved: number; amount: number; sample: { ledger: string; group: string; root: string; amount: number }[] }
interface RulesData {
  empty?: boolean; from: string; to: string;
  book: { id: string; title: string; says: string; why: string }[];
  pnl: RuleRow[]; oe: RuleRow[];
  index: { ledger: string; group: string; root: string; lands: string; rule: string; head: string | null; amount: number }[];
  counts: { ledgers: number; vouchers: number; lines: number };
}

/**
 * THE RULES, AS A PAGE (Dr Raghu, 30 Sep 2026: "why is this confusing. cant u
 * make the rules and keep it properly? if needed make all the rules. in a
 * page.")
 *
 * He is right that it was confusing, and the reason is that the rules lived
 * as regular expressions buried in the middle of a route file — readable by
 * the machine, by nobody else. Three separate errors this month came out of
 * exactly that: indirect expenses landing above the gross profit line, the
 * receivables doubling, the whole P&L doubling.
 *
 * So this page does not describe the rules. It RUNS them — the same array the
 * statement imports — and prints beside each one how many ledgers it caught
 * and what they came to. A rule that stops working shows up here as a count
 * that fell to zero, before it shows up as a number he has to disbelieve.
 */
export function RulesScreen() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const fyStart = today.slice(5, 7) >= "04" ? today.slice(0, 4) + "-04-01" : String(Number(today.slice(0, 4)) - 1) + "-04-01";
  const lme = lastMonthEndIso();
  const [from, setFrom] = useState(fyStart);
  const [to, setTo] = useState(lme >= fyStart ? lme : today);
  const [data, reload] = useBooks<RulesData>("rules", `&from=${from}&to=${to}`);
  const { num: bare, label: unitLabel } = useMoneyFmt();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  if (data?.empty) return <div className="text-sm" style={{ color: MUTED }}>No books yet — upload the Tally masters and transactions first.</div>;

  const hits = !data || q.trim().length < 2 ? [] :
    data.index.filter((r) => r.ledger.toLowerCase().includes(q.toLowerCase()) || r.group.toLowerCase().includes(q.toLowerCase())).slice(0, 40);

  const Ladder = ({ title, blurb, rows, kind }: { title: string; blurb: string; rows: RuleRow[]; kind: string }) => (
    <div className="mb-6">
      <div className="font-bold text-sm mb-1" style={{ color: INK }}>{title}</div>
      <p className="text-xs mb-2" style={{ color: MUTED, maxWidth: "80ch", lineHeight: 1.6 }}>{blurb}</p>
      <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: BORDER }}>
        {rows.map((r, i) => {
          const k = kind + r.id;
          const dead = r.moved === 0;
          return (
            <div key={k} className="border-t" style={{ borderColor: "var(--line-soft)" }}>
              <div onClick={() => r.moved && setOpen((o) => ({ ...o, [k]: !o[k] }))}
                className="flex items-start gap-3 px-3 py-2" style={{ cursor: r.moved ? "pointer" : "default" }}>
                <span className="tnum font-bold text-xs mt-0.5" style={{ color: MUTED, width: 18 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-xs font-bold" style={{ color: INK }}>
                    {r.moved ? <span style={{ display: "inline-block", width: 14, color: MUTED }}>{open[k] ? "▾" : "▸"}</span> : <span style={{ display: "inline-block", width: 14 }} />}
                    {r.lands}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--dim)", paddingLeft: 14, lineHeight: 1.55 }}>{r.says}</div>
                  {r.why && (
                    <div className="text-xs mt-1" style={{ color: "#8A6D3B", background: "#FBF3E4", padding: "6px 8px", borderRadius: 4, marginLeft: 14, lineHeight: 1.55 }}>
                      <b>Why it is written that way.</b> {r.why}
                    </div>
                  )}
                </div>
                <div className="text-right" style={{ minWidth: 118 }}>
                  <div className="tnum text-xs font-bold" style={{ color: dead ? MUTED : INK }}>{dead ? "—" : bare(r.amount)}</div>
                  <div className="text-xs" style={{ color: MUTED }}>{r.moved} of {r.ledgers} ledgers</div>
                </div>
              </div>
              {open[k] && (
                <div style={{ background: "#FAF9F5", padding: "4px 12px 8px 46px" }}>
                  {r.sample.map((c) => (
                    <div key={c.ledger} className="flex items-center justify-between text-xs py-0.5" style={{ color: MUTED }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.ledger} <span style={{ opacity: 0.6 }}>· {c.group}</span></span>
                      <span className="tnum" style={{ paddingLeft: 10 }}>{bare(c.amount)}</span>
                    </div>
                  ))}
                  {r.moved > r.sample.length && <div className="text-xs mt-1" style={{ color: MUTED }}>… and {r.moved - r.sample.length} more</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 940 }}>
      <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="text-lg font-bold" style={{ color: INK }}>How the books are read</div>
          <div className="text-sm" style={{ color: "var(--dim)", maxWidth: 680 }}>
            Every rule the statements stand on, in the order it fires — and what each one actually caught
            in this period. This page does not describe the rules; it runs them, so it cannot go stale.
          </div>
        </div>
        <PeriodBar from={from} to={to} setFrom={setFrom} setTo={setTo} onRefresh={reload} />
      </div>

      {!data ? <div className="text-sm" style={{ color: MUTED }}>reading…</div> : (
        <>
          <div className="mb-4">
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Find a ledger — and see exactly which rule takes it"
              className="border rounded px-3 py-2 text-sm w-full" style={{ borderColor: BORDER, maxWidth: 520 }} />
            {q.trim().length >= 2 && (
              <div className="bg-white rounded-lg border mt-2 overflow-hidden" style={{ borderColor: BORDER }}>
                {!hits.length && <div className="px-3 py-2 text-xs" style={{ color: MUTED }}>Nothing moved under that name in this period.</div>}
                {hits.map((h) => (
                  <div key={h.ledger} className="border-t px-3 py-1.5 text-xs flex items-center gap-2" style={{ borderColor: "var(--line-soft)" }}>
                    <span style={{ flex: 1, color: INK, fontWeight: 600 }}>{h.ledger}</span>
                    <span style={{ color: MUTED }}>{h.group}</span>
                    <span className="font-bold rounded px-1.5 py-0.5" style={{ background: "#EEF1FA", color: INK }}>{h.lands}</span>
                    {h.head && <span className="rounded px-1.5 py-0.5" style={{ background: "#F3F0FA", color: INK }}>{h.head}</span>}
                    <span className="tnum" style={{ color: MUTED, minWidth: 70, textAlign: "right" }}>{bare(h.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg border p-3 mb-6" style={{ borderColor: BORDER }}>
            <div className="font-bold text-sm mb-2" style={{ color: INK }}>The standing rules</div>
            {data.book.map((b) => (
              <div key={b.id} className="border-t py-2" style={{ borderColor: "var(--line-soft)" }}>
                <div className="text-xs font-bold" style={{ color: INK }}>{b.title}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--dim)", lineHeight: 1.55 }}>{b.says}</div>
                <div className="text-xs mt-1" style={{ color: MUTED, lineHeight: 1.55 }}><i>{b.why}</i></div>
              </div>
            ))}
          </div>

          <Ladder kind="p" title="Which line of the P&amp;L a ledger lands on"
            blurb={`First match wins, and one always does. The rungs are tested top to bottom, so the narrow tests come before the wide ones. Figures in ${unitLabel}, for ${periodLabel(data.from, data.to)}. The last rung should always read zero — if it does not, a new root has been opened in Tally and the ladder needs a rung.`}
            rows={data.pnl} />

          <Ladder kind="o" title="Which of the eleven operating-expense heads"
            blurb={`Applied to everything that landed on Indirect Expenses or Finance Charges above. The last head is a catch, so the eleven always add back to the operating-expense total exactly — whatever new ledgers get opened next month. Figures in ${unitLabel}.`}
            rows={data.oe} />

          <p className="text-xs" style={{ color: MUTED, maxWidth: "84ch", lineHeight: 1.6 }}>
            Read from {data.counts.ledgers.toLocaleString("en-IN")} ledgers, {data.counts.vouchers.toLocaleString("en-IN")} vouchers
            and {data.counts.lines.toLocaleString("en-IN")} voucher lines. These rules live in one file — <b>src/lib/kuber-rules.ts</b> —
            and nothing else in Kuber classifies a ledger. The P&amp;L, the balance sheet, the ratio pack and this page
            all read that one ladder.
          </p>
        </>
      )}
    </div>
  );
}


/** RATIO ANALYSIS — its own sheet (Dr Raghu, 28 Aug 2026): every ratio with
 *  its value, HIS target beside it, and the formula it stands on. */
export function RatioScreen() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const fyStart = today.slice(5, 7) >= "04" ? today.slice(0, 4) + "-04-01" : String(Number(today.slice(0, 4)) - 1) + "-04-01";
  const lme = lastMonthEndIso();
  const [from, setFrom] = useState(fyStart);
  const [to, setTo] = useState(lme >= fyStart ? lme : today);
  const [data, reload] = useBooks<MisData>("mis", `&from=${from}&to=${to}`);
  const { fmt: fmtMoney } = useMoneyFmt();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  if (data?.empty) return <div className="text-sm" style={{ color: MUTED }}>No books yet — upload the Tally masters and transactions first.</div>;

  const GROUPS: [string, string[]][] = [
    ["PROFIT AND LOSS STATEMENT RATIOS", ["ebitda_sales", "pbt_sales", "pat_sales", "int_cover", "gp_cr", "expenses_cr", "productivity"]],
    ["BALANCE SHEET RATIOS", ["debt_equity", "current_ratio", "quick_ratio", "debt_service", "dscr", "tol_tnw", "roce", "roi"]],
    ["THE DAYS", ["debtor_days", "inventory_days", "creditor_days", "ccc"]],
  ];
  const show = (r: MisRatio, v: number | null | undefined = r.value) => v == null ? "—"
    : r.unit === "%" ? fmtPct(v)
    : r.unit === "x" ? v.toFixed(2)
    : r.unit === "days" ? `${Math.round(v)} days`
    : fmtMoney(v);
  const hasLy = !!data?.ly;
  const saveTarget = async (key: string, target: string) => {
    await fetch("/api/kuber/books", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "set_ratio_target", key, target }),
    });
    reload();
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="text-lg font-bold" style={{ color: INK }}>Ratio Analysis</div>
          <div className="text-sm" style={{ color: "var(--dim)", maxWidth: 640 }}>
            Trial balance {data ? `${fmtD(data.from)} → ${fmtD(data.to)}` : "…"} — upto last month&apos;s last day by default.
            {data?.ly ? <> The same months a year back stand beside it, struck on the same closings.</> : null}
            {" "}Every ratio states its own formula; targets are yours to type. A dash is an honest &quot;the input isn&apos;t in yet&quot;, never a guess.
          </div>
        </div>
        <PeriodBar from={from} to={to} setFrom={setFrom} setTo={setTo} onRefresh={reload} />
      </div>
      {!data ? <div className="text-sm" style={{ color: MUTED }}>computing…</div> : GROUPS.map(([title, keys]) => (
        <div key={title} className="bg-white rounded-lg border mb-3 overflow-auto" style={{ borderColor: BORDER }}>
          <div className="px-3 py-2 text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.8 }}>{title}</div>
          <table className="w-full text-xs genie-table" style={{ minWidth: hasLy ? 780 : 640, borderCollapse: "separate", borderSpacing: 0 }}>
            <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
              <th className="px-3 py-1.5 text-left">Particulars</th>
              <th className="px-2 py-1.5 text-right" style={{ whiteSpace: "nowrap" }}>{data.ly ? periodLabel(data.from, data.to) : "Reporting"}</th>
              {hasLy && <th className="px-2 py-1.5 text-right" style={{ whiteSpace: "nowrap", fontStyle: "italic", fontWeight: 500, color: "#C7D2DD" }}>{periodLabel(data.ly!.from, data.ly!.to)}</th>}
              <th className="px-2 py-1.5 text-right">Target</th>
              <th className="px-3 py-1.5 text-left" style={{ color: "#8FA1B3" }}>The arithmetic</th>
            </tr></thead>
            <tbody>
              {keys.map((k, i) => {
                const r = data.ratios.find((x) => x.key === k);
                if (!r) return null;
                return (
                  <tr key={k} className="border-t" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                    <td className="px-3 py-1.5 font-semibold">{r.label}</td>
                    <td className="px-2 py-1.5 text-right tnum font-bold" style={{ color: r.value == null ? MUTED : INK, whiteSpace: "nowrap" }}>
                      {show(r)}<Arrow now={r.value} before={r.ly} k={r.key} dp={r.unit === "days" ? 0 : 2} suffix={r.unit === "%" ? " pts" : ""} />
                    </td>
                    {hasLy && <td className="px-2 py-1.5 text-right tnum" style={{ color: MUTED, fontStyle: "italic" }}>{show(r, r.ly)}</td>}
                    <td className="px-2 py-1.5 text-right">
                      <input value={drafts[k] ?? r.target} placeholder="—"
                        onChange={(e) => setDrafts((d) => ({ ...d, [k]: e.target.value }))}
                        onBlur={(e) => { if (e.target.value !== r.target) void saveTarget(k, e.target.value); }}
                        className="border rounded px-1.5 py-0.5 text-right tnum" style={{ borderColor: (drafts[k] ?? r.target) ? BORDER : "var(--line-soft)", width: 76 }} />
                    </td>
                    <td className="px-3 py-1.5" style={{ color: MUTED }}>{r.formula}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
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
          <div className="text-sm" style={{ color: "var(--dim)" }}>Every ledger&apos;s opening plus every line to the date — as-of, not a snapshot typed in.</div>
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
              <div className="flex items-center justify-between px-3 py-2 border-t text-sm font-bold" style={{ borderColor: "var(--ink)" }}>
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
  const [drill, setDrill] = useState<string | null>(null);

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
      style={{ position: "sticky", top: 0, background: "var(--ink)", cursor: "pointer" }}>
      {children}{sortK === k ? (dir === 1 ? " ▲" : " ▼") : ""}
    </th>
  );

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="text-lg font-bold" style={{ color: INK }}>{title}</div>
          <div className="text-sm" style={{ color: "var(--dim)", maxWidth: 640, lineHeight: 1.5 }}>{blurb}</div>
        </div>
        <div className="flex gap-2 items-center text-xs font-semibold flex-wrap" style={{ color: MUTED }}>
          {([["YTD", fyStart], ["QTD", qtdStart], ["MTD", mtdStart]] as [string, string][]).map(([lbl, start]) => (
            <button key={lbl} onClick={() => { setFrom(start); setTo(today); }}
              className="rounded-full border px-2.5 py-0.5 font-bold"
              style={from === start && to === today ? { background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" } : { color: MUTED, borderColor: BORDER, background: "#fff" }}>
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
            <table className="w-full text-xs genie-table" style={{ minWidth: 680, borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr style={{ background: "var(--ink)", color: "#fff" }}>
                  <Hd k="ledger">Ledger</Hd><Hd k="group">Group</Hd>
                  <th className="px-2 py-2 text-left" style={{ position: "sticky", top: 0, background: "var(--ink)" }}>Class</th>
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
                  <tr key={r.ledger} className="border-t" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                    <td className="px-2 py-1.5 font-semibold" role="button" tabIndex={0} onClick={() => setDrill(r.ledger)} style={{ cursor: "pointer", color: "#2C5B82", textDecoration: "underline" }} title="Open this ledger's vouchers">{r.ledger}</td>
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
            border marks a class set by hand; the flip is remembered and every register and total follows it. A ledger&apos;s
            name opens its vouchers.
          </p>
        </>
      )}
      {drill && <DrillModal ledger={drill} from={from} to={to} onClose={() => setDrill(null)} />}
    </div>
  );
}

// ---------------- Actual Cash Flow & Fund Flow ----------------
// (Dr Raghu, 28 Aug 2026: "build the Cash Flow and Fund Flow from the XML,
// make it drill downable.")

interface CashActual { empty?: boolean; from: string; to: string; inflows: TreeSec[]; outflows: TreeSec[]; totalIn: number; totalOut: number; net: number; bankMove: number; contra: number ; headsIn?: { head: string; amount: number; pct: number }[]; headsOut?: { head: string; amount: number; pct: number }[] }
export function ActualCashFlowScreen() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const fyStart = today.slice(5, 7) >= "04" ? today.slice(0, 4) + "-04-01" : String(Number(today.slice(0, 4)) - 1) + "-04-01";
  const [from, setFrom] = useState(fyStart);
  const [to, setTo] = useState(today);
  const [data, reload] = useBooks<CashActual>("cashflow_actual", `&from=${from}&to=${to}`);
  const { fmt: fmtMoney } = useMoneyFmt();
  const [drill, setDrill] = useState<string | null>(null);
  if (data?.empty) return <div className="text-sm" style={{ color: MUTED }}>No books yet — upload the Tally masters and transactions first.</div>;
  return (
    <div style={{ maxWidth: 1000 }}>
      <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="text-lg font-bold" style={{ color: INK }}>Actual Cash Flow</div>
          <div className="text-sm" style={{ color: "var(--dim)", maxWidth: 640 }}>What actually moved through bank and cash in the period, head by head — every voucher touching a bank or cash ledger, read from its other side.</div>
        </div>
        <PeriodBar from={from} to={to} setFrom={setFrom} setTo={setTo} onRefresh={reload} />
      </div>
      {!data ? <div className="text-sm" style={{ color: MUTED }}>computing…</div> : (
        <>
          <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
            <Card label="INFLOWS" value={fmtMoney(data.totalIn)} color={GREEN} />
            <Card label="OUTFLOWS" value={fmtMoney(data.totalOut)} color={RED} />
            <Card label="NET MOVEMENT" value={fmtMoney(data.net)} color={data.net >= 0 ? GREEN : RED} sub={`bank & cash actually moved ${fmtMoney(data.bankMove)}`} />
            {data.contra > 0 && <Card label="CONTRA (BANK ↔ BANK)" value={fmtMoney(data.contra)} sub="internal transfers — not a flow" />}
          </div>
          {/* THE HEADS HE READS BY, WITH THEIR SHARE AND A PIE (30 Sep 2026).
              The Tally-root drill stays below for the audit trail; this is the
              reading. */}
          {data.headsIn && data.headsOut && (
            <div className="flex gap-3 flex-wrap mb-3">
              <HeadPie title="RECEIVED" tone={GREEN} rows={data.headsIn} total={data.totalIn} fmtMoney={fmtMoney} />
              <HeadPie title="SPENT" tone={RED} rows={data.headsOut} total={data.totalOut} fmtMoney={fmtMoney} />
            </div>
          )}
          <div className="flex gap-3 flex-wrap">
            <div className="bg-white rounded-lg border" style={{ borderColor: BORDER, flex: 1, minWidth: 340 }}>
              <div className="px-3 py-2 text-xs font-bold" style={{ color: GREEN, letterSpacing: 0.8 }}>INFLOWS — BY TALLY HEAD, FOR THE DRILL</div>
              <DrillTree secs={data.inflows} fmtMoney={fmtMoney} onLedger={setDrill} />
            </div>
            <div className="bg-white rounded-lg border" style={{ borderColor: BORDER, flex: 1, minWidth: 340 }}>
              <div className="px-3 py-2 text-xs font-bold" style={{ color: RED, letterSpacing: 0.8 }}>OUTFLOWS — BY TALLY HEAD, FOR THE DRILL</div>
              <DrillTree secs={data.outflows} fmtMoney={fmtMoney} onLedger={setDrill} />
            </div>
          </div>
          <p className="text-xs mt-2" style={{ color: MUTED, maxWidth: "84ch", lineHeight: 1.6 }}>
            A head opens to its groups, a group to its ledgers, a ledger to its vouchers. If NET MOVEMENT and the bank&apos;s
            own movement disagree, a voucher mixes several heads unevenly — the drill finds it.
          </p>
        </>
      )}
      {drill && <DrillModal ledger={drill} from={from} to={to} onClose={() => setDrill(null)} />}
    </div>
  );
}

interface FundFlow { empty?: boolean; from: string; to: string; sources: TreeSec[]; applications: TreeSec[]; operations: number; totalSources: number; totalApplications: number; gap: number }
export function FundFlowScreen() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const fyStart = today.slice(5, 7) >= "04" ? today.slice(0, 4) + "-04-01" : String(Number(today.slice(0, 4)) - 1) + "-04-01";
  const [from, setFrom] = useState(fyStart);
  const [to, setTo] = useState(today);
  const [data, reload] = useBooks<FundFlow>("fundflow", `&from=${from}&to=${to}`);
  const { fmt: fmtMoney } = useMoneyFmt();
  const [drill, setDrill] = useState<string | null>(null);
  if (data?.empty) return <div className="text-sm" style={{ color: MUTED }}>No books yet — upload the Tally masters and transactions first.</div>;
  return (
    <div style={{ maxWidth: 1000 }}>
      <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="text-lg font-bold" style={{ color: INK }}>Fund Flow</div>
          <div className="text-sm" style={{ color: "var(--dim)", maxWidth: 640 }}>Where the money CAME FROM and WHERE IT WENT between the two dates — every balance-sheet head&apos;s change, sources against applications, with operations&apos; own funds on top.</div>
        </div>
        <PeriodBar from={from} to={to} setFrom={setFrom} setTo={setTo} onRefresh={reload} />
      </div>
      {!data ? <div className="text-sm" style={{ color: MUTED }}>computing…</div> : (
        <>
          <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
            <Card label="FUNDS FROM OPERATIONS" value={fmtMoney(data.operations)} color={data.operations >= 0 ? GREEN : RED} sub="the P&L heads' own movement" />
            <Card label="TOTAL SOURCES" value={fmtMoney(data.totalSources)} color={GREEN} />
            <Card label="TOTAL APPLICATIONS" value={fmtMoney(data.totalApplications)} color={RED} />
          </div>
          <div className="flex gap-3 flex-wrap">
            <div className="bg-white rounded-lg border" style={{ borderColor: BORDER, flex: 1, minWidth: 340 }}>
              <div className="px-3 py-2 text-xs font-bold" style={{ color: GREEN, letterSpacing: 0.8 }}>SOURCES — LIABILITIES RAISED · ASSETS RELEASED</div>
              {data.operations > 0 && (
                <div className="flex items-center justify-between px-3 py-1.5 border-t text-sm font-bold" style={{ borderColor: "var(--line-soft)" }}>
                  <span>Funds from operations</span><span className="tnum" style={{ color: GREEN }}>{fmtMoney(data.operations)}</span>
                </div>
              )}
              <DrillTree secs={data.sources} fmtMoney={fmtMoney} onLedger={setDrill} />
            </div>
            <div className="bg-white rounded-lg border" style={{ borderColor: BORDER, flex: 1, minWidth: 340 }}>
              <div className="px-3 py-2 text-xs font-bold" style={{ color: RED, letterSpacing: 0.8 }}>APPLICATIONS — ASSETS BUILT · LIABILITIES REPAID</div>
              {data.operations < 0 && (
                <div className="flex items-center justify-between px-3 py-1.5 border-t text-sm font-bold" style={{ borderColor: "var(--line-soft)" }}>
                  <span>Operations consumed</span><span className="tnum" style={{ color: RED }}>{fmtMoney(-data.operations)}</span>
                </div>
              )}
              <DrillTree secs={data.applications} fmtMoney={fmtMoney} onLedger={setDrill} />
            </div>
          </div>
        </>
      )}
      {drill && <DrillModal ledger={drill} from={from} to={to} onClose={() => setDrill(null)} />}
    </div>
  );
}

// ---------------- The CFO Note ----------------
// (Dr Raghu, 28 Aug 2026: "a very compact note that I should review every
// Saturday about the things I should do to take control of finances. The
// graphs should also be in this.") Computed fresh from the books each open.

interface CfoData {
  today: string; months: string[];
  series: Record<string, number[]>;
  actions: {
    topOverdueCustomers: { party: string; amount: number }[];
    topOverdueSuppliers: { party: string; amount: number }[];
    overdueReceivable: number; unadjRec: number; unadjPay: number;
    collGapThisMonth: number;
    bgSoon: { count: number; amount: number }; fdSoon: { count: number; amount: number };
    compRed: number; compAmber: number; emiMonthly: number;
  };
}

/** Two series over six months — a small honest SVG, no library. */
function TrendChart({ months, a, b, la, lb, ca, cb }: { months: string[]; a: number[]; b: number[]; la: string; lb: string; ca: string; cb: string }) {
  const W = 460, H = 150, PAD = 28;
  const max = Math.max(...a, ...b, 1);
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / Math.max(1, months.length - 1);
  const y = (v: number) => H - 22 - (v / max) * (H - 44);
  const path = (s2: number[]) => s2.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const mmm = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
  const cr = (n: number) => (n / 1e7).toFixed(1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 520 }}>
      <line x1={PAD} y1={H - 22} x2={W - PAD} y2={H - 22} stroke={BORDER} />
      <path d={path(a)} fill="none" stroke={ca} strokeWidth={2.2} />
      <path d={path(b)} fill="none" stroke={cb} strokeWidth={2.2} strokeDasharray="5 3" />
      {a.map((v, i) => (<circle key={`a${i}`} cx={x(i)} cy={y(v)} r={2.6} fill={ca} />))}
      {b.map((v, i) => (<circle key={`b${i}`} cx={x(i)} cy={y(v)} r={2.6} fill={cb} />))}
      {months.map((m, i) => (<text key={m} x={x(i)} y={H - 8} textAnchor="middle" fontSize={9} fill={MUTED}>{mmm(m)}</text>))}
      {a.map((v, i) => (v ? <text key={`ta${i}`} x={x(i)} y={y(v) - 6} textAnchor="middle" fontSize={8.5} fill={ca}>{cr(v)}</text> : null))}
      {b.map((v, i) => (v ? <text key={`tb${i}`} x={x(i)} y={y(v) + 13} textAnchor="middle" fontSize={8.5} fill={cb}>{cr(v)}</text> : null))}
      <text x={PAD} y={12} fontSize={10} fontWeight={700} fill={ca}>— {la}</text>
      <text x={PAD + 150} y={12} fontSize={10} fontWeight={700} fill={cb}>-- {lb}</text>
      <text x={W - PAD} y={12} fontSize={9} textAnchor="end" fill={MUTED}>₹ Cr / month</text>
    </svg>
  );
}

export function CfoNoteScreen({ go }: { go: (k: string) => void }) {
  const [d, setD] = useState<CfoData | null>(null);
  const [s, setS] = useState<Summary | null>(null);
  const { fmt: fmtMoney } = useMoneyFmt();
  /* THE BOARD REPORT — made here, kept below (Dr Raghu, 30 Sep 2026:
     "as a button", "and keep it in bottom as archieve"). */
  const [archive, setArchive] = useState<{ id: string; on_date: string; title: string; by: string; at: string }[] | null>(null);
  const [making, setMaking] = useState(false);
  const [boardMsg, setBoardMsg] = useState("");
  /* TWO DOCUMENTS UNDER ONE ROOF (Dr Raghu, 30 Sep 2026: "a tab on the top
     called CFO Monthly Report"). The Saturday read stays the default; the
     monthly report is the other tab. */
  const [tab, setTab] = useState<"note" | "report">("note");
  const loadArchive = useCallback(() => {
    fetch("/api/board-report", { cache: "no-store" }).then((r) => r.json())
      .then((j) => setArchive(j.rows || [])).catch(() => setArchive([]));
  }, []);
  const makeReport = async () => {
    setMaking(true); setBoardMsg("Reading the books — this takes a moment…");
    try {
      const r = await fetch("/api/board-report", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "the report could not be built");
      setBoardMsg("");
      loadArchive();
      window.open(`/board-report/print?id=${encodeURIComponent(j.id)}`, "_blank");
    } catch (e) { setBoardMsg(e instanceof Error ? e.message : String(e)); }
    finally { setMaking(false); }
  };
  useEffect(() => { loadArchive(); }, [loadArchive]);
  useEffect(() => {
    fetch("/api/kuber/books?view=cfonote", { cache: "no-store" }).then((r) => r.json()).then(setD).catch(() => setD(null));
    fetch("/api/kuber/books?view=summary&period=30", { cache: "no-store" }).then((r) => r.json()).then(setS).catch(() => setS(null));
  }, []);
  if (!d) return <div className="text-sm" style={{ color: MUTED }}>reading the books…</div>;
  const a = d.actions;
  const last = d.months.length - 1;
  const dir = (arr: number[]) => (arr[last] > arr[last - 1] ? "rising" : arr[last] < arr[last - 1] ? "falling" : "flat");

  // THE SATURDAY LIST — each line stands only when the books say so
  const todo: { title: string; detail: string; goKey?: string }[] = [];
  if (a.collGapThisMonth > 0) todo.push({ title: `Collect ${fmtMoney(a.collGapThisMonth)} more this month`, detail: "billing has outrun collections this month — the gap becomes borrowing if it stands", goKey: "receivables" });
  if (a.topOverdueCustomers.length) todo.push({ title: `Call these ${a.topOverdueCustomers.length}: ${a.topOverdueCustomers.map((x) => `${x.party.split(" ").slice(0, 2).join(" ")} (${fmtMoney(x.amount)})`).join(" · ")}`, detail: `they hold ${fmtMoney(a.topOverdueCustomers.reduce((s2, x) => s2 + x.amount, 0))} of the ${fmtMoney(a.overdueReceivable)} overdue`, goKey: "receivables" });
  if (a.unadjRec > 1e5) todo.push({ title: `Tie ${fmtMoney(a.unadjRec)} of receipts to their invoices`, detail: "money received but not set against bills — the gross receivable reads inflated until the refs are tied in Tally", goKey: "receivables" });
  if (a.unadjPay > 1e5) todo.push({ title: `Tie ${fmtMoney(a.unadjPay)} of payments to supplier bills`, detail: "the same untied problem on the payable side", goKey: "payables" });
  if (a.compRed > 0) todo.push({ title: `${a.compRed} compliance${a.compRed > 1 ? "s" : ""} stand NOT DONE for last month`, detail: "red on the calendar — penalty interest runs on these", goKey: "compliance" });
  if (a.compAmber > 0) todo.push({ title: `${a.compAmber} compliance${a.compAmber > 1 ? "s were" : " was"} filed late last month`, detail: "amber — worth a word with the filer before it becomes habit", goKey: "compliance" });
  if (a.bgSoon.count) todo.push({ title: `${a.bgSoon.count} BG${a.bgSoon.count > 1 ? "s" : ""} (${fmtMoney(a.bgSoon.amount)}) expire within 60 days`, detail: "renew or release — an expired BG discovered by the beneficiary is the expensive kind", goKey: "bg" });
  if (a.fdSoon.count) todo.push({ title: `${a.fdSoon.count} FD${a.fdSoon.count > 1 ? "s" : ""} (${fmtMoney(a.fdSoon.amount)}) mature within 60 days`, detail: "decide the rollover before the bank decides it for you", goKey: "fd" });
  if (a.emiMonthly > 0) todo.push({ title: `${fmtMoney(a.emiMonthly)} leaves every month as EMI`, detail: "hold it against this month's collections when planning the week's payments", goKey: "loan" });

  return (
    <div style={{ maxWidth: 980 }}>
      <div className="flex gap-1 mb-3">
        {([["note", "CFO Note"], ["report", "CFO Monthly Report"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="rounded px-3 py-1.5 text-sm font-bold"
            style={tab === k ? { background: "var(--ink)", color: "#fff" } : { color: MUTED, background: "#fff", border: `1px solid ${BORDER}` }}>{l}</button>
        ))}
      </div>
      {tab === "report" && <CfoMonthly />}
      {tab === "note" && <>
      <div className="mb-3 flex items-start gap-3 flex-wrap">
        <div style={{ flex: 1, minWidth: 320 }}>
          <div className="text-lg font-bold" style={{ color: INK }}>The CFO Note</div>
          <div className="text-sm" style={{ color: "var(--dim)", maxWidth: 700 }}>
            The Saturday read — computed fresh from the books each time it opens, nothing typed.
            Trends first, then the things to do. It will grow sharper as the books grow cleaner.
          </div>
        </div>
        {/* A BOARD PAPER IS A DIFFERENT DOCUMENT FROM A SATURDAY READ. This
            one is eleven A4 pages with page numbers, and it is KEPT — the
            archive below holds what the Board was actually given. */}
        <button onClick={makeReport} disabled={making}
          className="rounded px-3 py-2 text-sm font-bold text-white"
          style={{ background: making ? MUTED : "var(--blue)", whiteSpace: "nowrap" }}
          title="Eleven A4 pages, page-numbered, from today's books — and kept in the archive below">
          {making ? "Building…" : "📄 Board report"}
        </button>
      </div>
      {!!boardMsg && (
        <div className="text-xs rounded px-2.5 py-2 mb-3" style={{ background: "#FDF8EC", color: "#7A5B00" }}>{boardMsg}</div>
      )}

      {s && (
        <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <Card label="RECEIVABLES" value={fmtMoney(s.receivable.owed)} sub={`${s.receivable.owingParties} customers in debit`} />
          <Card label="PAYABLES" value={fmtMoney(s.payable.owed)} sub={`${s.payable.owingParties} suppliers`} />
          <Card label="BANK & CASH" value={fmtMoney(s.bankCash || 0)} color={(s.bankCash || 0) >= 0 ? GREEN : RED} />
          <Card label="OVERDUE TO COLLECT" value={fmtMoney(a.overdueReceivable)} color={a.overdueReceivable > 0 ? "var(--warn)" : GREEN} />
        </div>
      )}

      <div className="flex gap-3 flex-wrap mb-3">
        <div className="bg-white rounded-lg border p-3" style={{ borderColor: BORDER, flex: 1, minWidth: 340 }}>
          <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.8 }}>
            MONEY IN — billing vs collections · billing {dir(d.series.billing)}, collections {dir(d.series.collections)}
          </div>
          <TrendChart months={d.months} a={d.series.billing} b={d.series.collections} la="Billing" lb="Collections" ca="var(--blue)" cb={GREEN} />
        </div>
        <div className="bg-white rounded-lg border p-3" style={{ borderColor: BORDER, flex: 1, minWidth: 340 }}>
          <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.8 }}>
            MONEY OUT — purchases vs payments · purchases {dir(d.series.purchases)}, payments {dir(d.series.payments)}
          </div>
          <TrendChart months={d.months} a={d.series.purchases} b={d.series.payments} la="Purchases" lb="Payments" ca="#7C3AED" cb={RED} />
        </div>
      </div>

      <div className="bg-white rounded-lg border p-3" style={{ borderColor: BORDER }}>
        <div className="text-xs font-bold mb-2" style={{ color: "var(--blue)", letterSpacing: 0.8 }}>THE SATURDAY LIST — DO THESE, IN THIS ORDER</div>
        {todo.length === 0 && <div className="text-sm" style={{ color: GREEN, fontWeight: 700 }}>Nothing stands against you this week — the books are clean. Rare; enjoy it.</div>}
        {todo.map((t, i) => (
          <div key={i} className="flex gap-2 border-t py-2" style={{ borderColor: "var(--line-soft)" }}>
            <b className="tnum" style={{ color: "var(--blue)", width: 20, flexShrink: 0 }}>{i + 1}.</b>
            <div style={{ minWidth: 0 }}>
              <div className="text-sm font-bold" style={{ color: INK }}>{t.title}</div>
              <div className="text-xs" style={{ color: MUTED, lineHeight: 1.5 }}>{t.detail}{t.goKey && <> · <button onClick={() => go(t.goKey!)} style={{ color: ORANGE, fontWeight: 700 }}>open →</button></>}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs mt-2" style={{ color: MUTED, maxWidth: "84ch", lineHeight: 1.6 }}>
        Every line above is computed — a rule firing on the books, never an opinion. As the registers fill (loans,
        compliance, payment plans) the list sharpens by itself. Tell Bernie what Saturday should also ask, and it grows.
      </p>

      {/* ───────────── the archive ───────────── */}
      <div className="bg-white rounded-lg border p-3 mt-4" style={{ borderColor: BORDER }}>
        <div className="text-xs font-bold mb-1" style={{ color: "var(--blue)", letterSpacing: 0.8 }}>
          BOARD REPORTS — THE ARCHIVE
        </div>
        <div className="text-xs mb-2" style={{ color: MUTED, lineHeight: 1.55, maxWidth: "80ch" }}>
          Each report keeps the figures it was built from, so opening an old one shows <b>what the Board was actually
          given</b> — never a recomputation against later books. Two reports drawn a week apart will differ, and they should.
        </div>
        {archive === null && <div className="text-xs" style={{ color: MUTED }}>reading the archive…</div>}
        {archive?.length === 0 && (
          <div className="text-xs" style={{ color: MUTED }}>
            Nothing yet. <b>Board report</b> above makes the first one.
          </div>
        )}
        {archive?.map((r) => (
          <div key={r.id} className="flex items-baseline gap-2 border-t py-1.5 flex-wrap" style={{ borderColor: "var(--line-soft)" }}>
            <span className="text-sm font-bold" style={{ color: INK }}>{fmtD(r.on_date)}</span>
            <span className="text-xs" style={{ color: MUTED }}>
              generated {new Date(r.at).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}
              {r.by ? ` by ${String(r.by).split("@")[0]}` : ""}
            </span>
            <a href={`/board-report/print?id=${encodeURIComponent(r.id)}`} target="_blank" rel="noreferrer"
              className="text-xs font-bold" style={{ color: ORANGE, marginLeft: "auto" }}>open →</a>
          </div>
        ))}
      </div>
      </>}
    </div>
  );
}

// ---------------- Sales & Purchase Registers ----------------
// (Dr Raghu, 28 Aug 2026): every voucher of the family in the period —
// YTD by default, dates / MTD / QTD on the bar, totals on top, sortable.

/**
 * THE SALES REGISTER, AS A WORKING REGISTER (Dr Raghu, 30 Sep 2026).
 *
 * "in this we will have edit also. Add the Product Family ... field -
 * Salesman (this will help to know who has to follow it) ... Have the
 * scanned copy of the bill also which they will upload here as the single
 * source of truth! I think if we are able to do this quickly then a lot of
 * double work will eliminate!"
 *
 * WHICH IS EXACTLY WHY STATUS IS NOT TYPED. Tally already tracks what is
 * open against each invoice, bill by bill. A typed payment status beside it
 * would be a second truth that drifts from the first — which is the double
 * work, not the cure for it. So Status, Received, Outstanding, Days pending
 * and Interest loss are all COMPUTED from the books and shown in his columns;
 * only the product family, the salesman and the scan are typed, because they
 * are the three things Tally cannot know.
 *
 * An override exists for the bill where the books are honestly wrong. It is
 * marked when used, so a figure somebody has overruled never passes itself
 * off as the books' own.
 */
interface VregRow {
  id: string; date: string; vno: string; party: string; narration: string; amount: number;
  received: number | null; outstanding: number | null; status: string | null; overridden: boolean;
  paid_on: string | null; days: number | null; interest: number;
  fam: string | null; salesman: string | null; note: string | null;
  scan: { path: string; name: string } | null;
  items: { item: string; qty: string; rate: number; amount: number }[];
}
interface VregData { empty?: boolean; kind: string; from: string; to: string; rows: VregRow[]; count: number; total: number; fams: string[]; salesmen: string[] }

const STATUS_CHIP: Record<string, { bg: string; fg: string; label: string }> = {
  paid: { bg: "#E6F4EA", fg: "#0D7A3F", label: "Paid" },
  partial: { bg: "#FFF3E8", fg: "#8A5B00", label: "Partly paid" },
  unpaid: { bg: "#FBEAE8", fg: "#B3392E", label: "Unpaid" },
};

export function VoucherRegister({ kind }: { kind: "sales" | "purchase" }) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const fyStart = today.slice(5, 7) >= "04" ? today.slice(0, 4) + "-04-01" : String(Number(today.slice(0, 4)) - 1) + "-04-01";
  const [from, setFrom] = useState(fyStart);
  const [to, setTo] = useState(today);
  const [data, reload] = useBooks<VregData>("vreg", `&kind=${kind}&from=${from}&to=${to}`);
  const { fmt: fmtMoney } = useMoneyFmt();
  const [sortK, setSortK] = useState<"date" | "party" | "amount" | "vno" | "days" | "interest">("date");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [q, setQ] = useState("");
  const [fClient, setFClient] = useState("");
  const [fFam, setFFam] = useState("");
  const [fSales, setFSales] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [minAmt, setMinAmt] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<VregRow | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const sales = kind === "sales";
  if (data?.empty) return <div className="text-sm" style={{ color: MUTED }}>No books yet — upload the Tally masters and transactions first.</div>;

  const needle = q.trim().toLowerCase();
  const floor = Number(minAmt) || 0;
  const rows = (data?.rows || [])
    .filter((r) => !needle || r.party.toLowerCase().includes(needle) || r.vno.toLowerCase().includes(needle) || (r.narration || "").toLowerCase().includes(needle))
    .filter((r) => !fClient || r.party === fClient)
    .filter((r) => !fFam || r.fam === fFam)
    .filter((r) => !fSales || r.salesman === fSales)
    .filter((r) => !fStatus || r.status === fStatus)
    .filter((r) => !floor || r.amount >= floor)
    .sort((a, b) => {
      const v = sortK === "amount" ? a.amount - b.amount
        : sortK === "days" ? (a.days || 0) - (b.days || 0)
        : sortK === "interest" ? a.interest - b.interest
        : String(a[sortK] ?? "").localeCompare(String(b[sortK] ?? ""));
      return v * dir;
    });
  const shown = rows.reduce((s2, r) => s2 + r.amount, 0);
  const shownOs = rows.reduce((s2, r) => s2 + (r.outstanding || 0), 0);
  const shownInt = rows.reduce((s2, r) => s2 + r.interest, 0);
  const clients = [...new Set((data?.rows || []).map((r) => r.party).filter(Boolean))].sort();

  const allOn = rows.length > 0 && rows.every((r) => sel.has(r.vno));
  const toggleAll = () => setSel(allOn ? new Set() : new Set(rows.map((r) => r.vno)));
  const toggle = (vno: string) => setSel((s2) => { const n = new Set(s2); if (n.has(vno)) n.delete(vno); else n.add(vno); return n; });

  const bulk = async (patch: Record<string, unknown>) => {
    if (!sel.size) return;
    setBulkBusy(true);
    try {
      await fetch("/api/kuber/books", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "invoice_meta", bills: [...sel], ...patch }),
      });
      setSel(new Set()); reload();
    } finally { setBulkBusy(false); }
  };

  const Hd = ({ k, children, right }: { k: typeof sortK; children: React.ReactNode; right?: boolean }) => (
    <th className={`px-2 py-2 text-${right ? "right" : "left"} whitespace-nowrap`}
      onClick={() => { if (sortK === k) setDir((d2) => (d2 === 1 ? -1 : 1)); else { setSortK(k); setDir(k === "party" || k === "vno" ? 1 : -1); } }}
      style={{ position: "sticky", top: 0, background: "var(--ink)", cursor: "pointer" }}>
      {children}{sortK === k ? (dir === 1 ? " ▲" : " ▼") : ""}
    </th>
  );
  const box = { borderColor: BORDER } as React.CSSProperties;
  const cols = sales ? 13 : 8;

  return (
    <div style={{ maxWidth: sales ? 1240 : 1060 }}>
      <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="text-lg font-bold" style={{ color: INK }}>{sales ? "Sales Register" : "Purchase Register"}</div>
          <div className="text-sm" style={{ color: "var(--dim)", maxWidth: 720 }}>
            Every {sales ? "GST Sales voucher" : "purchase-family voucher (Purchase · Cap-Ex · Import)"} in the period, straight from the books.
            {sales && <> <b>Status, received, days and interest are read from the books</b> — only the family, the salesman and the scan are typed here.</>}
          </div>
        </div>
        <PeriodBar from={from} to={to} setFrom={setFrom} setTo={setTo} onRefresh={reload} />
      </div>
      {!data ? <div className="text-sm" style={{ color: MUTED }}>reading…</div> : (
        <>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Card label={`TOTAL — ${data.count} vouchers`} value={fmtMoney(data.total)} color={sales ? GREEN : "#1B6B93"} />
            {sales && <Card label="OUTSTANDING — SHOWN" value={fmtMoney(shownOs)} sub={`${rows.filter((r) => (r.outstanding || 0) > 1).length} invoices still open`} color="var(--blue)" />}
            {sales && <Card label="INTEREST LOST @ 15%" value={fmtMoney(shownInt)} sub="on what is still out, day by day since the bill" color={RED} />}
          </div>

          {/* FILTERS — by client, by amount, by date (the date is the period
              bar above), plus the two fields this register adds */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="party · no · narration…"
              className="border rounded px-2 py-1.5 text-sm" style={{ borderColor: needle ? ORANGE : BORDER, width: 210 }} />
            <select value={fClient} onChange={(e) => setFClient(e.target.value)} className="border rounded px-2 py-1.5 text-xs" style={box}>
              <option value="">every client</option>
              {clients.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {sales && <>
              <select value={fFam} onChange={(e) => setFFam(e.target.value)} className="border rounded px-2 py-1.5 text-xs" style={box}>
                <option value="">every family</option>
                {(data.fams || []).map((f) => <option key={f} value={f}>{f}</option>)}
                <option value="__none">— not set —</option>
              </select>
              <select value={fSales} onChange={(e) => setFSales(e.target.value)} className="border rounded px-2 py-1.5 text-xs" style={box}>
                <option value="">every salesman</option>
                {(data.salesmen || []).map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              {(["", "unpaid", "partial", "paid"] as const).map((k) => (
                <button key={k || "all"} onClick={() => setFStatus(k)}
                  className="rounded-full border px-2.5 py-0.5 text-xs font-bold"
                  style={fStatus === k ? { background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" } : { color: MUTED, borderColor: BORDER, background: "#fff" }}>
                  {k ? STATUS_CHIP[k].label : "all"}
                </button>
              ))}
            </>}
            <input value={minAmt} onChange={(e) => setMinAmt(e.target.value)} placeholder="min ₹"
              className="border rounded px-2 py-1.5 text-xs tnum" style={{ ...box, width: 92 }} />
          </div>

          {/* THE BULK BAR — "select multiple or select all, then edit where
              you can change salesperson, product, payment status". It writes
              only the field pressed, so setting a salesman on two hundred
              invoices cannot wipe a family somebody set yesterday. */}
          {sales && sel.size > 0 && (
            <div className="rounded p-2 mb-2 flex items-center gap-2 flex-wrap" style={{ background: "#EEF1FA", border: `1px solid ${BORDER}` }}>
              <b className="text-xs" style={{ color: INK }}>{sel.size} selected</b>
              <select defaultValue="" onChange={(e) => { if (e.target.value) { void bulk({ fam: e.target.value }); e.target.value = ""; } }}
                disabled={bulkBusy} className="border rounded px-2 py-1 text-xs" style={box}>
                <option value="">set product family…</option>
                {(data.fams || []).map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <input placeholder="set salesman + Enter" disabled={bulkBusy}
                onKeyDown={(e) => { if (e.key === "Enter") { const v = (e.target as HTMLInputElement).value.trim(); if (v) { void bulk({ salesman: v }); (e.target as HTMLInputElement).value = ""; } } }}
                list="vreg-salesmen" className="border rounded px-2 py-1 text-xs" style={{ ...box, width: 160 }} />
              <datalist id="vreg-salesmen">{(data.salesmen || []).map((s2) => <option key={s2} value={s2} />)}</datalist>
              <select defaultValue="" onChange={(e) => { if (e.target.value) { void bulk({ pay_status: e.target.value === "__books" ? "" : e.target.value }); e.target.value = ""; } }}
                disabled={bulkBusy} className="border rounded px-2 py-1 text-xs" style={box}>
                <option value="">override status…</option>
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partly paid</option>
                <option value="paid">Paid</option>
                <option value="__books">— back to the books —</option>
              </select>
              <span className="text-xs" style={{ color: MUTED }}>{bulkBusy ? "writing…" : "each change writes only that field"}</span>
              <button onClick={() => setSel(new Set())} className="text-xs font-bold ml-auto" style={{ color: MUTED }}>clear</button>
            </div>
          )}

          <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxHeight: "64vh" }}>
            <table className="w-full text-xs genie-table" style={{ minWidth: sales ? 1180 : 900, borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr style={{ background: "var(--ink)", color: "#fff" }}>
                  {sales && (
                    <th className="px-2 py-2" style={{ position: "sticky", top: 0, background: "var(--ink)", width: 30 }}>
                      <input type="checkbox" checked={allOn} onChange={toggleAll} title="Select everything shown" />
                    </th>
                  )}
                  <Hd k="date">Date</Hd><Hd k="vno">No</Hd><Hd k="party">Party</Hd>
                  {sales ? <>
                    <th className="px-2 py-2 text-left" style={{ position: "sticky", top: 0, background: "var(--ink)" }}>Family</th>
                    <th className="px-2 py-2 text-left" style={{ position: "sticky", top: 0, background: "var(--ink)" }}>Salesman</th>
                  </> : <>
                    <th className="px-2 py-2 text-left" style={{ position: "sticky", top: 0, background: "var(--ink)" }}>Narration</th>
                    <th className="px-2 py-2 text-left" style={{ position: "sticky", top: 0, background: "var(--ink)" }}>Items</th>
                  </>}
                  <Hd k="amount" right>Amount</Hd>
                  {!sales && <>
                    <th className="px-2 py-2" style={{ position: "sticky", top: 0, background: "var(--ink)" }}>Bill</th>
                    <th className="px-2 py-2" style={{ position: "sticky", top: 0, background: "var(--ink)" }} />
                  </>}
                  {sales && <>
                    <th className="px-2 py-2 text-right" style={{ position: "sticky", top: 0, background: "var(--ink)" }}>Received</th>
                    <th className="px-2 py-2 text-right" style={{ position: "sticky", top: 0, background: "var(--ink)" }}>O/S</th>
                    <th className="px-2 py-2 text-left" style={{ position: "sticky", top: 0, background: "var(--ink)" }}>Status</th>
                    <Hd k="days" right>Days</Hd>
                    <Hd k="interest" right>Interest @15%</Hd>
                    <th className="px-2 py-2" style={{ position: "sticky", top: 0, background: "var(--ink)" }}>Bill</th>
                    <th className="px-2 py-2" style={{ position: "sticky", top: 0, background: "var(--ink)" }} />
                  </>}
                </tr>
                <tr style={{ background: "#F3F1EB" }}>
                  <td colSpan={sales ? 6 : 5} className="px-2 py-1.5 font-bold" style={{ position: "sticky", top: 33, background: "#F3F1EB" }}>SHOWN — {rows.length}</td>
                  <td className="px-2 py-1.5 text-right tnum font-bold" style={{ position: "sticky", top: 33, background: "#F3F1EB" }}>{fmtMoney(shown)}</td>
                  {!sales && <td colSpan={2} style={{ position: "sticky", top: 33, background: "#F3F1EB" }} />}
                  {sales && <>
                    <td style={{ position: "sticky", top: 33, background: "#F3F1EB" }} />
                    <td className="px-2 py-1.5 text-right tnum font-bold" style={{ position: "sticky", top: 33, background: "#F3F1EB" }}>{fmtMoney(shownOs)}</td>
                    <td colSpan={3} style={{ position: "sticky", top: 33, background: "#F3F1EB" }} />
                    <td className="px-2 py-1.5 text-right tnum font-bold" style={{ position: "sticky", top: 33, background: "#F3F1EB", color: RED }}>{fmtMoney(shownInt)}</td>
                    <td colSpan={2} style={{ position: "sticky", top: 33, background: "#F3F1EB" }} />
                  </>}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (<tr><td colSpan={cols} className="px-3 py-4 text-center" style={{ color: MUTED }}>Nothing matches.</td></tr>)}
                {rows.map((r, i) => {
                  const chip = r.status ? STATUS_CHIP[r.status] : null;
                  return (
                    <tr key={r.id} className="border-t" style={{ borderColor: "var(--line-soft)", background: sel.has(r.vno) ? "#EEF1FA" : i % 2 ? "#FAF9F5" : "#fff" }}>
                      {sales && <td className="px-2 py-1"><input type="checkbox" checked={sel.has(r.vno)} onChange={() => toggle(r.vno)} /></td>}
                      <td className="px-2 py-1 tnum whitespace-nowrap">{fmtD(r.date)}</td>
                      <td className="px-2 py-1 whitespace-nowrap">{r.vno}</td>
                      <td className="px-2 py-1 font-semibold" style={{ maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.party}>{r.party || "—"}</td>
                      {sales ? <>
                        <td className="px-2 py-1" style={{ color: r.fam ? INK : MUTED, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.fam || ""}>{r.fam || "—"}</td>
                        <td className="px-2 py-1" style={{ color: r.salesman ? INK : MUTED, whiteSpace: "nowrap" }}>{r.salesman || "—"}</td>
                      </> : <>
                        <td className="px-2 py-1" style={{ color: MUTED, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.narration}</td>
                        {/* THE ITEMS, CLICKABLE (Dr Raghu, 30 Sep 2026: "we
                            should be able to click it, the lightbox will open
                            up ... VERY important for the audit of the bills") */}
                        <td className="px-2 py-1" style={{ maxWidth: 220 }}>
                          {r.items.length
                            ? <button onClick={() => setEdit(r)} title={r.items.map((x) => x.item).join(", ")}
                                style={{ color: "#2C5B82", textDecoration: "underline", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 210, display: "block", textAlign: "left" }}>
                                {r.items[0].item}{r.items.length > 1 ? ` +${r.items.length - 1}` : ""}
                              </button>
                            : <span style={{ color: "#D5D2C9" }}>—</span>}
                        </td>
                      </>}
                      <td className="px-2 py-1 text-right tnum font-bold">{fmtMoney(r.amount)}</td>
                      {!sales && <>
                        <td className="px-2 py-1 text-center">
                          {r.scan
                            ? <button onClick={() => void openScan(r.vno, kind)} title={r.scan.name} style={{ fontSize: 13 }}>&#128196;</button>
                            : <span style={{ color: "#D5D2C9" }}>&#128196;</span>}
                        </td>
                        <td className="px-2 py-1 text-center">
                          <button onClick={() => setEdit(r)} title="Open this bill" className="rounded"
                            style={{ border: `1px solid ${BORDER}`, background: "#fff", color: INK, padding: "1px 6px", fontSize: 12 }}>&#9998;</button>
                        </td>
                      </>}
                      {sales && <>
                        <td className="px-2 py-1 text-right tnum" style={{ color: MUTED }}>{r.received == null ? "—" : fmtMoney(r.received)}</td>
                        <td className="px-2 py-1 text-right tnum font-bold" style={{ color: (r.outstanding || 0) > 1 ? INK : MUTED }}>{r.outstanding == null ? "—" : fmtMoney(r.outstanding)}</td>
                        <td className="px-2 py-1 whitespace-nowrap">
                          {chip && <b className="rounded px-1.5 py-0.5" style={{ background: chip.bg, color: chip.fg, fontSize: 11 }}>{chip.label}</b>}
                          {r.overridden && <span title="overruled by hand — the books say otherwise" style={{ color: "#B45309", marginLeft: 3 }}>*</span>}
                        </td>
                        <td className="px-2 py-1 text-right tnum" style={{ color: (r.days || 0) > 60 ? RED : MUTED }}>{r.days ?? "—"}</td>
                        <td className="px-2 py-1 text-right tnum" style={{ color: r.interest > 0 ? RED : MUTED }}>{r.interest > 0 ? fmtMoney(r.interest) : "—"}</td>
                        <td className="px-2 py-1 text-center">
                          {r.scan
                            ? <button onClick={() => void openScan(r.vno, kind)} title={r.scan.name} style={{ fontSize: 13 }}>&#128196;</button>
                            : <span style={{ color: "#D5D2C9" }}>&#128196;</span>}
                        </td>
                        <td className="px-2 py-1 text-center">
                          <button onClick={() => setEdit(r)} title="Edit this invoice" className="rounded"
                            style={{ border: `1px solid ${BORDER}`, background: "#fff", color: INK, padding: "1px 6px", fontSize: 12 }}>&#9998;</button>
                        </td>
                      </>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data.count > 3000 && <p className="text-xs mt-1" style={{ color: "#8A6D1A" }}>Showing the first 3,000 of {data.count} — narrow the period for the rest.</p>}
        </>
      )}
      {edit && <InvoiceBox row={edit} kind={kind} fams={data?.fams || []} salesmen={data?.salesmen || []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

/** a link minted on the press — Drive through Genie, a bucket path signed */
async function scanUrl(bill: string, kind: string): Promise<string | null> {
  try {
    const r = await fetch(`/api/kuber/bill-scan?bill=${encodeURIComponent(bill)}&kind=${kind}`, { cache: "no-store" });
    const j = await r.json();
    return j.url || null;
  } catch { return null; }
}
async function openScan(bill: string, kind: string) {
  const u = await scanUrl(bill, kind);
  if (u) window.open(u, "_blank", "noopener");
}

/** One invoice, everything Genie is allowed to change about it. */
function InvoiceBox({ row, kind, fams, salesmen, onClose, onSaved }: {
  row: VregRow; kind: "sales" | "purchase"; fams: string[]; salesmen: string[]; onClose: () => void; onSaved: () => void;
}) {
  const sales = kind === "sales";
  const [f, setF] = useState({ fam: row.fam || "", salesman: row.salesman || "", pay_status: row.overridden ? (row.status || "") : "", note: row.note || "" });
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const { fmt: fmtMoney } = useMoneyFmt();
  /* THE BILL ITSELF, LARGE (Dr Raghu, 30 Sep 2026: "showing the particular
     invoice thumbnail in large, the invoice details and later on details from
     the items ... VERY important for the audit of the bills"). Fetched when
     the box opens, so the register itself never carries two hundred images. */
  const [scan, setScan] = useState<string | null>(null);
  useEffect(() => { void scanUrl(row.vno, kind).then(setScan); }, [row.vno, kind]);
  const save = async () => {
    setBusy("save"); setErr("");
    try {
      const r = await fetch("/api/kuber/books", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "invoice_meta", kind, bill: row.vno, ...f }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "could not save");
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  };
  const upload = async (file: File) => {
    setBusy("scan"); setErr("");
    try {
      const fd = new FormData();
      fd.append("bill", row.vno); fd.append("kind", kind); fd.append("file", file);
      const r = await fetch("/api/kuber/bill-scan", { method: "POST", body: fd });
      if (!r.ok) throw new Error((await r.json()).error || "could not upload");
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  };
  const L = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="block mb-2"><div className="text-xs font-bold mb-0.5" style={{ color: MUTED }}>{label}</div>{children}</label>
  );
  const inp = { borderColor: BORDER, width: "100%" } as React.CSSProperties;
  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)", zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg" style={{ width: "min(1020px,100%)", maxHeight: "92vh", overflowY: "auto" }}>
        <div className="px-4 py-3 flex items-center" style={{ background: "var(--navy)", borderRadius: "8px 8px 0 0" }}>
          <b className="text-white" style={{ fontSize: 14 }}>{row.vno}</b>
          <div className="flex-1" />
          <button onClick={onClose} className="font-bold" style={{ color: "#8FA1B3" }}>✕</button>
        </div>
        <div className="p-4" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,400px)", gap: 16, alignItems: "start" }}>
          <div>
          <div className="rounded p-3 mb-3" style={{ background: "#F4F2EC" }}>
            <div className="font-bold" style={{ color: INK }}>{row.party}</div>
            <div className="text-xs mt-1" style={{ color: MUTED }}>
              {fmtD(row.date)} · {fmtMoney(row.amount)}
              {row.outstanding != null && <> · received {fmtMoney(row.received || 0)} · still out <b style={{ color: (row.outstanding || 0) > 1 ? RED : "#0D7A3F" }}>{fmtMoney(row.outstanding)}</b></>}
              {row.days ? ` · ${row.days} days` : ""}
            </div>
            {!!row.narration && <div className="text-xs mt-1" style={{ color: INK }}>{row.narration}</div>}
            <div className="text-xs mt-1" style={{ color: MUTED }}>
              These come from the books and are not editable — change them in Tally.
            </div>
          </div>

          {/* WHAT WAS ON THE BILL — the audit's whole point */}
          {!!row.items.length && (
            <div className="mb-3">
              <div className="text-xs font-bold mb-1" style={{ color: MUTED }}>WHAT WAS ON THE BILL — {row.items.length} line{row.items.length > 1 ? "s" : ""}</div>
              <div className="rounded border overflow-auto" style={{ borderColor: BORDER, maxHeight: 240 }}>
                <table className="w-full text-xs genie-table" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                  <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
                    <th className="px-2 py-1.5 text-left" style={{ position: "sticky", top: 0, background: "var(--ink)" }}>Item</th>
                    <th className="px-2 py-1.5 text-right" style={{ position: "sticky", top: 0, background: "var(--ink)" }}>Qty</th>
                    <th className="px-2 py-1.5 text-right" style={{ position: "sticky", top: 0, background: "var(--ink)" }}>Rate</th>
                    <th className="px-2 py-1.5 text-right" style={{ position: "sticky", top: 0, background: "var(--ink)" }}>Amount</th>
                  </tr></thead>
                  <tbody>
                    {row.items.map((x, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                        <td className="px-2 py-1">{x.item}</td>
                        <td className="px-2 py-1 text-right tnum" style={{ color: MUTED, whiteSpace: "nowrap" }}>{x.qty || "—"}</td>
                        <td className="px-2 py-1 text-right tnum" style={{ color: MUTED }}>{x.rate ? fmtMoney(x.rate) : "—"}</td>
                        <td className="px-2 py-1 text-right tnum font-bold">{fmtMoney(x.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {Math.abs(row.items.reduce((a, x) => a + x.amount, 0) - row.amount) > 1 && (
                <div className="text-xs mt-1" style={{ color: "#B45309" }}>
                  The item lines come to {fmtMoney(row.items.reduce((a, x) => a + x.amount, 0))} against a voucher of {fmtMoney(row.amount)} — the difference is tax and charges booked on their own ledgers.
                </div>
              )}
            </div>
          )}
          {sales && <><L label="Product family"><select value={f.fam} onChange={(e) => setF({ ...f, fam: e.target.value })} className="border rounded px-2 py-1.5 text-sm" style={inp}>
            <option value="">— not set —</option>
            {fams.map((x) => <option key={x} value={x}>{x}</option>)}
          </select></L>
          <L label="Salesman — who follows this up">
            <input list="ibox-sales" value={f.salesman} onChange={(e) => setF({ ...f, salesman: e.target.value })} className="border rounded px-2 py-1.5 text-sm" style={inp} />
            <datalist id="ibox-sales">{salesmen.map((x) => <option key={x} value={x} />)}</datalist>
          </L>
          <L label="Status override — leave empty and the books decide">
            <select value={f.pay_status} onChange={(e) => setF({ ...f, pay_status: e.target.value })} className="border rounded px-2 py-1.5 text-sm" style={inp}>
              <option value="">— the books ({row.overridden ? "overruled now" : STATUS_CHIP[row.status || "unpaid"]?.label} ) —</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partly paid</option>
              <option value="paid">Paid</option>
            </select>
          </L>
          </>}
          <L label="Note"><textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} rows={2} className="border rounded px-2 py-1.5 text-sm" style={{ ...inp, resize: "vertical" }} /></L>

          {err && <div className="text-xs mb-2" style={{ color: RED }}>{err}</div>}
          <div className="flex gap-2">
            <button onClick={save} disabled={!!busy} className="rounded px-4 py-2 font-bold" style={{ background: GREEN, color: "#fff", fontSize: 12.5 }}>
              {busy === "save" ? "Saving…" : "Save"}
            </button>
            <div className="flex-1" />
            <button onClick={onClose} className="rounded px-3 py-2" style={{ color: MUTED, fontSize: 12.5 }}>Cancel</button>
          </div>
          </div>

          {/* THE BILL, LARGE. An auditor checking a voucher against the paper
              should see the paper without leaving the row. A PDF gets a frame
              rather than an image, because a browser will not draw one. */}
          <div>
            <div className="text-xs font-bold mb-1" style={{ color: MUTED }}>SCANNED BILL — the single source of truth</div>
            <div className="rounded border flex items-center justify-center"
              style={{ borderColor: BORDER, background: "#F4F2EC", minHeight: 260, overflow: "hidden" }}>
              {!row.scan ? (
                <span className="text-xs p-4 text-center" style={{ color: MUTED }}>
                  Nothing attached yet. The accounts team attaches it when they book the entry —
                  it files itself into the shared drive, not into the database.
                </span>
              ) : !scan ? (
                <span className="text-xs" style={{ color: MUTED }}>fetching…</span>
              ) : /\.pdf/i.test(row.scan.name) ? (
                <iframe src={scan} title={row.scan.name} style={{ width: "100%", height: 460, border: 0 }} />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={scan} alt={row.scan.name} style={{ maxWidth: "100%", maxHeight: 460, display: "block" }} />
              )}
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {row.scan && <button onClick={() => void openScan(row.vno, kind)} className="text-xs font-bold" style={{ color: "#2C5B82", textDecoration: "underline" }}>open full size</button>}
              <label className="text-xs font-bold rounded px-2 py-1" style={{ border: `1px solid ${BORDER}`, background: "#fff", color: INK, cursor: "pointer" }}>
                {row.scan ? "replace" : "attach a scan"}
                <input type="file" accept="image/*,application/pdf" style={{ display: "none" }}
                  onChange={(e) => { const x = e.target.files?.[0]; if (x) void upload(x); }} disabled={!!busy} />
              </label>
              {busy === "scan" && <span className="text-xs" style={{ color: MUTED }}>uploading…</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  BILLS RECEIVABLE — every unpaid bill, one line each
 * ------------------------------------------------------------------ */

interface BillRow {
  party: string; group: string | null; bill: string;
  bill_date: string | null; due_date: string | null;
  amount: number; age: number | null; overdue: number;
  fam: string | null; salesman: string | null; scan: string | null;
  expected_on: string | null; remarks: string | null;
}
interface BillsData {
  kind: string; today: string; rows: BillRow[]; count: number; total: number;
  held: number; creditParties: number; oldest: string | null;
  bands: { key: string; label: string; count: number; amount: number }[];
  parties: string[];
}

/**
 * BILLS RECEIVABLE — the collection desk.
 *
 * Dr Raghu, 30 Sep 2026: "make header sortable · show number of bills in
 * brackets and bold · make a box before the party name · Then Expected Date
 * after amount, this will be used for ticking · You can choose multiple and
 * edit, then sales person, Product, then Expected Date · showing age is not
 * relevant · Collection Remarks. Later I will make the collection Calls and
 * also emails from here."
 *
 * AGE CAME OFF AND OVERDUE STAYED. They looked like the same column and were
 * not: age counts from the bill, overdue from the day it was promised. Only
 * one of those is an argument you can put to a customer.
 *
 * THE EXPECTED DATE AND THE REMARK ARE BELIEFS, not facts — what somebody
 * thinks after a phone call. They live in Genie's own table keyed on the
 * bill, never in Tally, so a re-upload cannot wipe them. The salesman and
 * the product family are the same two fields the Sales Register holds, so
 * setting them here sets them there.
 */
export function BillsReceivable({ kind = "receivable" }: { kind?: "receivable" | "payable" }) {
  const [data, reload] = useBooks<BillsData>("billsdue", `&kind=${kind}`);
  const { fmt: fmtMoney } = useMoneyFmt();
  const [q, setQ] = useState("");
  const [party, setParty] = useState("");
  const [band, setBand] = useState("");
  const [minAmt, setMinAmt] = useState("");
  const [sortK, setSortK] = useState<SortK>("overdue");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [remarkDraft, setRemarkDraft] = useState("");
  const rec = kind === "receivable";

  if (!data) return <div className="text-sm" style={{ color: MUTED }}>reading the bills…</div>;
  const needle = q.trim().toLowerCase();
  const floor = Number(minAmt) || 0;
  const LO: Record<string, [number, number]> = { "0-90": [0, 90], "90-180": [90, 180], "180-365": [180, 365], "1-2y": [365, 730], "2-3y": [730, 1095], "3y+": [1095, 99999] };
  const rows = data.rows
    .filter((r) => !needle || r.party.toLowerCase().includes(needle) || r.bill.toLowerCase().includes(needle))
    .filter((r) => !party || r.party === party)
    .filter((r) => !band || ((r.age ?? 0) >= LO[band][0] && (r.age ?? 0) < LO[band][1]))
    .filter((r) => !floor || r.amount >= floor)
    .sort((a, b) => cmp(a, b, sortK) * dir);
  const shown = rows.reduce((s2, r) => s2 + r.amount, 0);
  const key = (r: BillRow) => `${r.party}|${r.bill}`;
  const allOn = rows.length > 0 && rows.every((r) => sel.has(key(r)));
  const toggleAll = () => setSel(allOn ? new Set() : new Set(rows.map(key)));
  const toggle = (k: string) => setSel((s2) => { const n = new Set(s2); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const apply = async (patch: Record<string, unknown>) => {
    if (!sel.size) return;
    setBusy(true);
    try {
      const bills = rows.filter((r) => sel.has(key(r))).map((r) => ({ party: r.party, bill: r.bill }));
      await fetch("/api/kuber/books", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "collection", bills, ...patch }),
      });
      setSel(new Set()); setRemarkDraft(""); reload();
    } finally { setBusy(false); }
  };

  const fams = [...new Set(data.rows.map((r) => r.fam).filter(Boolean) as string[])].sort();
  const salesmen = [...new Set(data.rows.map((r) => r.salesman).filter(Boolean) as string[])].sort();

  const Hd = ({ k, children, right }: { k: SortK; children: React.ReactNode; right?: boolean }) => (
    <th className={`px-2 py-2 text-${right ? "right" : "left"} whitespace-nowrap`}
      onClick={() => { if (sortK === k) setDir((d) => (d === 1 ? -1 : 1)); else { setSortK(k); setDir(k === "party" || k === "bill" || k === "fam" || k === "salesman" || k === "remarks" ? 1 : -1); } }}
      style={{ position: "sticky", top: 0, background: "var(--ink)", cursor: "pointer" }}>
      {children}{sortK === k ? (dir === 1 ? " ▲" : " ▼") : ""}
    </th>
  );
  const sel1 = sel.size;

  return (
    <div style={{ maxWidth: 1280 }}>
      <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="text-lg font-bold" style={{ color: INK }}>{rec ? "Bills Receivable" : "Bills Payable"}</div>
          <div className="text-sm" style={{ color: "var(--dim)", maxWidth: 760 }}>
            Every bill still unpaid, one line each — Tally&apos;s own bill-wise outstanding, which is where a bill sits
            until it is knocked off. Tick the ones you have chased, set who owns them and when the money is expected.
            {data.oldest && <> The oldest is <b>{fmtD(data.oldest)}</b>.</>}
          </div>
        </div>
        <button onClick={reload} title="Read the books again" className="rounded border font-bold"
          style={{ borderColor: BORDER, background: "#fff", color: INK, padding: "3px 9px", fontSize: 14 }}>&#8635;</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
        <Card label={rec ? "UNPAID — DUE TO COME" : "UNPAID — TO PAY"} value={fmtMoney(data.total)}
          sub={`${data.count} open bills`} color="var(--blue)" />
        <Card label={rec ? "ADVANCES HELD — NOT NETTED" : "ADVANCES PAID — NOT NETTED"} value={fmtMoney(data.held)}
          sub={`${data.creditParties} parties in credit · set off inside the party, never across`} color="#1B6B93" />
        <Card label="OVER A YEAR OLD" value={fmtMoney(data.bands.filter((b) => ["1-2y", "2-3y", "3y+"].includes(b.key)).reduce((s2, b) => s2 + b.amount, 0))}
          sub={`${data.bands.filter((b) => ["1-2y", "2-3y", "3y+"].includes(b.key)).reduce((s2, b) => s2 + b.count, 0)} bills`} color={RED} />
      </div>

      {/* the age bands — the count in brackets, bold, because the number of
          bills is the workload and the money is only the prize */}
      <div className="flex gap-2 mb-2 flex-wrap">
        {data.bands.map((b) => (
          <button key={b.key} onClick={() => setBand(band === b.key ? "" : b.key)}
            className="rounded border px-3 py-2 text-left"
            style={band === b.key ? { background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" } : { background: "#fff", borderColor: BORDER, color: INK }}>
            <div className="text-sm font-bold">{b.label}</div>
            <div className="text-base font-bold tnum">
              {fmtMoney(b.amount)} <b style={{ opacity: band === b.key ? 0.9 : 0.75 }}>({b.count})</b>
            </div>
          </button>
        ))}
        {band && <button onClick={() => setBand("")} className="text-xs font-bold self-center" style={{ color: MUTED }}>clear</button>}
      </div>

      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="party · bill no…"
          className="border rounded px-2 py-1.5 text-sm" style={{ borderColor: needle ? ORANGE : BORDER, width: 220 }} />
        <select value={party} onChange={(e) => setParty(e.target.value)} className="border rounded px-2 py-1.5 text-xs" style={{ borderColor: BORDER }}>
          <option value="">every party</option>
          {data.parties.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input value={minAmt} onChange={(e) => setMinAmt(e.target.value)} placeholder="min ₹"
          className="border rounded px-2 py-1.5 text-xs tnum" style={{ borderColor: BORDER, width: 92 }} />
        <span className="text-xs ml-auto" style={{ color: MUTED }}>{rows.length} shown · {fmtMoney(shown)}</span>
      </div>

      {/* TICK, THEN SET. Each press writes only the field pressed. */}
      {sel1 > 0 && (
        <div className="rounded p-2 mb-2 flex items-center gap-2 flex-wrap" style={{ background: "#EEF1FA", border: `1px solid ${BORDER}` }}>
          <b className="text-xs" style={{ color: INK }}>{sel1} ticked · {fmtMoney(rows.filter((r) => sel.has(key(r))).reduce((s2, r) => s2 + r.amount, 0))}</b>
          <input type="date" disabled={busy} onChange={(e) => { if (e.target.value) void apply({ expected_on: e.target.value }); }}
            title="Expected date" className="border rounded px-2 py-1 text-xs" style={{ borderColor: BORDER }} />
          <select defaultValue="" disabled={busy} onChange={(e) => { if (e.target.value) { void apply({ fam: e.target.value }); e.target.value = ""; } }}
            className="border rounded px-2 py-1 text-xs" style={{ borderColor: BORDER }}>
            <option value="">set product…</option>
            {fams.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <input placeholder="salesperson + Enter" disabled={busy} list="br-sales"
            onKeyDown={(e) => { if (e.key === "Enter") { const v = (e.target as HTMLInputElement).value.trim(); if (v) { void apply({ salesman: v }); (e.target as HTMLInputElement).value = ""; } } }}
            className="border rounded px-2 py-1 text-xs" style={{ borderColor: BORDER, width: 160 }} />
          <datalist id="br-sales">{salesmen.map((x) => <option key={x} value={x} />)}</datalist>
          <input value={remarkDraft} onChange={(e) => setRemarkDraft(e.target.value)} placeholder="collection remark…"
            onKeyDown={(e) => { if (e.key === "Enter" && remarkDraft.trim()) void apply({ remarks: remarkDraft.trim() }); }}
            disabled={busy} className="border rounded px-2 py-1 text-xs" style={{ borderColor: BORDER, width: 260 }} />
          <span className="text-xs" style={{ color: MUTED }}>{busy ? "writing…" : "Enter to apply"}</span>
          <button onClick={() => setSel(new Set())} className="text-xs font-bold ml-auto" style={{ color: MUTED }}>clear</button>
        </div>
      )}

      <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxHeight: "62vh" }}>
        <table className="w-full text-xs genie-table" style={{ minWidth: 1180, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: "var(--ink)", color: "#fff" }}>
              <th className="px-2 py-2" style={{ position: "sticky", top: 0, background: "var(--ink)", width: 30 }}>
                <input type="checkbox" checked={allOn} onChange={toggleAll} title="Tick everything shown" />
              </th>
              <Hd k="party">Party</Hd>
              <Hd k="bill">Bill</Hd>
              <Hd k="bill_date">Bill date</Hd>
              <Hd k="due_date">Due</Hd>
              <Hd k="overdue" right>Overdue</Hd>
              <Hd k="fam">Product</Hd>
              <Hd k="salesman">Salesperson</Hd>
              <Hd k="amount" right>Amount</Hd>
              <Hd k="expected_on">Expected</Hd>
              <Hd k="remarks">Collection remarks</Hd>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={11} className="px-3 py-4 text-center" style={{ color: MUTED }}>Nothing matches.</td></tr>}
            {rows.slice(0, 1500).map((r, i) => {
              const k = key(r);
              const on = sel.has(k);
              return (
                <tr key={k + i} className="border-t" style={{ borderColor: "var(--line-soft)", background: on ? "#EEF1FA" : i % 2 ? "#FAF9F5" : "#fff" }}>
                  <td className="px-2 py-1"><input type="checkbox" checked={on} onChange={() => toggle(k)} /></td>
                  <td className="px-2 py-1 font-semibold" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.party}>{r.party}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{r.bill}{r.scan && <span title={r.scan} style={{ marginLeft: 4 }}>&#128196;</span>}</td>
                  <td className="px-2 py-1 tnum whitespace-nowrap">{fmtD(r.bill_date)}</td>
                  <td className="px-2 py-1 tnum whitespace-nowrap" style={{ color: MUTED }}>{fmtD(r.due_date)}</td>
                  <td className="px-2 py-1 text-right tnum whitespace-nowrap" style={{ color: r.overdue > 365 ? RED : r.overdue > 90 ? "#B45309" : r.overdue > 0 ? INK : MUTED, fontWeight: r.overdue > 365 ? 700 : 400 }}>
                    {r.overdue > 0 ? (r.overdue >= 365 ? `${Math.floor(r.overdue / 365)}y ${Math.floor((r.overdue % 365) / 30)}m` : `${r.overdue}d`) : "—"}
                  </td>
                  <td className="px-2 py-1" style={{ color: r.fam ? INK : "#D5D2C9", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.fam || ""}>{r.fam || "—"}</td>
                  <td className="px-2 py-1" style={{ color: r.salesman ? INK : "#D5D2C9", whiteSpace: "nowrap" }}>{r.salesman || "—"}</td>
                  <td className="px-2 py-1 text-right tnum font-bold">{fmtMoney(r.amount)}</td>
                  <td className="px-2 py-1 tnum whitespace-nowrap" style={{ color: r.expected_on ? (r.expected_on < data.today ? RED : "#0D7A3F") : "#D5D2C9", fontWeight: r.expected_on ? 700 : 400 }}>
                    {r.expected_on ? fmtD(r.expected_on) : "—"}
                  </td>
                  <td className="px-2 py-1" style={{ color: r.remarks ? INK : "#D5D2C9", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.remarks || ""}>{r.remarks || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 1500 && <p className="text-xs mt-1" style={{ color: "#8A6D1A" }}>Showing the first 1,500 of {rows.length} — narrow it with a filter.</p>}
      <p className="text-xs mt-2" style={{ color: MUTED, maxWidth: "88ch", lineHeight: 1.6 }}>
        <b>Overdue counts from the day it was promised</b>, not from the bill — it is the only one of the two you can put
        to a customer. Product and Salesperson are the Sales Register&apos;s own two fields, so setting them here sets
        them there. Expected date and the remark are Genie&apos;s alone and a Tally upload cannot touch them.
        Calls and e-mails from this screen come next.
      </p>
    </div>
  );
}

type SortK = "party" | "bill" | "bill_date" | "due_date" | "overdue" | "fam" | "salesman" | "amount" | "expected_on" | "remarks";
/** one comparison for every column, so every header can be pressed */
function cmp(a: BillRow, b: BillRow, k: SortK): number {
  if (k === "amount") return a.amount - b.amount;
  if (k === "overdue") return a.overdue - b.overdue;
  /* a bill with no expected date sorts last whichever way it is read —
     an empty cell is not "the first of January" */
  if (k === "expected_on") return String(a.expected_on || "9999").localeCompare(String(b.expected_on || "9999"));
  return String(a[k] ?? "").localeCompare(String(b[k] ?? ""));
}

/* ------------------------------------------------------------------ *
 *  THE 13-WEEK CASH FLOW PLAN — his sheet, fed from the books
 * ------------------------------------------------------------------ */

interface PlanHead { key: string; label: string; src: string }
interface PlanData {
  today: string; start: string; end: string;
  weeks: { i: number; from: string; to: string; wno: number }[];
  opening: { amount: number; from: "books" | "stated"; books: number; note: string | null; asAt: string; lastUpload: string | null };
  heads: { in: PlanHead[]; out: PlanHead[] };
  rows: Record<string, number[]>; totals: Record<string, number>;
  inflow: number[]; outflow: number[]; net: number[]; openings: number[]; closings: number[];
  fwdVouchers: number; notes: string[];
  track: { billingYtd: number; collectionYtd: number; orderInHand: number; bookingYtd: number; fyStart: string };
}

/**
 * Dr Raghu, 30 Sep 2026 — the twelve heads of his own sheet, in his order,
 * each fed from the one place it actually lives (the API says which, and the
 * screen prints it under every row). Weeks run Sunday to Saturday like his
 * W40. The opening is the bank and cash at the start of that Sunday, from
 * the books, unless somebody has stated it because the books are staler
 * than the plan — and then the screen says whose figure it is.
 *
 * NOTHING ON THIS SCREEN IS TYPED. What can be typed lives in Payment
 * Planning, and the plan reads it.
 */
export function CashPlanScreen({ go }: { go: (key: string) => void }) {
  const [data, reload] = useBooks<PlanData>("cashplan");
  const { num, label, fmt: fmtMoney } = useMoneyFmt();
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState("");
  if (!data) return <div className="text-sm" style={{ color: MUTED }}>Reading the books…</div>;
  const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const cell = (v: number, tone?: string) =>
    Math.abs(v) >= 0.5 ? <span className="tnum" style={{ color: tone || INK }}>{num(v)}</span> : <span style={{ color: "#D5D2C8" }}>·</span>;
  const stateOpening = async (clear = false) => {
    await fetch("/api/kuber/books", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cash_opening", on_date: data.start, amount: clear ? null : Number(draft.replace(/,/g, "")) || 0 }),
    });
    setEditOpen(false); reload();
  };
  const L = 236;                                   // the sticky first column
  const Th = ({ children, right, bg }: { children: React.ReactNode; right?: boolean; bg?: string }) => (
    <th className={`px-2 py-1 text-${right ? "right" : "left"} whitespace-nowrap`} style={{ background: bg || "var(--ink)", color: "#fff" }}>{children}</th>
  );
  const Row = ({ label, vals, total, bold, bg, color, src, sign }: {
    label: string; vals: number[]; total: number; bold?: boolean; bg?: string; color?: string; src?: string; sign?: 1 | -1;
  }) => (
    <tr className="border-t" style={{ borderColor: "var(--line-soft)", background: bg || "#fff" }}>
      <td className="px-2 py-1" style={{ position: "sticky", left: 0, background: bg || "#fff", minWidth: L, fontWeight: bold ? 800 : 600, color: color || INK }}>
        {label}
        {src && <div style={{ fontWeight: 400, fontSize: 10, color: MUTED, lineHeight: 1.3 }}>{src}</div>}
      </td>
      <td className="px-2 py-1 text-right tnum" style={{ background: "#F3F1EB", fontWeight: bold ? 800 : 700, color: color || INK, whiteSpace: "nowrap" }}>{cell(total, color)}</td>
      {vals.map((v, i) => (
        <td key={i} className="px-2 py-1 text-right" style={{ whiteSpace: "nowrap", fontWeight: bold ? 800 : 400 }}>
          {cell(v, sign === -1 && v ? RED : color)}
        </td>
      ))}
    </tr>
  );
  const sum = (a: number[]) => a.reduce((s2, v) => s2 + v, 0);

  return (
    <div style={{ maxWidth: 1400 }}>
      <div className="flex items-baseline gap-3 mb-1 flex-wrap">
        <div className="text-lg font-bold" style={{ color: INK }}>13-Week Cash Flow Plan</div>
        <span className="text-xs font-bold" style={{ color: "#7A5E1E", letterSpacing: 0.5 }}>SALES IS VANITY · PROFIT IS SANITY · CASH FLOW IS KING</span>
        <button onClick={reload} title="Read the books again" className="rounded border font-bold ml-auto"
          style={{ borderColor: BORDER, background: "#fff", color: INK, padding: "2px 8px", fontSize: 13 }}>&#8635;</button>
      </div>
      <div className="text-xs mb-2" style={{ color: MUTED, lineHeight: 1.55, maxWidth: 900 }}>
        Figures in <b>{label}</b>. {dm(data.start)} → {dm(data.end)}, weeks Sunday to Saturday. Every head says under its name where it is read from.
        What can be typed lives in <button onClick={() => go("payplan")} className="font-bold" style={{ color: "var(--blue)" }}>Payment Planning</button>;
        the outflows come from Tally dated ahead.
        {data.opening.lastUpload && <> Books as at <b>{fmtD(data.opening.lastUpload)}</b>.</>}
      </div>

      {data.notes.map((n, i) => (
        <div key={i} className="rounded px-3 py-2 text-xs mb-2" style={{ background: "#FBF3E4", color: "#8A6D3B", border: "1px solid #EED9B0" }}>{n}</div>
      ))}

      <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER }}>
        <table className="text-xs genie-table" style={{ minWidth: 1360, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              <Th>{" "}</Th><Th right bg="#3D4A5C">13 wk</Th>
              {data.weeks.map((w) => <Th key={w.i} right>{w.i}</Th>)}
            </tr>
            <tr>
              <th className="px-2 py-1 text-left" style={{ position: "sticky", left: 0, background: "var(--ink)", color: "#fff", minWidth: L }}>{label}</th>
              <Th right bg="#3D4A5C">total</Th>
              {data.weeks.map((w) => <Th key={w.i} right>W {w.wno}</Th>)}
            </tr>
            <tr style={{ background: "#F3F1EB" }}>
              <td className="px-2 py-0.5 text-left" style={{ position: "sticky", left: 0, background: "#F3F1EB", color: MUTED }}>from</td><td style={{ background: "#F3F1EB" }} />
              {data.weeks.map((w) => <td key={w.i} className="px-2 py-0.5 text-right tnum whitespace-nowrap" style={{ color: MUTED, fontSize: 10 }}>{dm(w.from)}</td>)}
            </tr>
            <tr style={{ background: "#F3F1EB" }}>
              <td className="px-2 py-0.5 text-left" style={{ position: "sticky", left: 0, background: "#F3F1EB", color: MUTED }}>to</td><td style={{ background: "#F3F1EB" }} />
              {data.weeks.map((w) => <td key={w.i} className="px-2 py-0.5 text-right tnum whitespace-nowrap" style={{ color: MUTED, fontSize: 10 }}>{dm(w.to)}</td>)}
            </tr>
          </thead>
          <tbody>
            {/* OPENING — whose figure, said plainly */}
            <tr className="border-t" style={{ borderColor: "var(--ink)", background: "#FFF8E6" }}>
              <td className="px-2 py-1.5 font-bold" style={{ position: "sticky", left: 0, background: "#FFF8E6", color: INK, minWidth: L }}>
                Opening Balance
                <div style={{ fontWeight: 400, fontSize: 10, color: MUTED, lineHeight: 1.3 }}>
                  {data.opening.from === "stated"
                    ? <>stated for {dm(data.start)}{data.opening.note ? ` — ${data.opening.note}` : ""} · books said {num(data.opening.books)}</>
                    : <>bank + cash at close of {dm(data.opening.asAt)}, from the books</>}
                  {" · "}
                  {editOpen ? (
                    <span>
                      <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="₹ as stated" className="border rounded px-1 tnum" style={{ borderColor: BORDER, width: 110, fontSize: 11 }} />
                      {" "}<button onClick={() => void stateOpening()} className="font-bold" style={{ color: GREEN }}>save</button>
                      {" · "}<button onClick={() => void stateOpening(true)} style={{ color: MUTED }}>back to the books</button>
                      {" · "}<button onClick={() => setEditOpen(false)} style={{ color: MUTED }}>cancel</button>
                    </span>
                  ) : <button onClick={() => { setDraft(String(Math.round(data.opening.amount))); setEditOpen(true); }} className="font-bold" style={{ color: "var(--blue)" }}>state it</button>}
                </div>
              </td>
              <td style={{ background: "#F3F1EB" }} />
              {data.openings.map((v, i) => <td key={i} className="px-2 py-1.5 text-right tnum font-bold" style={{ color: v < 0 ? RED : INK, whiteSpace: "nowrap" }}>{num(v)}</td>)}
            </tr>

            <Row label="INFLOW" vals={data.inflow} total={sum(data.inflow)} bold bg="#E6F4EA" color="#0D7A3F" />
            {data.heads.in.map((h) => <Row key={h.key} label={h.label} vals={data.rows[h.key]} total={data.totals[h.key]} src={h.src} sign={1} />)}

            <Row label="OUTFLOW" vals={data.outflow} total={sum(data.outflow)} bold bg="#FFF3E8" color="#8A5B00" />
            {data.heads.out.map((h) => <Row key={h.key} label={h.label} vals={data.rows[h.key]} total={data.totals[h.key]} src={h.src} sign={-1} />)}

            <tr className="border-t" style={{ borderColor: "var(--ink)", background: "#1B3A5C" }}>
              <td className="px-2 py-1.5 font-bold text-white" style={{ position: "sticky", left: 0, background: "#1B3A5C", minWidth: L }}>Closing Balance (cum)</td>
              <td style={{ background: "#1B3A5C" }} />
              {data.closings.map((v, i) => <td key={i} className="px-2 py-1.5 text-right tnum font-bold" style={{ color: v < 0 ? "#FFB4A8" : "#fff", whiteSpace: "nowrap" }}>{num(v)}</td>)}
            </tr>
            <Row label="Net cash generation" vals={data.net} total={sum(data.net)} bold bg="#F7F5EF" />

            {/* the memo — a question, not a decision */}
            <tr className="border-t" style={{ borderColor: "var(--line-soft)", background: "#FAF9F5" }}>
              <td className="px-2 py-1" style={{ position: "sticky", left: 0, background: "#FAF9F5", minWidth: L, color: "#B45309", fontStyle: "italic", fontWeight: 600 }}>
                memo · supplier bills falling due, not yet planned
                <div style={{ fontWeight: 400, fontSize: 10, color: MUTED, lineHeight: 1.3, fontStyle: "normal" }}>outside the totals — tick them into the plan on Payment Planning › Supplier Bills</div>
              </td>
              <td className="px-2 py-1 text-right tnum" style={{ background: "#F3F1EB", color: "#B45309", fontStyle: "italic" }}>{cell(data.totals.memo_unplanned, "#B45309")}</td>
              {data.rows.memo_unplanned.map((v, i) => <td key={i} className="px-2 py-1 text-right" style={{ fontStyle: "italic" }}>{cell(v, "#B45309")}</td>)}
            </tr>
          </tbody>
        </table>
      </div>

      {/* TRACK RECORD — the four figures his sheet keeps under the plan */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
        <Card label="BOOKING YTD" value={fmtMoney(data.track.bookingYtd)} sub={`jobs opened since ${fmtD(data.track.fyStart)}`} color={INK} />
        <Card label="BILLING YTD" value={fmtMoney(data.track.billingYtd)} sub="GST Sales invoices, proformas excluded" color={GREEN} />
        <Card label="COLLECTION YTD" value={fmtMoney(data.track.collectionYtd)} sub="receipts landing on customer accounts" color="var(--blue)" />
        <Card label="ORDER IN HAND" value={fmtMoney(data.track.orderInHand)} sub="live jobs not yet delivered, ex-GST" color={INK} />
      </div>
      <p className="text-xs mt-2" style={{ color: MUTED, maxWidth: "90ch", lineHeight: 1.6 }}>
        <b>Collection from Order Execution</b> takes each live job&apos;s value plus GST, less the advance already in, and splits the balance by the
        Jobmaster&apos;s own terms — the % on delivery from the TDD, then +30, +60, +90 days. Where a job carries no terms it is read as
        100% on delivery and counted in the note under the row. <b>Follow Up Payment</b> is every open bill on the date somebody
        has said it will come (set on Bills Receivable), else its due date; anything already past sits in week 1.
        The five Tally outflows read forward-dated Payment and Journal vouchers by the debit side&apos;s ledger.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  PAYMENT PLANNING — the hub the plan reads from
 * ------------------------------------------------------------------ */

type ExpectedRow = { id: string; kind: string; party: string | null; amount: number; expected_on: string; confidence: string | null; note: string | null; received: boolean; received_on: string | null };
type PlanRow = { id: string; plan_date: string; party: string; amount: number; purpose: string | null; bill_ref: string | null; status: string; paid_on: string | null; note: string | null };

/**
 * Dr Raghu, 30 Sep 2026: "below the main buttons and where we will also show
 * the cash flow plan summary week wise, show tabs: Supplier Bills · Advance
 * Payments · Other Incomes · Other Payments · Payment Request."
 *
 * Everything the 13-week plan can read from a person is entered here, and
 * the strip at the top is the plan itself, so the effect of an entry is seen
 * on the same screen that took it.
 */
export function PaymentHub() {
  const [tab, setTab] = useState<"bills" | "advance" | "income" | "other" | "request" | "all">("bills");
  const [plan, reloadPlan] = useBooks<PlanData>("cashplan");
  const { num, label, fmt: fmtMoney } = useMoneyFmt();
  const bump = () => { reloadPlan(); };
  const TABS: [typeof tab, string][] = [
    ["bills", "Supplier Bills"], ["advance", "Advance Payments"], ["income", "Other Incomes"],
    ["other", "Other Payments"], ["request", "Payment Request"], ["all", "All planned"],
  ];
  return (
    <div style={{ maxWidth: 1400 }}>
      <div className="flex items-end justify-between gap-3 mb-2 flex-wrap">
        <div>
          <div className="text-lg font-bold" style={{ color: INK }}>Payment Planning</div>
          <div className="text-sm" style={{ color: "var(--dim)", maxWidth: 760 }}>
            What WILL be paid and when, and what is expected in. The strip below is the 13-week plan reading this screen — an entry here moves it.
          </div>
        </div>
      </div>

      {/* THE PLAN, WEEK-WISE, AS A STRIP */}
      {plan && (
        <div className="bg-white rounded-lg border overflow-auto mb-3" style={{ borderColor: BORDER }}>
          <table className="text-xs genie-table" style={{ minWidth: 1200, borderCollapse: "separate", borderSpacing: 0 }}>
            <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
              <th className="px-2 py-1 text-left" style={{ position: "sticky", left: 0, background: "var(--ink)", minWidth: 150 }}>{label}</th>
              {plan.weeks.map((w) => <th key={w.i} className="px-2 py-1 text-right whitespace-nowrap">W {w.wno}<div style={{ fontWeight: 400, fontSize: 9, color: "#8FA1B3" }}>{w.from.slice(8, 10)}/{w.from.slice(5, 7)}</div></th>)}
            </tr></thead>
            <tbody>
              {([["Opening", plan.openings, INK], ["Inflow", plan.inflow, "#0D7A3F"], ["Outflow", plan.outflow, "#8A5B00"], ["Closing", plan.closings, "var(--blue)"]] as [string, number[], string][]).map(([l, vals, c]) => (
                <tr key={l} className="border-t" style={{ borderColor: "var(--line-soft)" }}>
                  <td className="px-2 py-1 font-bold" style={{ position: "sticky", left: 0, background: "#fff", color: c }}>{l}</td>
                  {vals.map((v, i) => <td key={i} className="px-2 py-1 text-right tnum" style={{ color: v < 0 ? RED : c, fontWeight: l === "Closing" ? 700 : 400 }}>{Math.abs(v) >= 0.5 ? num(v) : "·"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-1 mb-3 flex-wrap">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="rounded px-3 py-1.5 text-sm font-bold"
            style={tab === k ? { background: "var(--ink)", color: "#fff" } : { color: MUTED, background: "#fff", border: `1px solid ${BORDER}` }}>{l}</button>
        ))}
      </div>

      {tab === "bills" && <SupplierBillsTab onChanged={bump} />}
      {tab === "advance" && <ExpectedTab kinds={["advance"]} title="Advances expected from customers" onChanged={bump} />}
      {tab === "income" && <ExpectedTab kinds={["bank_loan", "other_income"]} title="Bank loans and other inflows expected" onChanged={bump} />}
      {tab === "other" && <PlanTab filter={(r) => /^other/i.test(r.purpose || "")} title="Other payments — not a supplier bill" addPurpose="Other" onChanged={bump} />}
      {tab === "request" && <PlanTab filter={(r) => r.status === "planned"} title="Payment requests awaiting approval" approve onChanged={bump} />}
      {tab === "all" && <RegisterScreen kind="payplan" />}
      <p className="text-xs mt-3" style={{ color: MUTED }}>{fmtMoney(0).replace(/[\d.,]+/, "")}figures in {label} — change it at the top of Kuber.</p>
    </div>
  );
}

/** the payable bills, ticked into the plan on a date */
function SupplierBillsTab({ onChanged }: { onChanged: () => void }) {
  const [data, reload] = useBooks<BillsData>("billsdue", "&kind=payable");
  const { fmt: fmtMoney } = useMoneyFmt();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [on, setOn] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  if (!data) return <div className="text-sm" style={{ color: MUTED }}>reading the bills…</div>;
  const needle = q.trim().toLowerCase();
  const rows = data.rows.filter((r) => !needle || r.party.toLowerCase().includes(needle) || r.bill.toLowerCase().includes(needle)).slice(0, 800);
  const key = (r: BillRow) => `${r.party}|${r.bill}`;
  const toggle = (k: string) => setSel((s2) => { const n = new Set(s2); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const allOn = rows.length > 0 && rows.every((r) => sel.has(key(r)));
  const picked = rows.filter((r) => sel.has(key(r)));
  const plan = async () => {
    if (!on || !picked.length) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/kuber/books", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "plan_bills", plan_date: on, bills: picked.map((b) => ({ party: b.party, bill: b.bill, amount: b.amount })) }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "could not plan");
      setMsg(`${j.planned} planned for ${fmtD(on)}${j.alreadyPlanned ? ` · ${j.alreadyPlanned} already in the plan` : ""}`);
      setSel(new Set()); reload(); onChanged();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="supplier · bill…" className="border rounded px-2 py-1.5 text-sm" style={{ borderColor: BORDER, width: 220 }} />
        <span className="text-xs" style={{ color: MUTED }}>{data.count} open bills · {fmtMoney(data.total)} — tick, pick a day, plan</span>
        <div className="flex items-center gap-2 ml-auto">
          <b className="text-xs" style={{ color: INK }}>{picked.length} ticked · {fmtMoney(picked.reduce((s2, r) => s2 + r.amount, 0))}</b>
          <input type="date" value={on} onChange={(e) => setOn(e.target.value)} className="border rounded px-2 py-1 text-xs" style={{ borderColor: BORDER }} />
          <button onClick={() => void plan()} disabled={busy || !on || !picked.length} className="rounded px-3 py-1.5 text-xs font-bold"
            style={{ background: on && picked.length ? ORANGE : "#D5D2C9", color: "#fff" }}>{busy ? "…" : "Plan to pay"}</button>
        </div>
      </div>
      {msg && <div className="text-xs mb-2" style={{ color: "#0D7A3F" }}>{msg}</div>}
      <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxHeight: "52vh" }}>
        <table className="w-full text-xs genie-table" style={{ minWidth: 820, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
            <th className="px-2 py-2" style={{ width: 30 }}><input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(rows.map(key)))} /></th>
            <th className="px-2 py-2 text-left">Supplier</th><th className="px-2 py-2 text-left">Bill</th>
            <th className="px-2 py-2 text-left">Bill date</th><th className="px-2 py-2 text-left">Due</th>
            <th className="px-2 py-2 text-right">Overdue</th><th className="px-2 py-2 text-right">Amount</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const k = key(r);
              return (
                <tr key={k} className="border-t" style={{ borderColor: "var(--line-soft)", background: sel.has(k) ? "#EEF1FA" : i % 2 ? "#FAF9F5" : "#fff" }}>
                  <td className="px-2 py-1"><input type="checkbox" checked={sel.has(k)} onChange={() => toggle(k)} /></td>
                  <td className="px-2 py-1 font-semibold" style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.party}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{r.bill}</td>
                  <td className="px-2 py-1 tnum whitespace-nowrap">{fmtD(r.bill_date)}</td>
                  <td className="px-2 py-1 tnum whitespace-nowrap" style={{ color: MUTED }}>{fmtD(r.due_date)}</td>
                  <td className="px-2 py-1 text-right tnum" style={{ color: r.overdue > 90 ? RED : r.overdue > 0 ? "#B45309" : MUTED }}>{r.overdue > 0 ? `${r.overdue}d` : "—"}</td>
                  <td className="px-2 py-1 text-right tnum font-bold">{fmtMoney(r.amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** expected inflows of one or two kinds — a small register with its own add row */
function ExpectedTab({ kinds, title, onChanged }: { kinds: string[]; title: string; onChanged: () => void }) {
  const [rows, setRows] = useState<ExpectedRow[] | null>(null);
  const { fmt: fmtMoney } = useMoneyFmt();
  const [f, setF] = useState({ kind: kinds[0], party: "", amount: "", expected_on: "", note: "" });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    fetch("/api/kuber/register?kind=cashexp", { cache: "no-store" }).then((r) => r.json())
      .then((j: { rows?: ExpectedRow[] }) => setRows((j.rows || []).filter((r) => kinds.includes(r.kind)))).catch(() => setRows([]));
  }, [kinds]);
  useEffect(load, [load]);
  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    try { await fetch("/api/kuber/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "cashexp", ...body }) }); load(); onChanged(); }
    finally { setBusy(false); }
  };
  const add = async () => {
    if (!f.amount || !f.expected_on) return;
    await post({ action: "add", row: { kind: f.kind, party: f.party, amount: Number(f.amount.replace(/,/g, "")) || 0, expected_on: f.expected_on, confidence: "likely", note: f.note, received: false } });
    setF({ kind: kinds[0], party: "", amount: "", expected_on: "", note: "" });
  };
  const KIND_WORDS: Record<string, string> = { advance: "Advance from customer", bank_loan: "Bank loan", other_income: "Other inflow" };
  const box = { borderColor: BORDER } as React.CSSProperties;
  return (
    <div>
      <div className="text-sm font-bold mb-1" style={{ color: INK }}>{title}</div>
      <div className="rounded p-2 mb-2 flex items-end gap-2 flex-wrap" style={{ background: "#F7F5EF", border: `1px solid ${BORDER}` }}>
        {kinds.length > 1 && (
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className="border rounded px-2 py-1 text-xs" style={box}>
            {kinds.map((k) => <option key={k} value={k}>{KIND_WORDS[k] || k}</option>)}
          </select>
        )}
        <input value={f.party} onChange={(e) => setF({ ...f, party: e.target.value })} placeholder={f.kind === "advance" ? "customer" : "from whom"} className="border rounded px-2 py-1 text-xs" style={{ ...box, width: 200 }} />
        <input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="₹" className="border rounded px-2 py-1 text-xs tnum" style={{ ...box, width: 120 }} />
        <input type="date" value={f.expected_on} onChange={(e) => setF({ ...f, expected_on: e.target.value })} className="border rounded px-2 py-1 text-xs" style={box} />
        <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="note" className="border rounded px-2 py-1 text-xs" style={{ ...box, width: 220 }} />
        <button onClick={() => void add()} disabled={busy || !f.amount || !f.expected_on} className="rounded px-3 py-1.5 text-xs font-bold" style={{ background: f.amount && f.expected_on ? ORANGE : "#D5D2C9", color: "#fff" }}>+ Add</button>
      </div>
      <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER }}>
        <table className="w-full text-xs genie-table" style={{ minWidth: 720, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
            <th className="px-2 py-2 text-left">Expected on</th>{kinds.length > 1 && <th className="px-2 py-2 text-left">Kind</th>}
            <th className="px-2 py-2 text-left">From</th><th className="px-2 py-2 text-left">Note</th>
            <th className="px-2 py-2 text-right">Amount</th><th className="px-2 py-2 text-left">Received</th><th />
          </tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={7} className="px-3 py-3" style={{ color: MUTED }}>reading…</td></tr>}
            {rows !== null && !rows.length && <tr><td colSpan={7} className="px-3 py-3" style={{ color: MUTED }}>Nothing expected yet — the first entry starts it.</td></tr>}
            {(rows || []).map((r, i) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--line-soft)", background: r.received ? "#F2F2EE" : i % 2 ? "#FAF9F5" : "#fff", color: r.received ? MUTED : INK }}>
                <td className="px-2 py-1 tnum whitespace-nowrap">{fmtD(r.expected_on)}</td>
                {kinds.length > 1 && <td className="px-2 py-1">{KIND_WORDS[r.kind] || r.kind}</td>}
                <td className="px-2 py-1 font-semibold">{r.party || "—"}</td>
                <td className="px-2 py-1" style={{ color: MUTED }}>{r.note || ""}</td>
                <td className="px-2 py-1 text-right tnum font-bold">{fmtMoney(r.amount)}</td>
                <td className="px-2 py-1">
                  <button onClick={() => void post({ action: "update", id: r.id, row: { received: !r.received, received_on: r.received ? null : new Date().toISOString().slice(0, 10) } })}
                    className="rounded px-2 py-0.5 text-xs font-bold" style={r.received ? { background: "#E6F4EA", color: "#0D7A3F" } : { border: `1px solid ${BORDER}`, background: "#fff", color: MUTED }}>
                    {r.received ? `✓ ${fmtD(r.received_on)}` : "mark received"}
                  </button>
                </td>
                <td className="px-2 py-1 text-right"><button onClick={() => { if (confirm("Remove this entry?")) void post({ action: "delete", id: r.id }); }} style={{ color: MUTED }}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** a filtered view of the payment plan — other payments, or the requests awaiting approval */
function PlanTab({ filter, title, addPurpose, approve, onChanged }: {
  filter: (r: PlanRow) => boolean; title: string; addPurpose?: string; approve?: boolean; onChanged: () => void;
}) {
  const [rows, setRows] = useState<PlanRow[] | null>(null);
  const { fmt: fmtMoney } = useMoneyFmt();
  const [f, setF] = useState({ party: "", amount: "", plan_date: "", note: "" });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    fetch("/api/kuber/register?kind=payplan", { cache: "no-store" }).then((r) => r.json())
      .then((j: { rows?: PlanRow[] }) => setRows((j.rows || []).filter(filter))).catch(() => setRows([]));
  }, [filter]);
  useEffect(load, [load]);
  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    try { await fetch("/api/kuber/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "payplan", ...body }) }); load(); onChanged(); }
    finally { setBusy(false); }
  };
  const box = { borderColor: BORDER } as React.CSSProperties;
  const tone: Record<string, { bg: string; fg: string }> = { planned: { bg: "#FFF3E8", fg: "#8A5B00" }, approved: { bg: "#E6F4EA", fg: "#0D7A3F" }, paid: { bg: "#EDF2F7", fg: "#46545F" }, dropped: { bg: "#F2F2EE", fg: "#8A8A8A" } };
  return (
    <div>
      <div className="text-sm font-bold mb-1" style={{ color: INK }}>{title}</div>
      {addPurpose && (
        <div className="rounded p-2 mb-2 flex items-end gap-2 flex-wrap" style={{ background: "#F7F5EF", border: `1px solid ${BORDER}` }}>
          <input value={f.party} onChange={(e) => setF({ ...f, party: e.target.value })} placeholder="to whom" className="border rounded px-2 py-1 text-xs" style={{ ...box, width: 200 }} />
          <input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="₹" className="border rounded px-2 py-1 text-xs tnum" style={{ ...box, width: 120 }} />
          <input type="date" value={f.plan_date} onChange={(e) => setF({ ...f, plan_date: e.target.value })} className="border rounded px-2 py-1 text-xs" style={box} />
          <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="what for" className="border rounded px-2 py-1 text-xs" style={{ ...box, width: 240 }} />
          <button onClick={() => { if (f.amount && f.plan_date) { void post({ action: "add", row: { party: f.party, amount: Number(f.amount.replace(/,/g, "")) || 0, plan_date: f.plan_date, purpose: addPurpose, bill_ref: "", status: "planned", note: f.note } }); setF({ party: "", amount: "", plan_date: "", note: "" }); } }}
            disabled={busy || !f.amount || !f.plan_date} className="rounded px-3 py-1.5 text-xs font-bold" style={{ background: f.amount && f.plan_date ? ORANGE : "#D5D2C9", color: "#fff" }}>+ Add</button>
        </div>
      )}
      <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER }}>
        <table className="w-full text-xs genie-table" style={{ minWidth: 760, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead><tr style={{ background: "var(--ink)", color: "#fff" }}>
            <th className="px-2 py-2 text-left">Pay on</th><th className="px-2 py-2 text-left">Party</th><th className="px-2 py-2 text-left">Purpose</th>
            <th className="px-2 py-2 text-left">Bill ref</th><th className="px-2 py-2 text-right">Amount</th><th className="px-2 py-2 text-left">Status</th>{approve && <th />}
          </tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={7} className="px-3 py-3" style={{ color: MUTED }}>reading…</td></tr>}
            {rows !== null && !rows.length && <tr><td colSpan={7} className="px-3 py-3" style={{ color: MUTED }}>Nothing here.</td></tr>}
            {(rows || []).map((r, i) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                <td className="px-2 py-1 tnum whitespace-nowrap">{fmtD(r.plan_date)}</td>
                <td className="px-2 py-1 font-semibold">{r.party}</td>
                <td className="px-2 py-1" style={{ color: MUTED }}>{r.purpose || ""}{r.note ? ` · ${r.note}` : ""}</td>
                <td className="px-2 py-1 whitespace-nowrap" style={{ color: MUTED }}>{r.bill_ref || "—"}</td>
                <td className="px-2 py-1 text-right tnum font-bold">{fmtMoney(r.amount)}</td>
                <td className="px-2 py-1"><b className="rounded px-1.5 py-0.5" style={{ fontSize: 11, ...(tone[r.status] || tone.planned) }}>{r.status}</b></td>
                {approve && (
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    <button onClick={() => void post({ action: "update", id: r.id, row: { status: "approved" } })} disabled={busy} className="rounded px-2 py-0.5 text-xs font-bold mr-1" style={{ background: GREEN, color: "#fff" }}>approve</button>
                    <button onClick={() => void post({ action: "update", id: r.id, row: { status: "dropped" } })} disabled={busy} className="rounded px-2 py-0.5 text-xs font-bold" style={{ border: `1px solid ${BORDER}`, background: "#fff", color: MUTED }}>drop</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


/**
 * THE CFO MONTHLY REPORT — pick the month, make it, keep it.
 *
 * Dr Raghu, 30 Sep 2026: "On clicking have For Month, then make the statement
 * like this for that month. All based on tally data and the data that's
 * within the Genie. Idea is to see whether just uploading the XML shall be
 * enough for this."
 *
 * Twelve A4 pages from the books, page-numbered, the same month a year back
 * beside every figure, and a last page that says what the XML could not
 * supply. "Preview" draws it from the books as they stand; "Make and keep"
 * freezes the data so the report can be referred back to.
 */
function CfoMonthly() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const lastMonth = (() => { const t = new Date(today + "T00:00:00Z"); t.setUTCDate(0); return t.toISOString().slice(0, 7); })();
  const [month, setMonth] = useState(lastMonth);
  const [rows, setRows] = useState<{ id: string; month: string; fy: string; title: string; by: string; at: string }[] | null>(null);
  const [installed, setInstalled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => {
    fetch("/api/cfo-report", { cache: "no-store" }).then((r) => r.json())
      .then((j) => { setRows(j.rows || []); setInstalled(j.installed !== false); }).catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);
  const make = async () => {
    setBusy(true); setMsg("Reading the books — twelve pages take a moment…");
    try {
      const r = await fetch("/api/cfo-report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ month }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "the report could not be built");
      setMsg(""); load();
      window.open(`/cfo-report/print?id=${encodeURIComponent(j.id)}`, "_blank");
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const months: string[] = [];
  for (let i = 0; i < 24; i++) { const t = new Date(today + "T00:00:00Z"); t.setUTCDate(1); t.setUTCMonth(t.getUTCMonth() - i); months.push(t.toISOString().slice(0, 7)); }
  const ml = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  return (
    <div>
      <div className="mb-3">
        <div className="text-lg font-bold" style={{ color: INK }}>CFO Monthly Report</div>
        <div className="text-sm" style={{ color: "var(--dim)", maxWidth: 720 }}>
          The May report&apos;s sixteen tabs, drawn from the books for any month: summary, the detailed P&amp;L with the same month
          last year beside it, a depreciation schedule struck monthly, twelve months across, variance, balance sheet, receipts
          and payments, both ageings, inventory, the working-capital cycle, loans against their statements — and a last page
          that says what the XML could not supply.
        </div>
      </div>
      <div className="rounded p-3 mb-3 flex items-center gap-2 flex-wrap" style={{ background: "#F7F5EF", border: `1px solid ${BORDER}` }}>
        <span className="text-xs font-bold" style={{ color: MUTED }}>FOR MONTH</span>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="border rounded px-2 py-1.5 text-sm font-semibold" style={{ borderColor: BORDER, background: "#fff" }}>
          {months.map((m) => <option key={m} value={m}>{ml(m)}</option>)}
        </select>
        <button onClick={make} disabled={busy || !installed} className="rounded px-3 py-2 text-sm font-bold text-white" style={{ background: busy ? MUTED : "var(--blue)" }}>
          {busy ? "Building…" : "📄 Make and keep"}
        </button>
        <a href={`/cfo-report/print?month=${month}`} target="_blank" rel="noreferrer" className="text-sm font-bold" style={{ color: "var(--blue)" }}>preview without keeping →</a>
        {!installed && <span className="text-xs" style={{ color: "#B45309" }}>Run migration 0186 first — the archive has nowhere to live yet.</span>}
      </div>
      {!!msg && <div className="text-xs rounded px-2.5 py-2 mb-3" style={{ background: "#FDF8EC", color: "#7A5B00" }}>{msg}</div>}
      <div className="bg-white rounded-lg border" style={{ borderColor: BORDER }}>
        <div className="px-3 py-2 text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.8 }}>ARCHIVE — what was actually given, frozen</div>
        {rows === null && <div className="px-3 py-3 text-xs" style={{ color: MUTED }}>reading…</div>}
        {rows !== null && !rows.length && <div className="px-3 py-3 text-xs" style={{ color: MUTED }}>Nothing kept yet — the first report starts the archive.</div>}
        {(rows || []).map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-3 py-2 border-t text-sm" style={{ borderColor: "var(--line-soft)" }}>
            <a href={`/cfo-report/print?id=${encodeURIComponent(r.id)}`} target="_blank" rel="noreferrer" className="font-bold" style={{ color: "var(--blue)" }}>{r.title}</a>
            <span className="text-xs ml-auto" style={{ color: MUTED }}>
              {new Date(r.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {String(r.by || "").split("@")[0]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}


/**
 * A table of heads with their share of the side, and a pie of the same —
 * drawn by hand in SVG so the page carries no chart library. The colours
 * run from the tone (customers, suppliers) to grey (other), so the biggest
 * slice is the darkest and the eye lands on it first.
 */
function HeadPie({ title, tone, rows, total, fmtMoney }: { title: string; tone: string; rows: { head: string; amount: number; pct: number }[]; total: number; fmtMoney: (n: number) => string }) {
  const PAL = tone === GREEN ? ["#0D7A3F", "#1B6B93", "#8FA1B3"] : ["#B3392E", "#D97706", "#7C3AED", "#0E7490", "#6B7783", "#B8B5AC"];
  const R = 54, C = 60;
  let acc = 0;
  const slices = rows.filter((r) => r.amount > 0).map((r, i) => {
    const a0 = (acc / (total || 1)) * Math.PI * 2, a1 = ((acc + r.amount) / (total || 1)) * Math.PI * 2;
    acc += r.amount;
    const big = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a: number) => `${(C + R * Math.sin(a)).toFixed(2)},${(C - R * Math.cos(a)).toFixed(2)}`;
    return { d: `M${C},${C} L${p(a0)} A${R},${R} 0 ${big} 1 ${p(a1)} Z`, fill: PAL[rows.indexOf(r) % PAL.length], head: r.head };
  });
  return (
    <div className="bg-white rounded-lg border p-3 flex gap-3 items-start" style={{ borderColor: BORDER, flex: 1, minWidth: 380 }}>
      <svg viewBox="0 0 120 120" width={120} height={120} role="img" aria-label={`${title} by head`}>
        {slices.length === 1 ? <circle cx={C} cy={C} r={R} fill={slices[0].fill} /> : slices.map((s2) => <path key={s2.head} d={s2.d} fill={s2.fill}><title>{s2.head}</title></path>)}
        <circle cx={C} cy={C} r={26} fill="#fff" />
        <text x={C} y={C + 4} textAnchor="middle" fontSize={9} fontWeight={800} fill={tone}>{title}</text>
      </svg>
      <table className="text-xs" style={{ flex: 1, borderCollapse: "collapse" }}>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.head} className="border-t" style={{ borderColor: "var(--line-soft)" }}>
              <td className="py-1 pr-2"><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: PAL[i % PAL.length], marginRight: 6, verticalAlign: "middle" }} />{r.head}</td>
              <td className="py-1 text-right tnum font-bold" style={{ whiteSpace: "nowrap" }}>{r.amount ? fmtMoney(r.amount) : <span style={{ color: "#D5D2C8" }}>·</span>}</td>
              <td className="py-1 pl-2 text-right tnum" style={{ color: MUTED, width: 52 }}>{r.amount ? fmtPct(r.pct) : ""}</td>
            </tr>
          ))}
          <tr className="border-t" style={{ borderColor: "var(--ink)" }}>
            <td className="py-1 font-bold">{title === "RECEIVED" ? "Total received" : "Total spent"}</td>
            <td className="py-1 text-right tnum font-bold">{fmtMoney(total)}</td>
            <td className="py-1 pl-2 text-right tnum" style={{ color: MUTED }}>100%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
