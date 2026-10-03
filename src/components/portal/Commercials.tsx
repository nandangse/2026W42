"use client";
import { Card, dmy, Err, H1, inr, lakh, Loading, PrintButton, Table, useGet, type Boot, type Col, type PortalJob } from "./shared";

/**
 * COMMERCIALS — "which only a few people in the organisation can see". The
 * money on every open job: order value, what the CRM's sales order says,
 * the advance in hand, the terms, what is due on delivery. Nothing is typed
 * here; it is the jobmaster's own figures, shown to the ticked few.
 */
export default function Commercials({ boot }: { boot: Boot }) {
  const slug = boot.scope.slug;
  const r = useGet<{ jobs: PortalJob[] }>(`/api/portal/jobs?slug=${encodeURIComponent(slug)}&which=open`);
  const rows = (r.data?.jobs || []).filter((j) => j.commercials);
  const sum = (f: (j: PortalJob) => number | null | undefined) => rows.reduce((a, j) => a + (f(j) || 0), 0);
  const cols: Col<PortalJob>[] = [
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
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <H1 sub="The jobmaster's own figures on every open job. Shown only to the few who are ticked for it.">Commercials</H1><PrintButton />
      </div>
      {r.error && <Err e={r.error} />}
      {r.data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
          <Tile k="Open jobs" v={String(rows.length)} />
          <Tile k="Order value" v={lakh(sum((j) => j.commercials?.value))} />
          <Tile k="Advance in hand" v={lakh(sum((j) => j.commercials?.advance))} />
          <Tile k="Due on delivery" v={lakh(sum((j) => j.commercials?.pay_on_delivery))} />
        </div>
      )}
      <Card>{r.loading ? <Loading /> : <Table cols={cols} rows={rows} rowKey={(j) => j.id} maxHeight="70vh" empty="No open jobs." />}</Card>
    </div>
  );
}
const Tile = ({ k, v }: { k: string; v: string }) => (
  <div style={{ background: "#fff", border: "1px solid #e2e0da", borderRadius: 12, padding: "12px 14px" }}>
    <div style={{ fontSize: 11, color: "#8a94a0", fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" }}>{k}</div>
    <div style={{ fontSize: 22, fontWeight: 700, color: "#16232f", marginTop: 2 }}>{v || "—"}</div>
  </div>
);
