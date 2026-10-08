"use client";
/**
 * THE VENDOR REGISTRATION FORM, AS IT STANDS ON nandan.co.in (Dr Raghu, 8 Oct 2026: "Once the form is made in
 * an as-is condition, Mukesh will then give changes to that if required"). Field for field, in Mukesh's own
 * labels and order. Public — no login. Submits to /api/portal/vrf.
 */
import { useState } from "react";
import { VRF_RELATIONSHIP, VRF_COMPANY_TYPES, VRF_ITEMS, VRF_FILE_KINDS } from "@/lib/vrf-fields";
import { LOGO } from "@/lib/logo";

const C = { ink: "#16232F", dim: "#5B6470", line: "#D9D6CD", navy: "#16232F", accent: "#D9641B", red: "#8E2C20", green: "#2A6B39" };
const F = { width: "100%", border: `1px solid ${C.line}`, borderRadius: 6, padding: "10px 12px", fontSize: 15, color: C.ink, background: "#fff", boxSizing: "border-box" as const };

export default function VendorForm() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; files: number } | null>(null);
  const [err, setErr] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setErr("");
    const fd = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/portal/vrf", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `The server answered ${r.status}.`);
      setDone({ id: j.id, files: j.files || 0 }); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
    finally { setBusy(false); }
  };
  const Field = ({ label, name, req, type = "text", hint, as }: { label: string; name: string; req?: boolean; type?: string; hint?: string; as?: "textarea" | "select"; }) => (
    <label style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: C.dim, marginBottom: 14 }}>
      {label}{req && <span style={{ color: C.red }}> *</span>}
      {as === "textarea" ? <textarea name={name} required={req} rows={3} style={{ ...F, marginTop: 6, fontFamily: "inherit" }} /> : <input name={name} type={type} required={req} style={{ ...F, marginTop: 6 }} />}
      {hint && <div style={{ fontSize: 12, fontWeight: 400, color: C.dim, marginTop: 3 }}>{hint}</div>}
    </label>
  );
  const Select = ({ label, name, opts, req }: { label: string; name: string; opts: string[]; req?: boolean }) => (
    <label style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: C.dim, marginBottom: 14 }}>
      {label}{req && <span style={{ color: C.red }}> *</span>}
      <select name={name} required={req} defaultValue="" style={{ ...F, marginTop: 6 }}><option value="">Choose</option>{opts.map((o) => <option key={o}>{o}</option>)}</select>
    </label>
  );
  const Upload = ({ label, name, req }: { label: string; name: string; req?: boolean }) => (
    <label style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: C.dim, marginBottom: 14 }}>
      {label}{req && <span style={{ color: C.red }}> *</span>}
      <input name={name} type="file" multiple required={req} accept=".pdf,.jpg,.jpeg,.png,.ppt,.pptx,.doc,.docx" style={{ display: "block", marginTop: 6, fontSize: 13 }} />
    </label>
  );
  const H = ({ children }: { children: React.ReactNode }) => <h2 style={{ fontSize: 17, color: C.navy, borderBottom: `2px solid ${C.navy}`, paddingBottom: 6, margin: "26px 0 14px" }}>{children}</h2>;
  return (
    <main style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", color: C.ink, background: "#EFEDE7", minHeight: "100vh", padding: "24px 12px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", background: "#fff", borderRadius: 10, padding: "26px 28px", boxShadow: "0 2px 14px rgba(20,30,40,.10)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Nandan GSE" style={{ height: 34 }} />
          <div style={{ textAlign: "right" }}><div style={{ fontSize: 22, fontWeight: 800 }}>Nandan Vendor Registration Form</div><div style={{ fontSize: 13, color: C.dim }}>Nandan GSE Private Limited · Khopoli</div></div>
        </div>
        {done ? (
          <div style={{ marginTop: 24, padding: 18, borderRadius: 8, background: "#F2F8F3", border: `1px solid ${C.green}` }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.green }}>Thank you — your registration is received.</div>
            <div style={{ marginTop: 6, fontSize: 14 }}>Reference <b className="tnum">{done.id.slice(0, 8).toUpperCase()}</b>{done.files ? ` · ${done.files} file${done.files === 1 ? "" : "s"} attached` : ""}. Our purchase team will review it and get in touch.</div>
            <div style={{ marginTop: 10, fontSize: 13, color: C.dim }}>Questions: purchase@nandan.co.in</div>
          </div>
        ) : (
          <form onSubmit={submit} style={{ marginTop: 18 }}>
            <input name="website_url" tabIndex={-1} autoComplete="off" style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} aria-hidden="true" />
            <p style={{ fontSize: 14, color: C.dim }}>Fields marked <span style={{ color: C.red }}>*</span> are required.</p>
            <Field label="Email" name="email" type="email" req />
            <Field label="Supplier ID (In Nandan Scope)" name="supplier_id" />
            <Select label="Type of Relationship" name="relationship" opts={VRF_RELATIONSHIP} />
            <Field label="Do you have Any Material Storage Facility and what is the Capacity ?" name="storage_facility" req as="textarea" />
            <Field label="Do you have any Inhouse and Pre-dispatch Inspection Facility ?" name="inspection_facility" as="textarea" />
            <Field label="What Inhouse Manufacturing facility do you have ?" name="inhouse_mfg" as="textarea" />
            <Field label="What are the manufacturing Processes that outsource ?" name="outsourced_processes" as="textarea" />
            <H>Company</H>
            <Field label="Company Name" name="company_name" req />
            <Field label="Main Contact Person Name" name="contact_name" req />
            <Field label="Main Contact Person Mobile No" name="contact_mobile" type="tel" req />
            <Field label="Company Email Id" name="company_email" type="email" req />
            <Field label="Company Phone No" name="company_phone" type="tel" req />
            <Field label="Company Address" name="address" req as="textarea" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label="City" name="city" req />
              <Field label="Pin Code" name="pin" req />
            </div>
            <Field label="Established In Year" name="established_year" />
            <Field label="Company PAN No" name="pan_no" />
            <Upload label={VRF_FILE_KINDS[0][1]} name="file_pan" />
            <Select label="Type of Company" name="company_type" opts={VRF_COMPANY_TYPES} />
            <Field label="Company GST No" name="gst_no" req hint="If you dont have GST then write N/A" />
            <Upload label={VRF_FILE_KINDS[1][1]} name="file_gst" />
            <H>Items supplied <span style={{ color: C.red }}>*</span></H>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: "6px 14px", marginBottom: 14 }}>
              {VRF_ITEMS.map((it) => (
                <label key={it} style={{ fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" name="items_supplied" value={it} checked={items.includes(it)} onChange={(e) => setItems(e.target.checked ? [...items, it] : items.filter((x) => x !== it))} /> {it}
                </label>
              ))}
            </div>
            {items.includes("Other") && <Field label="Other Item Supplied" name="other_items" />}
            <Field label="Please Mention Below What All Supplies And Support You Do In Brief So We Can Maximise Our Relationship" name="brief" as="textarea" />
            <Upload label={VRF_FILE_KINDS[2][1]} name="file_brochure" />
            <H>Bank Details Mapping <span style={{ color: C.red }}>*</span></H>
            <Field label="Bank Name" name="bank_name" req />
            <Field label="Account No" name="account_no" req />
            <Field label="IFSC Code" name="ifsc" req />
            <Field label="Branch" name="branch" req />
            <Field label="Contact For Accounting" name="accounts_contact" req />
            <Upload label={VRF_FILE_KINDS[3][1]} name="file_cheque" />
            <H>Send Me A Copy Of My Responses</H>
            <div style={{ display: "flex", gap: 18, fontSize: 14, marginBottom: 18 }}>
              <label style={{ display: "flex", gap: 6 }}><input type="radio" name="send_copy" value="yes" /> Yes</label>
              <label style={{ display: "flex", gap: 6 }}><input type="radio" name="send_copy" value="no" defaultChecked /> No</label>
            </div>
            {err && <div style={{ color: C.red, fontWeight: 700, marginBottom: 12 }}>{err}</div>}
            <button type="submit" disabled={busy} style={{ background: C.accent, color: "#fff", border: 0, borderRadius: 6, padding: "12px 22px", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>{busy ? "Submitting…" : "Submit"}</button>
            <div style={{ fontSize: 12, color: C.dim, marginTop: 14 }}>Your details are held by Nandan GSE for supplier registration and evaluation only. <a href="/privacy">Privacy</a></div>
          </form>
        )}
      </div>
    </main>
  );
}
