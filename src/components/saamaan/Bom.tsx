"use client";

/**
 * BOM — the jobs in process, and their bills (Dr Raghu, 2 Sep 2026).
 *
 * THE FRONT: "show only the BOM Front specific: Project - Project Name -
 * Item Group - BOM No - No of items - Last Modified by - Modified Date.
 * Then clicking will take it deeper as BOM detailed in a fresh lightbox.
 * The BOM No should be the latest number that is submitted." One row per
 * project in process; the BOM is the highest-numbered SUBMITTED one on
 * the project; Item Group is the project's Product Family, which on the
 * ERP is a link to Item Group.
 *
 * THE LIGHTBOX: "BOM No - Item ID - Item Group - Item - Qty UOM - Rate -
 * Description (from Item) - Remarks - Status - Last Modified by - Modified
 * Date - Supplier." Those twelve columns, one row per line of that BOM,
 * 200 a page from the database.
 *
 * DESCRIPTION IS THE ITEM'S, from the Item mirror, as asked — and the
 * line's own where the item is not an RM item and so not in the mirror,
 * marked so. SUPPLIER is the item's supplier list; the ERP keeps none on
 * the line.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import GenieTable from "@/components/GenieTable";
import { Screen, Btn, Note, Chip, Modal, INK, MUTED, BORDER, NAVY, NAVY_SOFT, GREEN, AMBER, S, statusColour, useLoad } from "@/components/ims/ui";
import type { Summary } from "./Dashboard";

interface Line {
  row_id: string; bom_id: string; idx: number; item_code: string; item_name: string; item_group: string;
  qty: number | null; uom: string; rate: number | null; amount: number | null; description: string;
  bom_status: string; bom_remark: string; bom_no: string; is_sub_assembly: boolean;
  erp_modified: string | null; erp_modified_by: string;
  /** Joined by the server from the Item mirror. */
  item_description: string | null; item_group_of_item: string; suppliers: string[]; in_mirror: boolean;
  project_id: string; project_name: string;
}
interface Pickers {
  projects: { project_id: string; project_name: string; boms: number }[];
  boms: { bom_id: string; project_id: string; item_name: string; docstatus: number; lines: number }[];
}
interface Answer { installed: boolean; erpBase: string; rows: Line[]; total: number; page: number; size: number; pickers: Pickers; lastPulledAt: string | null; statuses: string[] }

const money = (n: unknown) => (n === null || n === undefined || n === "" ? "·" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
const qty = (n: unknown) => (n === null || n === undefined || n === "" ? "·" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: 3 }));
const fmtAt = (s: string | null) =>
  s ? new Date(s).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).replace(",", "") : "·";
const who = (s: string) => (S(s).includes("@") ? S(s).split("@")[0] : S(s)) || "·";
const erpForm = (base: string, doctype: string, name: string) =>
  `${base}/app/${doctype.toLowerCase().replace(/\s+/g, "-")}/${encodeURIComponent(name)}`;
/** Rich text → the words, for a cell. The full text is on hover. */
const plain = (html: string) => S(html).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/** The line's status, coloured by its meaning on the shop floor. */
const lineColour = (s: string) => {
  const t = s.toLowerCase();
  if (/receiv/.test(t) && !/partial/.test(t)) return GREEN;
  if (/partial/.test(t)) return AMBER;
  if (/order/.test(t)) return "#1B6B93";
  if (/releas/.test(t)) return NAVY;
  return statusColour(s);
};

// ================================================================ the front
interface Front {
  project_id: string; project_name: string; customer: string; status: string; live: boolean; item_group: string;
  bom_id: string; bom_item_code: string; bom_item_name: string; lines: number | null; bom_value: number | null; submitted: number; drafts: number;
  erp_modified: string | null; erp_modified_by: string;
}
interface FrontAnswer { installed: boolean; erpBase: string; rows: Front[]; lastPulledAt: string | null }

export default function Bom({ summary }: { summary: Summary }) {
  const [data, busy, reload, err] = useLoad<FrontAnswer>("/api/saamaan/items?mode=bom_front");
  const [open, setOpen] = useState<Front | null>(null);
  const [withBom, setWithBom] = useState(false);
  const [liveOnly, setLiveOnly] = useState(true);
  const base = data?.erpBase || summary.erpBase;
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => (!withBom || r.bom_id) && (!liveOnly || r.live)), [data, withBom, liveOnly]);

  return (
    <Screen
      title="BOM"
      blurb="Each project with its latest submitted BOM. Click a row for the bill itself. Filled by the ERP pull; nothing here is typed."
      action={<Btn onClick={reload} disabled={busy}>↻ Re-read</Btn>}>
      {err && <Note kind="error">{err}</Note>}
      {data && !data.lastPulledAt && (
        <Note kind="warn">BOM lines have not been pulled yet — open ERP pull and run it once; phase 6 brings them.</Note>
      )}
      <GenieTable<Front>
        rows={data ? rows : null}
        minWidth={1000}
        search={(r, q) => [r.project_id, r.project_name, r.customer, r.item_group, r.bom_id, r.bom_item_name, r.erp_modified_by].join(" ").toLowerCase().includes(q)}
        searchPlaceholder="🔍 project, name, group, BOM, who"
        empty={data?.lastPulledAt ? "No project matches." : "Nothing here yet — run the ERP pull."}
        header={<>
          <label className="text-xs flex items-center gap-1" style={{ color: MUTED }} title="Projects with a live job on the board — active, not delivered">
            <input type="checkbox" checked={liveOnly} onChange={(e) => setLiveOnly(e.target.checked)} /> With live project only
          </label>
          <label className="text-xs flex items-center gap-1" style={{ color: MUTED }}>
            <input type="checkbox" checked={withBom} onChange={(e) => setWithBom(e.target.checked)} /> with a submitted BOM only
          </label>
          <span className="text-xs tnum" style={{ color: MUTED }}>{rows.length.toLocaleString("en-IN")} {liveOnly ? "live projects" : "projects"}</span>
        </>}
        columns={[
          { key: "project", label: "Project", align: "left", sort: (r) => r.project_id,
            render: (r) => <button onClick={() => r.bom_id && setOpen(r)} className={`font-bold ${r.bom_id ? "hover:underline" : ""}`} style={{ color: r.bom_id ? NAVY : MUTED }} title={r.bom_id ? "Open the bill" : "No submitted BOM on this project"}>{r.project_id}</button> },
          { key: "name", label: "Project Name", align: "left", sort: (r) => r.project_name,
            render: (r) => (
              <button onClick={() => r.bom_id && setOpen(r)} className="font-semibold text-left" title={`${r.project_name}${r.live ? "" : `\n${r.status}`}`}
                style={{ color: r.live ? INK : MUTED, whiteSpace: "normal", width: 220, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.3 }}>
                {r.project_name || "·"}
              </button>
            ) },
          { key: "group", label: "Item Group", align: "left", sort: (r) => r.item_group,
            render: (r) => <span style={{ color: MUTED }} title="The project's Product Family — an Item Group on the ERP">{r.item_group || "·"}</span> },
          { key: "bom", label: "BOM No", align: "left", sort: (r) => r.bom_id,
            render: (r) => r.bom_id ? (
              <button onClick={() => setOpen(r)} className="rounded px-1.5 py-0.5 text-xs font-bold hover:underline" style={{ background: NAVY, color: "#fff" }}
                title={`${r.bom_item_code} — ${r.bom_item_name}
the latest submitted BOM${r.submitted > 1 ? ` of ${r.submitted}` : ""}${r.drafts ? `; ${r.drafts} draft${r.drafts === 1 ? "" : "s"} besides` : ""}`}>
                {r.bom_id}
              </button>
            ) : <span style={{ color: MUTED }} title={r.drafts ? `${r.drafts} draft BOM${r.drafts === 1 ? "" : "s"}, none submitted` : "no BOM on the ERP"}>{r.drafts ? "draft only" : "·"}</span> },
          { key: "n", label: "No of items", align: "right", sort: (r) => r.lines ?? -1,
            render: (r) => <span className="tnum" title={r.lines === null && r.bom_id ? "lines are pulled for live projects only" : ""}>{r.lines === null ? <span style={{ color: MUTED }}>·</span> : r.lines.toLocaleString("en-IN")}</span> },
          { key: "value", label: "BOM value (ERP)", align: "right", sort: (r) => r.bom_value ?? -1,
            render: (r) => <span className="tnum" title="The ERP's Total Cost on the BOM — raw material, operating and scrap">{money(r.bom_value)}</span> },
          { key: "by", label: "Last Modified by", align: "left", sort: (r) => who(r.erp_modified_by), render: (r) => <span>{who(r.erp_modified_by)}</span> },
          { key: "on", label: "Modified Date", align: "right", sort: (r) => S(r.erp_modified), render: (r) => <span className="tnum">{fmtAt(r.erp_modified)}</span> },
        ]}
      />
      <div className="text-xs mt-2" style={{ color: MUTED, lineHeight: 1.6 }}>
        BOM No is the highest-numbered submitted BOM on the project; BOM value is the ERP&apos;s Total Cost on it; Last Modified is that BOM&apos;s. Item Group is the project&apos;s Product Family.
        Lines are pulled for live projects only — untick the first box to see every project&apos;s BOM and value, greyed. Click anywhere on a row to open the bill.
      </div>
      {open && (
        <Modal onClose={() => setOpen(null)} title={`${open.bom_id} — ${open.project_id} · ${open.project_name}`} width={1500}>
          <BomLines bom={open.bom_id} base={base} summary={summary} />
        </Modal>
      )}
    </Screen>
  );
}

// ============================================================ the lightbox
function BomLines({ bom, base: baseIn }: { bom: string; base: string; summary: Summary }) {
  const project = "";
  const [status, setStatus] = useState("");
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Answer | null>(null);
  const [err, setErr] = useState("");
  const SIZE = 200;
  const base = data?.erpBase || baseIn;

  useEffect(() => { const t = setTimeout(() => { setQ(typed); setPage(0); }, 350); return () => clearTimeout(t); }, [typed]);

  const load = useCallback(() => {
    setErr("");
    const u = `/api/saamaan/items?mode=bom&project=${encodeURIComponent(project)}&bom=${encodeURIComponent(bom)}&status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}&page=${page}&size=${SIZE}`;
    fetch(u, { cache: "no-store" })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `The server answered ${r.status}.`); return j; })
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [project, bom, status, q, page]);
  useEffect(() => { load(); }, [load]);

  const total = data?.total ?? 0;
  const from = total ? page * SIZE + 1 : 0;
  const to = Math.min(total, (page + 1) * SIZE);
  const rows = data?.rows ?? null;

  /** The page on screen, as a clean A4 sheet, the filters named. */
  const print = () => {
    const w = window.open("", "_blank", "width=1200,height=800");
    if (!w) { setErr("The browser blocked the print window."); return; }
    const esc = (s: unknown) => S(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const filt = [project && `project ${project}`, bom && `BOM ${bom}`, status && `status ${status}`, q && `search "${q}"`].filter(Boolean).join(", ") || "every live BOM on a project in process";
    const body = (rows || []).map((r) => `<tr>
      <td>${esc(r.bom_id)}</td><td>${esc(r.item_code)}</td><td>${esc(r.item_group || r.item_group_of_item)}</td><td>${esc(r.item_name)}</td>
      <td class="n">${esc(qty(r.qty))} ${esc(r.uom)}</td><td class="n">${esc(money(r.rate))}</td>
      <td>${esc(plain(r.item_description ?? r.description).slice(0, 200))}</td><td>${esc(r.bom_remark)}</td><td>${esc(r.bom_status)}</td>
      <td>${esc(who(r.erp_modified_by))}</td><td class="n">${esc(fmtAt(r.erp_modified))}</td><td>${esc(r.suppliers.join(", "))}</td>
    </tr>`).join("");
    w.document.write(`<!doctype html><html><head><title>Saamaan — BOM</title><style>
      @page { size: A4 landscape; margin: 10mm; }
      body { font-family: Arial, Helvetica, sans-serif; color: #22283A; font-size: 9px; }
      h1 { font-size: 14px; margin: 0 0 2px; } .sub { color: #6B7280; margin-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; } thead { display: table-header-group; }
      th { background: #1B2D6B; color: #fff; text-align: left; padding: 3px 4px; font-size: 8.5px; }
      td { padding: 2px 4px; border-bottom: 1px solid #E5E8F0; vertical-align: top; }
      tr { page-break-inside: avoid; } td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    </style></head><body>
      <h1>📦 Nandan Saamaan — BOM</h1>
      <div class="sub">${esc(filt)} · rows ${from}–${to} of ${total.toLocaleString("en-IN")} · printed ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</div>
      <table><thead><tr><th>BOM No</th><th>Item ID</th><th>Item Group</th><th>Item</th><th class="n">Qty UOM</th><th class="n">Rate</th><th>Description</th><th>Remarks</th><th>Status</th><th>Last Modified by</th><th class="n">Modified Date</th><th>Supplier</th></tr></thead>
      <tbody>${body}</tbody></table>
    </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div>
      {err && <Note kind="error">{err}</Note>}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <a href={erpForm(base, "BOM", bom)} target="_blank" rel="noreferrer" className="text-xs font-bold" style={{ color: NAVY }}>Open on the ERP ↗</a>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}
          className="px-2 py-1.5 rounded border text-sm bg-white" style={{ borderColor: status ? NAVY : BORDER }}>
          <option value="">Any status</option>
          {(data?.statuses ?? []).map((s) => <option key={s} value={s}>{s || "(blank)"}</option>)}
        </select>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="🔍 item, name, remark, supplier"
          className="px-2 py-1.5 rounded border text-sm" style={{ borderColor: BORDER, minWidth: 220, flex: "1 1 220px", maxWidth: 360 }} />
        <span className="ml-auto text-xs tnum" style={{ color: MUTED }}>
          {rows === null ? "reading…" : total ? `${from.toLocaleString("en-IN")}–${to.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")}` : "none"}
        </span>
        <Btn onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>‹</Btn>
        <Btn onClick={() => setPage((p) => p + 1)} disabled={to >= total}>›</Btn>
        <Btn onClick={print} title="Print the rows on screen, with the filters named">Print / PDF</Btn>
      </div>

      <GenieTable<Line>
        rows={rows}
        minWidth={1400}
        maxHeight="62vh"
        empty={data?.lastPulledAt ? "No line here — lines are pulled for live projects only; loosen the filters, or open the BOM on the ERP." : "Nothing here yet — run the ERP pull."}
        columns={[
          { key: "bom", label: "BOM No", align: "left", sort: (r) => `${r.bom_id}#${String(r.idx).padStart(4, "0")}`,
            render: (r) => (
              <a href={erpForm(base, "BOM", r.bom_id)} target="_blank" rel="noreferrer" className="font-bold hover:underline" style={{ color: NAVY, textDecoration: "none" }}
                title={`${r.project_id} · ${r.project_name}\nline ${r.idx}`}>{r.bom_id}</a>
            ) },
          { key: "code", label: "Item ID", align: "left", sort: (r) => r.item_code,
            render: (r) => (
              <a href={erpForm(base, "Item", r.item_code)} target="_blank" rel="noreferrer" className="font-bold hover:underline" style={{ color: INK, textDecoration: "none" }}
                title={r.in_mirror ? "an RM item, in the Items mirror" : "not an RM item — not in the Items mirror"}>{r.item_code}{r.is_sub_assembly ? " ⧉" : ""}</a>
            ) },
          { key: "group", label: "Item Group", align: "left", sort: (r) => r.item_group || r.item_group_of_item,
            render: (r) => <span style={{ color: MUTED }}>{(r.item_group || r.item_group_of_item).replace(/^RM - /, "") || "·"}</span> },
          { key: "item", label: "Item", align: "left", sort: (r) => r.item_name,
            render: (r) => <span className="font-semibold" style={{ color: INK, whiteSpace: "normal", display: "inline-block", maxWidth: 260 }}>{r.item_name || "·"}</span> },
          { key: "qty", label: "Qty UOM", align: "right", sort: (r) => Number(r.qty ?? -1),
            render: (r) => <span className="tnum">{qty(r.qty)} <span style={{ color: MUTED }}>{r.uom}</span></span> },
          { key: "rate", label: "Rate", align: "right", sort: (r) => Number(r.rate ?? -1),
            render: (r) => <span className="tnum" title={r.amount !== null ? `amount ${money(r.amount)}` : ""}>{money(r.rate)}</span> },
          { key: "desc", label: "Description", align: "left",
            render: (r) => {
              const text = plain(r.item_description ?? r.description);
              const fromItem = r.item_description !== null;
              return text ? (
                <span title={`${text}${fromItem ? "\n\n— the Item's description" : "\n\n— the BOM line's own description; the item is not in the Items mirror"}`}
                  style={{ whiteSpace: "normal", display: "inline-block", maxWidth: 300, color: fromItem ? INK : MUTED }}>
                  {text.length > 140 ? `${text.slice(0, 140)}…` : text}
                </span>
              ) : <span style={{ color: MUTED }}>·</span>;
            } },
          { key: "remark", label: "Remarks", align: "left", sort: (r) => r.bom_remark,
            render: (r) => <span style={{ whiteSpace: "normal", display: "inline-block", maxWidth: 200 }}>{r.bom_remark || <span style={{ color: MUTED }}>·</span>}</span> },
          { key: "status", label: "Status", align: "left", sort: (r) => r.bom_status,
            render: (r) => r.bom_status ? <Chip text={r.bom_status} colour={lineColour(r.bom_status)} /> : <span style={{ color: MUTED }}>·</span> },
          { key: "by", label: "Last Modified by", align: "left", sort: (r) => who(r.erp_modified_by), render: (r) => <span>{who(r.erp_modified_by)}</span> },
          { key: "on", label: "Modified Date", align: "right", sort: (r) => S(r.erp_modified), render: (r) => <span className="tnum">{fmtAt(r.erp_modified)}</span> },
          { key: "sup", label: "Supplier", align: "left", sort: (r) => r.suppliers.join(", "),
            render: (r) => r.suppliers.length
              ? <span style={{ whiteSpace: "normal", display: "inline-block", maxWidth: 220 }}>{r.suppliers.join(", ")}</span>
              : <span style={{ color: MUTED }} title={r.in_mirror ? "no supplier on the item" : "not an RM item — no supplier list in the mirror"}>·</span> },
        ]}
      />
      <div className="text-xs mt-2" style={{ color: MUTED, lineHeight: 1.6 }}>
        Description is the item&apos;s, from the Items mirror; where an item is not an RM item the line&apos;s own description shows, in grey. Supplier is the
        item&apos;s supplier list — the ERP keeps none on the line. ⧉ marks a sub-assembly.
        <span style={{ background: NAVY_SOFT, padding: "0 4px", marginLeft: 6 }}>working set: live BOMs on live projects — those with a job on the board</span>
      </div>
    </div>
  );
}
