"use client";
import { useState } from "react";
import { api, btn, Card, dmy, Drawer, Empty, Err, Field, H1, inr, input, label, lakh, Loading, Markdown, P, pill, PrintButton, statusPill, Table, useGet, type Boot, type Col, type PortalJob, type PortalPo } from "./shared";

/**
 * THE FRONT PAGE. "Once there is a login by the customer, they will see
 * the purchase orders or the sales orders from their side which are open.
 * Against this, you will see the project numbers of the jobs that we have.
 * Against this, you will see the jobs that we have under delivery. From
 * there, below that, it'll also show jobs delivered."
 *
 * One table, his columns: PO number · Project · Job · Engine · Chassis ·
 * Model · Vehicle type · Target delivery · See details. Open jobs first,
 * the last deliveries under them. A supplier sees Nandan's purchase orders
 * on them instead.
 */
export default function Home({ boot, go, arg }: { boot: Boot; go: (t: string, a?: string | null) => void; arg: string | null }) {
  if (boot.org?.kind === "supplier") return <SupplierHome boot={boot} />;
  return <CustomerHome boot={boot} go={go} arg={arg} />;
}

export const jobCols = (opts: { customer?: boolean; staff?: boolean } = {}): Col<PortalJob>[] => [
  { key: "po", label: "PO number", get: (j) => j.po_no || <span style={{ color: P.muted }}>—</span>, sort: (j) => j.po_no },
  ...(opts.customer ? [{ key: "cust", label: "Customer", get: (j: PortalJob) => j.customer, sort: (j: PortalJob) => j.customer }] : []),
  { key: "proj", label: "Project", get: (j) => j.project, sort: (j) => j.project },
  { key: "job", label: "Job", get: (j) => <b>{j.job}</b>, sort: (j) => j.job },
  { key: "eng", label: "Engine no", get: (j) => j.engine_no, sort: (j) => j.engine_no },
  { key: "ch", label: "Chassis no", get: (j) => j.chassis_no, sort: (j) => j.chassis_no },
  { key: "model", label: "Model", get: (j) => j.model, sort: (j) => j.model },
  { key: "vt", label: "Vehicle type", get: (j) => j.vehicle_type, sort: (j) => j.vehicle_type },
  ...(opts.staff ? [{ key: "loc", label: "Location", get: (j: PortalJob) => j.location, sort: (j: PortalJob) => j.location }] : []),
  { key: "tdd", label: "Target delivery", get: (j) => dmy(j.tdd), sort: (j) => j.tdd || "" },
  { key: "see", label: "", get: () => <span style={{ color: P.blue, fontSize: 12, whiteSpace: "nowrap" }}>See details ›</span>, width: 90 },
];

function CustomerHome({ boot, go, arg }: { boot: Boot; go: (t: string, a?: string | null) => void; arg: string | null }) {
  const slug = boot.scope.slug;
  const open = useGet<{ jobs: PortalJob[] }>(`/api/portal/jobs?slug=${encodeURIComponent(slug)}&which=open`);
  const done = useGet<{ jobs: PortalJob[] }>(`/api/portal/jobs?slug=${encodeURIComponent(slug)}&which=delivered`);
  const [sel, setSel] = useState<PortalJob | null>(null);
  const all = [...(open.data?.jobs || []), ...(done.data?.jobs || [])];
  const picked = sel || (arg ? all.find((j) => j.id === arg || j.job === arg) || null : null);
  const cols = jobCols({ customer: !boot.org, staff: boot.me.staff });
  const recent = (done.data?.jobs || []).slice().sort((a, b) => (b.delivered_on || "").localeCompare(a.delivered_on || "")).slice(0, 12);
  const underDelivery = (open.data?.jobs || []).filter((j) => j.on_floor || j.pct > 0);
  const notStarted = (open.data?.jobs || []).filter((j) => !(j.on_floor || j.pct > 0));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <H1 sub={boot.org ? `What Nandan holds for ${boot.org.name} today, ${dmy(boot.today)}.` : boot.scope.kind === "locations" ? "The jobs tagged to your locations." : "Every customer's open orders and jobs."}>Orders & jobs</H1>
        <PrintButton />
      </div>
      {/* THE CEO'S MESSAGE (Dr Raghu, 16 Oct 2026): "Dear <name>, thank you for <organisation> being our valued clients!" then his words — on top, on landing */}
      {boot.org && boot.org.ceo_message && (
        <Card>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: P.muted, marginBottom: 6 }}>A MESSAGE FROM THE CEO</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: P.ink }}>Dear {String(boot.me.name || "").split(" ")[0] || "friend"},</div>
          <div style={{ fontSize: 15, color: P.ink, margin: "2px 0 10px" }}>Thank you for {boot.org.name} being our valued clients!</div>
          <Markdown text={boot.org.ceo_message} />
        </Card>
      )}
      {boot.org?.intro && <Card><Markdown text={boot.org.intro} /></Card>}
      {open.error && <Err e={open.error} />}
      <Card title={`Under delivery${open.data ? ` · ${underDelivery.length}` : ""}`} right={<span>on the shop floor or in progress</span>}>
        {open.loading ? <Loading /> : <Table cols={cols} rows={underDelivery} rowKey={(j) => j.id} onRow={setSel} empty="Nothing under delivery right now." />}
      </Card>
      {notStarted.length > 0 && (
        <Card title={`Orders received, not yet on the floor · ${notStarted.length}`}>
          <Table cols={cols} rows={notStarted} rowKey={(j) => j.id} onRow={setSel} />
        </Card>
      )}
      <Card title={`Delivered${done.data ? ` · last ${recent.length} of ${done.data.jobs.length}` : ""}`} right={<button onClick={() => go("previous")} style={btn("ghost", { padding: "4px 10px", fontSize: 12 })}>All previous jobs ›</button>}>
        {done.loading ? <Loading /> : recent.length === 0 ? <Empty>No deliveries on record yet.</Empty> : (
          <Table search={false} rowKey={(j) => j.id} onRow={setSel} rows={recent} cols={[
            { key: "job", label: "Job", get: (j) => <b>{j.job}</b>, sort: (j) => j.job },
            ...(boot.org ? [] : [{ key: "cust", label: "Customer", get: (j: PortalJob) => j.customer }]),
            { key: "vt", label: "Vehicle type", get: (j) => j.vehicle_type },
            { key: "model", label: "Model", get: (j) => j.model },
            { key: "vn", label: "Vehicle no", get: (j) => j.vehicle_no },
            { key: "d", label: "Delivered on", get: (j) => dmy(j.delivered_on), sort: (j) => j.delivered_on || "" },
            { key: "inv", label: "Invoice", get: (j) => j.invoice_no },
          ]} />
        )}
      </Card>
      {picked && <JobDrawer job={picked} boot={boot} onClose={() => { setSel(null); if (arg) go("home"); }} go={go} onSaved={() => { open.reload(); done.reload(); }} />}
    </div>
  );
}

/** Everything about one job, and for Nandan's people the few fields typed beside it. */
export function JobDrawer({ job, boot, onClose, go, onSaved }: { job: PortalJob; boot: Boot; onClose: () => void; go: (t: string, a?: string | null) => void; onSaved: () => void }) {
  const canEdit = boot.me.all;
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ po_no: job.po_no, vehicle_no: job.vehicle_no, vehicle_type: job.vehicle_type === job.fam ? "" : job.vehicle_type, invoice_no: job.invoice_no, location: job.location, remarks: job.remarks });
  const [msg, setMsg] = useState<string | null>(null);
  const save = async () => {
    try { await api("/api/portal/jobs", { action: "sidecar", job_id: job.id, fields: f }); setMsg("Saved."); setEdit(false); onSaved(); }
    catch (e) { setMsg(String((e as Error).message || e)); }
  };
  const c = job.commercials;
  return (
    <Drawer title={<span>Job {job.job} <span style={{ color: P.muted, fontWeight: 400 }}>· {job.customer}</span></span>} onClose={onClose}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {statusPill(job.delivered ? "Delivered" : job.on_floor ? "On the floor" : job.stat || "Open")}
        {!job.delivered && <span style={pill(P.soft, P.dim)}>{Math.round(job.pct)}% done</span>}
        {job.location && <span style={pill(P.blue)}>{job.location}</span>}
      </div>
      <Field k="PO number" v={job.po_no} />
      <Field k="PO date" v={dmy(job.po_date)} />
      <Field k="Sales order" v={job.so_no} />
      <Field k="Project" v={job.project} />
      <Field k="Job number" v={job.job} />
      <Field k="Vehicle type" v={job.vehicle_type} />
      <Field k="Model" v={job.model} />
      <Field k="Engine no" v={job.engine_no} />
      <Field k="Chassis no" v={job.chassis_no} />
      <Field k="Vehicle no" v={job.vehicle_no} />
      <Field k="Target delivery" v={dmy(job.tdd)} />
      {job.otd && <Field k="Committed (OTD)" v={dmy(job.otd)} />}
      {job.delivered && <Field k="Delivered on" v={dmy(job.delivered_on)} />}
      {job.delivered && <Field k="Invoice" v={job.invoice_no} />}
      <Field k="Remarks" v={job.remarks} />
      {job.client_update && <Field k="Latest update" v={job.client_update} />}
      {c && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 700, color: P.navy, fontSize: 13, margin: "8px 0 4px" }}>Commercials</div>
          <Field k="Order value" v={c.value != null ? `${inr(c.value)} (${lakh(c.value)})` : ""} />
          <Field k="SO amount (CRM)" v={inr(c.so_amount)} />
          <Field k="Advance received" v={inr(c.advance)} />
          <Field k="On delivery" v={inr(c.pay_on_delivery)} />
          <Field k="Terms" v={[c.pct_on != null ? `${c.pct_on}% on order` : "", c.pct_30 != null ? `${c.pct_30}% at 30` : "", c.pct_60 != null ? `${c.pct_60}% at 60` : "", c.pct_90 != null ? `${c.pct_90}% at 90` : ""].filter(Boolean).join(" · ")} />
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <button onClick={() => go("queries", `new-${job.id}`)} style={btn("primary")}>Raise a query on this job</button>
        {canEdit && <button onClick={() => setEdit(!edit)} style={btn("ghost")}>{edit ? "Close" : "Edit beside the job"}</button>}
      </div>
      {edit && (
        <div style={{ marginTop: 12, display: "grid", gap: 8, background: P.soft, padding: 12, borderRadius: 10 }}>
          <div style={{ fontSize: 12, color: P.dim }}>What the ERP cannot know. The job's own fields come from the jobmaster and are not typed here.</div>
          <div><label style={label}>PO number (when the CRM has none)</label><input style={input} value={f.po_no} onChange={(e) => setF({ ...f, po_no: e.target.value })} /></div>
          <div><label style={label}>Vehicle number</label><input style={input} value={f.vehicle_no} onChange={(e) => setF({ ...f, vehicle_no: e.target.value })} /></div>
          <div><label style={label}>Vehicle type (overrides the family {job.fam})</label><input style={input} value={f.vehicle_type} onChange={(e) => setF({ ...f, vehicle_type: e.target.value })} /></div>
          <div><label style={label}>Invoice number</label><input style={input} value={f.invoice_no} onChange={(e) => setF({ ...f, invoice_no: e.target.value })} /></div>
          <div><label style={label}>Location</label>
            <select style={input} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })}>
              <option value="">— none —</option>
              {boot.locations.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
            </select></div>
          <div><label style={label}>Remarks</label><textarea style={{ ...input, minHeight: 60 }} value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} /></div>
          <div><button onClick={save} style={btn("primary")}>Save</button></div>
        </div>
      )}
      {msg && <div style={{ marginTop: 8, fontSize: 12, color: msg === "Saved." ? P.green : P.red }}>{msg}</div>}
    </Drawer>
  );
}

function SupplierHome({ boot }: { boot: Boot }) {
  const slug = boot.scope.slug;
  const open = useGet<{ pos: PortalPo[] }>(`/api/portal/pos?slug=${encodeURIComponent(slug)}&which=open`);
  const done = useGet<{ pos: PortalPo[] }>(`/api/portal/pos?slug=${encodeURIComponent(slug)}&which=done`);
  const [sel, setSel] = useState<PortalPo | null>(null);
  const cols: Col<PortalPo>[] = [
    { key: "po", label: "Our PO", get: (p) => <b>{p.name}</b>, sort: (p) => p.name },
    { key: "d", label: "PO date", get: (p) => dmy(p.date), sort: (p) => p.date || "" },
    { key: "s", label: "Expected by", get: (p) => dmy(p.schedule), sort: (p) => p.schedule || "" },
    { key: "proj", label: "For project", get: (p) => p.project },
    { key: "items", label: "Lines", get: (p) => p.items.length, sort: (p) => p.items.length, num: true },
    { key: "rec", label: "Received", get: (p) => `${Math.round(p.per_received)}%`, sort: (p) => p.per_received, num: true },
    { key: "amt", label: "Value", get: (p) => inr(p.grand_total), sort: (p) => p.grand_total ?? 0, num: true },
    { key: "st", label: "Status", get: (p) => statusPill(p.status) },
  ];
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <H1 sub={`Nandan's purchase orders on ${boot.org?.name}, as the ERP holds them.`}>Purchase orders</H1><PrintButton />
      </div>
      {boot.org?.intro && <Card><Markdown text={boot.org.intro} /></Card>}
      {open.error && <Err e={open.error} />}
      <Card title={`Open${open.data ? ` · ${open.data.pos.length}` : ""}`}>{open.loading ? <Loading /> : <Table cols={cols} rows={open.data?.pos || []} rowKey={(p) => p.name} onRow={setSel} empty="No open purchase orders." />}</Card>
      <Card title={`Completed${done.data ? ` · ${done.data.pos.length}` : ""}`}>{done.loading ? <Loading /> : <Table cols={cols} rows={done.data?.pos || []} rowKey={(p) => p.name} onRow={setSel} empty="Nothing completed yet." />}</Card>
      {sel && (
        <Drawer title={`PO ${sel.name}`} onClose={() => setSel(null)}>
          <Field k="PO date" v={dmy(sel.date)} /><Field k="Expected by" v={dmy(sel.schedule)} /><Field k="Project" v={sel.project} /><Field k="Status" v={sel.status} /><Field k="Value" v={inr(sel.grand_total)} />
          <div style={{ fontWeight: 700, color: P.navy, fontSize: 13, margin: "14px 0 6px" }}>Lines</div>
          <Table search={false} rowKey={(i) => i.item + i.schedule} rows={sel.items} cols={[
            { key: "i", label: "Item", get: (i) => i.item },
            { key: "q", label: "Qty", get: (i) => i.qty != null ? `${i.qty} ${i.uom}` : "", num: true },
            { key: "r", label: "Received", get: (i) => i.received ?? "", num: true },
            { key: "s", label: "By", get: (i) => dmy(i.schedule) },
            { key: "a", label: "Amount", get: (i) => inr(i.amount), num: true },
          ]} />
        </Drawer>
      )}
    </div>
  );
}
