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
import { Screen, Modal, Btn, Note, Chip, INK, MUTED, BORDER, NAVY, NAVY_SOFT, GREEN, S, fmtD, statusColour } from "@/components/ims/ui";
import type { Summary } from "./Dashboard";

type Row = Record<string, unknown> & { item_code: string };
interface FileRow { file_id: string; file_name: string; file_url: string; is_private: boolean; attached_to_field: string; file_size: number | null }

const money = (n: unknown) =>
  n === null || n === undefined || n === "" ? "·" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const num = (n: unknown) => (n === null || n === undefined || n === "" ? "·" : Number(n).toLocaleString("en-IN"));

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
      <table><thead><tr><th>Code</th><th>Name</th><th>Group</th><th>UOM</th><th>Class</th><th>QC</th><th class="n">Last purchase</th><th class="n">Valuation</th><th>Drawings</th></tr></thead>
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

function Detail({ code, base, onClose }: { code: string; base: string; onClose: () => void }) {
  const [item, setItem] = useState<Row | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [err, setErr] = useState("");
  const [every, setEvery] = useState(false);

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
      {item && (
        <div className="text-sm" style={{ color: INK }}>
          {/* ------------------------------------------------ the top line */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <Chip text={S(item.item_group)} colour={NAVY} />
            {item.disabled ? <Chip text="Disabled on the ERP" colour="#5A6672" /> : null}
            {S(item.qc_status) && <Chip text={S(item.qc_status)} colour={statusColour(S(item.qc_status))} />}
            <a href={erpForm(base, "Item", code)} target="_blank" rel="noreferrer" className="ml-auto text-xs font-bold" style={{ color: NAVY }}>
              Open in the ERP ↗
            </a>
          </div>

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
