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
  today: string; loadedAt: string | null;
  receivable: { total: number; overdue: number; due30: number; parties: number; unadjusted: number };
  payable: { total: number; overdue: number; due30: number; parties: number; unadjusted: number };
  bg: { count: number; amount: number; expiring: number };
  fd: { count: number; amount: number; expiring: number };
  insurance: { count: number; amount: number; expiring: number };
}
export function KuberDashboard({ go }: { go: (key: string) => void }) {
  const [s] = useBooks<Summary>("summary");
  const { fmt: fmtMoney } = useMoneyFmt();
  if (!s) return <div className="text-sm" style={{ color: MUTED }}>Reading the books…</div>;
  const stale = !s.loadedAt;
  return (
    <div style={{ maxWidth: 1050 }}>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Card label="RECEIVABLES (NET)" value={fmtMoney(s.receivable.total)} sub={`${s.receivable.parties} parties · Sundry Debtors only${s.receivable.unadjusted ? ` · ${fmtMoney(-s.receivable.unadjusted)} unadjusted inside` : ""}`} color="#1B3A5C" />
        <Card label="OF WHICH OVERDUE" value={fmtMoney(s.receivable.overdue)} color={s.receivable.overdue ? RED : GREEN} />
        <Card label="PAYABLES (NET)" value={fmtMoney(s.payable.total)} sub={`${s.payable.parties} parties · Sundry Creditors only${s.payable.unadjusted ? ` · ${fmtMoney(-s.payable.unadjusted)} unadjusted inside` : ""}`} color="#1B3A5C" />
        <Card label="OF WHICH OVERDUE" value={fmtMoney(s.payable.overdue)} color={s.payable.overdue ? "#D97706" : GREEN} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Card label="DUE IN 30 DAYS — IN" value={fmtMoney(s.receivable.due30)} color={GREEN} />
        <Card label="DUE IN 30 DAYS — OUT" value={fmtMoney(s.payable.due30)} color={RED} />
        <Card label="BGs LIVE" value={`${s.bg.count} · ${fmtMoney(s.bg.amount)}`} sub={s.bg.expiring ? `${s.bg.expiring} expiring in 60 days` : "none expiring soon"} color={s.bg.expiring ? "#D97706" : INK} />
        <Card label="FDs LIVE" value={`${s.fd.count} · ${fmtMoney(s.fd.amount)}`} sub={s.fd.expiring ? `${s.fd.expiring} maturing in 60 days` : "none maturing soon"} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card label="INSURANCE LIVE" value={`${s.insurance.count} policies`} sub={s.insurance.expiring ? `${s.insurance.expiring} expiring in 60 days` : "none expiring soon"} color={s.insurance.expiring ? "#D97706" : INK} />
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
interface AgeingParty { party: string; group: string | null; total: number; unadjusted: number; not_due: number; d0_30: number; d31_90: number; d91_180: number; d180p: number; bills: { bill: string; bill_date: string | null; due_date: string | null; amount: number }[] }
export function AgeingScreen({ kind }: { kind: "receivable" | "payable" }) {
  const [data] = useBooks<{ rows: AgeingParty[]; total: number; overdue: number; unadjusted: number; today: string }>("ageing", `&kind=${kind}`);
  const { fmt: fmtMoney } = useMoneyFmt();
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  if (!data) return <div className="text-sm" style={{ color: MUTED }}>Reading the books…</div>;
  const rows = data.rows.filter((r) => !q || r.party.toLowerCase().includes(q.toLowerCase()));
  const title = kind === "receivable" ? "Customer Receivables" : "Supplier Payables";
  return (
    <div style={{ maxWidth: 1150 }}>
      <div className="flex items-baseline gap-3 mb-2 flex-wrap">
        <div className="text-lg font-bold" style={{ color: INK }}>{title}</div>
        <span className="text-sm tnum" style={{ color: "#1B3A5C" }}>{fmtMoney(data.total)} net</span>
        <span className="text-sm tnum font-bold" style={{ color: data.overdue ? RED : GREEN }}>{fmtMoney(data.overdue)} overdue</span>
        {data.unadjusted !== 0 && (
          <span className="text-sm tnum" style={{ color: MUTED }} title="Receipts and settlements Tally could not tie to a bill — they reduce the net but age nothing">
            {fmtMoney(data.unadjusted)} unadjusted
          </span>
        )}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 party"
          className="px-2 py-1 rounded border text-sm ml-auto" style={{ borderColor: BORDER }} />
      </div>
      <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxHeight: "72vh" }}>
        <table className="w-full text-xs" style={{ minWidth: 900, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: "#22303C", color: "#fff" }}>
              {["Party", "Net", "Not due", "<30 days", "31–90", "91–180", ">180 days", "Unadjusted", ""].map((h, i) => (
                <th key={i} className={`px-2 py-2 ${i === 0 ? "text-left" : "text-right"} whitespace-nowrap`} style={{ position: "sticky", top: 0, background: "#22303C" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (<tr><td colSpan={9} className="px-3 py-5 text-center" style={{ color: MUTED }}>Nothing here — upload the Tally files first.</td></tr>)}
            {rows.map((r, i) => (
              <>
                <tr key={r.party} className="border-t" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff", cursor: "pointer" }}
                  onClick={() => setOpen(open === r.party ? null : r.party)}>
                  <td className="px-2 py-1.5 font-semibold" style={{ color: INK, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.party}>
                    {open === r.party ? "▾ " : "▸ "}{r.party}
                  </td>
                  <td className="px-2 py-1.5 text-right tnum font-bold">{fmtMoney(r.total)}</td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ color: MUTED }}>{r.not_due ? fmtMoney(r.not_due) : "·"}</td>
                  <td className="px-2 py-1.5 text-right tnum">{r.d0_30 ? fmtMoney(r.d0_30) : "·"}</td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ color: "#D97706" }}>{r.d31_90 ? fmtMoney(r.d31_90) : "·"}</td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ color: RED }}>{r.d91_180 ? fmtMoney(r.d91_180) : "·"}</td>
                  <td className="px-2 py-1.5 text-right tnum font-bold" style={{ color: RED }}>{r.d180p ? fmtMoney(r.d180p) : "·"}</td>
                  <td className="px-2 py-1.5 text-right tnum" style={{ color: "#1B6B93" }} title="Receipts/settlements not tied to a bill — they reduce the net">{r.unadjusted ? "−" + fmtMoney(-r.unadjusted) : "·"}</td>
                  <td className="px-2 py-1.5 text-right" style={{ color: MUTED }}>{r.bills.length}</td>
                </tr>
                {open === r.party && r.bills.map((b, j) => (
                  <tr key={r.party + j} style={{ background: "#F4F6F9" }}>
                    <td className="px-2 py-1 pl-7" style={{ color: "#5A6672" }}>{b.bill}</td>
                    <td className="px-2 py-1 text-right tnum" style={{ color: b.amount < 0 ? "#1B6B93" : INK }}>{b.amount < 0 ? "−" + fmtMoney(-b.amount) : fmtMoney(b.amount)}</td>
                    <td colSpan={6} className="px-2 py-1 text-right tnum" style={{ color: b.due_date && b.due_date < data.today ? RED : MUTED }}>
                      billed {fmtD(b.bill_date)} · due {fmtD(b.due_date)}
                    </td>
                    <td />
                  </tr>
                ))}
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
  if (!data) return <div className="text-sm" style={{ color: MUTED }}>Reading the books…</div>;
  const rows = data.rows.filter((r) => !q || r.party.toLowerCase().includes(q.toLowerCase()));
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
              {["Grade", "Supplier", "Outstanding", "Overdue", "Overdue %", "Weighted delay", "Oldest due", "Open bills", "Vouchers FY"].map((h, i) => (
                <th key={h} className={`px-2 py-2 ${i <= 1 ? "text-left" : "text-right"} whitespace-nowrap`} style={{ position: "sticky", top: 0, background: "#22303C" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
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
 * One supplier's own report card — the sheet's tab-B3 drilldown reborn:
 * the headline facts, the ageing, what was PAID in the last 7/30/45/90
 * days, and every open bill beneath.
 */
function SupplierCard({ party, grade, onClose }: { party: string; grade: string; onClose: () => void }) {
  const { fmt: fmtMoney } = useMoneyFmt();
  const [d, setD] = useState<{
    net: number; gross: number; unadjusted: number; overdue: number; overdue_pct: number;
    weighted_delay: number; oldest_due: string | null; credit_days: number | null;
    buckets: Record<string, number>; paid: { d7: number; d30: number; d45: number; d90: number };
    vouchers: number; today: string;
    bills: { bill: string; bill_date: string | null; due_date: string | null; amount: number }[];
  } | null>(null);
  useEffect(() => {
    fetch(`/api/kuber/books?view=supplier&party=${encodeURIComponent(party)}`, { cache: "no-store" })
      .then((r) => r.json()).then(setD).catch(() => setD(null));
  }, [party]);
  const Fact = ({ k, v, c }: { k: string; v: string; c?: string }) => (
    <div><div className="text-xs font-bold" style={{ color: MUTED }}>{k}</div><div className="text-sm font-bold tnum" style={{ color: c || INK }}>{v}</div></div>
  );
  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg w-full" style={{ maxWidth: 760, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div className="flex items-center gap-3 px-4 py-3" style={{ background: "#22303C", borderRadius: "8px 8px 0 0" }}>
          <span className="rounded px-2 py-0.5 font-bold text-white" style={{ background: gradeColor[grade] ?? MUTED }}>{grade}</span>
          <div className="font-bold text-white" style={{ fontSize: 15 }}>{party}</div>
          <button onClick={onClose} className="ml-auto" style={{ color: "#8FA1B3" }}>✕</button>
        </div>
        <div className="p-4 overflow-auto">
          {!d ? <div className="text-sm" style={{ color: MUTED }}>Reading this supplier…</div> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <Fact k="NET OUTSTANDING" v={fmtMoney(d.net)} c="#1B3A5C" />
                <Fact k="BEYOND CREDIT PERIOD" v={`${fmtMoney(d.overdue)} · ${d.overdue_pct}%`} c={d.overdue ? RED : GREEN} />
                <Fact k="WEIGHTED DELAY" v={d.weighted_delay ? `${d.weighted_delay} days` : "—"} />
                <Fact k="CREDIT PERIOD (BILLS)" v={d.credit_days != null ? `${d.credit_days} days` : "—"} />
                <Fact k="OLDEST DUE" v={fmtD(d.oldest_due)} c={d.oldest_due ? RED : INK} />
                <Fact k="UNADJUSTED" v={d.unadjusted ? "−" + fmtMoney(-d.unadjusted) : "—"} c="#1B6B93" />
                <Fact k="PAID — 30 / 90 DAYS" v={`${fmtMoney(d.paid.d30)} / ${fmtMoney(d.paid.d90)}`} c={GREEN} />
                <Fact k="VOUCHERS THIS BOOK" v={String(d.vouchers)} />
              </div>
              <div className="flex gap-2 mb-3 flex-wrap">
                {([["not_due", "Not due", MUTED], ["d0_30", "<30", INK], ["d31_90", "31–90", "#D97706"], ["d91_180", "91–180", RED], ["d180p", ">180", RED]] as const).map(([k, l, c]) => (
                  <span key={k} className="rounded border px-2 py-1 text-xs font-semibold" style={{ borderColor: BORDER, color: c }}>
                    {l}: <b className="tnum">{d.buckets[k] ? fmtMoney(d.buckets[k]) : "·"}</b>
                  </span>
                ))}
              </div>
              <table className="w-full text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                <thead><tr style={{ background: "#22303C", color: "#fff" }}>
                  {["Bill", "Billed", "Due", "Amount"].map((h, i2) => (<th key={h} className={`px-2 py-1.5 text-${i2 === 3 ? "right" : "left"}`}>{h}</th>))}
                </tr></thead>
                <tbody>
                  {d.bills.map((b, i2) => (
                    <tr key={i2} className="border-t" style={{ borderColor: "#EFEDE7", background: i2 % 2 ? "#FAF9F5" : "#fff" }}>
                      <td className="px-2 py-1">{b.bill}</td>
                      <td className="px-2 py-1 tnum">{fmtD(b.bill_date)}</td>
                      <td className="px-2 py-1 tnum" style={{ color: b.due_date && b.due_date < d.today ? RED : MUTED }}>{fmtD(b.due_date)}</td>
                      <td className="px-2 py-1 text-right tnum" style={{ color: b.amount < 0 ? "#1B6B93" : INK }}>
                        {b.amount < 0 ? "−" + fmtMoney(-b.amount) : fmtMoney(b.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
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
            {["Ledger", "Group", "Opening", "Closing"].map((h, i) => (<th key={h} className={`px-2 py-2 ${i <= 1 ? "text-left" : "text-right"}`} style={{ position: "sticky", top: 0, background: "#22303C" }}>{h}</th>))}
          </tr></thead>
          <tbody>
            {(data?.rows || []).map((l, i) => (
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
