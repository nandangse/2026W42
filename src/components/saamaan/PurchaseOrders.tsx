"use client";
/**
 * Purchase orders and suppliers, the ERP's, pulled (Dr Raghu, 5 Sep 2026):
 * "I want all the purchase orders to come in. The submission will be done
 * from Erp only. It will be pulled only. Including the items inside.
 * Status. First have the list of the POs. For this also have a sub
 * document called Suppliers. Pull the details of the suppliers also."
 *
 * Two tabs. Purchase orders: the list, filtered by status, supplier, dates
 * and words, 200 a page; a PO opens with its lines. Suppliers: every one,
 * with how many POs and how much; a supplier opens whole, with addresses,
 * contacts and its POs. Pull from ERP runs the three phases in pages and
 * resumes from the last stamp, so a daily pull is quick.
 */
import React, { useCallback, useEffect, useState } from "react";
import GenieTable from "@/components/GenieTable";
import { Screen, Btn, Note, Chip, Modal, INK, MUTED, BORDER, NAVY, GREEN, AMBER, RED } from "@/components/ims/ui";
import { rupee } from "@/lib/fmt";
const inr = (n: number | null | undefined) => rupee(n, "·");

interface Po { name: string; supplier: string; supplier_name: string; status: string; docstatus: number; transaction_date: string | null; schedule_date: string | null; grand_total: number | null; net_total: number | null; currency: string; project: string; per_received: number | null; per_billed: number | null; advance_paid: number | null; set_warehouse: string; owner: string; erp_modified: string | null }
interface PoItem { row_name: string; idx: number; item_code: string; item_name: string; qty: number | null; uom: string; rate: number | null; amount: number | null; received_qty: number | null; billed_amt: number | null; warehouse: string; schedule_date: string | null; project: string }
interface Grn { name: string; supplier: string; supplier_name: string; status: string; docstatus: number; posting_date: string | null; grand_total: number | null; currency: string; project: string; set_warehouse: string; is_return: boolean; per_billed: number | null; total_qty: number | null; erp_modified: string | null; rejected?: number; lines?: number }
interface GrnItem { row_name: string; idx: number; item_code: string; item_name: string; qty: number | null; received_qty: number | null; rejected_qty: number | null; uom: string; rate: number | null; amount: number | null; warehouse: string; rejected_warehouse: string; purchase_order: string; batch_no: string; serial_no: string; project: string }
/* THE THIRD FACT (Dr Raghu, 8 Sep 2026: "can you also pull in the purchase
   invoice from the ERP?"). The PO is the promise, the GRN the arrival, and
   the invoice the only one of the three that carries money OWED — what was
   billed, against whose bill number, and what is still outstanding on it. */
interface Pinv { name: string; supplier: string; supplier_name: string; status: string; docstatus: number; posting_date: string | null; due_date: string | null; bill_no: string; bill_date: string | null; grand_total: number | null; outstanding: number | null; currency: string; project: string; is_paid: boolean; is_return: boolean; total_qty: number | null; erp_modified: string | null }
interface PinvItem { row_name: string; idx: number; item_code: string; item_name: string; qty: number | null; uom: string; rate: number | null; amount: number | null; warehouse: string; purchase_order: string; purchase_receipt: string; item_group: string; project: string }
interface Sup { name: string; supplier_name: string; supplier_group: string; supplier_type: string; gst_no: string; country: string; mobile_no: string; email_id: string; primary_address: string; primary_contact: string; status_of_supplier: string; rating_percentage: number | null; disabled: boolean; on_hold: boolean; erp_modified: string | null; n: number; value: number; open: number }
interface Pull { modified?: string; at?: string; items_modified?: string; items_at?: string; suppliers_at?: string; pinv_at?: string; by?: string }


const d = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "·");
const statusColour = (s: string) => (/Completed/.test(s) ? GREEN : /Cancelled|Closed/.test(s) ? MUTED : /Draft/.test(s) ? AMBER : /Receive|Bill/.test(s) ? NAVY : RED);
const erpForm = (base: string, doctype: string, name: string) => `${base}/app/${doctype.toLowerCase().replace(/\s+/g, "-")}/${encodeURIComponent(name)}`;

export default function PurchaseOrders({ erpBase, openOn }: { erpBase: string; openOn?: "po" | "suppliers" | "grn" | "pinv" }) {
  /* GRNs — what arrived (Dr Raghu, 8 Sep 2026: "from ERP get in Suppliers,
     Purchase orders, GRNs"). A purchase order is a promise; the GRN is the
     arrival, and the only place that records what was REFUSED. */
  const [tab, setTab] = useState<"po" | "suppliers" | "grn" | "pinv">(openOn ?? "po");
  const [pos, setPos] = useState<{ rows: Po[]; total: number; page: number; size: number; statuses: Record<string, number>; pull: Pull | null; installed: boolean } | null>(null);
  const [sups, setSups] = useState<{ rows: Sup[]; installed: boolean } | null>(null);
  const [grns, setGrns] = useState<{ rows: Grn[]; total: number; installed: boolean } | null>(null);
  const [grnOpen, setGrnOpen] = useState<{ grn: Grn; items: GrnItem[] } | null>(null);
  const [pinvs, setPinvs] = useState<{ rows: Pinv[]; total: number; installed: boolean; statuses?: string[] } | null>(null);
  const [pinvOpen, setPinvOpen] = useState<{ pinv: Pinv; items: PinvItem[] } | null>(null);
  const [q, setQ] = useState(""); const [status, setStatus] = useState(""); const [supplier, setSupplier] = useState(""); const [page, setPage] = useState(0);
  const [open, setOpen] = useState<{ po: Po; items: PoItem[] } | null>(null);
  const [supOpen, setSupOpen] = useState<{ supplier: Record<string, unknown>; pos: Po[] } | null>(null);
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false); const [log, setLog] = useState<string[]>([]);

  const loadPos = useCallback(async () => {
    const u = `/api/saamaan/po?page=${page}${status ? `&status=${encodeURIComponent(status)}` : ""}${supplier ? `&supplier=${encodeURIComponent(supplier)}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
    const r = await fetch(u, { cache: "no-store" }); const j = await r.json(); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); setPos(j);
  }, [page, status, supplier, q]);
  const loadSups = useCallback(async () => {
    const r = await fetch(`/api/saamaan/po?suppliers=1${q ? `&q=${encodeURIComponent(q)}` : ""}`, { cache: "no-store" }); const j = await r.json(); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); setSups(j);
  }, [q]);
  useEffect(() => { loadPos().catch((e) => setMsg(String(e.message || e))); }, [loadPos]);
  const loadGrns = useCallback(async () => {
    const u = `/api/saamaan/po?grns=1&page=${page}${supplier ? `&supplier=${encodeURIComponent(supplier)}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
    const r = await fetch(u, { cache: "no-store" }); const j = await r.json(); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); setGrns(j);
  }, [page, supplier, q]);
  useEffect(() => { if (tab === "suppliers") loadSups().catch((e) => setMsg(String(e.message || e))); }, [tab, loadSups]);
  useEffect(() => { if (tab === "grn") loadGrns().catch((e) => setMsg(String(e.message || e))); }, [tab, loadGrns]);
  const loadPinvs = useCallback(async () => {
    const u = `/api/saamaan/po?pinv=1&page=${page}${supplier ? `&supplier=${encodeURIComponent(supplier)}` : ""}${status ? `&status=${encodeURIComponent(status)}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
    const r = await fetch(u, { cache: "no-store" }); const j = await r.json(); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); setPinvs(j);
  }, [page, supplier, status, q]);
  useEffect(() => { if (tab === "pinv") loadPinvs().catch((e) => setMsg(String(e.message || e))); }, [tab, loadPinvs]);
  const openPinv = async (name: string) => { const r = await fetch(`/api/saamaan/po?pinv=1&name=${encodeURIComponent(name)}`, { cache: "no-store" }); const j = await r.json(); if (r.ok) setPinvOpen(j); else setMsg(j.error); };
  const openGrn = async (name: string) => { const r = await fetch(`/api/saamaan/po?grns=1&name=${encodeURIComponent(name)}`, { cache: "no-store" }); const j = await r.json(); if (r.ok) setGrnOpen(j); else setMsg(j.error); };

  const openPo = async (name: string) => { const r = await fetch(`/api/saamaan/po?name=${encodeURIComponent(name)}`, { cache: "no-store" }); const j = await r.json(); if (r.ok) setOpen(j); else setMsg(j.error); };
  const openSup = async (name: string) => { const r = await fetch(`/api/saamaan/po?supplier=${encodeURIComponent(name)}&one=1`, { cache: "no-store" }); const j = await r.json(); if (r.ok) setSupOpen(j); else setMsg(j.error); };

  /** The three phases in pages, resumed by the stamp; the log reads as it goes. */
  const pull = async (full = false) => {
    setBusy(true); setMsg(""); setLog([]);
    const say = (s: string) => setLog((l) => [...l, `${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false })} ${s}`]);
    try {
      for (const phase of ["po", "po_items", "suppliers", "grn", "grn_items", "pinv", "pinv_items"] as const) {
        let start = 0, total = 0;
        for (let guard = 0; guard < 400; guard++) {
          const r = await fetch("/api/saamaan/po", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phase, start, full }) });
          const j = await r.json(); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
          total += Number(j.written) || 0; say(`${phase}: ${Number(j.found) || 0} read, ${total} written so far${j.done ? " · done" : ""}`);
          if (j.done) break; start = Number(j.next_start) || 0;
        }
      }
      say("pull complete"); await loadPos(); if (tab === "suppliers") await loadSups(); if (tab === "grn") await loadGrns(); if (tab === "pinv") await loadPinvs();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const p = pos?.pull;
  return (
    <Screen title="Purchase orders" blurb="The ERP's purchase orders and suppliers, pulled and read here. Submission stays in the ERP; nothing is written back."
      action={<div className="flex gap-1.5"><Btn onClick={() => pull(false)} disabled={busy}>⇣ Pull from ERP</Btn><Btn onClick={() => { if (window.confirm("Re-read every purchase order, every line and every supplier from the beginning? This takes several minutes.")) pull(true); }} disabled={busy}>⇣ Full re-pull</Btn></div>}>
      {msg && <Note kind="error">{msg}</Note>}
      {pos && !pos.installed && <Note kind="warn">Run migration 0136 first — the purchase orders have nowhere to live yet.</Note>}
      {log.length > 0 && <div className="bg-white rounded-lg border p-2 mb-2 text-xs" style={{ borderColor: BORDER, maxHeight: 120, overflowY: "auto", color: MUTED }}>{log.map((l, i) => <div key={i}>{l}</div>)}</div>}
      <div className="flex gap-1.5 mb-2 items-center flex-wrap">
        {(["po", "suppliers", "grn", "pinv"] as const).map((k) => <button key={k} onClick={() => { setTab(k); setPage(0); }} className="rounded px-3 py-1.5 text-xs font-bold" style={{ background: tab === k ? NAVY : "#fff", color: tab === k ? "#fff" : INK, border: `1px solid ${tab === k ? NAVY : BORDER}` }}>{k === "po" ? `Purchase orders${pos ? ` (${pos.total.toLocaleString("en-IN")})` : ""}` : k === "suppliers" ? `Suppliers${sups ? ` (${sups.rows.length.toLocaleString("en-IN")})` : ""}` : k === "grn" ? `GRNs${grns ? ` (${grns.total.toLocaleString("en-IN")})` : ""}` : `Purchase invoices${pinvs ? ` (${pinvs.total.toLocaleString("en-IN")})` : ""}`}</button>)}
        <span style={{ flex: 1 }} />
        {p && <span className="text-xs" style={{ color: MUTED }}>POs to {p.modified ? d(p.modified) : "·"} · lines {p.items_at ? d(p.items_at) : "·"} · suppliers {p.suppliers_at ? d(p.suppliers_at) : "·"}</span>}
      </div>

      {tab === "po" && (
        <>
          <div className="flex gap-1.5 mb-2 flex-wrap items-center">
            {Object.entries(pos?.statuses || {}).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
              <button key={s} onClick={() => { setStatus(status === s ? "" : s); setPage(0); }} className="rounded px-2 py-0.5 text-xs font-bold" style={{ background: status === s ? statusColour(s) : "#fff", color: status === s ? "#fff" : statusColour(s), border: `1px solid ${statusColour(s)}` }}>{s} {n.toLocaleString("en-IN")}</button>
            ))}
            <span style={{ flex: 1 }} />
            {supplier && <Chip text={`supplier: ${supplier} ✕`} colour={NAVY} />}{supplier && <button onClick={() => { setSupplier(""); setPage(0); }} className="text-xs" style={{ color: MUTED }}>clear</button>}
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="🔍 PO no, supplier, project" className="text-xs rounded px-2 py-1" style={{ border: `1px solid ${BORDER}`, width: 220 }} />
          </div>
          <GenieTable<Po>
            rows={pos ? pos.rows : null} minWidth={1300} search={() => true} empty="No purchase orders in the mirror yet — Pull from ERP."
            columns={[
              { key: "name", label: "PO", align: "left", sort: (r) => r.name, render: (r) => <button onClick={() => openPo(r.name)} className="font-bold hover:underline" style={{ color: NAVY }}>{r.name}</button> },
              { key: "date", label: "Date", align: "left", sort: (r) => r.transaction_date || "", render: (r) => <span className="tnum">{d(r.transaction_date)}</span> },
              { key: "sup", label: "Supplier", align: "left", sort: (r) => r.supplier_name, render: (r) => <button onClick={() => { setSupplier(r.supplier); setPage(0); }} className="hover:underline text-left" style={{ color: INK, whiteSpace: "normal", maxWidth: 280, display: "inline-block" }} title="Only this supplier's POs">{r.supplier_name || r.supplier}</button> },
              { key: "status", label: "Status", align: "left", sort: (r) => r.status, render: (r) => <Chip text={r.status || "·"} colour={statusColour(r.status)} /> },
              { key: "proj", label: "Project", align: "left", sort: (r) => r.project, render: (r) => <span style={{ color: r.project ? INK : MUTED }}>{r.project ? r.project.replace(/^NGSE-PROJ-/, "") : "·"}</span> },
              { key: "sched", label: "Required by", align: "left", sort: (r) => r.schedule_date || "", render: (r) => <span className="tnum">{d(r.schedule_date)}</span> },
              { key: "net", label: "Net", align: "right", sort: (r) => Number(r.net_total || 0), render: (r) => <span className="tnum">{inr(r.net_total)}</span> },
              { key: "gt", label: "Grand total", align: "right", sort: (r) => Number(r.grand_total || 0), render: (r) => <span className="tnum font-bold">{inr(r.grand_total)}</span> },
              { key: "rec", label: "Received", align: "right", sort: (r) => Number(r.per_received || 0), render: (r) => <span className="tnum" style={{ color: (r.per_received || 0) >= 100 ? GREEN : (r.per_received || 0) > 0 ? AMBER : MUTED }}>{r.per_received == null ? "·" : `${Math.round(r.per_received)}%`}</span> },
              { key: "bill", label: "Billed", align: "right", sort: (r) => Number(r.per_billed || 0), render: (r) => <span className="tnum" style={{ color: (r.per_billed || 0) >= 100 ? GREEN : (r.per_billed || 0) > 0 ? AMBER : MUTED }}>{r.per_billed == null ? "·" : `${Math.round(r.per_billed)}%`}</span> },
              { key: "wh", label: "Warehouse", align: "left", sort: (r) => r.set_warehouse, render: (r) => <span className="text-xs" style={{ color: MUTED }}>{r.set_warehouse || "·"}</span> },
              { key: "erp", label: "", align: "left", render: (r) => <a href={erpForm(erpBase, "Purchase Order", r.name)} target="_blank" rel="noreferrer" className="text-xs hover:underline" style={{ color: MUTED }}>ERP ↗</a> },
            ]}
          />
          {pos && pos.total > pos.size && (
            <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: MUTED }}>
              <Btn onClick={() => setPage((x) => Math.max(0, x - 1))} disabled={page === 0}>← Newer</Btn>
              <span>{page * pos.size + 1}–{Math.min(pos.total, (page + 1) * pos.size)} of {pos.total.toLocaleString("en-IN")}</span>
              <Btn onClick={() => setPage((x) => x + 1)} disabled={(page + 1) * pos.size >= pos.total}>Older →</Btn>
            </div>
          )}
        </>
      )}

      {tab === "suppliers" && (
        <>
          <div className="flex gap-1.5 mb-2 items-center"><span style={{ flex: 1 }} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 name, GST, e-mail, group" className="text-xs rounded px-2 py-1" style={{ border: `1px solid ${BORDER}`, width: 240 }} /></div>
          <GenieTable<Sup>
            rows={sups ? sups.rows : null} minWidth={1300} search={() => true} empty="No suppliers in the mirror yet — Pull from ERP."
            columns={[
              { key: "name", label: "Supplier", align: "left", sort: (r) => r.supplier_name, render: (r) => <button onClick={() => openSup(r.name)} className="font-bold hover:underline text-left" style={{ color: NAVY, whiteSpace: "normal", maxWidth: 300, display: "inline-block" }}>{r.supplier_name || r.name}</button> },
              { key: "group", label: "Group", align: "left", sort: (r) => r.supplier_group, render: (r) => <span className="text-xs" style={{ color: MUTED }}>{r.supplier_group || "·"}</span> },
              { key: "gst", label: "GST", align: "left", sort: (r) => r.gst_no, render: (r) => <span className="tnum text-xs">{r.gst_no || "·"}</span> },
              { key: "mob", label: "Mobile", align: "left", render: (r) => <span className="tnum text-xs">{r.mobile_no || "·"}</span> },
              { key: "mail", label: "E-mail", align: "left", render: (r) => <span className="text-xs" style={{ color: MUTED }}>{r.email_id || "·"}</span> },
              { key: "n", label: "POs", align: "right", sort: (r) => r.n, render: (r) => <button onClick={() => { setSupplier(r.name); setTab("po"); setPage(0); }} className="tnum hover:underline" style={{ color: r.n ? NAVY : MUTED }}>{r.n || "·"}</button> },
              { key: "open", label: "Open", align: "right", sort: (r) => r.open, render: (r) => <span className="tnum" style={{ color: r.open ? AMBER : MUTED }}>{r.open || "·"}</span> },
              { key: "val", label: "Value, all time", align: "right", sort: (r) => r.value, render: (r) => <span className="tnum font-bold">{r.value ? inr(r.value) : "·"}</span> },
              { key: "st", label: "Status", align: "left", render: (r) => r.disabled ? <Chip text="disabled" colour={MUTED} /> : r.on_hold ? <Chip text="on hold" colour={AMBER} /> : <span className="text-xs" style={{ color: MUTED }}>{r.status_of_supplier || "·"}</span> },
              { key: "rating", label: "Rating", align: "right", sort: (r) => Number(r.rating_percentage || 0), render: (r) => <span className="tnum">{r.rating_percentage == null ? "·" : `${Math.round(r.rating_percentage)}%`}</span> },
            ]}
          />
        </>
      )}

      {tab === "grn" && (
        <>
          <div className="flex gap-1.5 mb-2 items-center">
            {supplier && <Chip text={`supplier ${supplier}`} colour={NAVY} />}
            {supplier && <Btn onClick={() => { setSupplier(""); setPage(0); }}>clear</Btn>}
            <span style={{ flex: 1 }} />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="🔍 GRN no., supplier, project, warehouse" className="text-xs rounded px-2 py-1" style={{ border: `1px solid ${BORDER}`, width: 280 }} />
          </div>
          {grns && !grns.installed && <Note kind="warn">The GRNs have nowhere to live yet — run migration 0157, then Pull from ERP.</Note>}
          <GenieTable<Grn>
            rows={grns ? grns.rows : null} minWidth={1300} search={() => true}
            empty="No GRNs in the mirror yet — Pull from ERP brings them."
            columns={[
              { key: "name", label: "GRN", align: "left", sort: (r) => r.name, render: (r) => <button onClick={() => openGrn(r.name)} className="font-bold hover:underline" style={{ color: NAVY }}>{r.name}</button> },
              { key: "date", label: "Received", align: "left", sort: (r) => r.posting_date || "", render: (r) => <span className="tnum text-xs">{d(r.posting_date)}</span> },
              { key: "sup", label: "Supplier", align: "left", sort: (r) => r.supplier_name, render: (r) => <button onClick={() => { setSupplier(r.supplier); setPage(0); }} className="hover:underline text-left" style={{ color: INK, whiteSpace: "normal", maxWidth: 260, display: "inline-block" }}>{r.supplier_name || r.supplier}</button> },
              { key: "wh", label: "Into", align: "left", sort: (r) => r.set_warehouse, render: (r) => <span className="text-xs" style={{ color: MUTED }}>{r.set_warehouse || "·"}</span> },
              { key: "proj", label: "Project", align: "left", sort: (r) => r.project, render: (r) => <span className="text-xs" style={{ color: MUTED }}>{r.project || "·"}</span> },
              { key: "qty", label: "Qty", align: "right", sort: (r) => Number(r.total_qty || 0), render: (r) => <span className="tnum">{r.total_qty == null ? "·" : r.total_qty.toLocaleString("en-IN")}</span> },
              /* THE FIGURE A RECEIPT EXISTS TO CARRY. A GRN that only records
                 what was accepted cannot tell you which supplier keeps
                 sending bad material, so what was refused is a column of its
                 own and shown in red when there is any. */
              { key: "rej", label: "Rejected", align: "right", sort: (r) => Number(r.rejected || 0), render: (r) => <span className="tnum font-bold" style={{ color: r.rejected ? RED : MUTED }}>{r.rejected ? r.rejected.toLocaleString("en-IN") : "·"}</span> },
              { key: "val", label: "Value", align: "right", sort: (r) => Number(r.grand_total || 0), render: (r) => <span className="tnum font-bold">{inr(r.grand_total)}</span> },
              { key: "st", label: "Status", align: "left", render: (r) => <>{r.is_return && <Chip text="return" colour={AMBER} />} <Chip text={r.status} colour={statusColour(r.status)} /></> },
              { key: "erp", label: "", align: "right", render: (r) => <a href={erpForm(erpBase, "Purchase Receipt", r.name)} target="_blank" rel="noreferrer" className="text-xs hover:underline" style={{ color: MUTED }}>ERP ↗</a> },
            ]}
          />
          {grns && grns.total > 200 && (
            <div className="flex gap-2 items-center justify-center mt-2 text-xs" style={{ color: MUTED }}>
              <Btn onClick={() => setPage((x) => Math.max(0, x - 1))} disabled={page === 0}>← Newer</Btn>
              <span>{page * 200 + 1}–{Math.min(grns.total, (page + 1) * 200)} of {grns.total.toLocaleString("en-IN")}</span>
              <Btn onClick={() => setPage((x) => x + 1)} disabled={(page + 1) * 200 >= grns.total}>Older →</Btn>
            </div>
          )}
        </>
      )}

      {tab === "pinv" && (
        <>
          <div className="flex gap-1.5 mb-2 flex-wrap items-center">
            {supplier && <Chip text={`supplier: ${supplier}`} colour={NAVY} />}
            {supplier && <button onClick={() => { setSupplier(""); setPage(0); }} className="text-xs hover:underline" style={{ color: MUTED }}>clear</button>}
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}
              className="rounded border px-2 py-1 text-xs" style={{ borderColor: BORDER, background: "#fff" }}>
              <option value="">every status</option>
              {(pinvs?.statuses || []).map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <GenieTable<Pinv>
            rows={pinvs ? pinvs.rows : null} minWidth={1400} search={() => true}
            empty="No purchase invoices in the mirror yet — Pull from ERP brings them."
            columns={[
              { key: "name", label: "Invoice", align: "left", sort: (r) => r.name, render: (r) => <button onClick={() => openPinv(r.name)} className="font-bold hover:underline" style={{ color: NAVY }}>{r.name}</button> },
              { key: "date", label: "Posted", align: "left", sort: (r) => r.posting_date || "", render: (r) => <span className="tnum text-xs">{d(r.posting_date)}</span> },
              { key: "sup", label: "Supplier", align: "left", sort: (r) => r.supplier_name, render: (r) => <button onClick={() => { setSupplier(r.supplier); setPage(0); }} className="hover:underline text-left" style={{ color: INK, whiteSpace: "normal", maxWidth: 240, display: "inline-block" }}>{r.supplier_name || r.supplier}</button> },
              /* THE SUPPLIER'S OWN NUMBER. Ours means nothing on the phone to
                 his accounts desk; his is what both sides can look up. */
              { key: "bill", label: "Their bill", align: "left", sort: (r) => r.bill_no, render: (r) => <span className="text-xs" style={{ color: INK }}>{r.bill_no || "·"}<span style={{ color: MUTED }}>{r.bill_date ? ` · ${d(r.bill_date)}` : ""}</span></span> },
              { key: "proj", label: "Project", align: "left", sort: (r) => r.project, render: (r) => <span className="text-xs" style={{ color: MUTED }}>{r.project || "·"}</span> },
              { key: "val", label: "Billed", align: "right", sort: (r) => Number(r.grand_total || 0), render: (r) => <span className="tnum font-bold">{inr(r.grand_total)}</span> },
              /* OUTSTANDING IS THE POINT OF THIS TABLE. Null is not zero — a
                 figure the ERP never recorded is not a bill that is settled. */
              { key: "out", label: "Outstanding", align: "right", sort: (r) => Number(r.outstanding || 0), render: (r) => <span className="tnum font-bold" style={{ color: r.outstanding == null ? MUTED : r.outstanding > 0 ? RED : GREEN }}>{r.outstanding == null ? "·" : inr(r.outstanding)}</span> },
              /* Overdue is a fact about today, not a status the ERP stores. */
              { key: "due", label: "Due", align: "left", sort: (r) => r.due_date || "", render: (r) => {
                const late = !!r.due_date && !r.is_paid && Number(r.outstanding || 0) > 0 && r.due_date < new Date().toISOString().slice(0, 10);
                return <span className="tnum text-xs font-bold" style={{ color: late ? RED : MUTED }}>{d(r.due_date)}{late ? " ⚠" : ""}</span>;
              } },
              { key: "st", label: "Status", align: "left", render: (r) => <>{r.is_return && <Chip text="return" colour={AMBER} />} <Chip text={r.status} colour={statusColour(r.status)} /></> },
              { key: "erp", label: "", align: "right", render: (r) => <a href={erpForm(erpBase, "Purchase Invoice", r.name)} target="_blank" rel="noreferrer" className="text-xs hover:underline" style={{ color: MUTED }}>ERP ↗</a> },
            ]}
          />
          {pinvs && pinvs.total > 200 && (
            <div className="flex gap-2 items-center justify-center mt-2 text-xs" style={{ color: MUTED }}>
              <Btn onClick={() => setPage((x) => Math.max(0, x - 1))} disabled={page === 0}>← Newer</Btn>
              <span>{page * 200 + 1}–{Math.min(pinvs.total, (page + 1) * 200)} of {pinvs.total.toLocaleString("en-IN")}</span>
              <Btn onClick={() => setPage((x) => x + 1)} disabled={(page + 1) * 200 >= pinvs.total}>Older →</Btn>
            </div>
          )}
        </>
      )}

      {pinvOpen && (
        <Modal onClose={() => setPinvOpen(null)} title={`${pinvOpen.pinv.name} · ${pinvOpen.pinv.supplier_name || pinvOpen.pinv.supplier}`} width={1200}>
          <div className="flex gap-2 flex-wrap mb-2 text-xs items-center">
            <Chip text={pinvOpen.pinv.status} colour={statusColour(pinvOpen.pinv.status)} />
            {pinvOpen.pinv.is_return && <Chip text="return" colour={AMBER} />}
            <span style={{ color: MUTED }}>
              posted {d(pinvOpen.pinv.posting_date)} · due {d(pinvOpen.pinv.due_date)}
              {pinvOpen.pinv.bill_no ? ` · their bill ${pinvOpen.pinv.bill_no}` : ""}
              {pinvOpen.pinv.project ? ` · ${pinvOpen.pinv.project}` : ""}
            </span>
            <span style={{ flex: 1 }} />
            <span className="tnum font-bold" style={{ color: INK }}>{inr(pinvOpen.pinv.grand_total)}</span>
            <span className="tnum font-bold" style={{ color: Number(pinvOpen.pinv.outstanding || 0) > 0 ? RED : GREEN }}>
              {pinvOpen.pinv.outstanding == null ? "" : `${inr(pinvOpen.pinv.outstanding)} outstanding`}
            </span>
            <a href={erpForm(erpBase, "Purchase Invoice", pinvOpen.pinv.name)} target="_blank" rel="noreferrer" className="text-xs hover:underline" style={{ color: MUTED }}>ERP ↗</a>
          </div>
          <GenieTable<PinvItem>
            rows={pinvOpen.items} minWidth={1100} search={() => true} empty="No lines on this invoice."
            columns={[
              { key: "idx", label: "#", align: "right", render: (r) => <span className="tnum" style={{ color: MUTED }}>{r.idx}</span> },
              { key: "code", label: "Item", align: "left", sort: (r) => r.item_code, render: (r) => <span className="font-bold text-xs">{r.item_code}</span> },
              { key: "nm", label: "Name", align: "left", render: (r) => <span className="text-xs" style={{ whiteSpace: "normal" }}>{r.item_name}</span> },
              { key: "qty", label: "Qty", align: "right", render: (r) => <span className="tnum">{r.qty == null ? "·" : r.qty.toLocaleString("en-IN")} <span style={{ color: MUTED }}>{r.uom}</span></span> },
              { key: "rate", label: "Rate", align: "right", render: (r) => <span className="tnum">{inr(r.rate)}</span> },
              { key: "amt", label: "Amount", align: "right", render: (r) => <span className="tnum font-bold">{inr(r.amount)}</span> },
              /* THE THREE DOCUMENTS JOINED UP: what was promised, what came,
                 what was billed — on one line, which is where a mismatch
                 between them is actually visible. */
              { key: "po", label: "Against PO", align: "left", render: (r) => <span className="text-xs" style={{ color: MUTED }}>{r.purchase_order || "·"}</span> },
              { key: "grn", label: "Against GRN", align: "left", render: (r) => <span className="text-xs" style={{ color: MUTED }}>{r.purchase_receipt || "·"}</span> },
              { key: "wh", label: "Warehouse", align: "left", render: (r) => <span className="text-xs" style={{ color: MUTED }}>{r.warehouse || "·"}</span> },
            ]}
          />
        </Modal>
      )}

      {grnOpen && (
        <Modal onClose={() => setGrnOpen(null)} title={`${grnOpen.grn.name} · ${grnOpen.grn.supplier_name || grnOpen.grn.supplier}`} width={1200}>
          <div className="flex gap-2 flex-wrap mb-2 text-xs items-center">
            <Chip text={grnOpen.grn.status} colour={statusColour(grnOpen.grn.status)} />
            {grnOpen.grn.is_return && <Chip text="return" colour={AMBER} />}
            <span style={{ color: MUTED }}>received {d(grnOpen.grn.posting_date)}{grnOpen.grn.set_warehouse ? ` into ${grnOpen.grn.set_warehouse}` : ""}{grnOpen.grn.project ? ` · ${grnOpen.grn.project}` : ""}</span>
            <span style={{ flex: 1 }} />
            <span style={{ color: MUTED }}>billed {grnOpen.grn.per_billed == null ? "·" : `${Math.round(grnOpen.grn.per_billed)}%`}</span>
            <b className="tnum">{inr(grnOpen.grn.grand_total)}</b>
            <a href={erpForm(erpBase, "Purchase Receipt", grnOpen.grn.name)} target="_blank" rel="noreferrer" className="text-xs hover:underline" style={{ color: NAVY }}>open in the ERP ↗</a>
          </div>
          <GenieTable<GrnItem>
            rows={grnOpen.items} minWidth={1100} search={() => true} empty="No lines on this GRN."
            columns={[
              { key: "idx", label: "#", align: "right", sort: (r) => r.idx, render: (r) => <span className="tnum" style={{ color: MUTED }}>{r.idx}</span> },
              { key: "item", label: "Item", align: "left", sort: (r) => r.item_code, render: (r) => <div><div className="font-bold tnum text-xs">{r.item_code}</div><div className="text-xs" style={{ color: MUTED, whiteSpace: "normal" }}>{r.item_name}</div></div> },
              { key: "recd", label: "Received", align: "right", sort: (r) => Number(r.received_qty || 0), render: (r) => <span className="tnum">{r.received_qty == null ? "·" : r.received_qty.toLocaleString("en-IN")}</span> },
              { key: "acc", label: "Accepted", align: "right", sort: (r) => Number(r.qty || 0), render: (r) => <span className="tnum font-bold">{r.qty == null ? "·" : r.qty.toLocaleString("en-IN")}</span> },
              { key: "rej", label: "Rejected", align: "right", sort: (r) => Number(r.rejected_qty || 0), render: (r) => <span className="tnum font-bold" style={{ color: r.rejected_qty ? RED : MUTED }}>{r.rejected_qty ? r.rejected_qty.toLocaleString("en-IN") : "·"}</span> },
              { key: "uom", label: "UOM", align: "left", render: (r) => <span className="text-xs" style={{ color: MUTED }}>{r.uom || "·"}</span> },
              { key: "rate", label: "Rate", align: "right", sort: (r) => Number(r.rate || 0), render: (r) => <span className="tnum">{inr(r.rate)}</span> },
              { key: "amt", label: "Amount", align: "right", sort: (r) => Number(r.amount || 0), render: (r) => <span className="tnum font-bold">{inr(r.amount)}</span> },
              { key: "wh", label: "Into", align: "left", render: (r) => <span className="text-xs" style={{ color: MUTED }}>{r.warehouse || "·"}</span> },
              /* the promise this arrival answers */
              { key: "po", label: "Against PO", align: "left", sort: (r) => r.purchase_order, render: (r) => r.purchase_order ? <button onClick={() => { setGrnOpen(null); setTab("po"); openPo(r.purchase_order); }} className="tnum text-xs hover:underline" style={{ color: NAVY }}>{r.purchase_order}</button> : <span style={{ color: MUTED }}>·</span> },
            ]}
          />
        </Modal>
      )}

      {open && (
        <Modal onClose={() => setOpen(null)} title={`${open.po.name} · ${open.po.supplier_name || open.po.supplier}`} width={1200}>
          <div className="flex gap-2 flex-wrap mb-2 text-xs items-center">
            <Chip text={open.po.status} colour={statusColour(open.po.status)} />
            <span style={{ color: MUTED }}>dated {d(open.po.transaction_date)} · required by {d(open.po.schedule_date)}{open.po.project ? ` · ${open.po.project}` : ""}{open.po.set_warehouse ? ` · ${open.po.set_warehouse}` : ""} · by {open.po.owner.split("@")[0]}</span>
            <span style={{ flex: 1 }} />
            <span style={{ color: MUTED }}>received {open.po.per_received == null ? "·" : `${Math.round(open.po.per_received)}%`} · billed {open.po.per_billed == null ? "·" : `${Math.round(open.po.per_billed)}%`} · advance {inr(open.po.advance_paid)}</span>
            <a href={erpForm(erpBase, "Purchase Order", open.po.name)} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: NAVY }}>open in ERP ↗</a>
          </div>
          <div className="bg-white rounded-lg border" style={{ borderColor: BORDER, overflow: "auto", maxHeight: "60vh" }}>
            <table className="w-full genie-table" style={{ fontSize: 12.5, borderCollapse: "collapse" }}>
              <thead><tr style={{ color: MUTED, fontSize: 10.5 }}>{["#", "Item", "Qty", "Rate", "Amount", "Received", "Billed", "Warehouse", "Required by"].map((h, i) => <th key={h} className="px-2 py-1.5" style={{ textAlign: i >= 2 && i <= 6 ? "right" : "left", borderBottom: `1px solid ${BORDER}`, position: "sticky", top: 0, background: "#fff" }}>{h}</th>)}</tr></thead>
              <tbody>
                {open.items.map((i) => (
                  <tr key={i.row_name} style={{ borderTop: "1px solid #EEECE6" }}>
                    <td className="px-2 py-1 tnum" style={{ color: MUTED }}>{i.idx}</td>
                    <td className="px-2 py-1"><div className="font-semibold" style={{ color: INK }}>{i.item_code}</div><div className="text-xs" style={{ color: MUTED, whiteSpace: "normal", maxWidth: 420 }}>{i.item_name}</div></td>
                    <td className="px-2 py-1 text-right tnum">{i.qty == null ? "·" : `${i.qty.toLocaleString("en-IN")} ${i.uom}`}</td>
                    <td className="px-2 py-1 text-right tnum">{inr(i.rate)}</td>
                    <td className="px-2 py-1 text-right tnum font-bold">{inr(i.amount)}</td>
                    <td className="px-2 py-1 text-right tnum" style={{ color: (i.received_qty || 0) >= (i.qty || 0) && i.qty ? GREEN : (i.received_qty || 0) > 0 ? AMBER : MUTED }}>{i.received_qty == null ? "·" : i.received_qty.toLocaleString("en-IN")}</td>
                    <td className="px-2 py-1 text-right tnum" style={{ color: MUTED }}>{inr(i.billed_amt)}</td>
                    <td className="px-2 py-1 text-xs" style={{ color: MUTED }}>{i.warehouse || "·"}</td>
                    <td className="px-2 py-1 text-xs tnum">{d(i.schedule_date)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr style={{ borderTop: `2px solid ${BORDER}`, fontWeight: 700 }}><td className="px-2 py-1.5" colSpan={4}>{open.items.length} lines · net {inr(open.po.net_total)}</td><td className="px-2 py-1.5 text-right tnum">{inr(open.items.reduce((a, i) => a + (i.amount || 0), 0))}</td><td colSpan={4} className="px-2 py-1.5 text-right tnum">grand total {inr(open.po.grand_total)}</td></tr></tfoot>
            </table>
          </div>
        </Modal>
      )}

      {supOpen && (
        <Modal onClose={() => setSupOpen(null)} title={String(supOpen.supplier.supplier_name || supOpen.supplier.name)} width={1100}>
          <SupplierBox s={supOpen.supplier} pos={supOpen.pos} erpBase={erpBase} onPo={(n) => { setSupOpen(null); openPo(n); }} />
        </Modal>
      )}
    </Screen>
  );
}

function SupplierBox({ s, pos, erpBase, onPo }: { s: Record<string, unknown>; pos: Po[]; erpBase: string; onPo: (n: string) => void }) {
  const S = (k: string) => String(s[k] ?? "").trim();
  const addrs = (s.addresses as Record<string, unknown>[] | null) || [];
  const cons = (s.contacts as Record<string, unknown>[] | null) || [];
  const erp = (s.erp as Record<string, unknown> | null) || {};
  function F({ l, v }: { l: string; v: unknown }): React.ReactElement | null {
    const t = String(v ?? "").trim();
    if (!t) return null;
    return <div className="text-xs"><span style={{ color: MUTED }}>{l}: </span><span style={{ color: INK }}>{t}</span></div>;
  }
  return (
    <div>
      <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <div className="bg-white rounded-lg border p-3" style={{ borderColor: BORDER }}>
          <div className="text-xs font-bold uppercase mb-1" style={{ color: MUTED, letterSpacing: 0.5 }}>Supplier</div>
          <F l="ERP name" v={s.name} /><F l="Group" v={s.supplier_group} /><F l="Type" v={s.supplier_type} /><F l="GST" v={s.gst_no} /><F l="GST category" v={s.gst_category} /><F l="Country" v={s.country} /><F l="Payment terms" v={s.payment_terms} /><F l="Website" v={s.website} /><F l="Status" v={s.status_of_supplier} /><F l="Rating" v={s.rating_percentage != null ? `${String(s.rating_percentage)}%` : ""} />
          {(Boolean(s.disabled) || Boolean(s.on_hold)) ? <div className="mt-1"><Chip text={s.disabled ? "disabled" : "on hold"} colour={s.disabled ? MUTED : AMBER} /></div> : null}
          <a href={erpForm(erpBase, "Supplier", S("name"))} target="_blank" rel="noreferrer" className="text-xs hover:underline" style={{ color: NAVY }}>open in ERP ↗</a>
        </div>
        <div className="bg-white rounded-lg border p-3" style={{ borderColor: BORDER }}>
          <div className="text-xs font-bold uppercase mb-1" style={{ color: MUTED, letterSpacing: 0.5 }}>Reach them</div>
          <F l="Mobile" v={s.mobile_no} /><F l="E-mail" v={s.email_id} /><F l="Primary contact" v={s.primary_contact} /><F l="Primary address" v={s.primary_address} />
          {cons.map((c, i) => { const g = (k: string) => String(c[k] ?? "").trim(); return <div key={i} className="text-xs mt-1" style={{ color: INK }}>👤 {[g("first_name"), g("last_name")].filter(Boolean).join(" ")}{g("designation") ? `, ${g("designation")}` : ""}{g("mobile") ? ` · ${g("mobile")}` : ""}{g("phone") ? ` · ${g("phone")}` : ""}{g("email") ? ` · ${g("email")}` : ""}{c.primary ? " · primary" : ""}</div>; })}
          {addrs.map((a, i) => { const g = (k: string) => String(a[k] ?? "").trim(); return <div key={i} className="text-xs mt-1" style={{ color: MUTED, whiteSpace: "normal" }}>📍 {g("type") ? `${g("type")}: ` : ""}{[g("line1"), g("line2"), g("city"), g("state"), g("pincode")].filter(Boolean).join(", ")}{g("gstin") ? ` · GST ${g("gstin")}` : ""}{g("phone") ? ` · ${g("phone")}` : ""}</div>; })}
        </div>
        <div className="bg-white rounded-lg border p-3" style={{ borderColor: BORDER }}>
          <div className="text-xs font-bold uppercase mb-1" style={{ color: MUTED, letterSpacing: 0.5 }}>Bank and the rest</div>
          <F l="Bank" v={s.bank_name} /><F l="Account" v={s.account_no} /><F l="IFSC" v={s.ifsc_code} /><F l="Vendor ID" v={erp.vendor_id} /><F l="Item class" v={erp.item_class} /><F l="Service" v={erp.custom_type_of_service} /><F l="Evaluated by" v={erp.evaluated_by} /><F l="Evaluated on" v={erp.date_of_evaluation} /><F l="Remarks" v={erp.remarks_on_the_rating} /><F l="Supplier since" v={erp.supplier_since_how_many_years ? `${String(erp.supplier_since_how_many_years)} years` : ""} />
        </div>
      </div>
      <div className="text-xs font-bold uppercase mb-1" style={{ color: MUTED, letterSpacing: 0.5 }}>Purchase orders ({pos.length}{pos.length === 200 ? "+" : ""})</div>
      <div className="bg-white rounded-lg border" style={{ borderColor: BORDER, maxHeight: "40vh", overflowY: "auto" }}>
        {pos.map((p, i) => (
          <div key={p.name} className="px-3 py-1.5 flex gap-2 items-baseline text-xs" style={{ borderTop: i ? "1px solid #EEECE6" : undefined }}>
            <button onClick={() => onPo(p.name)} className="font-bold hover:underline" style={{ color: NAVY }}>{p.name}</button>
            <span className="tnum" style={{ color: MUTED }}>{d(p.transaction_date)}</span>
            <Chip text={p.status} colour={statusColour(p.status)} />
            <span style={{ color: MUTED }}>{p.project ? p.project.replace(/^NGSE-PROJ-/, "") : ""}</span>
            <span style={{ flex: 1 }} />
            <span className="tnum font-bold">{inr(p.grand_total)}</span>
          </div>
        ))}
        {!pos.length && <div className="p-3 text-xs" style={{ color: MUTED }}>No purchase order in the mirror for this supplier.</div>}
      </div>
    </div>
  );
}
