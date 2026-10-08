"use client";

/**
 * SUPPLIER PAYMENT RELEASE and the SUPPLIER-ONLY PAYMENT PLAN (Dr Raghu,
 * 6 Oct 2026). See /api/saamaan/payment-release for the release, and the
 * "supplierplan" view of /api/kuber/books for the plan — payments to
 * suppliers only; nothing about cash coming in, openings or closings.
 */
import { useEffect, useMemo, useState } from "react";
import GenieTable from "@/components/GenieTable";
import { Btn, Note, INK, MUTED, BORDER, NAVY, GREEN, AMBER, useLoad } from "@/components/ims/ui";

const inr = (n: number | null | undefined) => (n === null || n === undefined ? "·" : Math.abs(n) >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${Math.round(n).toLocaleString("en-IN")}`);
const dmy = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}` : "·");
const istDay = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
/** ISO week number and its Monday, for "week 41 — this much" (Dr Raghu, 8 Oct 2026) */
const isoWeekOf = (d: string): { wk: number; monday: string } => {
  const t = new Date(`${d}T00:00:00Z`); const dow = (t.getUTCDay() + 6) % 7;
  const monday = new Date(t.getTime() - dow * 86400000);
  const thu = new Date(monday.getTime() + 3 * 86400000);
  const y0 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  return { wk: Math.ceil(((thu.getTime() - y0.getTime()) / 86400000 + 1) / 7), monday: monday.toISOString().slice(0, 10) };
};
/* OPEN OR CLOSED (Dr Raghu, 8 Oct 2026: "This should be closed by Suresh or accounts when they take it
   into plan. It should leave from here so that it doesn't get double-counted. It should be showing in
   the 13-week cash flow plan regardless"). A release is OPEN while its Kuber plan row still says
   "planned"; the moment accounts approve, pay or drop it in Kuber it is closed here — gone from the
   totals, kept in the closed list — and lives on in the cash plan, where it was all along. */
const isOpen = (r: { kuber: { status: string } | null }) => !r.kuber || r.kuber.status === "planned";

interface Release { id: string; supplier: string; kind: string; amount: number; bill_refs: string; remarks: string; wanted_on: string | null; files: { name: string; path: string; size: number }[]; mail: string; by_email: string; at: string; kuber: { status: string; paid_on: string | null } | null }

export function PaymentRelease() {
  const [list, busy, reload, err] = useLoad<{ rows: Release[]; installed: boolean }>("/api/saamaan/payment-release");
  const [sup] = useLoad<{ suppliers: string[] }>("/api/saamaan/payment-release?view=suppliers");
  const [f, setF] = useState({ supplier: "", kind: "advance", amount: "", bill_refs: "", remarks: "", wanted_on: istDay() });
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const known = useMemo(() => new Set(sup?.suppliers ?? []), [sup]);
  const submit = async () => {
    if (!confirm(`Release ${f.kind === "advance" ? "an advance" : "a payment"} of ₹${Number(f.amount.replace(/,/g, "")).toLocaleString("en-IN")} to ${f.supplier}? It goes into Kuber's payment requests, and accounts@ gets the intimation.`)) return;
    setSending(true); setMsg(null);
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => fd.append(k, v));
    files.forEach((x) => fd.append("files", x));
    const r = await fetch("/api/saamaan/payment-release", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setSending(false);
    if (!r.ok) { setMsg({ ok: false, text: j.error || `The server answered ${r.status}.` }); return; }
    setMsg({ ok: !/^not sent/.test(j.mail), text: `Released — it is in Kuber's payment requests now. Mail to accounts@: ${j.mail}.` });
    setF({ supplier: "", kind: "advance", amount: "", bill_refs: "", remarks: "", wanted_on: istDay() }); setFiles([]);
    reload();
  };
  const ready = f.supplier && Number(f.amount.replace(/,/g, "")) > 0 && (f.kind === "advance" || f.bill_refs.trim());
  return (
    <div>
      <div className="text-sm mb-2" style={{ color: INK }}><b>Supplier payment release</b> <span style={{ color: MUTED }}>— the supplier, the amount, the bill or PI. Submit puts it into Kuber&apos;s payment requests, where accounts act, and mails accounts@nandan.co.in to say so.</span></div>
      {list && !list.installed && <Note kind="warn">Run migration 0205 first — releases have nowhere to live yet.</Note>}
      <div className="bg-white rounded-lg border p-3 mb-3 grid gap-3" style={{ borderColor: BORDER, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <label className="text-xs font-bold" style={{ color: MUTED }}>Supplier<br />
          <input list="rel-sup" value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} placeholder="type to find"
            className="rounded border px-2 py-1.5 text-sm mt-1 w-full" style={{ borderColor: f.supplier && sup && !known.has(f.supplier) ? AMBER : BORDER, color: INK }} />
          <datalist id="rel-sup">{(sup?.suppliers ?? []).map((s) => <option key={s} value={s} />)}</datalist>
          {f.supplier && sup && !known.has(f.supplier) && <span style={{ color: AMBER, fontWeight: 400 }}>not in the ERP&apos;s supplier list — check the name</span>}
        </label>
        <label className="text-xs font-bold" style={{ color: MUTED }}>For<br />
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className="rounded border px-2 py-1.5 text-sm mt-1 w-full bg-white" style={{ borderColor: BORDER, color: INK }}>
            <option value="advance">Advance payment</option><option value="bill">Against a bill</option>
          </select>
        </label>
        <label className="text-xs font-bold" style={{ color: MUTED }}>Amount (₹)<br />
          <input value={f.amount} inputMode="decimal" onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^0-9.,]/g, "") })}
            className="rounded border px-2 py-1.5 text-sm mt-1 w-full tnum text-right" style={{ borderColor: BORDER, color: INK }} />
        </label>
        <label className="text-xs font-bold" style={{ color: MUTED }}>Payment against bill / PI number{f.kind === "bill" ? "" : " (if any)"}<br />
          <input value={f.bill_refs} onChange={(e) => setF({ ...f, bill_refs: e.target.value })} placeholder={f.kind === "advance" ? "PI or PO number" : "bill number(s)"}
            className="rounded border px-2 py-1.5 text-sm mt-1 w-full" style={{ borderColor: BORDER, color: INK }} />
        </label>
        <label className="text-xs font-bold" style={{ color: MUTED }}>Wanted by<br />
          <input type="date" value={f.wanted_on} onChange={(e) => setF({ ...f, wanted_on: e.target.value })} className="rounded border px-2 py-1.5 text-sm mt-1 w-full" style={{ borderColor: BORDER, color: INK }} />
        </label>
        <label className="text-xs font-bold" style={{ color: MUTED }}>Remarks<br />
          <input value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} placeholder="anything accounts should know"
            className="rounded border px-2 py-1.5 text-sm mt-1 w-full" style={{ borderColor: BORDER, color: INK }} />
        </label>
        <label className="text-xs font-bold" style={{ color: MUTED }}>Bills, PI, anything needed<br />
          <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className="text-xs mt-1" />
          {files.length > 0 && <span style={{ fontWeight: 400 }}>{files.length} file{files.length === 1 ? "" : "s"} · {(files.reduce((a, x) => a + x.size, 0) / 1048576).toFixed(1)} MB</span>}
        </label>
        <div className="flex items-end"><Btn kind="primary" onClick={submit} disabled={sending || !ready}>{sending ? "Releasing…" : "Submit"}</Btn></div>
      </div>
      {msg && <Note kind={msg.ok ? "info" : "warn"}>{msg.text}</Note>}
      {err && <Note kind="error">{err}</Note>}
      {/* THE TOTAL ON TOP, AND BY WEEK (Dr Raghu, 8 Oct 2026: "whatever the amount is, should show a total at the top so that we at
          least know the nature of it … if it is wanted by date, it should also showcase week-wise: week 41, this much") */}
      {list && list.rows.length > 0 && (() => {
        const open = list.rows.filter(isOpen), closed = list.rows.filter((r) => !isOpen(r));
        const total = open.reduce((a, r) => a + Number(r.amount || 0), 0);
        const today = istDay();
        const overdue = open.filter((r) => r.wanted_on && r.wanted_on < today).reduce((a, r) => a + Number(r.amount || 0), 0);
        const byWeek = new Map<string, { wk: number; monday: string; amount: number; n: number }>();
        for (const r of open) { const d = r.wanted_on || today; const w = isoWeekOf(d); const g = byWeek.get(w.monday) ?? byWeek.set(w.monday, { ...w, amount: 0, n: 0 }).get(w.monday)!; g.amount += Number(r.amount || 0); g.n++; }
        const weeks = [...byWeek.values()].sort((a, b) => a.monday.localeCompare(b.monday));
        return (
          <div className="bg-white rounded-lg border p-3 mb-3" style={{ borderColor: BORDER }}>
            <div className="flex flex-wrap gap-3 items-end">
              <div><div className="text-xs font-bold" style={{ color: MUTED, letterSpacing: .5 }}>OPEN — ASKED, NOT YET TAKEN INTO PLAN</div><div className="tnum font-bold" style={{ fontSize: 24, color: INK }}>{inr(total)}</div><div className="text-xs" style={{ color: MUTED }}>{open.length} request{open.length === 1 ? "" : "s"}{overdue ? <> · <b style={{ color: "var(--red, #8E2C20)" }}>{inr(overdue)} wanted before today</b></> : ""}</div></div>
              <div className="flex gap-2 flex-wrap">
                {weeks.map((w) => (
                  <div key={w.monday} className="rounded border px-2.5 py-1.5" style={{ borderColor: w.monday < isoWeekOf(today).monday ? "var(--red, #8E2C20)" : BORDER, background: "#FBFAF7" }}>
                    <div className="text-xs" style={{ color: MUTED }}>week {w.wk} · {dmy(w.monday).slice(0, 5)}</div>
                    <div className="tnum font-bold" style={{ color: INK }}>{inr(w.amount)}</div>
                    <div className="text-xs" style={{ color: MUTED }}>{w.n} request{w.n === 1 ? "" : "s"}</div>
                  </div>
                ))}
              </div>
              <div className="ml-auto text-xs" style={{ color: MUTED, maxWidth: 320 }}>Closed by accounts in Kuber (approved, paid or dropped): <b>{closed.length}</b>, {inr(closed.reduce((a, r) => a + Number(r.amount || 0), 0))} — out of these totals, still in the cash plan.</div>
            </div>
          </div>
        );
      })()}
      <GenieTable<Release> rows={list ? [...list.rows].sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || b.at.localeCompare(a.at)) : null} minWidth={1000} empty="No release raised yet."
        search={(r, q) => `${r.supplier} ${r.bill_refs} ${r.remarks}`.toLowerCase().includes(q)} searchPlaceholder="🔍 supplier, bill, remark"
        columns={[
          { key: "at", label: "Date", align: "left", sort: (r) => r.at, render: (r) => <span className="tnum">{dmy(r.at.slice(0, 10))}</span> },
          { key: "s", label: "Supplier", align: "left", sort: (r) => r.supplier, render: (r) => <b style={{ color: INK }}>{r.supplier}</b> },
          { key: "k", label: "For", align: "left", sort: (r) => r.kind, render: (r) => <span>{r.kind === "advance" ? "Advance" : "Bill"}</span> },
          { key: "b", label: "Against bill", align: "left", sort: (r) => r.bill_refs, render: (r) => <span>{r.bill_refs || "·"}</span> },
          { key: "a", label: "Amount", align: "right", sort: (r) => r.amount, render: (r) => <b className="tnum">{inr(r.amount)}</b> },
          { key: "w", label: "Wanted by", align: "left", sort: (r) => r.wanted_on ?? "", render: (r) => <span className="tnum">{dmy(r.wanted_on)}</span> },
          { key: "r", label: "Remarks", align: "left", render: (r) => <span className="text-xs" style={{ color: MUTED }}>{r.remarks || "·"}</span> },
          { key: "f", label: "Files", align: "left", render: (r) => <span className="text-xs">{r.files.length ? r.files.map((x) => <a key={x.path} href={`/api/saamaan/payment-release?file=${encodeURIComponent(x.path)}`} target="_blank" rel="noreferrer" style={{ color: NAVY, marginRight: 6 }}>{x.name}</a>) : "·"}</span> },
          { key: "st", label: "Here", align: "left", sort: (r) => (isOpen(r) ? "0" : "1"), render: (r) => <b className="text-xs" style={{ color: isOpen(r) ? AMBER : MUTED }}>{isOpen(r) ? "open — with accounts" : `closed · ${r.kuber?.status === "paid" ? `paid ${dmy(r.kuber.paid_on)}` : r.kuber?.status === "approved" ? "taken into plan" : r.kuber?.status}`}</b> },
          { key: "kb", label: "In Kuber", align: "left", sort: (r) => r.kuber?.status ?? "", render: (r) => <b className="text-xs" style={{ color: r.kuber?.status === "paid" ? GREEN : r.kuber?.status === "approved" ? NAVY : AMBER }}>{r.kuber ? (r.kuber.status === "planned" ? "awaiting approval" : r.kuber.status === "paid" ? `paid ${dmy(r.kuber.paid_on)}` : r.kuber.status) : "·"}</b> },
          { key: "m", label: "Mail", align: "left", render: (r) => <span className="text-xs" style={{ color: /^not sent/.test(r.mail) ? AMBER : MUTED }}>{r.mail || "·"}</span> },
        ]} />
      {busy && !list && <div className="text-xs" style={{ color: MUTED }}>reading…</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- the plan */
interface PlanRow { id: string; plan_date: string; party: string; amount: number; purpose: string; bill_ref: string; status: string; paid_on: string | null }

/** The supplier payments planned, by week and by supplier — nothing else. */
export function SupplierPlan() {
  const [rows, setRows] = useState<PlanRow[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch("/api/kuber/books?view=supplierplan", { cache: "no-store" }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `The server answered ${r.status}.`); setRows(j.rows || []); }).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  const weekOf = (d: string) => { const t = new Date(`${d}T00:00:00Z`); const dow = (t.getUTCDay() + 6) % 7; return new Date(t.getTime() - dow * 86400000).toISOString().slice(0, 10); };
  const weeks = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) if (r.status !== "paid") m.set(weekOf(r.plan_date), (m.get(weekOf(r.plan_date)) ?? 0) + Number(r.amount || 0));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, 13);
  }, [rows]);
  return (
    <div>
      <div className="text-sm mb-2" style={{ color: INK }}><b>Supplier payment plan</b> <span style={{ color: MUTED }}>— what is planned to be paid to which supplier, and when. Payments to suppliers only.</span></div>
      {err && <Note kind="error">{err}</Note>}
      {weeks.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-3">
          {weeks.map(([w, v]) => (
            <div key={w} className="bg-white rounded border px-2.5 py-1.5" style={{ borderColor: BORDER }}>
              <div className="text-xs" style={{ color: MUTED }}>week of {dmy(w).slice(0, 5)}</div>
              <div className="tnum font-bold" style={{ color: INK }}>{inr(v)}</div>
            </div>
          ))}
        </div>
      )}
      <GenieTable<PlanRow> rows={rows} minWidth={860} empty="Nothing planned for any supplier."
        search={(r, q) => `${r.party} ${r.bill_ref} ${r.status}`.toLowerCase().includes(q)} searchPlaceholder="🔍 supplier, bill, status"
        columns={[
          { key: "d", label: "Planned for", align: "left", sort: (r) => r.plan_date, render: (r) => <span className="tnum">{dmy(r.plan_date)}</span> },
          { key: "p", label: "Supplier", align: "left", sort: (r) => r.party, render: (r) => <b style={{ color: INK }}>{r.party}</b> },
          { key: "f", label: "For", align: "left", sort: (r) => r.purpose, render: (r) => <span>{r.purpose || "Supplier bill"}</span> },
          { key: "b", label: "Bill", align: "left", sort: (r) => r.bill_ref, render: (r) => <span>{r.bill_ref || "·"}</span> },
          { key: "a", label: "Amount", align: "right", sort: (r) => Number(r.amount), render: (r) => <b className="tnum">{inr(Number(r.amount))}</b> },
          { key: "s", label: "Status", align: "left", sort: (r) => r.status, render: (r) => <span className="text-xs font-bold" style={{ color: r.status === "paid" ? GREEN : r.status === "approved" ? NAVY : AMBER }}>{r.status === "planned" ? "awaiting approval" : r.status === "paid" ? `paid ${dmy(r.paid_on)}` : r.status}</span> },
        ]} />
    </div>
  );
}
