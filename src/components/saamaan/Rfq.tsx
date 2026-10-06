"use client";

/**
 * SAAMAAN → RFQs (Dr Raghu, 6 Oct 2026).
 *
 *   "We will create an RFQ, add an item ID, give a description, and that
 *    will then be sent to the suppliers in their portal ... The basic
 *    default description should come from the item, and then there can be
 *    an add-on remark ... Ideally, all the description changes should be
 *    done in the master so that it continues on forward. For example,
 *    ISMC 75 is not acceptable as it is. It has to be ISMC 75, main, 6 m
 *    long, and with TC."
 *
 * So the description on a line is the master's, and the way to improve it
 * is to improve the MASTER — right here, for those who keep the Item master
 * (Mukesh, Rameez), pushed to the ERP like every other Item-master edit. The
 * add-on remark is for what belongs to this RFQ alone.
 */

import { useEffect, useState } from "react";
import GenieTable from "@/components/GenieTable";
import { Screen, Btn, Note, Empty, INK, MUTED, BORDER, NAVY, GREEN, AMBER, RED, post, useLoad } from "@/components/ims/ui";

const ORANGE = "#E8600A";
const dmy = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const inr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;

interface Rfq { id: string; rfq_no: string; title: string; status: string; due_on: string | null; note: string; created_at: string; sent_at: string | null; items: number; suppliers: number; quoted: number }
interface Line { id: string; idx: number; item_code: string; item_name: string; description: string; addon: string; qty: number; uom: string; specs: string; required_by: string | null }
interface Sup { org_slug: string; org_name: string; status: string; quoted_at: string | null; remark: string }
interface Quote { rfq_item_id: string; org_slug: string; rate: number | null; qty_offered: number | null; lead_days: number | null; remark: string }

export default function RfqDesk({ email, isOwner }: { email: string; isOwner: boolean }) {
  const read = () => (typeof window === "undefined" ? "" : window.location.hash.replace(/^#/, ""));
  const [id, setId] = useState(read);
  useEffect(() => { const f = () => setId(read()); window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  const go = (x: string) => { window.location.hash = x; setId(x); };
  return id ? <One id={id} back={() => go("")} email={email} isOwner={isOwner} /> : <List go={go} />;
}

function List({ go }: { go: (x: string) => void }) {
  const [data, busy, reload, err] = useLoad<{ installed: boolean; may: boolean; rfqs: Rfq[] }>("/api/saamaan/rfq?view=list");
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState("");
  const create = async () => {
    const r = await post("/api/saamaan/rfq", { action: "create", title });
    if (!r.ok) { setMsg(r.error || "Not made."); return; }
    go(String(r.id));
  };
  const tone = (s: string) => (s === "sent" ? AMBER : s === "closed" ? GREEN : s === "cancelled" ? MUTED : NAVY);
  return (
    <Screen title="RFQs" blurb="Requests for quotation, sent to suppliers in their portal. Each line carries the Item master's description — improve the master and every RFQ after it is better — with an add-on remark for this RFQ alone."
      action={<Btn onClick={reload} disabled={busy}>↻</Btn>}>
      {err && <Note kind="error">{err}</Note>}
      {data && !data.installed && <Note kind="warn">Run migration 0201 first — RFQs have nowhere to live yet.</Note>}
      {data?.may && (
        <div className="flex gap-2 mb-3 flex-wrap">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What it is for — e.g. Structural steel for EIH 6.3 HL #3" className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: BORDER, flex: "1 1 360px" }} />
          <Btn kind="primary" onClick={create}>+ New RFQ</Btn>
          {msg && <span className="text-sm" style={{ color: RED }}>{msg}</span>}
        </div>
      )}
      <GenieTable<Rfq> rows={data ? data.rfqs : null} minWidth={860} search={(r, q) => `${r.rfq_no} ${r.title}`.toLowerCase().includes(q)} searchPlaceholder="🔍 RFQ no or title" empty="No RFQs yet."
        columns={[
          { key: "n", label: "RFQ", align: "left", sort: (r) => r.rfq_no, render: (r) => <button onClick={() => go(r.id)} className="font-bold" style={{ color: NAVY }}>{r.rfq_no}</button> },
          { key: "t", label: "For", align: "left", sort: (r) => r.title, render: (r) => r.title || <span style={{ color: MUTED }}>—</span> },
          { key: "s", label: "Status", align: "left", sort: (r) => r.status, render: (r) => <b style={{ color: tone(r.status) }}>{r.status}</b> },
          { key: "i", label: "Items", align: "right", sort: (r) => r.items, render: (r) => <span className="tnum">{r.items}</span> },
          { key: "q", label: "Quoted", align: "right", sort: (r) => r.quoted, render: (r) => <span className="tnum">{r.quoted}/{r.suppliers}</span> },
          { key: "d", label: "Quote by", align: "right", sort: (r) => r.due_on || "", render: (r) => dmy(r.due_on) },
          { key: "c", label: "Made", align: "right", sort: (r) => r.created_at, render: (r) => <span style={{ color: MUTED }}>{dmy(r.created_at)}</span> },
        ]} />
    </Screen>
  );
}

function One({ id, back, email, isOwner }: { id: string; back: () => void; email: string; isOwner: boolean }) {
  const [data, busy, reload, err] = useLoad<{ may: boolean; rfq: Rfq; items: Line[]; suppliers: Sup[]; quotes: Quote[]; master: Record<string, string> }>(`/api/saamaan/rfq?view=one&id=${id}`);
  const [supList] = useLoad<{ portal: boolean; suppliers: { slug: string; name: string; active: boolean; logins: number }[] }>("/api/saamaan/rfq?view=suppliers");
  const [hdr, setHdr] = useState({ title: "", due_on: "", note: "" });
  const [add, setAdd] = useState({ code: "", qty: "", uom: "", addon: "", specs: "", required_by: "" });
  const [preview, setPreview] = useState<{ item_name: string; description: string; uom: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [editMaster, setEditMaster] = useState<{ code: string; text: string } | null>(null);
  const masterEditor = isOwner || ["mukesh@nandan.co.in", "rameez@nandan.co.in"].includes(email.toLowerCase());
  useEffect(() => { if (data) setHdr({ title: data.rfq.title, due_on: data.rfq.due_on || "", note: data.rfq.note }); }, [data]);
  useEffect(() => {
    const code = add.code.trim();
    if (code.length < 3) { setPreview(null); return; }
    const t = setTimeout(() => {
      fetch(`/api/saamaan/rfq?view=item&code=${encodeURIComponent(code)}`, { cache: "no-store" }).then((r) => r.json()).then((j) => {
        if (j.ok) { setPreview({ item_name: j.item_name, description: j.description, uom: j.uom }); setAdd((a) => ({ ...a, uom: a.uom || j.uom })); } else setPreview(null);
      }).catch(() => setPreview(null));
    }, 350);
    return () => clearTimeout(t);
  }, [add.code]);
  if (err) return <Note kind="error">{err}</Note>;
  if (!data) return <Empty>Opening the RFQ…</Empty>;
  const { rfq, items, suppliers, quotes, master, may } = data;
  const draft = rfq.status === "draft" && may;
  const act = async (body: Record<string, unknown>, ok?: string) => { setMsg(""); const r = await post("/api/saamaan/rfq", body); if (!r.ok) { setMsg(r.error || "Not done."); return false; } if (ok) setMsg(ok); reload(); return true; };
  const chosen = new Set(suppliers.map((s) => s.org_slug));
  const toggleSup = (slug: string) => { const next = new Set(chosen); if (next.has(slug)) next.delete(slug); else next.add(slug); act({ action: "set_suppliers", id, slugs: [...next] }); };
  const saveMaster = async () => {
    if (!editMaster) return;
    const r = await post("/api/saamaan/item-edit", { action: "field", code: editMaster.code, field: "description", value: editMaster.text });
    if (!r.ok) { setMsg(r.error || "The ERP did not take it."); return; }
    setEditMaster(null);
    for (const l of items.filter((x) => x.item_code === editMaster.code)) await post("/api/saamaan/rfq", { action: "refresh_description", item_id: l.id });
    setMsg("The master is updated in the ERP — and this RFQ reads it."); reload();
  };
  const bestRate = (lineId: string) => { const r = quotes.filter((q) => q.rfq_item_id === lineId && q.rate != null).map((q) => Number(q.rate)); return r.length ? Math.min(...r) : null; };

  return (
    <Screen title={`${rfq.rfq_no}${rfq.title ? ` — ${rfq.title}` : ""}`} blurb={`${rfq.status}${rfq.sent_at ? ` · sent ${dmy(rfq.sent_at)}` : ""}${rfq.due_on ? ` · quotes by ${dmy(rfq.due_on)}` : ""}`}
      action={<>
        <Btn onClick={back}>← RFQs</Btn>
        {draft && <Btn kind="primary" onClick={() => { if (confirm(`Send ${rfq.rfq_no} to ${suppliers.length} supplier${suppliers.length === 1 ? "" : "s"}? The descriptions are read from the master once more and frozen.`)) act({ action: "send", id }, "Sent — it is in their portal now."); }} disabled={!items.length || !suppliers.length}>Send to suppliers</Btn>}
        {may && rfq.status === "sent" && <Btn onClick={() => act({ action: "close", id }, "Closed — no more quotes taken.")}>Close</Btn>}
        {may && ["draft", "sent"].includes(rfq.status) && <Btn kind="danger" onClick={() => { if (confirm("Cancel this RFQ?")) act({ action: "cancel", id }); }}>Cancel</Btn>}
      </>}>
      {msg && <Note kind={/Sent|updated|Closed/.test(msg) ? "info" : "error"}>{msg}</Note>}

      {draft && (
        <div className="rounded-lg border p-3 mb-3 bg-white grid gap-2" style={{ borderColor: BORDER }}>
          <div className="flex gap-2 flex-wrap">
            <input value={hdr.title} onChange={(e) => setHdr({ ...hdr, title: e.target.value })} placeholder="What it is for" className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: BORDER, flex: "1 1 300px" }} />
            <label className="text-xs" style={{ color: MUTED }}>Quotes by <input type="date" value={hdr.due_on} onChange={(e) => setHdr({ ...hdr, due_on: e.target.value })} className="rounded border px-2 py-1 text-sm" style={{ borderColor: BORDER }} /></label>
          </div>
          <textarea value={hdr.note} onChange={(e) => setHdr({ ...hdr, note: e.target.value })} rows={2} placeholder="To the suppliers — delivery at Khopoli, prices before GST, payment terms, test certificates…" className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: BORDER }} />
          <div><Btn onClick={() => act({ action: "save_header", id, ...hdr }, "Saved.")}>Save</Btn></div>
        </div>
      )}
      {!draft && rfq.note && <div className="rounded-lg border p-3 mb-3 bg-white text-sm" style={{ borderColor: BORDER, whiteSpace: "pre-wrap" }}>{rfq.note}</div>}

      <div className="text-xs font-bold uppercase mb-1" style={{ color: MUTED, letterSpacing: 0.6 }}>Items</div>
      <div className="grid gap-2 mb-3">
        {items.length === 0 && <Empty>No items yet.</Empty>}
        {items.map((l) => {
          const drift = draft && master[l.item_code] !== undefined && master[l.item_code] !== l.description;
          const lineQuotes = quotes.filter((q) => q.rfq_item_id === l.id);
          const best = bestRate(l.id);
          return (
            <div key={l.id} className="rounded-lg border p-3 bg-white" style={{ borderColor: BORDER }}>
              <div className="flex gap-2 items-baseline flex-wrap">
                <b style={{ color: NAVY }}>{l.idx}. {l.item_code}</b><b style={{ color: INK, flex: 1 }}>{l.item_name}</b>
                <b className="tnum" style={{ color: INK }}>{l.qty} {l.uom}</b>{l.required_by && <span className="text-xs" style={{ color: MUTED }}>by {dmy(l.required_by)}</span>}
                {draft && <button onClick={() => act({ action: "remove_item", item_id: l.id })} className="text-xs font-bold" style={{ color: RED }}>remove</button>}
              </div>
              <div className="text-sm mt-1" style={{ color: INK, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{l.description}</div>
              {drift && <div className="text-xs mt-1" style={{ color: AMBER }}>The master has changed since this line was added. <button onClick={() => act({ action: "refresh_description", item_id: l.id })} className="font-bold underline">Use the master&apos;s new description</button></div>}
              {draft && masterEditor && (editMaster?.code === l.item_code
                ? <div className="mt-2 grid gap-1"><textarea value={editMaster.text} onChange={(e) => setEditMaster({ ...editMaster, text: e.target.value })} rows={3} className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: ORANGE }} />
                    <div className="flex gap-2"><Btn kind="primary" onClick={saveMaster}>Save to the Item master (ERP)</Btn><Btn onClick={() => setEditMaster(null)}>Cancel</Btn></div>
                    <div className="text-xs" style={{ color: MUTED }}>Write it once, fully — &quot;ISMC 75, main, 6 m long, with TC&quot; — and every RFQ, PO and slip after this reads it.</div></div>
                : <button onClick={() => setEditMaster({ code: l.item_code, text: l.description })} className="text-xs font-bold mt-1" style={{ color: NAVY }}>✎ Improve the master description</button>)}
              {(l.addon || draft) && (draft
                ? <div className="grid gap-1 mt-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
                    <input defaultValue={l.addon} placeholder="Add-on remark, this RFQ only" onBlur={(e) => e.target.value !== l.addon && act({ action: "update_item", item_id: l.id, addon: e.target.value })} className="rounded border px-2 py-1 text-sm" style={{ borderColor: BORDER }} />
                    <input defaultValue={l.specs} placeholder="Any other specification" onBlur={(e) => e.target.value !== l.specs && act({ action: "update_item", item_id: l.id, specs: e.target.value })} className="rounded border px-2 py-1 text-sm" style={{ borderColor: BORDER }} />
                  </div>
                : <div className="text-sm mt-1"><b>Also:</b> {l.addon}{l.specs ? <> · <b>Spec:</b> {l.specs}</> : null}</div>)}
              {lineQuotes.length > 0 && (
                <table className="text-xs mt-2 w-full" style={{ borderCollapse: "collapse" }}>
                  <thead><tr style={{ color: MUTED, textAlign: "left" }}><th>Supplier</th><th style={{ textAlign: "right" }}>Rate</th><th style={{ textAlign: "right" }}>Qty</th><th style={{ textAlign: "right" }}>Days</th><th style={{ textAlign: "right" }}>Value</th><th>Their remark</th></tr></thead>
                  <tbody>{lineQuotes.sort((a, b) => Number(a.rate ?? 1e18) - Number(b.rate ?? 1e18)).map((q) => (
                    <tr key={q.org_slug} style={{ borderTop: `1px solid ${BORDER}`, background: q.rate != null && q.rate === best ? "#EAF6EF" : undefined }}>
                      <td className="py-1 font-bold">{suppliers.find((s) => s.org_slug === q.org_slug)?.org_name || q.org_slug}</td>
                      <td className="tnum" style={{ textAlign: "right" }}>{q.rate != null ? inr(Number(q.rate)) : "·"}</td>
                      <td className="tnum" style={{ textAlign: "right" }}>{q.qty_offered ?? "·"}</td>
                      <td className="tnum" style={{ textAlign: "right" }}>{q.lead_days ?? "·"}</td>
                      <td className="tnum" style={{ textAlign: "right" }}>{q.rate != null ? inr(Number(q.rate) * Number(q.qty_offered ?? l.qty)) : "·"}</td>
                      <td>{q.remark || ""}</td>
                    </tr>))}</tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>

      {draft && (
        <div className="rounded-lg border p-3 mb-3 bg-white grid gap-2" style={{ borderColor: BORDER, borderTop: `3px solid ${ORANGE}` }}>
          <div className="text-xs font-bold uppercase" style={{ color: MUTED, letterSpacing: 0.6 }}>Add an item</div>
          <div className="flex gap-2 flex-wrap">
            <input value={add.code} onChange={(e) => setAdd({ ...add, code: e.target.value.trim(), uom: "" })} placeholder="Item code" className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: BORDER, width: 140 }} />
            <input value={add.qty} onChange={(e) => setAdd({ ...add, qty: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="Quantity" className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: BORDER, width: 100 }} />
            <input value={add.uom} onChange={(e) => setAdd({ ...add, uom: e.target.value })} placeholder="UOM" className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: BORDER, width: 90 }} />
            <label className="text-xs" style={{ color: MUTED }}>needed by <input type="date" value={add.required_by} onChange={(e) => setAdd({ ...add, required_by: e.target.value })} className="rounded border px-2 py-1 text-sm" style={{ borderColor: BORDER }} /></label>
          </div>
          {preview ? <div className="text-sm rounded p-2" style={{ background: "#F7F5EF", whiteSpace: "pre-wrap" }}><b>{preview.item_name}</b>{"\n"}{preview.description}</div>
            : add.code.length >= 3 ? <div className="text-xs" style={{ color: MUTED }}>No item with that code in the mirror.</div> : null}
          <input value={add.addon} onChange={(e) => setAdd({ ...add, addon: e.target.value })} placeholder="Add-on remark — anything this RFQ needs beyond the master" className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: BORDER }} />
          <input value={add.specs} onChange={(e) => setAdd({ ...add, specs: e.target.value })} placeholder="Any other specification — grade, make, test certificate" className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: BORDER }} />
          <div><Btn kind="primary" disabled={!preview || !(Number(add.qty) > 0)} onClick={async () => { if (await act({ action: "add_item", id, item_code: add.code, qty: Number(add.qty), uom: add.uom, addon: add.addon, specs: add.specs, required_by: add.required_by })) { setAdd({ code: "", qty: "", uom: "", addon: "", specs: "", required_by: "" }); setPreview(null); } }}>Add the line</Btn></div>
        </div>
      )}

      <div className="text-xs font-bold uppercase mb-1" style={{ color: MUTED, letterSpacing: 0.6 }}>Suppliers</div>
      {draft ? (
        supList && !supList.portal ? <Note kind="warn">The Portal is not installed — migration 0198 — so there are no supplier logins to send to.</Note>
        : (supList?.suppliers ?? []).length === 0 ? <Note kind="warn">No suppliers on the Portal yet. Add them in /portal/all/settings — an organisation of kind Supplier, and its people — and they appear here.</Note>
        : <div className="flex gap-2 flex-wrap">{(supList?.suppliers ?? []).filter((s) => s.active).map((s) => (
            <button key={s.slug} onClick={() => toggleSup(s.slug)} className="rounded border px-2 py-1 text-sm font-bold" style={{ borderColor: chosen.has(s.slug) ? NAVY : BORDER, background: chosen.has(s.slug) ? NAVY : "#fff", color: chosen.has(s.slug) ? "#fff" : INK }}>
              {chosen.has(s.slug) ? "✓ " : ""}{s.name}<span style={{ fontWeight: 400, opacity: 0.7 }}> · {s.logins} login{s.logins === 1 ? "" : "s"}</span>
            </button>))}</div>
      ) : (
        <GenieTable<Sup> rows={suppliers} minWidth={600}
          columns={[
            { key: "n", label: "Supplier", align: "left", sort: (s) => s.org_name, render: (s) => <b>{s.org_name}</b> },
            { key: "s", label: "Status", align: "left", sort: (s) => s.status, render: (s) => <b style={{ color: s.status === "quoted" ? GREEN : s.status === "declined" ? RED : AMBER }}>{s.status}</b> },
            { key: "q", label: "Quoted", align: "right", sort: (s) => s.quoted_at || "", render: (s) => dmy(s.quoted_at) },
            { key: "r", label: "Their word", align: "left", render: (s) => s.remark || "·" },
          ]} />
      )}
      {busy && <div className="text-xs mt-2" style={{ color: MUTED }}>…</div>}
    </Screen>
  );
}
