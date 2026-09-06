"use client";
// split out of CrmApp.tsx (Genie 5.0.1.1) — one file per tab, loaded when opened
import { useCallback, useEffect, useState } from "react";

import { PIPELINES } from "@/crm/doctypes";

import RichTextEditor, { RichContent } from "../../RichTextEditor";

import { BORDER, MUTED, NAVY, ORANGE, Row } from "./shared";
import { PencilField, dIN, money } from "./Widgets";
import { RichText } from "./Record";
import { ErpPushBox } from "./Quote";

export function ProductBasicTab({ row, onSaved }: { row: Row; onSaved: (r?: Row) => void }) {
  const rid = String(row.id ?? "");
  const [busyErp, setBusyErp] = useState(false);
  const [msg, setMsg] = useState("");
  const [editDesc, setEditDesc] = useState(false);
  const [busyDesc, setBusyDesc] = useState(false);

  const patch = async (fields: Record<string, unknown>) => {
    const r = await fetch(`/api/crm/product?id=${encodeURIComponent(rid)}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(fields),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Could not save");
    onSaved((j.row ?? { ...row, ...fields }) as Row);
  };
  const P = (name: string) => (v: string) => patch({ [name]: v === "" ? null : v });
  const PN = (name: string) => (v: string) => patch({ [name]: v === "" ? null : Number(v) });

  // pull this one item AGAIN from the ERP — description rich with images,
  // the image field, and every file attached to the Item
  const pullErp = async () => {
    setBusyErp(true); setMsg("");
    try {
      const r = await fetch("/api/crm/product-extra", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "erp_refresh", product_id: rid }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "The ERP did not answer");
      const rr = await (await fetch(`/api/crm/product?id=${encodeURIComponent(rid)}`, { cache: "no-store" })).json();
      if (rr?.row) onSaved(rr.row as Row);
      setMsg(`Pulled from ERP ✓${j.attachments ? ` · ${j.attachments} file${j.attachments === 1 ? "" : "s"}` : ""}`);
      window.setTimeout(() => setMsg(""), 4000);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusyErp(false); }
  };

  const attachments = Array.isArray(row.attachments) ? (row.attachments as { name?: string; url?: string }[]) : [];
  const img = row.image ? String(row.image) : "";
  const desc = String(row.description ?? "");

  const uploadImage = async (f: File) => {
    const fd = new FormData();
    fd.append("target_type", "product"); fd.append("target_id", rid); fd.append("file", f);
    const r = await fetch("/api/crm/opp-attach", { method: "POST", body: fd });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Upload failed");
    return String(j.url);
  };

  const [busyUp, setBusyUp] = useState("");
  const [pushOpen, setPushOpen] = useState(false);

  return (
    <div className="p-4">
      <div className="flex gap-5 flex-wrap">
        <div className="grid gap-x-6 gap-y-3" style={{ flex: 1, minWidth: 340, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", alignContent: "start" }}>
          <PencilField label="Item Group" value={row.item_group} onSave={P("item_group")} />
          <PencilField label="Item" value={row.name} onSave={(v) => (v ? patch({ name: v }) : Promise.reject(new Error("The item needs a name")))} />
          <PencilField label="Item ID" value={row.sku} display={(v) => <b>{String(v ?? "—")}</b>} />
          <PencilField label="Approved Price INR" value={row.approved_price_inr} type="money" display={(v) => <b>{money(v)}</b>} onSave={PN("approved_price_inr")} />
          <PencilField label="Last Quoted Price" value={row.last_quoted_price} display={(v) => money(v)} />
          <PencilField label="Last Quoted On" value={row.last_quoted_on} display={dIN} />
          <PencilField label="Avg Quoted (1 yr)" value={row.avg_quoted_price_1y} display={(v) => money(v)} />
          <PencilField label="Alternate Price USD" value={row.alt_price_usd} type="money" display={(v) => money(v, "USD")} onSave={PN("alt_price_usd")} />
          <PencilField label="Delivery Period" value={row.delivery_period} onSave={P("delivery_period")} />
          <PencilField label="Throughput %" value={row.throughput_pct} type="number" display={(v) => (v === null || v === undefined ? "—" : `${v}%`)} onSave={PN("throughput_pct")} />
          <PencilField label="Purchase Item" value={row.purchase_item} onSave={P("purchase_item")} />
          <PencilField label="Pipeline" value={row.pipeline} type="select" options={[...PIPELINES]} onSave={P("pipeline")} />
          <PencilField label="Optional Extras" value={row.optional_extras} onSave={P("optional_extras")} />
        </div>
        <div style={{ width: 240, flexShrink: 0 }}>
          <div className="text-xs font-semibold mb-1" style={{ color: MUTED }}>IMAGE</div>
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, border: `1px solid ${BORDER}`, cursor: "zoom-in" }}
              onClick={() => window.open(img, "_blank", "noopener")} />
          ) : (
            <div className="rounded border text-xs flex items-center justify-center" style={{ borderColor: BORDER, color: MUTED, height: 120 }}>no image yet</div>
          )}
          {/* UPLOAD FROM THIS COMPUTER (Dr Raghu, 31 Aug 2026: "in product
              also allow upload from computer") — the picture need not wait
              on somebody putting it into the ERP first. */}
          <label className="mt-2 block w-full rounded px-2 py-1.5 text-xs font-bold text-center cursor-pointer border"
            style={{ borderColor: NAVY, color: NAVY }}>
            {busyUp === "image" ? "Uploading…" : img ? "⇪ Replace the image" : "⇪ Upload an image"}
            <input type="file" accept="image/*" hidden disabled={!!busyUp}
              onChange={async (e) => {
                const f = e.target.files?.[0]; e.target.value = "";
                if (!f) return;
                setBusyUp("image"); setMsg("");
                try { await patch({ image: await uploadImage(f) }); setMsg("Image uploaded ✓"); window.setTimeout(() => setMsg(""), 4000); }
                catch (er) { setMsg(er instanceof Error ? er.message : String(er)); }
                finally { setBusyUp(""); }
              }} />
          </label>

          <button onClick={() => void pullErp()} disabled={busyErp}
            className="mt-2 w-full rounded px-2 py-1.5 text-xs font-bold text-white" style={{ background: busyErp ? "#B9BEC4" : NAVY }}>
            {busyErp ? "Pulling…" : "↻ Pull from ERP"}
          </button>
          <div className="text-xs mt-1" style={{ color: MUTED, lineHeight: 1.5 }}>Re-reads this item — description, image and its attached files.</div>

          {/* …and the other way (Dr Raghu, 31 Aug 2026: "Can this be pushed
              back to erp? along with the modification?"). It shows what
              differs before it writes anything. */}
          <button onClick={() => setPushOpen(true)}
            className="mt-2 w-full rounded px-2 py-1.5 text-xs font-bold border" style={{ borderColor: ORANGE, color: ORANGE }}>
            ⇧ Push to ERP
          </button>
          {msg && <div className="text-xs mt-1 font-semibold" style={{ color: msg.includes("✓") ? "#1A7F4E" : "#8E2C20" }}>{msg}</div>}

          <div className="mt-3">
            <div className="text-xs font-semibold mb-1" style={{ color: MUTED }}>ATTACHMENTS</div>
            {attachments.map((a, i) => (
              <div key={i} className="flex items-start gap-1 mb-0.5">
                <a href={String(a.url)} target="_blank" rel="noreferrer" className="text-xs flex-1" style={{ color: "#2C5B82", textDecoration: "underline", overflowWrap: "anywhere" }}>📎 {String(a.name || a.url)}</a>
                <button title="Remove from this product" style={{ color: MUTED, fontSize: 11 }}
                  onClick={async () => {
                    if (!window.confirm(`Remove "${String(a.name || a.url)}" from this product?`)) return;
                    await fetch("/api/crm/product-extra", {
                      method: "POST", headers: { "content-type": "application/json" },
                      body: JSON.stringify({ action: "attach_del", product_id: rid, url: a.url }),
                    });
                    const rr = await (await fetch(`/api/crm/product?id=${encodeURIComponent(rid)}`, { cache: "no-store" })).json();
                    if (rr?.row) onSaved(rr.row as Row);
                  }}>✕</button>
              </div>
            ))}
            {attachments.length === 0 && <div className="text-xs" style={{ color: MUTED }}>None yet.</div>}
            <label className="mt-1 block w-full rounded px-2 py-1 text-xs font-bold text-center cursor-pointer border"
              style={{ borderColor: BORDER, color: MUTED }}>
              {busyUp === "file" ? "Uploading…" : "＋ Add a file from this computer"}
              <input type="file" hidden disabled={!!busyUp}
                onChange={async (e) => {
                  const f = e.target.files?.[0]; e.target.value = "";
                  if (!f) return;
                  setBusyUp("file"); setMsg("");
                  try {
                    const url = await uploadImage(f);
                    await fetch("/api/crm/product-extra", {
                      method: "POST", headers: { "content-type": "application/json" },
                      body: JSON.stringify({ action: "attach_add", product_id: rid, name: f.name, url }),
                    });
                    const rr = await (await fetch(`/api/crm/product?id=${encodeURIComponent(rid)}`, { cache: "no-store" })).json();
                    if (rr?.row) onSaved(rr.row as Row);
                    setMsg("File attached ✓"); window.setTimeout(() => setMsg(""), 4000);
                  } catch (er) { setMsg(er instanceof Error ? er.message : String(er)); }
                  finally { setBusyUp(""); }
                }} />
            </label>
            <div className="text-xs mt-1" style={{ color: MUTED, lineHeight: 1.5 }}>Up to 25 MB. Every file is copied to the Drive archive too.</div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold" style={{ color: MUTED }}>DESCRIPTION</span>
          {!editDesc && <button title="Edit the description" onClick={() => setEditDesc(true)} style={{ fontSize: 12, opacity: 0.6 }}>✏️</button>}
        </div>
        {editDesc ? (
          <RichTextEditor initial={desc} busy={busyDesc} minHeight={260} onCancel={() => setEditDesc(false)}
            onUploadImage={uploadImage}
            onSave={(html) => {
              setBusyDesc(true);
              patch({ description: html }).then(() => setEditDesc(false)).catch((e) => window.alert(e instanceof Error ? e.message : String(e))).finally(() => setBusyDesc(false));
            }} />
        ) : (
          <div className="rounded border p-3 text-sm" style={{ borderColor: BORDER, lineHeight: 1.6, overflowWrap: "anywhere" }}>
            {desc.trim()
              ? <RichContent text={desc} legacy={(s2) => <RichText text={s2} />} />
              : <span style={{ color: MUTED }}>No description yet — ✏️ or ↻ Pull from ERP.</span>}
          </div>
        )}
      </div>

      {pushOpen && <ErpPushBox pid={rid} onClose={() => setPushOpen(false)} />}
    </div>
  );
}

export function ProductQuotesTab({ id }: { id: string }) {
  type Q = { id: string; qtn_no: string; client: string | null; quoted_on: string | null; qty: number | null; rate: number | null; amount: number | null; currency: string; source: string };
  const [quotes, setQuotes] = useState<Q[] | null>(null);
  const [erpUrl, setErpUrl] = useState<string | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    setQuotes(null); setErr("");
    fetch(`/api/crm/product-extra?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "?"); setQuotes(j.quotes); setErpUrl(j.erp_url); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [id]);
  return (
    <div className="p-4">
      {err && <div className="rounded p-2 mb-2 text-sm" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>}
      {quotes === null && !err && <div className="text-sm" style={{ color: MUTED }}>reading the quote history…</div>}
      {quotes !== null && quotes.length === 0 && <div className="text-sm" style={{ color: MUTED }}>No quotation has carried this item in the imported year.</div>}
      {quotes !== null && quotes.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="genie-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ textAlign: "left", color: MUTED, fontSize: 11 }}>
              <th className="py-1 pr-3">QTN NO</th><th className="py-1 pr-3">CLIENT</th><th className="py-1 pr-3">DATE</th>
              <th className="py-1 pr-3" style={{ textAlign: "right" }}>QTY</th><th className="py-1 pr-3" style={{ textAlign: "right" }}>RATE</th>
              <th className="py-1 pr-3" style={{ textAlign: "right" }}>AMOUNT</th><th className="py-1" /></tr></thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id} style={{ borderTop: `1px solid ${BORDER}` }}>
                  <td className="py-1.5 pr-3 tnum" title={q.qtn_no}>{(q.qtn_no.match(/(\d+)\s*$/) || [, q.qtn_no])[1]}</td>
                  <td className="py-1.5 pr-3">{q.client || "—"}</td>
                  <td className="py-1.5 pr-3 tnum">{dIN(q.quoted_on)}</td>
                  <td className="py-1.5 pr-3 tnum" style={{ textAlign: "right" }}>{q.qty ?? "—"}</td>
                  <td className="py-1.5 pr-3 tnum" style={{ textAlign: "right" }}>{money(q.rate, q.currency)}</td>
                  <td className="py-1.5 pr-3 tnum" style={{ textAlign: "right" }}>{money(q.amount, q.currency)}</td>
                  <td className="py-1.5">
                    {q.source === "erp" && erpUrl ? (
                      <a href={`${erpUrl}/app/quotation/${encodeURIComponent(q.qtn_no)}`} target="_blank" rel="noreferrer"
                        className="text-xs font-bold" style={{ color: "#2C5B82" }}>View Quote ↗</a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ProductPricingTab({ id, onSaved }: { id: string; onSaved: () => void }) {
  type P = { id: string; priced_on: string; currency: string; amount: number; remarks: string | null; approved_by: string | null; is_approved: boolean };
  const [prices, setPrices] = useState<P[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const todayIst = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const [form, setForm] = useState({ priced_on: todayIst, currency: "INR", amount: "", remarks: "", approved_by: "", is_approved: false });
  const load = useCallback(() => {
    fetch(`/api/crm/product-extra?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "?"); setPrices(j.prices); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [id]);
  useEffect(() => { setPrices(null); setErr(""); load(); }, [load]);
  const act = async (body: Record<string, unknown>) => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/crm/product-extra", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save");
      load(); onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="p-4">
      <p className="text-xs mb-3" style={{ color: MUTED, maxWidth: "72ch", lineHeight: 1.6 }}>
        The pricing ladder. The <b style={{ color: "#1A7F4E" }}>Approved</b> row leads the table and is the price a quote line
        starts from when this product is picked. Approving a new row retires the old approval.
      </p>
      {err && <div className="rounded p-2 mb-2 text-sm" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>}
      <div className="rounded border p-2.5 mb-3 flex items-end gap-2 flex-wrap" style={{ borderColor: BORDER, background: "#FAF9F5" }}>
        {([["Date", "priced_on", "date", 130], ["Currency", "currency", "select", 90], ["Amount", "amount", "number", 130], ["Remarks", "remarks", "text", 220], ["Approved by", "approved_by", "text", 140]] as const).map(([lab, key, typ, w]) => (
          <label key={key} className="block">
            <div className="text-xs font-semibold mb-0.5" style={{ color: MUTED }}>{lab}</div>
            {typ === "select" ? (
              <select value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className="px-2 py-1 rounded text-sm border" style={{ borderColor: BORDER, background: "#fff", width: w }}>
                {["INR", "USD", "EUR"].map((c) => <option key={c}>{c}</option>)}
              </select>
            ) : (
              <input type={typ} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="px-2 py-1 rounded text-sm border" style={{ borderColor: BORDER, width: w }} />
            )}
          </label>
        ))}
        <label className="flex items-center gap-1.5 text-xs font-semibold pb-1.5" style={{ color: "#1A7F4E" }}>
          <input type="checkbox" checked={form.is_approved} onChange={(e) => setForm((f) => ({ ...f, is_approved: e.target.checked }))} style={{ accentColor: "var(--green)" }} />
          This is the Approved price
        </label>
        <button disabled={busy || !(Number(form.amount) > 0)} onClick={() => void act({ action: "price_add", product_id: id, ...form }).then(() => setForm((f) => ({ ...f, amount: "", remarks: "" })))}
          className="rounded px-3 py-1.5 text-sm font-bold text-white" style={{ background: Number(form.amount) > 0 ? ORANGE : "#B9BEC4" }}>
          + Add price
        </button>
      </div>
      {prices === null && !err && <div className="text-sm" style={{ color: MUTED }}>reading the ladder…</div>}
      {prices !== null && prices.length === 0 && <div className="text-sm" style={{ color: MUTED }}>No price rows yet — the first one you add can wear the approval.</div>}
      {prices !== null && prices.length > 0 && (
        <table className="genie-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ textAlign: "left", color: MUTED, fontSize: 11 }}>
            <th className="py-1 pr-3">DATE</th><th className="py-1 pr-3">CURRENCY</th>
            <th className="py-1 pr-3" style={{ textAlign: "right" }}>AMOUNT</th>
            <th className="py-1 pr-3">REMARKS</th><th className="py-1 pr-3">APPROVED BY</th><th className="py-1" /></tr></thead>
          <tbody>
            {prices.map((p) => (
              <tr key={p.id} style={{ borderTop: `1px solid ${BORDER}`, background: p.is_approved ? "#E6F4EB" : undefined }}>
                <td className="py-1.5 pr-3 tnum">{dIN(p.priced_on)}</td>
                <td className="py-1.5 pr-3">{p.currency}</td>
                <td className="py-1.5 pr-3 tnum" style={{ textAlign: "right", fontWeight: p.is_approved ? 800 : 500 }}>{money(p.amount, p.currency)}</td>
                <td className="py-1.5 pr-3">{p.remarks || "—"}</td>
                <td className="py-1.5 pr-3">{p.approved_by || "—"}</td>
                <td className="py-1.5" style={{ whiteSpace: "nowrap" }}>
                  {p.is_approved
                    ? <span className="rounded px-1.5 py-0.5 text-xs font-bold" style={{ background: "var(--green)", color: "#fff" }}>APPROVED</span>
                    : <button title="Remove this price row" disabled={busy} onClick={() => { if (window.confirm("Remove this price row?")) void act({ action: "price_del", id: p.id }); }} style={{ color: "#8E2C20", fontSize: 12 }}>✕</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function ProductTrainingTab({ id, group }: { id: string; group: string | null }) {
  const [content, setContent] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ updated_by?: string; updated_at?: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    setContent(null); setErr(""); setEditing(false);
    fetch(`/api/crm/product-extra?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "?"); setContent(String(j.training?.content ?? "")); setMeta(j.training); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [id]);
  if (!group) return <div className="p-4 text-sm" style={{ color: MUTED }}>Give this product an Item Group first — training lives per product family.</div>;
  const save = async (html: string) => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/crm/product-extra", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "training_save", item_group: group, content: html }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save");
      setContent(html); setEditing(false);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-sm font-bold">Training — {group}</span>
        {!editing && content !== null && <button title="Edit the training" onClick={() => setEditing(true)} style={{ fontSize: 12, opacity: 0.6 }}>✏️</button>}
        <span className="text-xs" style={{ color: MUTED }}>written once for the family, read on every product in it{meta?.updated_by ? ` · last by ${meta.updated_by}` : ""}</span>
      </div>
      {err && <div className="rounded p-2 mb-2 text-sm" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>}
      {content === null && !err && <div className="text-sm" style={{ color: MUTED }}>reading…</div>}
      {content !== null && (editing ? (
        <RichTextEditor initial={content} busy={busy} minHeight={260} onCancel={() => setEditing(false)} onSave={(html) => void save(html)}
          placeholder={`What every salesperson should know about ${group}.`} />
      ) : (
        <div className="rounded border p-3 text-sm" style={{ borderColor: BORDER, lineHeight: 1.6 }}>
          {content.trim()
            ? <RichContent text={content} legacy={(s2) => <RichText text={s2} />} />
            : <span style={{ color: MUTED }}>Nothing written for this family yet — ✏️ starts it.</span>}
        </div>
      ))}
    </div>
  );
}

/** Situational Details on a quote (Dr Raghu, 30 Aug 2026): six bold
 *  headings, blank below each by default; Genie writes or improves the
 *  text when ASKED — at most three runs, then the pen is the hand's. */
export const SITUATIONAL_BLANK = ["Situational Analysis", "Situation", "Current Reality", "Solution We discussed", "Result", "Why nandan"]
  .map((h) => `<p><b>${h}:</b></p><p><br></p>`).join("");

export function SituationalTab({ row, onSaved }: { row: Row; onSaved: (r?: Row) => void }) {
  const rid = String(row.id ?? "");
  const stored = String(row.situational_details ?? "").trim();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<"save" | "genie" | null>(null);
  const [armed, setArmed] = useState(false);
  const [err, setErr] = useState("");
  const runs = Number(row.situational_runs) || 0;
  const html = stored || SITUATIONAL_BLANK;

  const save = async (v: string) => {
    setBusy("save"); setErr("");
    try {
      const r = await fetch(`/api/crm/quotation?id=${encodeURIComponent(rid)}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ situational_details: v }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save");
      onSaved(j.row as Row); setEditing(false);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };
  const genie = async () => {
    setBusy("genie"); setErr("");
    try {
      const r = await fetch("/api/crm/situational", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ quotation_id: rid }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Genie could not write it");
      const rr = await (await fetch(`/api/crm/quotation?id=${encodeURIComponent(rid)}`, { cache: "no-store" })).json();
      if (rr?.row) onSaved(rr.row as Row);
      setArmed(false);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        {!editing && <button title="Edit by hand" onClick={() => setEditing(true)} style={{ fontSize: 13, opacity: 0.7 }}>✏️ Edit</button>}
        <label className="text-xs flex items-center gap-1.5" style={{ color: MUTED }}>
          <input type="checkbox" checked={armed} disabled={runs >= 3 || busy !== null} onChange={(e) => setArmed(e.target.checked)} style={{ accentColor: NAVY }} />
          Let Genie {stored ? "improve" : "write"} it
        </label>
        <button disabled={!armed || runs >= 3 || busy !== null} onClick={() => void genie()}
          className="rounded px-3 py-1 text-xs font-bold text-white"
          style={{ background: armed && runs < 3 && busy === null ? "#7C3AED" : "#B9BEC4" }}>
          {busy === "genie" ? "Genie is writing…" : `✨ Situational Analysis (${3 - runs} left)`}
        </button>
        {runs >= 3 && <span className="text-xs" style={{ color: MUTED }}>Genie has improved this three times — the pen is yours now.</span>}
        {err && <span className="text-xs font-semibold" style={{ color: "#8E2C20" }}>{err}</span>}
      </div>
      {editing ? (
        <RichTextEditor initial={html} busy={busy === "save"} minHeight={320}
          onUploadImage={async (f) => {
            const fd = new FormData();
            fd.append("target_type", "quotation"); fd.append("target_id", rid); fd.append("file", f);
            const r = await fetch("/api/crm/opp-attach", { method: "POST", body: fd });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || "Upload failed");
            return String(j.url);
          }}
          onCancel={() => setEditing(false)} onSave={(v) => void save(v)} />
      ) : (
        <div className="rounded border p-4 text-sm" style={{ borderColor: BORDER, lineHeight: 1.7, maxWidth: "80ch" }}>
          <RichContent text={html} legacy={(s2) => <RichText text={s2} />} />
        </div>
      )}
    </div>
  );
}