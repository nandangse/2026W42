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
import { Card, Metric, INK, MUTED, BORDER, GREEN, AMBER, fmtD, daysTo, useLoad } from "@/components/ims/ui";

/** The value of stock, read live off the ERP's Bin — see /api/saamaan/stock?mode=value. */
interface StockValue {
  ok: boolean; readAt: string; mastersReady: boolean;
  erpTotal: number; stock: number; wip: number; finished: number; vendor: number;
  untyped: number; untypedWarehouses: string[];
  warehouses: { warehouse: string; value: number; qty: number; bins: number; kind: string }[];
}
const cr = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`;

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
}

const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "");

export default function Dashboard({ summary, go }: { summary: Summary; go: (k: string, group?: string) => void }) {
  const pulled = summary.lastPulledAt !== null;
  const age = pulled ? daysTo(summary.lastPulledAt!.slice(0, 10)) : null;
  // Fetched on its own, so the dashboard never waits on 25,000 bins.
  const [sv, svBusy, , svErr] = useLoad<StockValue>("/api/saamaan/stock?mode=value");

  return (
    <div style={{ maxWidth: 1180 }}>
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
          </span>
        </Card>
      </div>

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
                <div className="tnum" style={{ color: INK, fontSize: 20, fontWeight: 800, lineHeight: 1.3 }}>{cr(sv.wip)}</div>
                <div className="text-xs" style={{ color: MUTED }}>in WIP</div>
              </div>
              <div>
                <div className="tnum" style={{ color: INK, fontSize: 20, fontWeight: 800, lineHeight: 1.3 }}>{cr(sv.finished)}</div>
                <div className="text-xs" style={{ color: MUTED }}>Finished goods</div>
              </div>
              <div>
                <div className="tnum" style={{ color: INK, fontSize: 20, fontWeight: 800, lineHeight: 1.3 }}>{cr(sv.vendor)}</div>
                <div className="text-xs" style={{ color: MUTED }}>at vendors</div>
              </div>
              <div>
                <div className="tnum" style={{ color: MUTED, fontSize: 20, fontWeight: 800, lineHeight: 1.3 }}>{cr(sv.erpTotal)}</div>
                <div className="text-xs" style={{ color: MUTED }}>the ERP&rsquo;s total, every warehouse</div>
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

      <div className="grid md:grid-cols-2 gap-3" style={{ alignItems: "start" }}>
        <div>
          <div className="text-xs font-bold uppercase mb-1" style={{ color: MUTED, letterSpacing: 0.6 }}>Items by group — click one to open it</div>
          <GenieTable
            rows={summary.groups}
            minWidth={320}
            maxHeight="60vh"
            empty={pulled ? "The ERP offered no RM groups." : "Nothing here yet — the ERP has not been pulled. Open ERP pull."}
            columns={[
              { key: "g", label: "Item Group", align: "left", sort: (r) => r.item_group,
                render: (r) => <button onClick={() => go("items", r.item_group)} className="font-semibold text-left hover:underline" style={{ color: INK }}>{r.item_group}</button> },
              { key: "n", label: "Items", align: "right", sort: (r) => r.n,
                render: (r) => <span className="tnum">{r.n.toLocaleString("en-IN")}</span> },
              { key: "p", label: "Share", align: "right", sort: (r) => r.n,
                render: (r) => <span className="tnum" style={{ color: MUTED }}>{pct(r.n, summary.items)}</span> },
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
