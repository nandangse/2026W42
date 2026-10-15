"use client";
import { useState } from "react";
import { btn, Card, dmy, Err, H1, input, Loading, P, pill, Table, useGet, type Boot, type PortalJob } from "./shared";
import { jobCols } from "./Home";

/**
 * THE CUSTOMER PORTAL, SEEN FROM NANDAN'S SIDE (Dr Raghu, 15 Oct 2026: "keep
 * Customer portal — that's where the customers are seen. In that we should
 * have the Jobmaster"). Every customer on the jobmaster on the left — with
 * or without a portal door — and, for the one picked, its Jobmaster: what is
 * open and what has been delivered, in the portal's own columns.
 */
type Cust = { name: string; open: number; delivered: number; open_value: number; slug: string | null; org_name: string | null; door: "live" | "no people" | "inactive" | "none"; people: number; last_login: string | null };
const DOOR: Record<Cust["door"], { label: string; color: string }> = { live: { label: "portal live", color: "#0D7A3F" }, "no people": { label: "portal, nobody invited", color: "#B26A00" }, inactive: { label: "portal inactive", color: P.red }, none: { label: "no portal", color: P.muted } };

export default function Customers({ boot, go, arg }: { boot: Boot; go: (t: string, a?: string | null) => void; arg: string | null }) {
  const list = useGet<{ customers: Cust[] }>("/api/portal/customers");
  const [q, setQ] = useState(""); const [only, setOnly] = useState<"all" | "open" | "portal">("open");
  const picked = arg ? decodeURIComponent(arg) : null;
  const rows = (list.data?.customers || []).filter((c) => (only === "all" || (only === "open" ? c.open > 0 : c.door !== "none")) && (!q || c.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <H1 sub="Every customer on the jobmaster, and each one's Jobmaster — open and delivered. A customer with a door is one on the portal.">Customer portal</H1>
      {list.error && <Err e={list.error} />}
      <div style={{ display: "grid", gridTemplateColumns: picked ? "minmax(260px, 1fr) minmax(360px, 2.2fr)" : "1fr", gap: 16 }} className="portal-split">
        <Card title={list.data ? `${rows.length} customers` : "Customers"} right={
          <span className="no-print" style={{ display: "flex", gap: 4 }}>
            {(["open", "portal", "all"] as const).map((f) => <button key={f} onClick={() => setOnly(f)} style={btn("ghost", { padding: "2px 8px", fontSize: 11, background: only === f ? P.navy : "#fff", color: only === f ? "#fff" : P.ink })}>{f === "open" ? "with open jobs" : f === "portal" ? "with a portal" : "all"}</button>)}
          </span>}>
          <input style={{ ...input, marginBottom: 8 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a customer" />
          {list.loading ? <Loading /> : (
            <div style={{ display: "grid", gap: 4, maxHeight: "70vh", overflowY: "auto" }}>
              {rows.map((c) => (
                <button key={c.name} onClick={() => go("customers", encodeURIComponent(c.name))} style={{ textAlign: "left", background: picked === c.name ? P.soft : "#fff", border: `1px solid ${picked === c.name ? P.navy : P.line}`, borderRadius: 8, padding: "7px 10px", cursor: "pointer" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}><b style={{ fontSize: 13, flex: 1 }}>{c.name}</b><span style={pill(DOOR[c.door].color)}>{DOOR[c.door].label}</span></div>
                  <div style={{ fontSize: 12, color: P.muted, marginTop: 2 }}>{c.open} open · {c.delivered} delivered{c.people ? ` · ${c.people} on the portal` : ""}{c.last_login ? ` · last sign-in ${dmy(c.last_login.slice(0, 10))}` : ""}</div>
                </button>
              ))}
              {rows.length === 0 && <div style={{ color: P.muted, fontSize: 13, padding: 8 }}>No customer matches.</div>}
            </div>
          )}
        </Card>
        {picked && <Jobmaster boot={boot} name={picked} go={go} />}
      </div>
      <style>{`@media (max-width: 900px) { .portal-split { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

function Jobmaster({ boot, name, go }: { boot: Boot; name: string; go: (t: string, a?: string | null) => void }) {
  const r = useGet<{ name: string; org: { slug: string; name: string; active: boolean } | null; open: PortalJob[]; delivered: PortalJob[] }>(`/api/portal/customers?name=${encodeURIComponent(name)}`);
  const cols = jobCols({ customer: false, staff: boot.me.staff });
  const open = (r.data?.open || []).map((j) => j);
  const delivered = (r.data?.delivered || []).slice().sort((a, b) => (b.delivered_on || "").localeCompare(a.delivered_on || ""));
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Card title={`${name} — Jobmaster`} right={<span style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {r.data?.org ? <a href={`/portal/${r.data.org.slug}`} style={btn("ghost", { padding: "3px 9px", fontSize: 12 })}>Open their portal ›</a> : boot.me.admin ? <button onClick={() => go("settings")} style={btn("primary", { padding: "3px 9px", fontSize: 12 })}>+ Create their portal</button> : <span style={pill(P.muted)}>no portal</span>}
        <button onClick={() => go("customers")} style={btn("ghost", { padding: "2px 8px", fontSize: 12 })}>✕</button></span>}>
        {r.error && <Err e={r.error} />}
        {r.loading ? <Loading /> : (
          <div style={{ display: "grid", gap: 14 }}>
            <div><div style={{ fontSize: 12, fontWeight: 700, color: P.dim, letterSpacing: 1, marginBottom: 4 }}>OPEN · {open.length}</div>
              <Table cols={cols} rows={open} rowKey={(j) => j.id} onRow={(j) => go("home", j.id)} empty="Nothing open." /></div>
            <div><div style={{ fontSize: 12, fontWeight: 700, color: P.dim, letterSpacing: 1, marginBottom: 4 }}>DELIVERED · {delivered.length}</div>
              <Table rowKey={(j) => j.id} onRow={(j) => go("home", j.id)} rows={delivered} empty="No deliveries on record." cols={[
                { key: "job", label: "Job", get: (j) => <b>{j.job}</b>, sort: (j) => j.job },
                { key: "proj", label: "Project", get: (j) => j.project, sort: (j) => j.project },
                { key: "vt", label: "Vehicle type", get: (j) => j.vehicle_type },
                { key: "model", label: "Model", get: (j) => j.model },
                { key: "d", label: "Delivered on", get: (j) => dmy(j.delivered_on), sort: (j) => j.delivered_on || "" },
                { key: "inv", label: "Invoice", get: (j) => j.invoice_no },
              ]} /></div>
          </div>
        )}
      </Card>
    </div>
  );
}
