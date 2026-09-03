"use client";

/**
 * Items — the ERP's Item master, mirrored, browsed.
 *
 * 22,000 rows do not travel to a browser: the search and the group filter
 * run in the database and a page of 200 comes back. Click a code to open
 * the whole record — the rich description drawn as the ERP draws it
 * (pictures included), the drawings, every attachment, every link, the
 * child tables, and every field the ERP returned, in case the one being
 * argued about is not on the card.
 *
 * Print / PDF prints WHAT IS ON SCREEN — the page, the filters — and says
 * so in its heading, because a printout that quietly reverts to all
 * 22,000 items is not the document anybody asked for.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GenieTable from "@/components/GenieTable";
import { Screen, Modal, Btn, Note, Chip, INK, MUTED, BORDER, NAVY, NAVY_SOFT, GREEN, AMBER, S, fmtD, statusColour } from "@/components/ims/ui";
import type { Summary } from "./Dashboard";

type Row = Record<string, unknown> & { item_code: string };
interface FileRow { file_id: string; file_name: string; file_url: string; is_private: boolean; attached_to_field: string; file_size: number | null }

const money = (n: unknown) =>
  n === null || n === undefined || n === "" ? "·" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const num = (n: unknown) => (n === null || n === undefined || n === "" ? "·" : Number(n).toLocaleString("en-IN"));
const qtyFmt = (n: unknown) => (n === null || n === undefined ? "·" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: 3 }));

/** An ERP path (/files/x.png, /file/abc/y.pdf) → a link that opens. As-is otherwise. */
const erpUrl = (base: string, p: string) => (p && p.startsWith("/") ? `${base}${p}` : p);
/** The ERP's form for a document. Frappe slugs the doctype: Item Group → item-group. */
const erpForm = (base: string, doctype: string, name: string) =>
  `${base}/app/${doctype.toLowerCase().replace(/\s+/g, "-")}/${encodeURIComponent(name)}`;

/**
 * The rich description, made safe to draw and pointed at the ERP for its
 * pictures. The HTML is the ERP's own (Quill); scripts and handlers are
 * stripped on principle, and every relative src or href gains the ERP's
 * URL so the picture actually shows. The stored text is untouched.
 */
function richHtml(s: string, base: string): string {
  return S(s)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/(src|href)=("|')\/(files|private\/files|file)\//gi, `$1=$2${base}/$3/`);
}
const hasHtml = (s: string) => /<[a-z][\s\S]*>/i.test(s);

const DrawingLinks = ({ r, base }: { r: Row; base: string }) => {
  const links = [
    ["PDF", S(r.drawing_pdf)], ["DWG", S(r.drawing_dwg)], ["DXF", S(r.custom_drawing_dxf)], ["IMG", S(r.image)],
  ].filter(([, p]) => p);
  if (!links.length) return <span style={{ color: MUTED }}>·</span>;
  return (
    <span className="flex gap-1.5">
      {links.map(([k, p]) => (
        <a key={k} href={erpUrl(base, p)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
          className="rounded px-1.5 py-0.5 text-xs font-bold" style={{ background: NAVY_SOFT, color: NAVY, textDecoration: "none" }}
          title={p}>{k}</a>
      ))}
    </span>
  );
};

export default function Items({ summary, initialGroup }: { summary: Summary; initialGroup: string }) {
  const base = summary.erpBase;
  const [q, setQ] = useState("");
  const [typed, setTyped] = useState("");
  const [groups, setGroups] = useState<string[]>(initialGroup ? [initialGroup] : []);
  const [showDisabled, setShowDisabled] = useState(false);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const SIZE = 200;

  useEffect(() => { setGroups(initialGroup ? [initialGroup] : []); setPage(0); }, [initialGroup]);
  /** The search waits for the typing to stop; a query a keystroke is a query too many. */
  useEffect(() => { const t = setTimeout(() => { setQ(typed); setPage(0); }, 350); return () => clearTimeout(t); }, [typed]);

  const load = useCallback(() => {
    setErr("");
    const u = `/api/saamaan/items?mode=list&q=${encodeURIComponent(q)}${groups.map((g) => `&group=${encodeURIComponent(g)}`).join("")}&page=${page}&size=${SIZE}${showDisabled ? "&disabled=1" : ""}`;
    fetch(u, { cache: "no-store" })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `The server answered ${r.status}.`); return j; })
      .then((j) => { setRows(j.rows || []); setTotal(j.total || 0); })
      .catch((e) => { setErr(e instanceof Error ? e.message : String(e)); setRows([]); });
  }, [q, groups, page, showDisabled]);
  useEffect(() => { load(); }, [load]);

  const from = total ? page * SIZE + 1 : 0;
  const to = Math.min(total, (page + 1) * SIZE);
  const filtersWords = useMemo(() => {
    const w: string[] = [];
    if (groups.length) w.push(groups.length === 1 ? `group "${groups[0]}"` : `groups ${groups.map((g) => `"${g}"`).join(", ")}`);
    if (q) w.push(`search "${q}"`);
    if (showDisabled) w.push("disabled included");
    return w.length ? w.join(", ") : "all RM items, not disabled";
  }, [groups, q, showDisabled]);

  /** The page on screen, as a clean A4 sheet. Rows never split across pages. */
  const print = () => {
    const w = window.open("", "_blank", "width=1100,height=800");
    if (!w) { setErr("The browser blocked the print window."); return; }
    const esc = (s: unknown) => S(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const body = (rows || []).map((r) => `<tr>
      <td>${esc(r.item_code)}</td><td>${esc(r.item_name)}</td><td>${esc(r.item_group)}</td><td>${esc(r.stock_uom)}</td>
      <td>${esc(r.custom_item_class)}</td><td>${esc(r.qc_status)}</td>
      <td class="n">${esc(money(r.last_purchase_rate))}</td><td class="n">${esc(money(r.valuation_rate))}</td>
      <td class="n">${r.closing_erp === null ? "·" : esc(qtyFmt(r.closing_erp))}</td><td class="n">${r.closing_genie === null ? "·" : esc(qtyFmt(r.closing_genie))}</td>
      <td>${[r.drawing_pdf && "PDF", r.drawing_dwg && "DWG", r.custom_drawing_dxf && "DXF"].filter(Boolean).join(" · ") || "·"}</td>
    </tr>`).join("");
    w.document.write(`<!doctype html><html><head><title>Saamaan — Items</title><style>
      @page { size: A4 landscape; margin: 12mm; }
      body { font-family: Arial, Helvetica, sans-serif; color: #22283A; font-size: 10px; }
      h1 { font-size: 15px; margin: 0 0 2px; } .sub { color: #6B7280; margin-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; } thead { display: table-header-group; }
      th { background: #1B2D6B; color: #fff; text-align: left; padding: 4px 5px; font-size: 9.5px; }
      td { padding: 3px 5px; border-bottom: 1px solid #E5E8F0; vertical-align: top; }
      tr { page-break-inside: avoid; } td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
    </style></head><body>
      <h1>📦 Nandan Saamaan — Items</h1>
      <div class="sub">${esc(filtersWords)} · rows ${from}–${to} of ${total.toLocaleString("en-IN")} · printed ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</div>
      <table><thead><tr><th>Code</th><th>Name</th><th>Group</th><th>UOM</th><th>Class</th><th>QC</th><th class="n">Last purchase</th><th class="n">Valuation</th><th class="n">Closing (ERP)</th><th class="n">Closing (Genie)</th><th>Drawings</th></tr></thead>
      <tbody>${body}</tbody></table>
    </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  return (
    <Screen
      title="Items"
      blurb='The ERP’s Item master, mirrored — every item whose group is named "RM - …" and which is not disabled. Click a code for the whole record.'
      action={<>
        <Btn onClick={print} title="Print the rows on screen, with the filters named">Print / PDF</Btn>
      </>}>
      {err && <Note kind="error">{err}</Note>}

      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="🔍 code, name, description, drawing no."
          className="px-2 py-1.5 rounded border text-sm" style={{ borderColor: BORDER, minWidth: 260, flex: "1 1 260px", maxWidth: 420 }} />
        <GroupPicker all={summary.groups} value={groups} onChange={(g) => { setGroups(g); setPage(0); }} />
        <label className="text-xs flex items-center gap-1" style={{ color: MUTED }}>
          <input type="checkbox" checked={showDisabled} onChange={(e) => { setShowDisabled(e.target.checked); setPage(0); }} /> include disabled
        </label>
        <span className="ml-auto text-xs tnum" style={{ color: MUTED }}>
          {rows === null ? "reading…" : total ? `${from.toLocaleString("en-IN")}–${to.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")}` : "none"}
        </span>
        <Btn onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>‹</Btn>
        <Btn onClick={() => setPage((p) => p + 1)} disabled={to >= total}>›</Btn>
      </div>

      <GenieTable
        rows={rows}
        minWidth={1100}
        empty={summary.lastPulledAt ? "No item matches — loosen the search, or try another group." : "Nothing here yet — the ERP has not been pulled. Open ERP pull."}
        columns={[
          { key: "code", label: "Code", align: "left", sort: (r) => r.item_code,
            render: (r) => <button onClick={() => setOpen(r.item_code)} className="font-bold hover:underline text-left" style={{ color: NAVY }}>{r.item_code}</button> },
          { key: "name", label: "Name", align: "left", sort: (r) => S(r.item_name),
            render: (r) => <span className="font-semibold" style={{ color: r.disabled ? MUTED : INK }}>{S(r.item_name) || "·"}{r.disabled ? " (disabled)" : ""}</span> },
          { key: "group", label: "Group", align: "left", sort: (r) => S(r.item_group), render: (r) => <span style={{ color: MUTED }}>{S(r.item_group).replace(/^RM - /, "")}</span> },
          { key: "uom", label: "UOM", align: "left", render: (r) => S(r.stock_uom) || "·" },
          { key: "class", label: "Class", align: "center", sort: (r) => S(r.custom_item_class), render: (r) => S(r.custom_item_class) || "·" },
          { key: "kit", label: "Kittable", align: "center", render: (r) => S(r.kittable) || "·" },
          { key: "qc", label: "QC", align: "left", sort: (r) => S(r.qc_status), render: (r) => S(r.qc_status) ? <Chip text={S(r.qc_status)} colour={statusColour(S(r.qc_status))} /> : "·" },
          { key: "lpr", label: "Last purchase", align: "right", sort: (r) => Number(r.last_purchase_rate ?? -1), render: (r) => <span className="tnum">{money(r.last_purchase_rate)}</span> },
          { key: "val", label: "Valuation", align: "right", sort: (r) => Number(r.valuation_rate ?? -1), render: (r) => <span className="tnum">{money(r.valuation_rate)}</span> },
          { key: "cerp", label: "Closing (ERP)", align: "right", sort: (r) => Number(r.closing_erp ?? -1), title: "The ERP's closing stock — every warehouse, live",
            render: (r) => <span className="tnum" style={{ color: r.closing_erp === null ? MUTED : INK }}>{r.closing_erp === null ? "·" : qtyFmt(r.closing_erp)}</span> },
          { key: "cgen", label: "Closing (Genie)", align: "right", sort: (r) => Number(r.closing_genie ?? -1), title: "Closing stock in the Stock warehouses only, per Masters — live",
            render: (r) => (
              <span className="tnum font-bold" style={{ color: r.closing_genie === null ? MUTED : r.closing_genie ? INK : MUTED }}
                title={r.closing_untyped ? "some of it sits in a warehouse not yet typed in Masters" : ""}>
                {r.closing_genie === null ? "·" : qtyFmt(r.closing_genie)}{r.closing_untyped ? <span style={{ color: AMBER }}>?</span> : null}
              </span>
            ) },
          { key: "drw", label: "Drawings", align: "left", render: (r) => <DrawingLinks r={r} base={base} /> },
          { key: "mod", label: "ERP modified", align: "right", sort: (r) => S(r.erp_modified), render: (r) => <span className="tnum" style={{ color: MUTED }}>{fmtD(r.erp_modified)}</span> },
        ]}
      />

      {open && <Detail code={open} base={base} onClose={() => setOpen(null)} />}
    </Screen>
  );
}

// ======================================================= the group picker
/**
 * A typable box with checkboxes (Dr Raghu, 2 Sep 2026: "have a typable box
 * and also checkboxes to have multiple"). Type to narrow the 29 groups,
 * tick as many as the question needs; the ticked ones stay on top so what
 * is on never scrolls out of sight. Enter ticks the one group left showing.
 */
function GroupPicker({ all, value, onChange }: {
  all: { item_group: string; n: number }[]; value: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);
  const short = (g: string) => g.replace(/^RM - /, "");
  const shown = all
    .filter((g) => short(g.item_group).toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => Number(value.includes(b.item_group)) - Number(value.includes(a.item_group)) || a.item_group.localeCompare(b.item_group));
  const toggle = (g: string) => onChange(value.includes(g) ? value.filter((x) => x !== g) : [...value, g]);
  const label = value.length === 0 ? "All groups" : value.length === 1 ? short(value[0]) : `${value.length} groups`;

  return (
    <div ref={box} style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} className="px-2 py-1.5 rounded border text-sm bg-white flex items-center gap-2"
        style={{ borderColor: value.length ? NAVY : BORDER, color: INK, minWidth: 180, maxWidth: 320 }} title="Type to narrow, tick to choose several">
        <span className="truncate" style={{ fontWeight: value.length ? 700 : 400 }}>{label}</span>
        <span className="ml-auto text-xs" style={{ color: MUTED }}>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="rounded-lg border bg-white shadow-lg" style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 30, width: 340, borderColor: BORDER }}>
          <div className="p-2" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="type to narrow the groups…"
              onKeyDown={(e) => { if (e.key === "Enter" && shown.length === 1) { toggle(shown[0].item_group); setQ(""); } if (e.key === "Escape") setOpen(false); }}
              className="w-full px-2 py-1.5 rounded border text-sm" style={{ borderColor: BORDER }} />
            <div className="flex gap-3 mt-1.5 text-xs font-bold">
              <button onClick={() => onChange([...new Set([...value, ...shown.map((g) => g.item_group)])])} style={{ color: NAVY }}>Tick all shown</button>
              <button onClick={() => onChange([])} style={{ color: MUTED }} disabled={!value.length}>Clear</button>
              <span className="ml-auto" style={{ color: MUTED }}>{value.length ? `${value.length} on` : "all groups"}</span>
            </div>
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {shown.map((g) => {
              const on = value.includes(g.item_group);
              return (
                <label key={g.item_group} className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-gray-50"
                  style={{ background: on ? NAVY_SOFT : undefined }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(g.item_group)} style={{ accentColor: NAVY }} />
                  <span className="truncate" style={{ color: INK, fontWeight: on ? 700 : 400 }}>{short(g.item_group)}</span>
                  <span className="ml-auto text-xs tnum" style={{ color: MUTED }}>{g.n.toLocaleString("en-IN")}</span>
                </label>
              );
            })}
            {!shown.length && <div className="px-3 py-2 text-sm" style={{ color: MUTED }}>No group matches that.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================ one item, whole
const KEY_FIELDS: [string, string][] = [
  ["item_group", "Item Group"], ["stock_uom", "Stock UOM"], ["purchase_uom", "Purchase UOM"], ["sales_uom", "Sales UOM"],
  ["custom_item_class", "Item Class"], ["kittable", "Kittable"], ["qc_status", "QC Status"], ["each_blank", "Each Blank Size"],
  ["gst_hsn_code", "HSN/SAC"], ["brand", "Brand"], ["country_of_origin", "Country of Origin"],
  ["last_purchase_rate", "Last Purchase Rate"], ["valuation_rate", "Valuation Rate"], ["standard_rate", "Standard Selling Rate"],
  ["date_price_updated", "Date Price Updated"], ["weight_per_unit", "Weight per Unit"], ["weight_uom", "Weight UOM"],
  ["safety_stock", "Safety Stock"], ["min_order_qty", "Min Order Qty"], ["lead_time_days", "Lead Time (days)"],
  ["shelf_life_in_days", "Shelf Life (days)"], ["end_of_life", "End of Life"], ["valuation_method", "Valuation Method"],
  ["default_material_request_type", "Default MR Type"], ["bom_status", "BOM Status"], ["warranty_period", "Warranty (days)"],
  ["customer_code", "Customer Code"], ["default_item_manufacturer", "Manufacturer"], ["default_manufacturer_part_no", "Manufacturer Part No"],
];
const FLAGS: [string, string][] = [
  ["is_stock_item", "Maintain Stock"], ["is_purchase_item", "Allow Purchase"], ["is_sales_item", "Allow Sales"],
  ["include_item_in_manufacturing", "In Manufacturing"], ["is_sub_contracted_item", "Subcontracted"], ["is_fixed_asset", "Fixed Asset"],
  ["has_batch_no", "Batch No"], ["has_serial_no", "Serial No"], ["has_variants", "Has Variants"], ["master_reference_product", "Master Reference Product"],
];
/** Link fields → the ERP doctype they point at, so each opens the right form. */
const LINKS: [string, string, string][] = [
  ["drawing_no", "Drawing No", "Drawing"], ["raw_material", "Raw Material", "Raw Material"], ["item_group", "Item Group", "Item Group"],
  ["default_bom", "Default BOM", "BOM"], ["variant_of", "Variant Of", "Item"], ["brand", "Brand", "Brand"],
];
const CHILD_WORDS: Record<string, string> = {
  uoms: "UOM conversions", item_defaults: "Item defaults", supplier_items: "Suppliers", reorder_levels: "Reorder levels",
  taxes: "Taxes", barcodes: "Barcodes", customer_items: "Customer items", attributes: "Variant attributes",
};
const CHILD_NOISE = /^(name|idx|parent|parentfield|parenttype|doctype|docstatus)$/;

const show = (k: string, v: unknown) => {
  if (v === null || v === undefined || v === "") return "·";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (/rate|stock|qty|weight_per_unit/.test(k) && typeof v === "number") return /rate/.test(k) ? money(v) : num(v);
  if (/^end_of_life$/.test(k)) return fmtD(v);
  return S(v);
};

/**
 * The three rooms of an item (Dr Raghu, 3 Sep 2026: "have a tab on the
 * top which is ERP Data - default shown, Stock Register - To Build,
 * Intelligence - To Build"). The first is the ERP's record, as it is; the
 * other two are Genie's to fill, and say so until they are.
 */
const TABS: { key: string; label: string; built: boolean }[] = [
  { key: "erp", label: "ERP Data", built: true },
  { key: "stock", label: "Stock Register", built: true },
  { key: "intel", label: "Intelligence", built: false },
];

// ================================================= the stock register, live
interface Sle {
  name: string; posting_date: string; posting_time: string; warehouse: string; actual_qty: number; qty_after_transaction: number;
  incoming_rate: number; valuation_rate: number; stock_value: number; voucher_type: string; voucher_no: string; project: string | null; modified_by: string;
}
interface BinRow { warehouse: string; actual_qty: number; valuation_rate: number; stock_value: number; kind: string }
interface Closing { erpQty: number; erpValue: number; qty: number; value: number; rate: number | null; stockWarehouses: number; elsewhereQty: number; untypedQty: number; untypedWarehouses: number }
interface Stock { erpBase: string; readAt: string; mastersReady: boolean; bins: BinRow[]; closing: Closing; ledger: Sle[]; ledgerTotal: number | null; ledgerShown: number }

/** One read of the ERP's stock for an item, shared by the head and the register tab. */
function useStock(code: string): [Stock | null, string] {
  const [data, setData] = useState<Stock | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    setData(null); setErr("");
    fetch(`/api/saamaan/stock?code=${encodeURIComponent(code)}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `The server answered ${r.status}.`); return j; })
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [code]);
  return [data, err];
}

/**
 * CLOSING STOCK, in large letters (Dr Raghu, 3 Sep 2026): the quantity in
 * the STOCK warehouses only — "for the purpose of the stock it's ONLY the
 * closing stock in the 'Stock' warehouses!" — with the UOM and the value
 * at the ERP's valuation. What sits in WIP, at a vendor, or in a warehouse
 * nobody has typed yet is said underneath, never folded in.
 */
function ClosingStock({ stock, err, uom }: { stock: Stock | null; err: string; uom: string }) {
  if (err) return <div className="rounded border p-3 text-xs" style={{ borderColor: BORDER, background: "#fff", color: "#8A1F16" }}>{err}</div>;
  if (!stock) return <div className="rounded border p-3 text-sm" style={{ borderColor: BORDER, background: "#fff", color: MUTED }}>Reading the ERP…</div>;
  const c = stock.closing;
  const held = stock.bins.filter((b) => Number(b.actual_qty) !== 0);
  return (
    <div className="rounded border p-3" style={{ borderColor: BORDER, background: "#fff" }}>
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-bold uppercase" style={{ color: MUTED, letterSpacing: 0.6 }}>Closing stock — Genie</span>
        <span className="ml-auto text-xs" style={{ color: MUTED }} title="every warehouse, as the ERP counts it">ERP, all warehouses: <b className="tnum" style={{ color: INK }}>{qtyFmt(c.erpQty)}</b> · {money(c.erpValue)}</span>
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="tnum" style={{ fontSize: 34, fontWeight: 800, color: c.qty ? INK : MUTED, lineHeight: 1.1 }}>{qtyFmt(c.qty)}</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: MUTED }}>{uom || "·"}</span>
        <span className="ml-auto text-right">
          <span className="tnum block" style={{ fontSize: 16, fontWeight: 800, color: INK }}>{money(c.value)}</span>
          <span className="text-xs" style={{ color: MUTED }}>{c.rate !== null ? `at ${money(c.rate)} / ${uom || "unit"}` : "at valuation"}</span>
        </span>
      </div>
      <div className="text-xs mt-1" style={{ color: MUTED, lineHeight: 1.5 }}>
        {!stock.mastersReady ? "No warehouse has a type yet — run migration 0124 and set the Stock warehouses in Masters."
          : c.stockWarehouses ? `in ${c.stockWarehouses} Stock warehouse${c.stockWarehouses === 1 ? "" : "s"}` : "nothing in a Stock warehouse"}
        {c.elsewhereQty ? ` · ${qtyFmt(c.elsewhereQty)} elsewhere (WIP, vendor${c.untypedQty ? ", untyped" : ""})` : ""}
        {c.untypedWarehouses ? <span style={{ color: AMBER }}> · {c.untypedWarehouses} warehouse{c.untypedWarehouses === 1 ? "" : "s"} holding it not yet typed in Masters</span> : null}
      </div>
      {held.length > 0 && (
        <div className="flex gap-1 flex-wrap mt-1.5">
          {held.map((b) => (
            <span key={b.warehouse} className="rounded px-1.5 py-0.5 text-xs tnum" title={`${b.kind || "not typed"} · ${money(b.stock_value)}`}
              style={{ background: b.kind === "Stock" ? "#E6F4EC" : "#F3F4F6", color: b.kind === "Stock" ? GREEN : MUTED, fontWeight: b.kind === "Stock" ? 700 : 500 }}>
              {b.warehouse.replace(/ - NGSE$| - NGPL-I$/, "")} {qtyFmt(b.actual_qty)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** The ERP's form for the voucher — Stock Entry → /app/stock-entry/STE-28936. */
const voucherUrl = (base: string, type: string, no: string) => `${base}/app/${type.toLowerCase().replace(/\s+/g, "-")}/${encodeURIComponent(no)}`;

/**
 * An item's stock register, read live off the ERP when the tab opens:
 * every movement, in and out, newest first — the ERP's own Stock Ledger
 * report for one item, and only that ("dont give me balance, i want to
 * see the first report with every transaction — in and out", Dr Raghu,
 * 3 Sep 2026).
 */
function StockRegister({ code, base, data, err }: { code: string; base: string; data: Stock | null; err: string }) {
  const erp = data?.erpBase || base;
  /**
   * A Stock Reconciliation SETS a balance rather than moving a quantity:
   * the ERP writes it with actual_qty 0 and the new balance. Shown as-is
   * it reads as nothing happened while the balance jumps. So the movement
   * is worked out from the previous line in the same warehouse — oldest
   * first, one running balance per warehouse. The earliest line in the
   * window has nothing before it and stays a dot.
   */
  const moves = useMemo(() => {
    const out = new Map<string, number | null>();
    if (!data) return out;
    const asc = [...data.ledger].sort((a, b) => `${a.posting_date} ${a.posting_time}`.localeCompare(`${b.posting_date} ${b.posting_time}`));
    const prev = new Map<string, number>();
    for (const l of asc) {
      const q = Number(l.actual_qty) || 0;
      const after = Number(l.qty_after_transaction);
      if (q !== 0) out.set(l.name, q);
      else if (/reconcil/i.test(l.voucher_type)) out.set(l.name, prev.has(l.warehouse) ? after - prev.get(l.warehouse)! : null);
      else out.set(l.name, 0);
      prev.set(l.warehouse, after);
    }
    return out;
  }, [data]);
  if (err) return <Note kind="error">{err}</Note>;
  if (!data) return <div className="text-sm" style={{ color: MUTED }}>Reading the ERP&apos;s stock ledger…</div>;
  return (
    <div className="text-sm" style={{ color: INK }}>
      <div className="flex items-baseline gap-2 mb-1">
        <div className="text-xs font-bold uppercase" style={{ color: MUTED, letterSpacing: 0.6 }}>Every transaction, in and out — the ERP&apos;s stock ledger, newest first</div>
        <span className="text-xs tnum" style={{ color: MUTED }}>
          {data.ledgerTotal === null ? `${data.ledgerShown} shown` : data.ledgerTotal > data.ledgerShown ? `${data.ledgerShown} of ${data.ledgerTotal.toLocaleString("en-IN")} shown` : `${data.ledgerTotal} in all`}
        </span>
      </div>
      {data.ledger.length ? (
        <div className="rounded border overflow-auto" style={{ borderColor: BORDER, background: "#fff", maxHeight: "50vh" }}>
          <table className="w-full text-xs" style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: 900 }}>
            <thead><tr style={{ background: NAVY, color: "#fff", position: "sticky", top: 0 }}>
              <th className="px-2 py-1 text-left">Date</th><th className="px-2 py-1 text-left">Warehouse</th><th className="px-2 py-1 text-right">In</th><th className="px-2 py-1 text-right">Out</th>
              <th className="px-2 py-1 text-right">Balance</th><th className="px-2 py-1 text-right">Rate</th><th className="px-2 py-1 text-right">Balance value</th>
              <th className="px-2 py-1 text-left">Voucher</th><th className="px-2 py-1 text-left">Project</th><th className="px-2 py-1 text-left">By</th>
            </tr></thead>
            <tbody>{data.ledger.map((l, i) => {
              const q = moves.get(l.name) ?? 0;
              const reco = /reconcil/i.test(l.voucher_type);
              const unknown = reco && moves.get(l.name) === null;
              return (
                <tr key={l.name} style={{ background: i % 2 ? "#FAF9F5" : "#fff" }}>
                  <td className="px-2 py-1 tnum whitespace-nowrap" style={{ borderBottom: `1px solid ${BORDER}` }}>{fmtD(l.posting_date)} <span style={{ color: MUTED }}>{S(l.posting_time).slice(0, 5)}</span></td>
                  <td className="px-2 py-1" style={{ borderBottom: `1px solid ${BORDER}` }}>{l.warehouse}</td>
                  <td className="px-2 py-1 text-right tnum font-bold" style={{ borderBottom: `1px solid ${BORDER}`, color: GREEN }} title={reco ? "a reconciliation set the balance; the movement is the difference from the line before" : ""}>{q > 0 ? `${qtyFmt(q)}${reco ? "≈" : ""}` : unknown ? "·" : ""}</td>
                  <td className="px-2 py-1 text-right tnum font-bold" style={{ borderBottom: `1px solid ${BORDER}`, color: "#B3261E" }} title={reco ? "a reconciliation set the balance; the movement is the difference from the line before" : ""}>{q < 0 ? `${qtyFmt(-q)}${reco ? "≈" : ""}` : ""}</td>
                  <td className="px-2 py-1 text-right tnum" style={{ borderBottom: `1px solid ${BORDER}` }}>{qtyFmt(l.qty_after_transaction)}</td>
                  <td className="px-2 py-1 text-right tnum" style={{ borderBottom: `1px solid ${BORDER}` }} title={`incoming ${money(l.incoming_rate)}`}>{money(l.valuation_rate)}</td>
                  <td className="px-2 py-1 text-right tnum" style={{ borderBottom: `1px solid ${BORDER}` }}>{money(l.stock_value)}</td>
                  <td className="px-2 py-1 whitespace-nowrap" style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <a href={voucherUrl(erp, l.voucher_type, l.voucher_no)} target="_blank" rel="noreferrer" className="font-bold hover:underline" style={{ color: NAVY, textDecoration: "none" }} title={l.voucher_type}>{l.voucher_no}</a>
                    <span style={{ color: MUTED }}> {l.voucher_type}</span>
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap" style={{ borderBottom: `1px solid ${BORDER}`, color: MUTED }}>{S(l.project).replace(/^NGSE-PROJ-/, "") || "·"}</td>
                  <td className="px-2 py-1" style={{ borderBottom: `1px solid ${BORDER}`, color: MUTED }}>{S(l.modified_by).split("@")[0] || "·"}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      ) : (
        <div className="rounded border p-3 text-sm" style={{ borderColor: BORDER, background: "#fff", color: MUTED }}>
          No movement on the ERP, ever — no Stock Entry, Purchase Receipt or Delivery Note has carried {code}.
        </div>
      )}
      <div className="text-xs mt-2" style={{ color: MUTED }}>
        Read live from the ERP at {new Date(data.readAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} — not mirrored. Each voucher opens on the ERP.
        A Stock Reconciliation sets the balance rather than moving a quantity; its In or Out is worked out from the line before and marked ≈.
      </div>
    </div>
  );
}

function Detail({ code, base, onClose }: { code: string; base: string; onClose: () => void }) {
  const [item, setItem] = useState<Row | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [err, setErr] = useState("");
  const [every, setEvery] = useState(false);
  const [tab, setTab] = useState("erp");
  const [stock, stockErr] = useStock(code);

  useEffect(() => {
    fetch(`/api/saamaan/items?mode=one&code=${encodeURIComponent(code)}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `The server answered ${r.status}.`); return j; })
      .then((j) => { setItem(j.item); setFiles(j.files || []); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [code]);

  const erp = (item?.erp ?? {}) as Record<string, unknown>;
  const children = (item?.children ?? {}) as Record<string, Record<string, unknown>[]>;
  const desc = S(item?.description);

  return (
    <Modal onClose={onClose} title={`${code}${item ? ` — ${S(item.item_name)}` : ""}`} width={920}>
      {err && <Note kind="error">{err}</Note>}
      {!item && !err && <div className="text-sm" style={{ color: MUTED }}>Reading…</div>}

      {/* ------------------------------------ the head, in two columns */}
      {item && (
        <div className="grid md:grid-cols-2 gap-3 mb-3" style={{ alignItems: "start" }}>
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Chip text={S(item.item_group)} colour={NAVY} />
              {item.disabled ? <Chip text="Disabled on the ERP" colour="#5A6672" /> : null}
              {S(item.qc_status) && <Chip text={S(item.qc_status)} colour={statusColour(S(item.qc_status))} />}
              {S(item.custom_item_class) && <Chip text={`Class ${S(item.custom_item_class)}`} colour={MUTED} />}
            </div>
            <div className="text-xs" style={{ color: MUTED, lineHeight: 1.6 }}>
              <div>Stock UOM <b style={{ color: INK }}>{S(item.stock_uom) || "·"}</b> · Last purchase <b style={{ color: INK }}>{money(item.last_purchase_rate)}</b> · Valuation <b style={{ color: INK }}>{money(item.valuation_rate)}</b></div>
              <div>Kittable <b style={{ color: INK }}>{S(item.kittable) || "·"}</b> · HSN <b style={{ color: INK }}>{S(item.gst_hsn_code) || "·"}</b>{S(item.drawing_no) ? <> · Drawing <b style={{ color: INK }}>{S(item.drawing_no)}</b></> : null}</div>
            </div>
            <a href={erpForm(base, "Item", code)} target="_blank" rel="noreferrer" className="inline-block mt-1 text-xs font-bold" style={{ color: NAVY }}>Open in the ERP ↗</a>
          </div>
          <ClosingStock stock={stock} err={stockErr} uom={S(item.stock_uom)} />
        </div>
      )}

      {/* --------------------------------------------------------- the tabs */}
      {item && (
        <div className="flex gap-1 mb-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="px-3 py-2 text-sm font-bold"
              style={{
                color: tab === t.key ? NAVY : t.built ? INK : MUTED,
                borderBottom: `3px solid ${tab === t.key ? NAVY : "transparent"}`,
                marginBottom: -1,
              }}>
              {t.label}{!t.built && <span className="ml-1 text-xs font-semibold" style={{ color: MUTED }}>· to build</span>}
            </button>
          ))}
        </div>
      )}

      {item && tab === "stock" && <StockRegister code={code} base={base} data={stock} err={stockErr} />}
      {item && tab === "intel" && (
        <div className="rounded border p-6 text-sm" style={{ borderColor: BORDER, background: "#fff", color: MUTED, lineHeight: 1.7 }}>
          <div className="font-bold mb-1" style={{ color: INK }}>Intelligence — to build</div>
          What Genie knows about {code} beyond the ERP: where it is used, which BOMs carry it, who supplies it and at what price over time, what has gone wrong with it.
          Say what this room should hold and it will be built.
        </div>
      )}

      {item && tab === "erp" && (
        <div className="text-sm" style={{ color: INK }}>
          {/* ----------------------------------------------- description */}
          <div className="text-xs font-bold uppercase mb-1" style={{ color: MUTED, letterSpacing: 0.6 }}>Description</div>
          {desc ? (
            hasHtml(desc)
              ? <div className="rich rounded border p-3 mb-3" style={{ borderColor: BORDER, background: "#fff", lineHeight: 1.6, overflowX: "auto" }}
                  dangerouslySetInnerHTML={{ __html: richHtml(desc, base) }} />
              : <div className="rounded border p-3 mb-3" style={{ borderColor: BORDER, background: "#fff", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{desc}</div>
          ) : <div className="mb-3" style={{ color: MUTED }}>No description on the ERP.</div>}
          {S(item.item_short_description) && (
            <div className="mb-3"><span className="text-xs font-bold" style={{ color: MUTED }}>Short description · </span>{S(item.item_short_description)}</div>
          )}
          {S(item.optional_extras) && (
            <div className="mb-3"><span className="text-xs font-bold" style={{ color: MUTED }}>Optional extras · </span>{S(item.optional_extras)}</div>
          )}

          {/* --------------------------------------- drawings and files */}
          <div className="text-xs font-bold uppercase mb-1" style={{ color: MUTED, letterSpacing: 0.6 }}>Drawings &amp; attachments</div>
          <div className="rounded border mb-3" style={{ borderColor: BORDER, background: "#fff" }}>
            {[["drawing_pdf", "Drawing PDF"], ["drawing_dwg", "Drawing DWG"], ["custom_drawing_dxf", "Drawing DXF"], ["image", "Image"]]
              .filter(([k]) => S(item[k])).map(([k, label]) => (
                <div key={k} className="flex items-center gap-2 px-3 py-1.5" style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <span className="text-xs font-bold" style={{ color: MUTED, width: 110 }}>{label}</span>
                  <a href={erpUrl(base, S(item[k]))} target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: NAVY, wordBreak: "break-all" }}>{S(item[k])}</a>
                </div>
              ))}
            {files.map((f) => (
              <div key={f.file_id} className="flex items-center gap-2 px-3 py-1.5" style={{ borderBottom: `1px solid ${BORDER}` }}>
                <span className="text-xs font-bold" style={{ color: MUTED, width: 110 }}>{f.attached_to_field || "attachment"}</span>
                <a href={erpUrl(base, f.file_url)} target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: NAVY, wordBreak: "break-all" }}>{f.file_name || f.file_url}</a>
                <span className="ml-auto text-xs tnum whitespace-nowrap" style={{ color: MUTED }}>
                  {f.file_size ? `${(f.file_size / 1024).toFixed(0)} KB` : ""}{f.is_private ? " · private — needs an ERP login" : ""}
                </span>
              </div>
            ))}
            {!files.length && !["drawing_pdf", "drawing_dwg", "custom_drawing_dxf", "image"].some((k) => S(item[k])) && (
              <div className="px-3 py-2" style={{ color: MUTED }}>Nothing attached on the ERP.</div>
            )}
          </div>

          {/* ------------------------------------------------- the links */}
          {LINKS.some(([k]) => S(item[k])) && (<>
            <div className="text-xs font-bold uppercase mb-1" style={{ color: MUTED, letterSpacing: 0.6 }}>Links</div>
            <div className="flex gap-2 flex-wrap mb-3">
              {LINKS.filter(([k]) => S(item[k])).map(([k, label, dt]) => (
                <a key={k} href={erpForm(base, dt, S(item[k]))} target="_blank" rel="noreferrer"
                  className="rounded border px-2 py-1 text-xs font-semibold" style={{ borderColor: BORDER, color: NAVY, textDecoration: "none", background: "#fff" }}>
                  <span style={{ color: MUTED }}>{label} · </span>{S(item[k])} ↗
                </a>
              ))}
            </div>
          </>)}

          {/* ------------------------------------------------ the fields */}
          <div className="text-xs font-bold uppercase mb-1" style={{ color: MUTED, letterSpacing: 0.6 }}>Fields</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 rounded border p-3 mb-3" style={{ borderColor: BORDER, background: "#fff" }}>
            {KEY_FIELDS.map(([k, label]) => (
              <div key={k} className="flex justify-between gap-2" style={{ borderBottom: `1px dotted ${BORDER}` }}>
                <span className="text-xs" style={{ color: MUTED }}>{label}</span>
                <span className="text-xs font-semibold text-right tnum" style={{ color: item[k] === null || item[k] === "" ? MUTED : INK }}>{show(k, item[k])}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap mb-3">
            {FLAGS.map(([k, label]) => (
              <span key={k} className="rounded px-2 py-0.5 text-xs font-bold" style={{ background: item[k] ? "#E6F4EC" : "#F3F4F6", color: item[k] ? GREEN : MUTED }}>
                {item[k] ? "✓" : "–"} {label}
              </span>
            ))}
          </div>

          {/* ------------------------------------------- child tables */}
          {Object.keys(children).filter((k) => (children[k] || []).length).map((k) => {
            const rows = children[k];
            const cols = Object.keys(rows[0]).filter((c) => !CHILD_NOISE.test(c) && rows.some((r) => r[c] !== null && r[c] !== "" && r[c] !== 0));
            return (
              <div key={k} className="mb-3">
                <div className="text-xs font-bold uppercase mb-1" style={{ color: MUTED, letterSpacing: 0.6 }}>{CHILD_WORDS[k] ?? k} ({rows.length})</div>
                <div className="rounded border overflow-auto" style={{ borderColor: BORDER, background: "#fff" }}>
                  <table className="w-full text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                    <thead><tr style={{ background: NAVY, color: "#fff" }}>{cols.map((c) => <th key={c} className="px-2 py-1 text-left whitespace-nowrap">{c}</th>)}</tr></thead>
                    <tbody>{rows.map((r, i) => (
                      <tr key={i} style={{ background: i % 2 ? "#FAF9F5" : "#fff" }}>
                        {cols.map((c) => <td key={c} className="px-2 py-1 whitespace-nowrap" style={{ borderBottom: `1px solid ${BORDER}` }}>{show(c, r[c])}</td>)}
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {/* ---------------------------------------- every field, verbatim */}
          <button onClick={() => setEvery((v) => !v)} className="text-xs font-bold" style={{ color: NAVY }}>
            {every ? "▾" : "▸"} Every field the ERP returned ({Object.keys(erp).length})
          </button>
          {every && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 rounded border p-3 mt-1" style={{ borderColor: BORDER, background: "#fff" }}>
              {Object.entries(erp).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 text-xs" style={{ borderBottom: `1px dotted ${BORDER}`, padding: "2px 0" }}>
                  <span style={{ color: MUTED, fontFamily: "monospace" }}>{k}</span>
                  <span className="text-right" style={{ color: v === null || v === "" ? MUTED : INK, wordBreak: "break-all", maxWidth: 360 }}>
                    {v === null || v === "" ? "·" : typeof v === "object" ? JSON.stringify(v) : S(v).slice(0, 400)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="text-xs mt-3" style={{ color: MUTED }}>
            On the ERP: created {fmtD(item.erp_creation)} by {S(item.erp_owner) || "—"} · modified {fmtD(item.erp_modified)} by {S(item.erp_modified_by) || "—"} · pulled {fmtD(item.pulled_at)}.
          </div>
        </div>
      )}
      <style>{`
        .rich img { max-width: 100%; height: auto; }
        .rich p { margin: 0 0 6px; } .rich table { border-collapse: collapse; } .rich td, .rich th { border: 1px solid #E5E8F0; padding: 2px 6px; }
      `}</style>
    </Modal>
  );
}
