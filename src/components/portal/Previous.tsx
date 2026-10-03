"use client";
import { useState } from "react";
import { Card, dmy, Err, H1, Loading, PrintButton, Table, useGet, type Boot, type Col, type PortalJob } from "./shared";
import { JobDrawer } from "./Home";

/**
 * PREVIOUS JOBS — "where all the delivered jobs will be listed and shown":
 * Job number · Customer · Vehicle number · Type · Date of delivery ·
 * Invoice number · Remarks. His seven columns, in his order.
 */
export default function Previous({ boot, go }: { boot: Boot; go: (t: string, a?: string | null) => void }) {
  const slug = boot.scope.slug;
  const r = useGet<{ jobs: PortalJob[] }>(`/api/portal/jobs?slug=${encodeURIComponent(slug)}&which=delivered`);
  const [sel, setSel] = useState<PortalJob | null>(null);
  const rows = (r.data?.jobs || []).slice().sort((a, b) => (b.delivered_on || "").localeCompare(a.delivered_on || ""));
  const cols: Col<PortalJob>[] = [
    { key: "job", label: "Job number", get: (j) => <b>{j.job}</b>, sort: (j) => j.job },
    { key: "cust", label: "Customer", get: (j) => j.customer, sort: (j) => j.customer },
    { key: "vn", label: "Vehicle number", get: (j) => j.vehicle_no, sort: (j) => j.vehicle_no },
    { key: "type", label: "Type", get: (j) => j.vehicle_type, sort: (j) => j.vehicle_type },
    { key: "d", label: "Date of delivery", get: (j) => dmy(j.delivered_on), sort: (j) => j.delivered_on || "" },
    { key: "inv", label: "Invoice number", get: (j) => j.invoice_no, sort: (j) => j.invoice_no },
    { key: "rem", label: "Remarks", get: (j) => j.remarks },
  ];
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <H1 sub={`Everything delivered${boot.org ? ` to ${boot.org.name}` : ""}, newest first. Click a row for the job.`}>Previous jobs</H1><PrintButton />
      </div>
      {r.error && <Err e={r.error} />}
      <Card title={r.data ? `${rows.length} delivered` : "Delivered"}>
        {r.loading ? <Loading /> : <Table cols={cols} rows={rows} rowKey={(j) => j.id} onRow={setSel} maxHeight="75vh" empty="No deliveries on record yet." />}
      </Card>
      {sel && <JobDrawer job={sel} boot={boot} onClose={() => setSel(null)} go={go} onSaved={r.reload} />}
    </div>
  );
}
