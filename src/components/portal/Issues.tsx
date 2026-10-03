"use client";
import { useState } from "react";
import { Card, dmy, Drawer, Err, Field, H1, Loading, P, PrintButton, statusPill, Table, useGet, type Boot, type Col, type PortalIssue } from "./shared";

/**
 * SERVICE CALLS AND ISSUES — "which is going to tag all of these service
 * calls and issues together". Seva's tickets on this organisation's
 * machines, as the ERP holds them: open first, then the rest.
 */
export default function Issues({ boot }: { boot: Boot }) {
  const slug = boot.scope.slug;
  const r = useGet<{ issues: PortalIssue[] }>(`/api/portal/issues?slug=${encodeURIComponent(slug)}`);
  const [sel, setSel] = useState<PortalIssue | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const all = r.data?.issues || [];
  const isOpen = (i: PortalIssue) => !/closed|resolved/i.test(i.status);
  const rows = onlyOpen ? all.filter(isOpen) : all;
  const cols: Col<PortalIssue>[] = [
    { key: "d", label: "Date", get: (i) => dmy(i.issue_date), sort: (i) => i.issue_date || "" },
    { key: "t", label: "Ticket", get: (i) => <b>{i.title}</b>, sort: (i) => i.title },
    ...(boot.org ? [] : [{ key: "c", label: "Customer", get: (i: PortalIssue) => i.customer, sort: (i: PortalIssue) => i.customer }]),
    { key: "m", label: "Machine", get: (i) => i.machine, sort: (i) => i.machine },
    { key: "l", label: "Location", get: (i) => i.location, sort: (i) => i.location },
    { key: "j", label: "Job", get: (i) => i.job_number, sort: (i) => i.job_number },
    { key: "cat", label: "Type", get: (i) => i.category, sort: (i) => i.category },
    { key: "s", label: "Status", get: (i) => statusPill(i.status), sort: (i) => i.status },
    { key: "r", label: "Resolved", get: (i) => dmy(i.resolved_at), sort: (i) => i.resolved_at || "" },
  ];
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <H1 sub={`Every service call and issue${boot.org ? ` on ${boot.org.name}'s machines` : ""}, as Nandan's service desk holds it.`}>Service calls & issues</H1><PrintButton />
      </div>
      {r.error && <Err e={r.error} />}
      <Card title={r.data ? `${all.filter(isOpen).length} open · ${all.length} in all` : "Tickets"} right={
        <label className="no-print" style={{ fontSize: 12, color: P.dim, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> open only</label>}>
        {r.loading ? <Loading /> : <Table cols={cols} rows={rows} rowKey={(i) => i.id} onRow={setSel} maxHeight="72vh" empty={onlyOpen ? "Nothing open — good." : "No tickets on record."} />}
      </Card>
      {sel && (
        <Drawer title={sel.title} onClose={() => setSel(null)}>
          <div style={{ marginBottom: 10 }}>{statusPill(sel.status)}</div>
          <Field k="Date" v={dmy(sel.issue_date)} /><Field k="Customer" v={sel.customer} /><Field k="Machine" v={sel.machine} /><Field k="Location" v={sel.location} />
          <Field k="Job" v={sel.job_number} /><Field k="Type" v={sel.category} /><Field k="Resolved on" v={dmy(sel.resolved_at)} />
          {sel.description && <div style={{ marginTop: 12 }}><div style={{ fontWeight: 700, fontSize: 13, color: P.navy }}>What was reported</div><p style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{sel.description}</p></div>}
          {sel.resolution && <div style={{ marginTop: 12 }}><div style={{ fontWeight: 700, fontSize: 13, color: P.navy }}>Resolution</div><p style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{sel.resolution}</p></div>}
        </Drawer>
      )}
    </div>
  );
}
