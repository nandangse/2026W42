"use client";
/** VENDOR REGISTRATIONS — what suppliers filled on /portal/vrf, for the purchase team (8 Oct 2026). */
import { useState } from "react";
import GenieTable from "@/components/GenieTable";
import { Btn, Note, INK, MUTED, BORDER, GREEN, AMBER, useLoad } from "@/components/ims/ui";
import type { VrfRow } from "@/lib/vrf-fields";

const dmy = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}` : "·");
const colour = (s: string) => (s === "approved" ? GREEN : s === "rejected" ? "#8E2C20" : s === "reviewed" ? "var(--blue)" : AMBER);

export default function VendorRegistrations() {
  const [data, busy, reload, err] = useLoad<{ rows: VrfRow[]; installed: boolean }>("/api/saamaan/vrf");
  const [open, setOpen] = useState<VrfRow | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const setStatus = async (r: VrfRow, status: string) => {
    setSaving(true);
    const x = await fetch("/api/saamaan/vrf", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: r.id, status, review_note: note || r.review_note }) });
    setSaving(false); if (x.ok) { setOpen(null); reload(); }
  };
  const rows = data?.rows ?? null;
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <tr><td style={{ color: MUTED, padding: "3px 8px 3px 0", whiteSpace: "nowrap", verticalAlign: "top", fontSize: 12 }}>{k}</td><td style={{ padding: "3px 0", fontSize: 13, color: INK }}>{v || "·"}</td></tr>;
  return (
    <div>
      <div className="text-sm mb-2" style={{ color: INK }}><b>Vendor registrations</b> <span style={{ color: MUTED }}>— filled by suppliers at <a href="/portal/vrf" target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>genie.nandan.co.in/portal/vrf</a>. New ones amber; mark reviewed, approved or rejected with a note.</span></div>
      {data && !data.installed && <Note kind="warn">Run migration 0207 first — registrations have nowhere to live yet.</Note>}
      {err && <Note kind="error">{err}</Note>}
      {rows && rows.length > 0 && <div className="text-xs mb-2" style={{ color: MUTED }}>{rows.length} registration{rows.length === 1 ? "" : "s"} · {rows.filter((r) => r.status === "new").length} new</div>}
      <GenieTable<VrfRow> rows={rows} minWidth={1000} empty="No registration received yet — share genie.nandan.co.in/portal/vrf with suppliers."
        search={(r, q) => `${r.company_name} ${r.contact_name} ${r.city} ${r.gst_no} ${r.items_supplied.join(" ")} ${r.email}`.toLowerCase().includes(q)} searchPlaceholder="🔍 company, person, city, GST, item"
        columns={[
          { key: "at", label: "Received", align: "left", sort: (r) => r.at, render: (r) => <span className="tnum">{dmy(r.at.slice(0, 10))}</span> },
          { key: "c", label: "Company", align: "left", sort: (r) => r.company_name, render: (r) => <button onClick={() => { setOpen(r); setNote(r.review_note || ""); }} className="font-bold text-left" style={{ color: "var(--blue)", textDecoration: "underline dotted" }}>{r.company_name}</button> },
          { key: "rel", label: "Relationship", align: "left", sort: (r) => r.relationship, render: (r) => <span className="text-xs">{r.relationship || "·"}</span> },
          { key: "p", label: "Contact", align: "left", sort: (r) => r.contact_name, render: (r) => <span>{r.contact_name} <span className="text-xs tnum" style={{ color: MUTED }}>{r.contact_mobile}</span></span> },
          { key: "city", label: "City", align: "left", sort: (r) => r.city, render: (r) => <span>{r.city}</span> },
          { key: "gst", label: "GST", align: "left", sort: (r) => r.gst_no, render: (r) => <span className="tnum text-xs">{r.gst_no}</span> },
          { key: "it", label: "Items", align: "left", render: (r) => <span className="text-xs" style={{ color: MUTED }}>{r.items_supplied.slice(0, 4).join(", ")}{r.items_supplied.length > 4 ? ` +${r.items_supplied.length - 4}` : ""}</span> },
          { key: "f", label: "Files", align: "right", sort: (r) => r.files.length, render: (r) => <span className="tnum">{r.files.length || "·"}</span> },
          { key: "s", label: "Status", align: "left", sort: (r) => r.status, render: (r) => <b className="text-xs" style={{ color: colour(r.status) }}>{r.status}</b> },
        ]} />
      {busy && !rows && <div className="text-xs" style={{ color: MUTED }}>reading…</div>}
      {open && (
        <div onClick={() => setOpen(null)} style={{ position: "fixed", inset: 0, background: "rgba(22,35,47,0.55)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg" style={{ width: "min(860px, 100%)", maxHeight: "92vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
            <div className="px-4 py-3 flex items-center gap-3" style={{ background: "var(--navy)", color: "#fff" }}>
              <div style={{ flex: 1 }}><div className="font-bold" style={{ fontSize: 17 }}>{open.company_name}</div><div className="text-xs" style={{ color: "#8FA1B3" }}>received {dmy(open.at.slice(0, 10))} · {open.relationship || "relationship not said"} · <b style={{ color: colour(open.status) }}>{open.status}</b>{open.reviewed_by ? ` by ${open.reviewed_by.split("@")[0]} ${dmy(String(open.reviewed_at).slice(0, 10))}` : ""}</div></div>
              <button onClick={() => setOpen(null)} className="text-xs font-bold rounded px-2 py-1" style={{ background: "rgba(255,255,255,0.12)", color: "#D7DEE6" }}>✕</button>
            </div>
            <div className="p-4 grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <table><tbody>
                <Row k="Email" v={open.email} /><Row k="Supplier ID" v={open.supplier_id} /><Row k="Contact" v={`${open.contact_name} · ${open.contact_mobile}`} /><Row k="Company e-mail" v={open.company_email} /><Row k="Company phone" v={open.company_phone} />
                <Row k="Address" v={<span style={{ whiteSpace: "pre-wrap" }}>{open.address}</span>} /><Row k="City · PIN" v={`${open.city} · ${open.pin}`} /><Row k="Established" v={open.established_year} /><Row k="Type" v={open.company_type} /><Row k="PAN" v={open.pan_no} /><Row k="GST" v={open.gst_no} />
              </tbody></table>
              <table><tbody>
                <Row k="Storage facility" v={open.storage_facility} /><Row k="Inspection facility" v={open.inspection_facility} /><Row k="In-house manufacturing" v={open.inhouse_mfg} /><Row k="Outsourced processes" v={open.outsourced_processes} />
                <Row k="Items supplied" v={open.items_supplied.join(", ") + (open.other_items ? ` · other: ${open.other_items}` : "")} /><Row k="In brief" v={<span style={{ whiteSpace: "pre-wrap" }}>{open.brief}</span>} />
                <Row k="Bank" v={`${open.bank_name} · ${open.branch}`} /><Row k="Account" v={<span className="tnum">{open.account_no}</span>} /><Row k="IFSC" v={<span className="tnum">{open.ifsc}</span>} /><Row k="Accounts contact" v={open.accounts_contact} /><Row k="Copy requested" v={open.send_copy ? "yes" : "no"} />
                <Row k="Files" v={open.files.length ? open.files.map((f) => <div key={f.path}><a href={`/api/saamaan/vrf?file=${encodeURIComponent(f.path)}`} target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>{f.kind}: {f.name}</a> <span className="text-xs" style={{ color: MUTED }}>{(f.size / 1024).toFixed(0)} KB</span></div>) : "none"} />
              </tbody></table>
            </div>
            <div className="px-4 pb-4 flex gap-2 items-end flex-wrap">
              <label className="text-xs font-bold" style={{ color: MUTED, flex: 1, minWidth: 240 }}>Review note<br /><input value={note} onChange={(e) => setNote(e.target.value)} className="rounded border px-2 py-1.5 text-sm mt-1 w-full" style={{ borderColor: BORDER, color: INK }} placeholder="what was checked, what is missing" /></label>
              <Btn onClick={() => setStatus(open, "reviewed")} disabled={saving}>Mark reviewed</Btn>
              <Btn kind="primary" onClick={() => setStatus(open, "approved")} disabled={saving}>Approve</Btn>
              <Btn onClick={() => setStatus(open, "rejected")} disabled={saving}>Reject</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
