"use client";
import { useMemo, useState } from "react";
import { btn, Card, dmy, Err, H1, inr, lakh, Loading, P, PrintButton, Table, useGet, type Boot, type Col, type PortalJob } from "./shared";

/**
 * COMMERCIALS — "which only a few people in the organisation can see".
 *
 * Dr Raghu, 16 Oct 2026: the twelve-month story as a table with % of order
 * value; Payment anticipated by age on the right; tabs Jobs · Invoices ·
 * Payments; 12 months or from–to on top; outstanding invoices always shown.
 * The money comes from Tally through Kuber (invoices, receipts, open bills)
 * and the jobmaster (orders, advance expected, due on delivery).
 */
type Sum = { key: string; label: string; amount: number; pct: number | null; note: string };
type Age = { key: string; label: string; cols: number[]; total: number };
type Inv = { id: string; date: string; no: string; type: string; party: string; narration: string; amount: number };
type Pay = { id: string; date: string; no: string; party: string; narration: string; amount: number };
type Out = { party: string; bill: string; bill_date: string | null; due_date: string | null; amount: number; age_days: number | null };
type D = { from: string; to: string; today: string; columns: string[]; summary: Sum[]; anticipated: Age[]; invoices: Inv[]; payments: Pay[]; outstanding: Out[]; open_jobs: PortalJob[]; orders_in_period: number; matched_parties: string[] };
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function Commercials({ boot }: { boot: Boot }) {
  const slug = boot.scope.slug;
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(iso(new Date(today.getTime() - 365 * 864e5)));
  const [to, setTo] = useState(iso(today));
  const [tab, setTab] = useState<"jobs" | "invoices" | "payments">("jobs");
  const r = useGet<D>(`/api/portal/commercials?slug=${encodeURIComponent(slug)}&from=${from}&to=${to}`);
  const d = r.data;
  const preset = (months: number) => { setFrom(iso(new Date(today.getTime() - months * 30.44 * 864e5))); setTo(iso(today)); };
  const fyStart = () => { const y = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1; setFrom(`${y}-04-01`); setTo(iso(today)); };
  const jobs = (d?.open_jobs || []).filter((j) => j.commercials);
  const jobCols: Col<PortalJob>[] = [
    { key: "job", label: "Job", get: (j) => <b>{j.job}</b>, sort: (j) => j.job },
    ...(boot.org ? [] : [{ key: "cust", label: "Customer", get: (j: PortalJob) => j.customer, sort: (j: PortalJob) => j.customer }]),
    { key: "po", label: "PO", get: (j) => j.po_no, sort: (j) => j.po_no },
    { key: "vt", label: "Vehicle type", get: (j) => j.vehicle_type },
    { key: "tdd", label: "Target", get: (j) => dmy(j.tdd), sort: (j) => j.tdd || "" },
    { key: "val", label: "Order value", get: (j) => inr(j.commercials?.value), sort: (j) => j.commercials?.value ?? 0, num: true },
    { key: "so", label: "SO amount", get: (j) => inr(j.commercials?.so_amount), sort: (j) => j.commercials?.so_amount ?? 0, num: true },
    { key: "adv", label: "Advance", get: (j) => inr(j.commercials?.advance), sort: (j) => j.commercials?.advance ?? 0, num: true },
    { key: "terms", label: "Terms", get: (j) => { const c = j.commercials!; return [c.pct_on != null ? `${c.pct_on}% order` : "", c.pct_30 != null ? `${c.pct_30}% @30` : "", c.pct_60 != null ? `${c.pct_60}% @60` : "", c.pct_90 != null ? `${c.pct_90}% @90` : ""].filter(Boolean).join(" · "); } },
    { key: "pod", label: "On delivery", get: (j) => inr(j.commercials?.pay_on_delivery), sort: (j) => j.commercials?.pay_on_delivery ?? 0, num: true },
  ];
  const outCols: Col<Out>[] = [
    ...(boot.org ? [] : [{ key: "party", label: "Party", get: (b: Out) => b.party, sort: (b: Out) => b.party }]),
    { key: "bill", label: "Invoice", get: (b) => <b>{b.bill}</b>, sort: (b) => b.bill },
    { key: "bd", label: "Invoice date", get: (b) => dmy(b.bill_date), sort: (b) => b.bill_date || "" },
    { key: "dd", label: "Due", get: (b) => dmy(b.due_date), sort: (b) => b.due_date || "" },
    { key: "age", label: "Age", get: (b) => b.age_days == null ? "—" : <span style={{ color: b.age_days > 90 ? P.red : b.age_days > 45 ? "#B26A00" : P.ink, fontWeight: b.age_days > 45 ? 700 : 400 }}>{b.age_days} days</span>, sort: (b) => b.age_days ?? 0, num: true },
    { key: "amt", label: "Outstanding", get: (b) => inr(b.amount), sort: (b) => b.amount, num: true },
  ];
  const invCols: Col<Inv>[] = [
    { key: "date", label: "Date", get: (v) => dmy(v.date), sort: (v) => v.date },
    { key: "no", label: "Invoice no", get: (v) => <b>{v.no}</b>, sort: (v) => v.no },
    ...(boot.org ? [] : [{ key: "party", label: "Party", get: (v: Inv) => v.party, sort: (v: Inv) => v.party }]),
    { key: "type", label: "Type", get: (v) => v.type },
    { key: "nar", label: "Narration", get: (v) => <span style={{ color: P.muted }}>{v.narration}</span> },
    { key: "amt", label: "Amount", get: (v) => <span style={{ color: v.amount < 0 ? P.red : P.ink }}>{inr(v.amount)}</span>, sort: (v) => v.amount, num: true },
  ];
  const payCols: Col<Pay>[] = [
    { key: "date", label: "Date", get: (v) => dmy(v.date), sort: (v) => v.date },
    { key: "no", label: "Receipt", get: (v) => <b>{v.no}</b>, sort: (v) => v.no },
    ...(boot.org ? [] : [{ key: "party", label: "Party", get: (v: Pay) => v.party, sort: (v: Pay) => v.party }]),
    { key: "nar", label: "Reference", get: (v) => <span style={{ color: P.muted }}>{v.narration}</span> },
    { key: "amt", label: "Amount", get: (v) => inr(v.amount), sort: (v) => v.amount, num: true },
  ];
  const th: React.CSSProperties = { textAlign: "right", padding: "6px 8px", fontSize: 11, whiteSpace: "nowrap", color: "#fff", background: P.navy };
  const td: React.CSSProperties = { textAlign: "right", padding: "6px 8px", fontSize: 13, borderBottom: `1px solid ${P.line}`, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <H1 sub="Orders, invoices, payments and what is still to come — Tally's books and the jobmaster's terms. Shown only to the few who are ticked for it.">Commercials</H1>
        <div className="no-print" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => preset(12)} style={btn("ghost", { padding: "4px 10px", fontSize: 12 })}>12 months</button>
          <button onClick={fyStart} style={btn("ghost", { padding: "4px 10px", fontSize: 12 })}>This FY</button>
          <span style={{ fontSize: 12, color: P.muted }}>From</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ border: `1px solid ${P.line}`, borderRadius: 8, padding: "4px 8px", fontSize: 12 }} />
          <span style={{ fontSize: 12, color: P.muted }}>To</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ border: `1px solid ${P.line}`, borderRadius: 8, padding: "4px 8px", fontSize: 12 }} />
          <PrintButton />
        </div>
      </div>
      {r.error && <Err e={r.error} />}
      {r.loading && !d && <Loading />}
      {d && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1fr) minmax(520px, 1.6fr)", gap: 16 }} className="portal-split">
            <Card title={`${dmy(d.from)} – ${dmy(d.to)}`} right={<span style={{ fontSize: 11, color: P.muted }}>% of total order value</span>}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {d.summary.map((s) => (
                    <tr key={s.key} title={s.note}>
                      <td style={{ ...td, textAlign: "left", fontWeight: s.key === "order_value" ? 700 : 500 }}>{s.label}<div style={{ fontSize: 11, color: P.muted, fontWeight: 400, whiteSpace: "normal" }}>{s.note}</div></td>
                      <td style={{ ...td, fontWeight: 700 }}>{lakh(s.amount)}</td>
                      <td style={{ ...td, color: P.muted, width: 60 }}>{s.pct == null ? "—" : `${s.pct}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card title="Payment anticipated" right={<span style={{ fontSize: 11, color: P.muted }}>by when it falls due, seen from {dmy(d.today)}</span>}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", minWidth: 900 }}>
                  <thead><tr><th style={{ ...th, textAlign: "left" }}>Type</th><th style={th}>TOTAL</th>{d.columns.map((c) => <th key={c} style={th}>{c}</th>)}</tr></thead>
                  <tbody>
                    {d.anticipated.map((a) => (
                      <tr key={a.key} style={a.key === "total" ? { background: P.soft, fontWeight: 700 } : undefined}>
                        <td style={{ ...td, textAlign: "left" }}>{a.label}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{lakh(a.total)}</td>
                        {a.cols.map((v, i) => <td key={i} style={{ ...td, color: v ? (i < 3 ? P.red : P.ink) : "#C9C6BD" }}>{v ? lakh(v) : "·"}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 11, color: P.muted, marginTop: 6 }}>Items delivered = invoices outstanding, by their due date. Advance for the order = the advance the terms ask for, less what is in hand, owed now. On delivery = the jobmaster&apos;s due-on-delivery, by target delivery date.</div>
            </Card>
          </div>

          <div className="no-print" style={{ display: "flex", gap: 4 }}>
            {([["jobs", `Jobs · ${jobs.length}`], ["invoices", `Invoices · ${d.invoices.length}`], ["payments", `Payments · ${d.payments.length}`]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={btn("ghost", { padding: "6px 14px", fontSize: 13, background: tab === k ? P.navy : "#fff", color: tab === k ? "#fff" : P.ink })}>{l}</button>
            ))}
          </div>

          {/* OUTSTANDING ALWAYS (his rule) — above whichever tab is open */}
          <Card title={`Outstanding invoices · ${d.outstanding.length} · ${lakh(d.outstanding.reduce((s, b) => s + b.amount, 0))}`} right={<span style={{ fontSize: 11, color: P.muted }}>every unpaid invoice today, whatever the period above</span>}>
            <Table cols={outCols} rows={d.outstanding} rowKey={(b) => `${b.party}|${b.bill}`} maxHeight="40vh" empty="Nothing outstanding." search={d.outstanding.length > 8} />
          </Card>

          {tab === "jobs" && <Card title={`Open jobs · ${jobs.length}`}><Table cols={jobCols} rows={jobs} rowKey={(j) => j.id} maxHeight="70vh" empty="No open jobs." /></Card>}
          {tab === "invoices" && <Card title={`Invoices ${dmy(d.from)} – ${dmy(d.to)} · ${lakh(d.invoices.reduce((s, v) => s + v.amount, 0))}`} right={<span style={{ fontSize: 11, color: P.muted }}>Tally's sales vouchers and credit notes</span>}><Table cols={invCols} rows={d.invoices} rowKey={(v) => v.id} maxHeight="70vh" empty="No invoice in the period." /></Card>}
          {tab === "payments" && <Card title={`Payments ${dmy(d.from)} – ${dmy(d.to)} · ${lakh(d.payments.reduce((s, v) => s + v.amount, 0))}`} right={<span style={{ fontSize: 11, color: P.muted }}>Tally's receipts</span>}><Table cols={payCols} rows={d.payments} rowKey={(v) => v.id} maxHeight="70vh" empty="No payment in the period." /></Card>}
          {!boot.org && d.matched_parties.length > 0 && <div style={{ fontSize: 11, color: P.muted }}>Tally parties read: {d.matched_parties.length}.</div>}
          {boot.org && <div style={{ fontSize: 11, color: P.muted }}>Tally parties matched to {boot.org.name}: {d.matched_parties.join(" · ") || "none — add the Tally name to the organisation's match names"}.</div>}
        </>
      )}
      <style>{`@media (max-width: 1000px) { .portal-split { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
