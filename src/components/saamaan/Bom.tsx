"use client";

/**
 * BOM — the lines of the jobs in process (Dr Raghu, 2 Sep 2026: "Lets make
 * an app called BOM. In this you will have BOM No - Item ID - Item Group -
 * Item - Qty UOM - Rate - Description (from Item) - Remarks - Status - Last
 * Modified by - Modified Date - Supplier. will ask more later as needed."
 * And: "I am concerned with the jobs in process right now.")
 *
 * Those twelve columns, one row per BOM line, for every live BOM on a
 * project in process. Pick a project, then a BOM, or search across all of
 * them. The lines do not all travel to the browser: the filters run in the
 * database and a page of 200 comes back.
 *
 * DESCRIPTION IS THE ITEM'S, from the Item mirror, as asked — and the
 * line's own where the item is not an RM item and so not in the mirror,
 * marked so. SUPPLIER is the item's supplier list; the ERP keeps none on
 * the line.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import GenieTable from "@/components/GenieTable";
import { Screen, Btn, Note, Chip, INK, MUTED, BORDER, NAVY, NAVY_SOFT, GREEN, AMBER, S, statusColour } from "@/components/ims/ui";
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

export default function Bom({ summary }: { summary: Summary }) {
  const [project, setProject] = useState("");
  const [bom, setBom] = useState("");
  const [status, setStatus] = useState("");
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Answer | null>(null);
  const [err, setErr] = useState("");
  const SIZE = 200;
  const base = data?.erpBase || summary.erpBase;

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

  const boms = useMemo(() => (data?.pickers.boms ?? []).filter((b) => !project || b.project_id === project), [data, project]);
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
    <Screen
      title="BOM"
      blurb="Every line of every live BOM on a project in process — the working set. Filled by the ERP pull; nothing here is typed."
      action={<Btn onClick={print} title="Print the rows on screen, with the filters named">Print / PDF</Btn>}>
      {err && <Note kind="error">{err}</Note>}
      {data && !data.lastPulledAt && (
        <Note kind="warn">BOM lines have not been pulled yet — open ERP pull and run it once; phase 6 brings them.</Note>
      )}

      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <select value={project} onChange={(e) => { setProject(e.target.value); setBom(""); setPage(0); }}
          className="px-2 py-1.5 rounded border text-sm bg-white" style={{ borderColor: project ? NAVY : BORDER, maxWidth: 360 }}>
          <option value="">All projects in process ({(data?.pickers.projects ?? []).length})</option>
          {(data?.pickers.projects ?? []).map((p) => (
            <option key={p.project_id} value={p.project_id}>{p.project_id.replace(/^NGSE-PROJ-/, "")} · {p.project_name} ({p.boms})</option>
          ))}
        </select>
        <select value={bom} onChange={(e) => { setBom(e.target.value); setPage(0); }}
          className="px-2 py-1.5 rounded border text-sm bg-white" style={{ borderColor: bom ? NAVY : BORDER, maxWidth: 360 }}>
          <option value="">All BOMs ({boms.length})</option>
          {boms.map((b) => (
            <option key={b.bom_id} value={b.bom_id}>{b.bom_id} · {b.item_name} ({b.lines}{b.docstatus === 0 ? ", draft" : ""})</option>
          ))}
        </select>
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
      </div>

      <GenieTable<Line>
        rows={rows}
        minWidth={1500}
        empty={data?.lastPulledAt ? "No line matches — loosen the filters." : "Nothing here yet — run the ERP pull."}
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
        item&apos;s supplier list — the ERP keeps none on the line. ⧉ marks a sub-assembly. Hover a BOM number for its project.
        <span style={{ background: NAVY_SOFT, padding: "0 4px", marginLeft: 6 }}>working set: live BOMs on projects in process</span>
      </div>
    </Screen>
  );
}
