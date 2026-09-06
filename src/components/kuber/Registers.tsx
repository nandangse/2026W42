"use client";

/**
 * The CFO registers (Dr Raghu, 28 Aug 2026) — Bank Guarantees, Fixed
 * Deposits, Insurance, Payment Planning and the manual cash-flow lines.
 * One generic screen: a dated table and an add/edit lightbox, the columns
 * lifted from the management-review sheet's own registers (B60/B61/B62/B9)
 * so nothing he tracks today loses a home.
 */

import { useCallback, useEffect, useState } from "react";
import { swallow } from "@/lib/swallow";
import { useMoneyFmt } from "./money";
import { dmy as fmtD } from "@/lib/fmt";
export { fmtD };

const INK = "#16232F", MUTED = "#8A94A0", BORDER = "#E2E0DA", ORANGE = "#E8600A";


const TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

type Field = { key: string; label: string; type: "text" | "money" | "date" | "select" | "number" | "tick"; options?: string[]; hint?: string };

/**
 * An amount typed WITH its commas (Dr Raghu, 28 Aug 2026): 460800 reads as
 * 4,60,800 while you type — lakhs-and-crores grouping, or thousands-and-
 * millions when the row says USD. The commas are clothing; the saved value
 * is the bare number.
 */
export function MoneyEntry({ value, onChange, usd }: { value: string; onChange: (v: string) => void; usd?: boolean }) {
  const dress = (raw: string) => {
    const neg = raw.trim().startsWith("-");
    const [i, dec] = raw.replace(/[^0-9.]/g, "").split(".");
    if (!i) return raw.trim() === "-" ? "-" : dec !== undefined ? `0.${dec}` : "";
    const grouped = Number(i).toLocaleString(usd ? "en-US" : "en-IN");
    return (neg ? "-" : "") + grouped + (dec !== undefined ? `.${dec}` : "");
  };
  return (
    <input
      inputMode="decimal"
      value={dress(String(value))}
      onChange={(e) => onChange(e.target.value.replace(/,/g, ""))}
      className="w-full border rounded px-2 py-1 text-sm tnum" style={{ borderColor: BORDER }}
    />
  );
}

const CONFIGS: Record<string, { title: string; blurb: string; fields: Field[]; dateKey: string; amountKey: string; warnDays?: number; statusWords?: Record<string, string> }> = {
  bounce: {
    title: "Bounced Cheques",
    blurb: "Every cheque that came back — whose, which bank, why, and where the recovery stands. A bounce forgotten is money forgiven.",
    dateKey: "date", amountKey: "amount",
    fields: [
      { key: "date", label: "Bounce date", type: "date" },
      { key: "party", label: "Party", type: "text" },
      { key: "cheque_no", label: "Cheque No", type: "text" },
      { key: "bank", label: "Bank", type: "text" },
      { key: "amount", label: "Amount", type: "money" },
      { key: "reason", label: "Reason", type: "text", hint: "insufficient funds, signature, stale…" },
      { key: "status", label: "Status", type: "select", options: ["received back", "replaced", "recovered", "legal", "written off"] },
      { key: "note", label: "Note", type: "text" },
    ],
  },
  release: {
    title: "Payments to Release",
    blurb: "The queue cleared to go out — who gets what, who approved it, and the day it leaves. The 13-week plan decides; this list executes.",
    dateKey: "release_on", amountKey: "amount",
    fields: [
      { key: "party", label: "Party", type: "text" },
      { key: "amount", label: "Amount", type: "money" },
      { key: "purpose", label: "Purpose / bill ref", type: "text" },
      { key: "approved_by", label: "Approved by", type: "text" },
      { key: "release_on", label: "Release on", type: "date" },
      { key: "status", label: "Status", type: "select", options: ["waiting", "approved", "released", "held"] },
      { key: "note", label: "Note", type: "text" },
    ],
  },
  loan: {
    title: "Banking — Loan Status",
    blurb: "Every borrowing with its sanction, outstanding, EMI and ROI — cut Dr Raghu's way: Secured–Banks (A), Secured–Others (B), Non-fund/BG (C), Unsecured (D). The status totals ARE the A/B/C/D lines; ALL is Total Debts.",
    dateKey: "upto", amountKey: "outstanding", warnDays: 60,
    fields: [
      { key: "bank", label: "Bank / NBFC", type: "text" },
      { key: "loan_ac_no", label: "Loan A/c No", type: "text" },
      { key: "ltype", label: "Type", type: "text", hint: "Working Capital CC, ECGL, UGCL, Term Loan…" },
      { key: "drawn_on", label: "Drawn on", type: "date" },
      { key: "sanctioned", label: "Sanctioned", type: "money" },
      { key: "outstanding", label: "Outstanding", type: "money" },
      { key: "emi", label: "EMI", type: "money", hint: "monthly, interest + principal" },
      { key: "roi", label: "ROI %", type: "number" },
      { key: "emi_date", label: "EMI Date", type: "text" },
      { key: "tenor_months", label: "Tenor (months)", type: "number" },
      { key: "upto", label: "Upto", type: "date" },
      { key: "security", label: "Security", type: "text", hint: "Property, FD, Buffer…" },
      { key: "status", label: "Category", type: "select", options: ["secured - bank", "secured - others", "non-fund (BG)", "unsecured", "closed"] },
      { key: "note", label: "Note", type: "text" },
    ],
  },
  bg: {
    title: "Bank Guarantees",
    blurb: "Every BG with its expiry and claim date — the register the bank's own list never shows this clearly.",
    dateKey: "expiry_date", amountKey: "amount", warnDays: 60,
    fields: [
      { key: "bg_no", label: "BG No", type: "text" },
      { key: "bank", label: "Bank", type: "text" },
      { key: "favouring", label: "Beneficiary", type: "text" },
      { key: "purpose", label: "Type / Purpose", type: "text", hint: "Performance BG, Advance BG, Security BG…" },
      { key: "amount", label: "Contract Amount", type: "money" },
      { key: "margin_amount", label: "Margin", type: "money" },
      { key: "issue_date", label: "Issued", type: "date" },
      { key: "expiry_date", label: "Valid Till", type: "date" },
      { key: "claim_expiry", label: "Claim Date", type: "date" },
      { key: "status", label: "Status", type: "select", options: ["in force", "live", "expired", "closed"] },
      { key: "note", label: "Note", type: "text" },
    ],
  },
  fd: {
    title: "Fixed Deposits",
    blurb: "Deposits with maturity and the BG each one backs — maturities feed the 13-week cash flow as inflows.",
    dateKey: "maturity_date", amountKey: "principal", warnDays: 60,
    fields: [
      { key: "fd_no", label: "FD / Account No", type: "text" },
      { key: "bank", label: "Bank", type: "text" },
      { key: "principal", label: "Deposit", type: "money" },
      { key: "rate", label: "Int Rate %", type: "number" },
      { key: "start_date", label: "Start", type: "date" },
      { key: "maturity_date", label: "Maturity", type: "date" },
      { key: "maturity_amount", label: "Maturity Value", type: "money" },
      { key: "lien_for", label: "Lien / BG No", type: "text", hint: "The BG this FD is margin for, if any" },
      { key: "status", label: "Status", type: "select", options: ["live", "matured", "closed"] },
      { key: "note", label: "Note", type: "text" },
    ],
  },
  insurance: {
    title: "Insurance",
    blurb: "Policies with their valid-till dates — a lapse discovered on claim day is the most expensive kind.",
    dateKey: "expiry_date", amountKey: "sum_insured", warnDays: 45,
    fields: [
      { key: "covering", label: "What it covers", type: "text", hint: "Turbhe Fire, Khalapur plant, vehicle…" },
      { key: "insurer", label: "Insurer", type: "text" },
      { key: "policy_no", label: "Policy No", type: "text" },
      { key: "policy_type", label: "Type", type: "text" },
      { key: "sum_insured", label: "Sum Insured", type: "money" },
      { key: "premium", label: "Premium", type: "money" },
      { key: "start_date", label: "From", type: "date" },
      { key: "expiry_date", label: "Valid Till", type: "date" },
      { key: "status", label: "Status", type: "select", options: ["live", "renewed", "lapsed", "claimed"] },
      { key: "note", label: "Agent / note", type: "text" },
    ],
  },
  payplan: {
    title: "Payment Planning",
    blurb: "The deliberate list of what WILL be paid and when. A party planned here overrides its raw bills in the cash flow — the plan is the decision.",
    dateKey: "plan_date", amountKey: "amount",
    fields: [
      { key: "plan_date", label: "Pay on", type: "date" },
      { key: "party", label: "Party", type: "text", hint: "Exactly as the ledger is named in Tally, so the books link up" },
      { key: "amount", label: "Amount", type: "money" },
      { key: "purpose", label: "Purpose", type: "text" },
      { key: "bill_ref", label: "Bill ref", type: "text" },
      { key: "status", label: "Status", type: "select", options: ["planned", "approved", "paid", "dropped"] },
      { key: "paid_on", label: "Paid on", type: "date" },
      { key: "note", label: "Note", type: "text" },
    ],
  },
  cashitem: {
    title: "Cash Flow Items",
    blurb: "The flows the bills never show — salaries, EMIs, statutory, rent. Tick weekly and a line repeats across all thirteen weeks.",
    dateKey: "date", amountKey: "amount",
    fields: [
      { key: "date", label: "Date", type: "date" },
      { key: "direction", label: "Direction", type: "select", options: ["out", "in"] },
      { key: "label", label: "What", type: "text", hint: "Salary, EMI, Statutory, Rent, PDC…" },
      { key: "amount", label: "Amount", type: "money" },
      { key: "weekly", label: "Repeats weekly", type: "tick" },
      { key: "note", label: "Note", type: "text" },
    ],
  },
};

type Row = Record<string, unknown> & { id: string };

export default function RegisterScreen({ kind }: { kind: string }) {
  const cfg = CONFIGS[kind];
  const { fmt: fmtMoney } = useMoneyFmt();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [installed, setInstalled] = useState(true);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [msg, setMsg] = useState("");
  // sort on any column; filter by status; totals ON TOP (Dr Raghu, 28 Aug
  // 2026: "I would ideally prefer all totals at the top in the Kuber
  // Module") — the strip says exactly WHICH field it totals, no assumptions,
  // and it folds away when not wanted.
  const [sortKey, setSortKey] = useState("");
  const [dir, setDir] = useState<1 | -1>(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [totalsOpen, setTotalsOpen] = useState(false);
  useEffect(() => {
    try { setTotalsOpen(localStorage.getItem(`kuber.totals.${kind}`) !== "0"); } catch (e) { swallow("kuber/Registers", e); /* fine */ }
  }, [kind]);
  const toggleTotals = () => setTotalsOpen((v) => {
    try { localStorage.setItem(`kuber.totals.${kind}`, v ? "0" : "1"); } catch (e) { swallow("kuber/Registers", e); /* fine */ }
    return !v;
  });

  const load = useCallback(() => {
    fetch(`/api/kuber/register?kind=${kind}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { setRows(j.rows || []); setInstalled(j.installed !== false); })
      .catch(() => setRows([]));
  }, [kind]);
  useEffect(() => { load(); }, [load]);

  const today = TODAY();
  const cols = cfg.fields.filter((f) => f.key !== "note").slice(0, 8);
  const statusField = cfg.fields.find((f) => f.key === "status");
  const word = (st: string) => cfg.statusWords?.[st] ?? st;
  const amountLabel = cfg.fields.find((f) => f.key === cfg.amountKey)?.label ?? cfg.amountKey;

  const shown = (rows || [])
    .filter((r) => statusFilter === "all" || String(r.status ?? "") === statusFilter);
  const sorted = (() => {
    const c = cols.find((x) => x.key === sortKey);
    if (!c) return shown;
    return [...shown].sort((a, b) => {
      const x = a[c.key], y = b[c.key];
      if (c.type === "money" || c.type === "number") return dir * ((Number(x) || 0) - (Number(y) || 0));
      return dir * String(x ?? "").localeCompare(String(y ?? ""));
    });
  })();
  const clickSort = (k: string) => {
    if (sortKey === k) { if (dir === 1) setDir(-1); else { setSortKey(""); setDir(1); } }
    else { setSortKey(k); setDir(1); }
  };
  // one total per status, of the register's own amount field — said in words
  const totals = (() => {
    if (!statusField) return [];
    const by = new Map<string, { n: number; v: number }>();
    for (const r of rows || []) {
      const st = String(r.status ?? "");
      const t = by.get(st) || { n: 0, v: 0 };
      t.n += 1; t.v += Number(r[cfg.amountKey]) || 0;
      by.set(st, t);
    }
    return (statusField.options || []).filter((st) => by.has(st)).map((st) => ({ st, ...by.get(st)! }));
  })();
  const allTotal = (rows || []).reduce((s2, r) => s2 + (Number(r[cfg.amountKey]) || 0), 0);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap" style={{ maxWidth: 980 }}>
        <div>
          <div className="text-lg font-bold" style={{ color: INK }}>{cfg.title}</div>
          <div className="text-sm" style={{ color: "#5A6672", maxWidth: 640, lineHeight: 1.5 }}>{cfg.blurb}</div>
        </div>
        <button onClick={() => setEditing("new")} className="rounded px-3 py-1.5 text-sm font-bold text-white" style={{ background: ORANGE }}>
          + Add
        </button>
      </div>
      {!installed && (
        <div className="rounded p-3 text-sm font-semibold mb-2" style={{ background: "#FCF6E8", color: "#8A6D1A", maxWidth: 980 }}>
          Run migration 0076 first — this register has nowhere to live yet.
        </div>
      )}
      {msg && <div className="text-xs font-bold mb-2" style={{ color: "#B3261E" }}>{msg}</div>}

      {/* ---- totals, ON TOP, in words — and foldable ---- */}
      {statusField && (
        <div className="mb-2" style={{ maxWidth: 1100 }}>
          <button onClick={toggleTotals} className="text-xs font-bold mb-1" style={{ color: MUTED }}>
            {totalsOpen ? "▾ totals" : "▸ totals"} — {amountLabel.toLowerCase()}, by status
          </button>
          {totalsOpen && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="bg-white rounded-lg border p-3" style={{ borderColor: BORDER }}>
                <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.8 }}>TOTAL {amountLabel.toUpperCase()} — ALL</div>
                <div className="text-lg font-bold tnum" style={{ color: INK }}>{fmtMoney(allTotal)}</div>
                <div className="text-xs" style={{ color: MUTED }}>{(rows || []).length} entries</div>
              </div>
              {totals.map((t) => (
                <div key={t.st} className="bg-white rounded-lg border p-3" style={{ borderColor: BORDER }}>
                  <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.8 }}>
                    TOTAL {amountLabel.toUpperCase()} — {word(t.st).toUpperCase()}
                  </div>
                  <div className="text-lg font-bold tnum" style={{ color: t.st === "live" || t.st === "in force" || t.st === "in effect" ? "#0D7A3F" : t.st === "expired" ? "#B3261E" : INK }}>{fmtMoney(t.v)}</div>
                  <div className="text-xs" style={{ color: MUTED }}>{t.n} entries</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- status filter ---- */}
      {statusField && (
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className="text-xs font-bold" style={{ color: MUTED }}>SHOW</span>
          <button onClick={() => setStatusFilter("all")} className="rounded-full border px-2.5 py-0.5 text-xs font-bold"
            style={statusFilter === "all" ? { background: "#22303C", color: "#fff", borderColor: "#22303C" } : { color: MUTED, borderColor: BORDER, background: "#fff" }}>
            all
          </button>
          {(statusField.options || []).map((st) => (
            <button key={st} onClick={() => setStatusFilter(st)} className="rounded-full border px-2.5 py-0.5 text-xs font-bold"
              style={statusFilter === st ? { background: "#22303C", color: "#fff", borderColor: "#22303C" } : { color: MUTED, borderColor: BORDER, background: "#fff" }}>
              {word(st)}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxWidth: 1100, maxHeight: "68vh" }}>
        <table className="w-full text-xs" style={{ minWidth: 760, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: "#22303C", color: "#fff" }}>
              {cols.map((f) => (
                <th key={f.key} className="px-2 py-2 text-left whitespace-nowrap"
                  style={{ position: "sticky", top: 0, background: "#22303C", cursor: "pointer" }}
                  onClick={() => clickSort(f.key)}
                  title="Click to sort — again to flip, a third time to clear">
                  {f.label}{sortKey === f.key ? (dir === 1 ? " ▲" : " ▼") : ""}
                </th>
              ))}
              <th className="px-2 py-2" style={{ position: "sticky", top: 0, background: "#22303C" }} />
            </tr>
          </thead>
          <tbody>
            {/* each money column's total, pinned under its heading */}
            {sorted.length > 0 && cols.some((f) => f.type === "money") && (
              <tr className="font-bold text-xs">
                {cols.map((f, i) => {
                  const cellCss = { position: "sticky" as const, top: 33, background: "#F7F5EF", zIndex: 3, borderBottom: "2px solid #22303C" };
                  if (i === 0) return <td key={f.key} className="px-2 py-1.5" style={cellCss}>TOTAL — {sorted.length} shown</td>;
                  if (f.type !== "money") return <td key={f.key} style={cellCss} />;
                  return (
                    <td key={f.key} className="px-2 py-1.5 tnum" style={cellCss}>
                      {fmtMoney(sorted.reduce((s2, r) => s2 + (Number(r[f.key]) || 0), 0))}
                    </td>
                  );
                })}
                <td style={{ position: "sticky", top: 33, background: "#F7F5EF", zIndex: 3, borderBottom: "2px solid #22303C" }} />
              </tr>
            )}
            {rows?.length === 0 && (
              <tr><td colSpan={cols.length + 1} className="px-3 py-5 text-center" style={{ color: MUTED }}>Nothing here yet — the first entry starts the register.</td></tr>
            )}
            {rows && rows.length > 0 && sorted.length === 0 && (
              <tr><td colSpan={cols.length + 1} className="px-3 py-5 text-center" style={{ color: MUTED }}>Nothing carries the status &quot;{word(statusFilter)}&quot;.</td></tr>
            )}
            {sorted.map((r, i) => {
              const d = String(r[cfg.dateKey] || "");
              const soon = cfg.warnDays != null && d && /^(live|in force|in effect)?$/.test(String(r.status ?? "")) &&
                d <= new Date(new Date(today).getTime() + cfg.warnDays * 86400000).toISOString().slice(0, 10);
              const past = d && d < today && /^(live|in force|in effect)?$/.test(String(r.status ?? ""));
              return (
                <tr key={r.id} className="border-t" style={{ borderColor: "#EFEDE7", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                  {cols.map((f) => (
                    <td key={f.key} className="px-2 py-1.5 whitespace-nowrap"
                      style={f.key === cfg.dateKey ? { color: past ? "#B3261E" : soon ? "#D97706" : INK, fontWeight: past || soon ? 700 : 400 } : { color: INK }}>
                      {f.type === "money" ? fmtMoney(r[f.key] as number)
                        : f.type === "date" ? fmtD(r[f.key] as string)
                        : f.type === "tick" ? (r[f.key] ? "every week" : "once")
                        : String(r[f.key] ?? "") || "—"}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <button onClick={() => setEditing(r)} className="font-bold" style={{ color: "#1B3A5C" }}>✎</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditBox
          cfg={cfg}
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
          onError={setMsg}
          kind={kind}
        />
      )}
    </div>
  );
}

function EditBox({ cfg, row, kind, onClose, onSaved, onError }: {
  cfg: (typeof CONFIGS)[string]; row: Row | null; kind: string;
  onClose: () => void; onSaved: () => void; onError: (m: string) => void;
}) {
  const [f, setF] = useState<Record<string, unknown>>(() => {
    const o: Record<string, unknown> = {};
    for (const fd of cfg.fields) o[fd.key] = row ? row[fd.key] ?? "" : fd.type === "select" ? fd.options![0] : fd.type === "tick" ? false : "";
    return o;
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true); onError("");
    try {
      const r = await fetch("/api/kuber/register", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, action: row ? "update" : "add", id: row?.id, row: f }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Could not save");
      onSaved();
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const remove = async () => {
    if (!row) return;
    if (!window.confirm("Remove this entry? The registers are Kuber's own — this does not touch Tally.")) return;
    await fetch("/api/kuber/register", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, action: "delete", id: row.id }),
    });
    onSaved();
  };

  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)", zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg p-4 w-full" style={{ maxWidth: 520, maxHeight: "88vh", overflow: "auto" }}>
        <div className="flex items-center justify-between mb-2">
          <div className="font-bold text-sm" style={{ color: INK }}>{row ? "Edit" : "Add"} — {cfg.title}</div>
          <button onClick={onClose} style={{ color: MUTED }}>✕</button>
        </div>
        <div className="space-y-2">
          {cfg.fields.map((fd) => (
            <label key={fd.key} className="block">
              <span className="text-xs font-semibold" style={{ color: MUTED }}>{fd.label}{fd.hint ? ` — ${fd.hint}` : ""}</span>
              {fd.type === "select" ? (
                <select value={String(f[fd.key] ?? "")} onChange={(e) => setF({ ...f, [fd.key]: e.target.value })}
                  className="w-full border rounded px-2 py-1 text-sm bg-white" style={{ borderColor: BORDER }}>
                  {fd.options!.map((o) => (<option key={o}>{o}</option>))}
                </select>
              ) : fd.type === "tick" ? (
                <div><input type="checkbox" checked={!!f[fd.key]} onChange={(e) => setF({ ...f, [fd.key]: e.target.checked })} style={{ accentColor: ORANGE }} /></div>
              ) : fd.type === "money" ? (
                <MoneyEntry
                  value={String(f[fd.key] ?? "")}
                  usd={String(f.currency ?? "").toUpperCase() === "USD"}
                  onChange={(v) => setF({ ...f, [fd.key]: v })}
                />
              ) : (
                <input
                  type={fd.type === "date" ? "date" : fd.type === "number" ? "number" : "text"}
                  value={String(f[fd.key] ?? "")}
                  onChange={(e) => setF({ ...f, [fd.key]: e.target.value })}
                  className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: BORDER }}
                />
              )}
            </label>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={save} disabled={busy} className="flex-1 rounded py-1.5 text-sm font-bold text-white" style={{ background: busy ? "#B9BEC4" : ORANGE }}>
            {busy ? "Saving…" : "💾 Save"}
          </button>
          {row && <button onClick={remove} className="rounded px-3 text-sm font-bold" style={{ color: "#B3261E" }}>🗑</button>}
          <button onClick={onClose} className="rounded px-3 text-sm" style={{ color: MUTED }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
