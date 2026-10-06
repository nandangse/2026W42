"use client";

/**
 * Saamaan's dashboard — what the mirror holds, and where it is thin.
 *
 * The cards say how many items came, how many carry a drawing in each
 * format, how many attachments there are, and when the ERP was last read.
 * "No data" and 0 are different facts: a mirror that was never pulled says
 * so rather than showing a confident nought.
 */

import GenieTable from "@/components/GenieTable";
import { Card, Metric, Modal, INK, MUTED, BORDER, GREEN, AMBER, NAVY, RED, fmtD, daysTo, useLoad } from "@/components/ims/ui";
import { useState } from "react";

/** The value of stock, read live off the ERP's Bin — see /api/saamaan/stock?mode=value. */
interface StockValue {
  ok: boolean; readAt: string; mastersReady: boolean;
  erpTotal: number; stock: number; wip: number; finished: number; vendor: number; stores?: number; wipReal?: number | null; wipJobs?: number | null;
  untyped: number; untypedWarehouses: string[];
  genieTotal?: number; ignored?: number; ignoredWarehouses?: string[];
  warehouses: { warehouse: string; value: number; qty: number; bins: number; kind: string }[];
}
const cr = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`;
const lk = (v: number) => (Math.abs(v) >= 1e7 ? `₹${(v / 1e7).toFixed(2)} Cr` : Math.abs(v) >= 1e5 ? `₹${(v / 1e5).toFixed(2)} L` : `₹${Math.round(v).toLocaleString("en-IN")}`);

export interface PullLine {
  id: string; phase: string; found: number; written: number; removed: number; note: string; by: string | null; at: string;
}
export interface Summary {
  installed: boolean;
  erpBase: string;
  items: number;
  disabled: number;
  withPdf: number;
  withDwg: number;
  withDxf: number;
  files: number;
  /** Null until migration 0119 — no table is not no projects. */
  projects: number | null;
  boms: number | null;
  groups: { item_group: string; n: number }[];
  pulls: PullLine[];
  lastPulledAt: string | null;
  /** Whether THIS person may pull — answered by the server, not guessed here. */
  mayPull?: boolean;
}

const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "");

export default function Dashboard({ summary, go }: { summary: Summary; go: (k: string, group?: string) => void }) {
  const pulled = summary.lastPulledAt !== null;
  const age = pulled ? daysTo(summary.lastPulledAt!.slice(0, 10)) : null;
  // Fetched on its own, so the dashboard never waits on 25,000 bins.
  const [sv, svBusy, , svErr] = useLoad<StockValue>("/api/saamaan/stock?mode=value");
  /* "Next to this, also show value and value percentage" (Dr Raghu, 6 Oct 2026) — RM stock per group, live */
  const [gv] = useLoad<{ groups: { group: string; value: number }[] }>("/api/saamaan/inventory?view=itemgroups");
  const valueOf = new Map((gv?.groups ?? []).map((g) => [g.group, g.value]));
  const rmTotal = (gv?.groups ?? []).reduce((a, g) => a + g.value, 0);

  return (
    <div style={{ maxWidth: 1180 }}>
      {/*
        THE VALUE OF STOCK, NOW (Dr Raghu, 3 Sep 2026: "show current value of
        stock"). Live off the ERP's Bin, and given in FOUR PARTS rather than
        one number — because the ERP's own total is Rs 109.59 Cr across
        nineteen warehouses and only Rs 27.63 Cr of it sits in the ones
        typed "Stock": Finished Goods (Rs 37.71 Cr) and eleven others have
        never been typed in Masters. A total that quietly folds Rs 69 Cr of
        unclassified warehouses into "stock" is a number the balance sheet
        will later disagree with, so the untyped part is named and counted,
        and one click opens Masters to type them.
      */}
      <div className="bg-white rounded-lg border p-3 mb-3" style={{ borderColor: BORDER }}>
        <div className="flex items-baseline gap-3 flex-wrap">
          <div className="text-xs font-bold uppercase" style={{ color: MUTED, letterSpacing: 0.6 }}>Value of stock — live off the ERP</div>
          {sv?.readAt && <span className="text-xs" style={{ color: MUTED }}>read {new Date(sv.readAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} IST</span>}
        </div>
        {svErr ? (
          <div className="text-sm mt-2" style={{ color: AMBER }}>{svErr}</div>
        ) : !sv ? (
          <div className="text-sm mt-2" style={{ color: MUTED }}>{svBusy ? "Reading every bin on the ERP…" : "No data"}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-2">
              <div>
                <div className="tnum" style={{ color: GREEN, fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{cr(sv.stock)}</div>
                <div className="text-xs mt-1" style={{ color: MUTED }}>in <b>Stock</b> warehouses · {sv.warehouses.filter((w) => w.kind === "Stock").length} of them</div>
              </div>
              <div>
                <div className="tnum" style={{ color: INK, fontSize: 20, fontWeight: 800, lineHeight: 1.3 }}>{sv.wipReal === null || sv.wipReal === undefined ? "·" : cr(sv.wipReal)}</div>
                <div className="text-xs" style={{ color: MUTED }} title="the ERP's completed transfers out of the stores to each live job, by job number">WIP real{sv.wipJobs ? ` · ${sv.wipJobs} live jobs` : ""}</div>
              </div>
              <div>
                <div className="tnum" style={{ color: INK, fontSize: 20, fontWeight: 800, lineHeight: 1.3 }}>{cr(sv.finished)}</div>
                <div className="text-xs" style={{ color: MUTED }}>Finished goods</div>
              </div>
              <div>
                <div className="tnum" style={{ color: INK, fontSize: 20, fontWeight: 800, lineHeight: 1.3 }}>{cr(sv.vendor)}</div>
                <div className="text-xs" style={{ color: MUTED }}>at vendors{sv.stores ? <> · service stores <b style={{ color: INK }}>{cr(sv.stores)}</b></> : null}</div>
              </div>
              <div>
                <div className="tnum" style={{ color: MUTED, fontSize: 20, fontWeight: 800, lineHeight: 1.3 }}>{cr(sv.genieTotal ?? sv.erpTotal)}</div>
                <div className="text-xs" style={{ color: MUTED }}>total stock</div>
              </div>
            </div>
            {sv.untypedWarehouses.length > 0 && (
              <div className="text-xs mt-2 pt-2" style={{ color: AMBER, borderTop: `1px solid ${BORDER}` }}>
                <b>{cr(sv.untyped)}</b> sits in {sv.untypedWarehouses.length} warehouse{sv.untypedWarehouses.length === 1 ? "" : "s"} nobody has typed yet
                — {sv.untypedWarehouses.slice(0, 4).join(", ")}{sv.untypedWarehouses.length > 4 ? ` and ${sv.untypedWarehouses.length - 4} more` : ""}.
                It is counted in the ERP&rsquo;s total and in none of the four parts.{" "}
                <button onClick={() => go("masters")} className="font-bold underline" style={{ color: INK }}>Type them in Masters</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* "we would like to begin by seeing the value of the stock at the top" (Dr Raghu, 6 Oct 2026) — then the pulse, then the item counts */}
      <PulseBlock />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mb-3">
        <Card title="Items" hint={`under "RM -", not disabled${summary.disabled ? ` · ${summary.disabled.toLocaleString("en-IN")} since disabled` : ""}`}>
          <Metric value={pulled ? summary.items : null} haveData={pulled} />
        </Card>
        <Card title="Groups" hint="the ERP's Item Groups, as named there">
          <Metric value={pulled ? summary.groups.length : null} haveData={pulled} />
        </Card>
        <Card title="Drawing PDF" hint={pulled ? `${pct(summary.withPdf, summary.items)} of items carry one` : "of items with a PDF drawing"}>
          <Metric value={pulled ? summary.withPdf : null} haveData={pulled} />
        </Card>
        <Card title="DWG · DXF" hint="CAD drawings, in either format">
          <span style={{ color: INK, fontSize: 26, fontWeight: 800, lineHeight: 1 }}>
            {pulled ? <>{summary.withDwg.toLocaleString("en-IN")} <span style={{ color: MUTED, fontSize: 14 }}>·</span> {summary.withDxf.toLocaleString("en-IN")}</> : <span style={{ color: MUTED, fontSize: 15, fontWeight: 700 }}>No data</span>}
          </span>
        </Card>
        <Card title="Attachments" hint="every File the ERP holds on these items">
          <Metric value={pulled ? summary.files : null} haveData={pulled} />
        </Card>
        <Card title="Projects · BOMs" hint={summary.projects === null ? "run migration 0119" : "on the ERP — open Projects"}>
          <button onClick={() => go("projects")} style={{ color: INK, fontSize: 26, fontWeight: 800, lineHeight: 1 }}>
            {summary.projects === null || !pulled ? <span style={{ color: MUTED, fontSize: 15, fontWeight: 700 }}>No data</span>
              : <>{summary.projects.toLocaleString("en-IN")} <span style={{ color: MUTED, fontSize: 14 }}>·</span> {(summary.boms ?? 0).toLocaleString("en-IN")}</>}
          </button>
        </Card>
        <Card title="Last pulled" hint={pulled ? (age === 0 ? "today" : `${Math.abs(age ?? 0)} day${Math.abs(age ?? 0) === 1 ? "" : "s"} ago`) : "never — open ERP pull"}>
          <span style={{ color: pulled ? (age !== null && age <= -7 ? AMBER : GREEN) : MUTED, fontSize: pulled ? 20 : 15, fontWeight: 800, lineHeight: 1 }}>
            {pulled ? fmtD(summary.lastPulledAt) : "No data"}
            {pulled && <div style={{ fontSize: 15, marginTop: 4 }}>{new Date(summary.lastPulledAt!).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} IST</div>}
          </span>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-3" style={{ alignItems: "start" }}>
        <div>
          <div className="text-xs font-bold uppercase mb-1" style={{ color: MUTED, letterSpacing: 0.6 }}>Items by group — click one to open it</div>
          <GenieTable
            rows={summary.groups}
            minWidth={480}
            maxHeight="60vh"
            empty={pulled ? "The ERP offered no RM groups." : "Nothing here yet — the ERP has not been pulled. Open ERP pull."}
            columns={[
              { key: "g", label: "Item Group", align: "left", sort: (r) => r.item_group,
                render: (r) => <button onClick={() => go("items", r.item_group)} className="font-semibold text-left hover:underline" style={{ color: INK }}>{r.item_group}</button> },
              { key: "n", label: "Items", align: "right", sort: (r) => r.n,
                render: (r) => <span className="tnum">{r.n.toLocaleString("en-IN")}</span> },
              { key: "p", label: "Share", align: "right", sort: (r) => r.n,
                render: (r) => <span className="tnum" style={{ color: MUTED }}>{pct(r.n, summary.items)}</span> },
              { key: "v", label: "Value", align: "right", sort: (r) => valueOf.get(r.item_group) ?? -1,
                render: (r) => <b className="tnum" style={{ color: INK }}>{gv ? lk(valueOf.get(r.item_group) ?? 0) : "…"}</b> },
              { key: "vp", label: "Value %", align: "right", sort: (r) => valueOf.get(r.item_group) ?? -1,
                render: (r) => <span className="tnum" style={{ color: MUTED }}>{gv && rmTotal ? `${(((valueOf.get(r.item_group) ?? 0) / rmTotal) * 100).toFixed(1)}%` : "·"}</span> },
            ]}
          />
        </div>

        <div className="bg-white rounded-lg border p-4" style={{ borderColor: BORDER }}>
          <div className="text-sm font-bold mb-2" style={{ color: INK }}>How this room works</div>
          <div className="text-sm" style={{ color: "var(--dim)", lineHeight: 1.7 }}>
            The ERP owns the Item master. <b>Items</b> is a mirror of every item whose group is named
            &ldquo;RM - …&rdquo; and which is not disabled — every field the ERP holds, the rich description with its
            pictures, the drawings in PDF, DWG and DXF, every attachment, and every link, as they are. Search it, filter
            it by group, open an item to read the whole record, and print the page you are looking at.
            <br /><br />
            <b>Projects</b> lists every project with the Approved BOM it points at and every BOM the ERP holds against it.
            <b> ERP pull</b> reads the ERP again — items, child tables, files, projects, BOMs — and keeps a ledger
            of every walk. An item the ERP has since disabled is marked here, never dropped: the Bill of Materials,
            which comes next on this base, must still find it.
            <br /><br />
            Nothing here is typed by hand. What is wrong in the mirror is wrong in the ERP, and is fixed there.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================ the pulse */
/**
 * HOW THE STORE AND PURCHASE ARE MOVING (Dr Raghu, 6 Oct 2026) — GRNs by
 * day for fifteen days, physical counts, and the purchase follow-ups that
 * cannot wait: open POs, overdue POs, GRNs still without an invoice. Live
 * off the ERP; the counts are Genie's. For Rameez and Mukesh at a glance.
 */
interface Win { n: number; qty: number; value: number }
interface Pulse {
  readAt: string; today: string;
  grn: { days: { day: string; n: number; qty: number; value: number }[]; today: Win; d7: Win; d15: Win };
  noInvoice: Win; noInvoice7: Win; poOpen: { n: number; value: number }; poOverdue: { n: number; value: number }; poOverdue60: { n: number; value: number };
  counts: { today: { lines: number; items: number; sheets: number }; d7: { lines: number; items: number; sheets: number }; d15: { lines: number; items: number; sheets: number }; byPerson: { who: string; lines: number }[]; days: { day: string; lines: number }[] };
}
const qn2 = (v: number) => Math.round(v).toLocaleString("en-IN");

function Bars({ values, labels, colour, title }: { values: number[]; labels: string[]; colour: string; title: (i: number) => string }) {
  const max = Math.max(1, ...values);
  const W = 15 * 22, Hh = 64;
  return (
    <svg viewBox={`0 0 ${W} ${Hh + 14}`} width="100%" style={{ maxWidth: 420, display: "block" }} role="img">
      {values.map((v, i) => {
        const h = v ? Math.max(2, (v / max) * Hh) : 0;
        return (
          <g key={i}>
            <title>{title(i)}</title>
            <rect x={i * 22 + 3} y={Hh - h} width={16} height={h} rx={2} fill={i === values.length - 1 ? colour : `${colour}99`} />
            {i % 2 === 0 || i === values.length - 1 ? <text x={i * 22 + 11} y={Hh + 11} fontSize={8} textAnchor="middle" fill="#8A8F98">{labels[i]}</text> : null}
          </g>
        );
      })}
    </svg>
  );
}

/* "make the data open up in a light box … by clicking the header, it can be sorted, and by typing on the top, it can start filtering out. This is only for quick view" (Dr Raghu, 6 Oct 2026) */
type ListKey = "po_open" | "po_overdue" | "po_overdue60" | "grn_noinv" | "grn_noinv7" | "grn_today" | "grn_7" | "grn_15";
interface DocRow { doc: string; doctype: string; supplier: string; date: string; due?: string; late?: number; age?: number; value: number; pending: number; qty: number; qty_pending?: number; received_pct?: number; billed_pct: number; status: string }
const dmy = (d: string) => (d ? `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(2, 4)}` : "·");

function QuickView({ list, title, onClose }: { list: ListKey; title: string; onClose: () => void }) {
  const [d, busy, , err] = useLoad<{ rows: DocRow[]; erpBase: string }>(`/api/saamaan/pulse?list=${list}`);
  const po = list.startsWith("po_");
  const pendingGrn = list === "grn_noinv" || list === "grn_noinv7";
  const href = (r: DocRow) => `${d?.erpBase ?? ""}/app/${r.doctype.toLowerCase().replace(/\s+/g, "-")}/${encodeURIComponent(r.doc)}`;
  const rows = d?.rows ?? null;
  const sumV = (rows ?? []).reduce((a, r) => a + (po || pendingGrn ? r.pending : r.value), 0);
  return (
    <Modal onClose={onClose} title={title} width={1100}>
      {err && <div className="text-sm mb-2" style={{ color: RED }}>{err}</div>}
      {rows && <div className="text-xs mb-2" style={{ color: MUTED }}>{rows.length.toLocaleString("en-IN")} documents · <b style={{ color: INK }}>{lk(sumV)}</b> {po ? "still to be received" : pendingGrn ? "not yet invoiced" : "received"} · read live off the ERP; click a number to open it there</div>}
      {busy && !rows && <div className="text-sm" style={{ color: MUTED }}>Reading the ERP…</div>}
      <GenieTable<DocRow> rows={rows} minWidth={900} maxHeight="65vh"
        search={(r, q) => `${r.doc} ${r.supplier} ${r.status}`.toLowerCase().includes(q)} searchPlaceholder="🔍 number, supplier, status"
        columns={po ? [
          { key: "d", label: "PO", align: "left", sort: (r) => r.doc, render: (r) => <a href={href(r)} target="_blank" rel="noreferrer" className="font-bold" style={{ color: NAVY }}>{r.doc}</a> },
          { key: "s", label: "Supplier", align: "left", sort: (r) => r.supplier, render: (r) => <span style={{ whiteSpace: "normal" }}>{r.supplier}</span> },
          { key: "dt", label: "Date", align: "left", sort: (r) => r.date, render: (r) => <span className="tnum">{dmy(r.date)}</span> },
          { key: "due", label: "Required by", align: "left", sort: (r) => r.due ?? "", render: (r) => <span className="tnum">{dmy(r.due ?? "")}</span> },
          { key: "late", label: "Days late", align: "right", sort: (r) => r.late ?? 0, render: (r) => <b className="tnum" style={{ color: (r.late ?? 0) > 60 ? RED : (r.late ?? 0) > 0 ? AMBER : MUTED }}>{r.late ? r.late : "·"}</b> },
          { key: "rcv", label: "Received", align: "right", sort: (r) => r.received_pct ?? 0, render: (r) => <span className="tnum">{Math.round(r.received_pct ?? 0)}%</span> },
          { key: "v", label: "PO value", align: "right", sort: (r) => r.value, render: (r) => <span className="tnum">{lk(r.value)}</span> },
          { key: "p", label: "Pending", align: "right", sort: (r) => r.pending, render: (r) => <b className="tnum">{lk(r.pending)}</b> },
          { key: "st", label: "Status", align: "left", sort: (r) => r.status, render: (r) => <span className="text-xs" style={{ color: MUTED }}>{r.status}</span> },
        ] : [
          { key: "d", label: "GRN", align: "left", sort: (r) => r.doc, render: (r) => <a href={href(r)} target="_blank" rel="noreferrer" className="font-bold" style={{ color: NAVY }}>{r.doc}</a> },
          { key: "s", label: "Supplier", align: "left", sort: (r) => r.supplier, render: (r) => <span style={{ whiteSpace: "normal" }}>{r.supplier}</span> },
          { key: "dt", label: "Date", align: "left", sort: (r) => r.date, render: (r) => <span className="tnum">{dmy(r.date)}</span> },
          { key: "age", label: "Days old", align: "right", sort: (r) => r.age ?? 0, render: (r) => <b className="tnum" style={{ color: pendingGrn && (r.age ?? 0) > 7 ? RED : INK }}>{r.age ?? "·"}</b> },
          { key: "q", label: pendingGrn ? "Qty not invoiced" : "Qty", align: "right", sort: (r) => (pendingGrn ? r.qty_pending ?? 0 : r.qty), render: (r) => <span className="tnum">{qn2(pendingGrn ? r.qty_pending ?? 0 : r.qty)}</span> },
          { key: "v", label: "GRN value", align: "right", sort: (r) => r.value, render: (r) => <span className="tnum">{lk(r.value)}</span> },
          ...(pendingGrn ? [{ key: "p", label: "Not invoiced", align: "right" as const, sort: (r: DocRow) => r.pending, render: (r: DocRow) => <b className="tnum">{lk(r.pending)}</b> }] : []),
          { key: "b", label: "Billed", align: "right", sort: (r) => r.billed_pct, render: (r) => <span className="tnum">{Math.round(r.billed_pct)}%</span> },
          { key: "st", label: "Status", align: "left", sort: (r) => r.status, render: (r) => <span className="text-xs" style={{ color: MUTED }}>{r.status}</span> },
        ]} />
    </Modal>
  );
}

function PulseBlock() {
  const [p, busy, , err] = useLoad<Pulse>("/api/saamaan/pulse");
  const [open, setOpen] = useState<{ list: ListKey; title: string } | null>(null);
  const dd = (day: string) => day.slice(8, 10);
  const cell = (label: string, w?: Win, list?: ListKey) => (
    <div className="rounded border px-2.5 py-2" style={{ borderColor: BORDER, cursor: list ? "pointer" : undefined }} onClick={list ? () => setOpen({ list, title: `GRNs — ${label.toLowerCase()}` }) : undefined} title={list ? "open the list" : undefined}>
      <div className="text-xs font-bold uppercase" style={{ color: MUTED, letterSpacing: 0.5 }}>{label}</div>
      <div className="tnum" style={{ color: INK, fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{w ? w.n.toLocaleString("en-IN") : "…"}</div>
      <div className="text-xs tnum" style={{ color: MUTED }}>{w ? <><b style={{ color: INK }}>{lk(w.value)}</b> · {qn2(w.qty)} qty</> : " "}</div>
    </div>
  );
  const ccell = (label: string, c?: { lines: number; items: number; sheets: number }) => (
    <div className="rounded border px-2.5 py-2" style={{ borderColor: BORDER }}>
      <div className="text-xs font-bold uppercase" style={{ color: MUTED, letterSpacing: 0.5 }}>{label}</div>
      <div className="tnum" style={{ color: INK, fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{c ? c.lines.toLocaleString("en-IN") : "…"}</div>
      <div className="text-xs tnum" style={{ color: MUTED }}>{c ? <>lines · {c.items} items · {c.sheets} sheet{c.sheets === 1 ? "" : "s"}</> : " "}</div>
    </div>
  );
  const flag = (label: string, n: number | undefined, value: number | undefined, tone: string, hint: string, qty?: number, list?: ListKey) => (
    <div className="rounded border px-2.5 py-2" style={{ borderColor: BORDER, borderLeft: `4px solid ${tone}`, cursor: list ? "pointer" : undefined }} onClick={list ? () => setOpen({ list, title: label }) : undefined} title={list ? "open the list" : undefined}>
      <div className="text-xs font-bold uppercase" style={{ color: MUTED, letterSpacing: 0.5 }}>{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="tnum" style={{ color: tone, fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{n === undefined ? "…" : n.toLocaleString("en-IN")}</span>
        <span className="tnum text-sm font-bold" style={{ color: INK }}>{value === undefined ? "" : lk(value)}</span>
      </div>
      <div className="text-xs" style={{ color: MUTED }}>{qty !== undefined ? `${qn2(qty)} qty · ` : ""}{hint}</div>
    </div>
  );
  return (
    <div className="bg-white rounded-lg border p-3 mb-3" style={{ borderColor: BORDER }}>
      <div className="flex items-baseline gap-3 flex-wrap mb-2">
        <div className="text-xs font-bold uppercase" style={{ color: MUTED, letterSpacing: 0.6 }}>The pulse — GRNs, counts and purchase follow-up</div>
        {p?.readAt && <span className="text-xs" style={{ color: MUTED }}>read {new Date(p.readAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} IST</span>}
        {busy && !p && <span className="text-xs" style={{ color: MUTED }}>reading the ERP…</span>}
      </div>
      {err && <div className="text-xs mb-2" style={{ color: RED }}>{err}</div>}

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
        <div>
          <div className="text-sm font-bold mb-1" style={{ color: INK }}>GRNs</div>
          <div className="grid grid-cols-3 gap-2 mb-2">{cell("Today", p?.grn.today, "grn_today")}{cell("Last 7 days", p?.grn.d7, "grn_7")}{cell("Last 15 days", p?.grn.d15, "grn_15")}</div>
          {p && <Bars values={p.grn.days.map((d) => d.value)} labels={p.grn.days.map((d) => dd(d.day))} colour="#1B6B93"
            title={(i) => `${p.grn.days[i].day}: ${p.grn.days[i].n} GRN${p.grn.days[i].n === 1 ? "" : "s"} · ${lk(p.grn.days[i].value)} · ${qn2(p.grn.days[i].qty)} qty`} />}
          <div className="text-xs" style={{ color: MUTED }}>value received each day, the last fifteen — hover a bar for the day</div>
        </div>
        <div>
          <div className="text-sm font-bold mb-1" style={{ color: INK }}>Physical counts</div>
          <div className="grid grid-cols-3 gap-2 mb-2">{ccell("Today", p?.counts.today)}{ccell("Last 7 days", p?.counts.d7)}{ccell("Last 15 days", p?.counts.d15)}</div>
          {p && <Bars values={p.counts.days.map((d) => d.lines)} labels={p.counts.days.map((d) => dd(d.day))} colour="#0F766E"
            title={(i) => `${p.counts.days[i].day}: ${p.counts.days[i].lines} line${p.counts.days[i].lines === 1 ? "" : "s"} counted`} />}
          <div className="text-xs" style={{ color: MUTED }}>
            {p ? (p.counts.byPerson.length ? <>today: {p.counts.byPerson.map((x) => <span key={x.who}><b style={{ color: INK }}>{x.who}</b> {x.lines} </span>)}</> : "nobody has counted today yet") : " "}
          </div>
        </div>
      </div>

      <div className="text-sm font-bold mt-3 mb-1" style={{ color: INK }}>Purchase follow-up</div>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {flag("Open POs", p?.poOpen.n, p?.poOpen.value, NAVY, "still to be received, at value pending", undefined, "po_open")}
        {flag("POs overdue", p?.poOverdue.n, p?.poOverdue.value, AMBER, "past the required-by date", undefined, "po_overdue")}
        {flag("Overdue > 2 months", p?.poOverdue60.n, p?.poOverdue60.value, RED, "close them or chase them", undefined, "po_overdue60")}
        {flag("GRN in, no invoice", p?.noInvoice.n, p?.noInvoice.value, AMBER, "received, invoice not booked", p?.noInvoice.qty, "grn_noinv")}
        {flag("No invoice > 7 days", p?.noInvoice7.n, p?.noInvoice7.value, RED, "GRNs older than a week, still unbilled", p?.noInvoice7.qty, "grn_noinv7")}
      </div>
      {open && <QuickView list={open.list} title={open.title} onClose={() => setOpen(null)} />}
    </div>
  );
}
