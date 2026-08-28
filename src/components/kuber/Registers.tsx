"use client";

/**
 * The CFO registers (Dr Raghu, 28 Aug 2026) — Bank Guarantees, Fixed
 * Deposits, Insurance, Payment Planning and the manual cash-flow lines.
 * One generic screen: a dated table and an add/edit lightbox, the columns
 * lifted from the management-review sheet's own registers (B60/B61/B62/B9)
 * so nothing he tracks today loses a home.
 */

import { useCallback, useEffect, useState } from "react";
import { useMoneyFmt } from "./money";

const INK = "#16232F", MUTED = "#8A94A0", BORDER = "#E2E0DA", ORANGE = "#E8600A";

export const fmtD = (d: string | null | undefined) => {
  if (!d) return "—";
  const [y, m, dd] = String(d).slice(0, 10).split("-");
  return `${dd}-${m}-${y}`;
};
const TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

type Field = { key: string; label: string; type: "text" | "money" | "date" | "select" | "number" | "tick"; options?: string[]; hint?: string };

const CONFIGS: Record<string, { title: string; blurb: string; fields: Field[]; dateKey: string; amountKey: string; warnDays?: number }> = {
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
      { key: "status", label: "Status", type: "select", options: ["live", "released", "expired", "invoked"] },
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

  const load = useCallback(() => {
    fetch(`/api/kuber/register?kind=${kind}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { setRows(j.rows || []); setInstalled(j.installed !== false); })
      .catch(() => setRows([]));
  }, [kind]);
  useEffect(() => { load(); }, [load]);

  const today = TODAY();
  const cols = cfg.fields.filter((f) => f.key !== "note").slice(0, 8);

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

      <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxWidth: 1100, maxHeight: "68vh" }}>
        <table className="w-full text-xs" style={{ minWidth: 760, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: "#22303C", color: "#fff" }}>
              {cols.map((f) => (
                <th key={f.key} className="px-2 py-2 text-left whitespace-nowrap" style={{ position: "sticky", top: 0, background: "#22303C" }}>{f.label}</th>
              ))}
              <th className="px-2 py-2" style={{ position: "sticky", top: 0, background: "#22303C" }} />
            </tr>
          </thead>
          <tbody>
            {rows?.length === 0 && (
              <tr><td colSpan={cols.length + 1} className="px-3 py-5 text-center" style={{ color: MUTED }}>Nothing here yet — the first entry starts the register.</td></tr>
            )}
            {(rows || []).map((r, i) => {
              const d = String(r[cfg.dateKey] || "");
              const soon = cfg.warnDays != null && d && String(r.status ?? "live") === "live" &&
                d <= new Date(new Date(today).getTime() + cfg.warnDays * 86400000).toISOString().slice(0, 10);
              const past = d && d < today && String(r.status ?? "live") === "live";
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
              ) : (
                <input
                  type={fd.type === "date" ? "date" : fd.type === "money" || fd.type === "number" ? "number" : "text"}
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
