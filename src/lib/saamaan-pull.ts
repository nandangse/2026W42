import { HttpError } from "@/lib/auth";
import { syncRbomReleased } from "@/lib/rbom-sync";
import { adminClient } from "@/lib/supabase/admin";
import { crmDb, crmConfigured } from "@/crm/db";



/**
 * THE ERP PULL (moved out of /api/saamaan/erp-items on 3 Oct 2026 so the
 * four-hourly cron and the button run the one walk) — the Item master, pulled straight off
 * nandanerp (Dr Raghu, 2 Sep 2026, pointing at the Item report filtered to
 * RM: "Item table needs to be imported. Item Group like RM. Disabled equals
 * no. All these fields that existed in the main one will need to be
 * imported. Description is rich text. Also import the attachments and the
 * links as it is. I want to create the Bill of Materials subsequently.
 * Hence getting this right is important.").
 *
 * THREE PHASES, each its own request, because one request that walks
 * 22,000 items, their eight child tables and 14,000 files would be one
 * request that times out half-way and leaves nobody sure what landed:
 *
 *   items    — every Item whose group is like "RM -" and which is not
 *              disabled, the WHOLE main document (fields=["*"], 96 keys on
 *              the day this was written), 500 a page. Typed columns for the
 *              fields the screens and the BOM read by name; the verbatim
 *              document in `erp` so nothing is lost. An item that has
 *              since been disabled or moved out of RM is MARKED disabled,
 *              never deleted — a BOM line pointing at it must still resolve.
 *   children — the eight child tables (UOM conversions, item defaults,
 *              suppliers, reorder levels, taxes, barcodes, customer items,
 *              variant attributes), listed in bulk by parenttype rather
 *              than one document at a time, grouped by parent and written
 *              into `children`.
 *   files    — every File the ERP holds against an Item, the file_url
 *              exactly as the ERP wrote it. A file gone from the ERP goes
 *              from here.
 *   projects — every Project, with the BOM fields the ERP keeps on it
 *              (custom_approved_bom and the five ticks). Dr Raghu, 2 Sep
 *              2026: "With each project there is a BOM mentioned."
 *   warehouses — every Warehouse the ERP has. The name is the ERP's; the
 *              TYPE (Stock / WIP / Vendor) and the remark are Genie's, kept
 *              across pulls. A warehouse seen for the first time gets a type
 *              guessed from its name and a remark saying so.
 *   boms     — every BOM header: item, project, active, default, docstatus.
 *   bom_items — the LINES of every live (not cancelled) BOM on a LIVE
 *              project — one with a job on the board: "I am concerned
 *              with the jobs in process right now"; "Live project is the
 *              one with a Job that's live." The working set, whole, every
 *              pull: a line gone from the ERP, or a project whose jobs
 *              have all delivered, goes from here.
 *
 * READS ONLY. Nothing on the ERP is written, ever.
 *
 * The ERP token lives in the CRM database's integration_setting — the one
 * place it is kept — so Saamaan borrows it rather than a second copy being
 * made, exactly as Seva does.
 */

type Doc = Record<string, unknown>;
const S = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const B = (v: unknown) => v === 1 || v === "1" || v === true;
/** NULL where the ERP holds nothing. Never a defaulted zero. */
const N = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const I = (v: unknown) => { const n = N(v); return n === null ? null : Math.round(n); };
const D = (v: unknown) => { const s = S(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
/** The ERP's "2026-09-02 15:04:26.988375" is site time — Asia/Kolkata. */
const T = (v: unknown) => {
  const s = S(v);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  return m ? `${m[1]}T${m[2]}+05:30` : null;
};

const RM_FILTER = [["item_group", "like", "%RM -%"], ["disabled", "=", 0]];
const CHILDREN: { doctype: string; field: string }[] = [
  { doctype: "UOM Conversion Detail", field: "uoms" },
  { doctype: "Item Default", field: "item_defaults" },
  { doctype: "Item Supplier", field: "supplier_items" },
  { doctype: "Item Reorder", field: "reorder_levels" },
  { doctype: "Item Tax", field: "taxes" },
  { doctype: "Item Barcode", field: "barcodes" },
  { doctype: "Item Customer Detail", field: "customer_items" },
  { doctype: "Item Variant Attribute", field: "attributes" },
];
/** The ERP's own bookkeeping on a child row — carried, but not the point. */
const CHILD_NOISE = /^(owner|creation|modified|modified_by|docstatus|parenttype|parentfield|doctype)$/;

async function erpConfig() {
  if (!crmConfigured())
    throw new HttpError(503, "The ERP token lives in the CRM's Integrations, and that database is not connected here.");
  const { data } = await crmDb().from("integration_setting").select("config").eq("key", "erpnext").maybeSingle();
  const cfg = (data?.config || {}) as Record<string, string>;
  if (!cfg.url || !cfg.api_key || !cfg.api_secret)
    throw new HttpError(400, "Save the ERPNext URL, key and secret in CRM → Integrations first.");
  return {
    base: cfg.url.replace(/\/+$/, ""),
    H: { authorization: `token ${cfg.api_key}:${cfg.api_secret}` } as Record<string, string>,
  };
}

/** Every page of a list, 500 at a time, until a short page. */
async function pages(url: (start: number) => string, H: Record<string, string>, pick: (j: unknown) => Doc[]): Promise<Doc[]> {
  const out: Doc[] = [];
  for (let start = 0; start < 200000; start += 500) {
    const r = await fetch(url(start), { headers: H });
    if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status} at row ${start}.`);
    const page = pick(await r.json());
    out.push(...page);
    if (page.length < 500) break;
  }
  return out;
}


/**
 * A LIVE project is one with a live job — "Live project is the one with a
 * Job that's live" (Dr Raghu, 3 Sep 2026) — not one whose own status field
 * says so. The board (`jobs`) holds every job on the floor: active, not
 * delivered, not archived. Its `proj` column is the project.
 */
async function liveProjectIds(admin: ReturnType<typeof adminClient>): Promise<Set<string>> {
  const { data, error } = await admin.from("jobs").select("proj").eq("active", true).eq("delivered", false).is("archived_at", null).limit(5000);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((j) => String(j.proj || "")).filter(Boolean));
}

/** Every item code Genie holds — paged past PostgREST's silent 1000 cap. */
async function knownCodes(admin: ReturnType<typeof adminClient>): Promise<Set<string>> {
  const codes = new Set<string>();
  for (let a = 0; ; a += 1000) {
    const { data, error } = await admin.from("material_item").select("item_code").order("item_code").range(a, a + 999);
    if (error) {
      if (/does not exist|schema cache/i.test(error.message))
        throw new HttpError(503, "Run migration 0118 first — Saamaan's tables don't exist yet.");
      throw new Error(error.message);
    }
    for (const r of data || []) codes.add(String(r.item_code));
    if (!data || data.length < 1000) break;
  }
  return codes;
}

/** The main document → the typed row. `erp` keeps everything verbatim. */
function toRow(d: Doc, pulledAt: string): Doc {
  return {
    item_code: S(d.name) || S(d.item_code),
    item_name: S(d.item_name),
    item_group: S(d.item_group),
    description: S(d.description),
    item_short_description: S(d.item_short_description),
    optional_extras: S(d.optional_extras),
    stock_uom: S(d.stock_uom),
    purchase_uom: S(d.purchase_uom),
    sales_uom: S(d.sales_uom),
    disabled: B(d.disabled),
    is_stock_item: B(d.is_stock_item),
    is_purchase_item: B(d.is_purchase_item),
    is_sales_item: B(d.is_sales_item),
    include_item_in_manufacturing: B(d.include_item_in_manufacturing),
    is_sub_contracted_item: B(d.is_sub_contracted_item),
    is_fixed_asset: B(d.is_fixed_asset),
    has_variants: B(d.has_variants),
    has_batch_no: B(d.has_batch_no),
    has_serial_no: B(d.has_serial_no),
    master_reference_product: B(d.master_reference_product),
    variant_of: S(d.variant_of),
    default_bom: S(d.default_bom),
    bom_status: S(d.bom_status),
    valuation_rate: N(d.valuation_rate),
    standard_rate: N(d.standard_rate),
    last_purchase_rate: N(d.last_purchase_rate),
    opening_stock: N(d.opening_stock),
    safety_stock: N(d.safety_stock),
    min_order_qty: N(d.min_order_qty),
    lead_time_days: I(d.lead_time_days),
    shelf_life_in_days: I(d.shelf_life_in_days),
    weight_per_unit: N(d.weight_per_unit),
    weight_uom: S(d.weight_uom),
    total_projected_qty: N(d.total_projected_qty),
    gst_hsn_code: S(d.gst_hsn_code),
    brand: S(d.brand),
    country_of_origin: S(d.country_of_origin),
    customs_tariff_number: S(d.customs_tariff_number),
    end_of_life: D(d.end_of_life),
    default_material_request_type: S(d.default_material_request_type),
    valuation_method: S(d.valuation_method),
    warranty_period: S(d.warranty_period),
    customer_code: S(d.customer_code),
    default_item_manufacturer: S(d.default_item_manufacturer),
    default_manufacturer_part_no: S(d.default_manufacturer_part_no),
    drawing_no: S(d.drawing_no),
    drawing_pdf: S(d.drawing_pdf),
    drawing_dwg: S(d.drawing_dwg),
    custom_drawing_dxf: S(d.custom_drawing_dxf),
    image: S(d.image),
    kittable: S(d.kittable),
    raw_material: S(d.raw_material),
    each_blank: S(d.each_blank),
    qc_status: S(d.qc_status),
    custom_item_class: S(d.custom_item_class),
    date_price_updated: S(d.date_price_updated),
    erp_owner: S(d.owner),
    erp_modified_by: S(d.modified_by),
    erp_creation: T(d.creation),
    erp_modified: T(d.modified),
    erp: d,
    pulled_at: pulledAt,
  };
}

export const PULL_PHASES = ["items", "children", "files", "projects", "boms", "bom_items", "warehouses"] as const;
export type PullResult = { ok: true; phase: string; found: number; written: number; removed: number; note: string };

/** One phase of the walk, logged into material_pull under `by` — a hand's e-mail, or cron@genie. */
export async function pullPhase(phase: string, by: string): Promise<PullResult> {
  const { base, H } = await erpConfig();
  const admin = adminClient();
  const startedAt = new Date().toISOString();
  const log = async (found: number, written: number, removed: number, note: string) => {
    await admin.from("material_pull").insert({ phase, found, written, removed, note, by });
  };

  // ------------------------------------------------------------ items
  if (phase === "items") {
    const docs = await pages(
      (start) => `${base}/api/resource/Item?fields=${encodeURIComponent(JSON.stringify(["*"]))}`
        + `&filters=${encodeURIComponent(JSON.stringify(RM_FILTER))}&limit_start=${start}&limit_page_length=500`,
      H, (j) => ((j as { data?: Doc[] }).data ?? []),
    );
    const rows = docs.map((d) => toRow(d, startedAt)).filter((r) => S(r.item_code));
    let written = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from("material_item").upsert(rows.slice(i, i + 500), { onConflict: "item_code" });
      if (error) {
        if (/does not exist|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0118 first — Saamaan's tables don't exist yet.");
        throw new Error(error.message);
      }
      written += Math.min(500, rows.length - i);
    }
    // Anything the ERP no longer offers under this filter is marked, not
    // dropped: it was disabled, or moved out of RM. A BOM line pointing at
    // it must still find it.
    const { count } = await admin.from("material_item")
      .update({ disabled: true }, { count: "exact" })
      .lt("pulled_at", startedAt).eq("disabled", false);
    const removed = count ?? 0;
    const note = `${rows.length} items under "RM -", not disabled; ${removed} no longer offered, marked disabled.`;
    await log(rows.length, written, removed, note);
    return ({ ok: true, phase, found: rows.length, written, removed, note });
  }

  // --------------------------------------------------------- children
  if (phase === "children") {
    const known = await knownCodes(admin);
    const byItem = new Map<string, Record<string, Doc[]>>();
    let found = 0;
    for (const c of CHILDREN) {
      const rows = await pages(
        (start) => `${base}/api/method/frappe.client.get_list?doctype=${encodeURIComponent(c.doctype)}&parent=Item`
          + `&fields=${encodeURIComponent(JSON.stringify(["*"]))}`
          + `&filters=${encodeURIComponent(JSON.stringify([["parenttype", "=", "Item"]]))}`
          + `&order_by=${encodeURIComponent("parent asc, idx asc")}&limit_start=${start}&limit_page_length=500`,
        H, (j) => ((j as { message?: Doc[] }).message ?? []),
      );
      for (const r of rows) {
        const parent = S(r.parent);
        if (!known.has(parent)) continue;
        found++;
        const clean: Doc = {};
        for (const [k, v] of Object.entries(r)) if (!CHILD_NOISE.test(k)) clean[k] = v;
        const slot = byItem.get(parent) ?? {};
        (slot[c.field] ??= []).push(clean);
        byItem.set(parent, slot);
      }
    }
    // Every known item is written — an item whose children all vanished
    // on the ERP gets an empty set, not yesterday's.
    const rows = [...known].map((code) => ({ item_code: code, children: byItem.get(code) ?? {} }));
    let written = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from("material_item").upsert(rows.slice(i, i + 500), { onConflict: "item_code" });
      if (error) throw new Error(error.message);
      written += Math.min(500, rows.length - i);
    }
    const note = `${found} child rows across ${byItem.size} items — ${CHILDREN.map((c) => c.field).join(", ")}.`;
    await log(found, written, 0, note);
    return ({ ok: true, phase, found, written, removed: 0, note });
  }

  // ------------------------------------------------------------ files
  if (phase === "files") {
    const known = await knownCodes(admin);
    const files = await pages(
      (start) => `${base}/api/resource/File?fields=${encodeURIComponent(JSON.stringify(
        ["name", "file_name", "file_url", "is_private", "attached_to_name", "attached_to_field", "file_size", "modified"]))}`
        + `&filters=${encodeURIComponent(JSON.stringify([["attached_to_doctype", "=", "Item"]]))}`
        + `&limit_start=${start}&limit_page_length=500`,
      H, (j) => ((j as { data?: Doc[] }).data ?? []),
    );
    const rows = files
      .filter((f) => known.has(S(f.attached_to_name)) && S(f.name))
      .map((f) => ({
        file_id: S(f.name),
        item_code: S(f.attached_to_name),
        file_name: S(f.file_name),
        file_url: S(f.file_url),
        is_private: B(f.is_private),
        attached_to_field: S(f.attached_to_field),
        file_size: I(f.file_size),
        erp_modified: T(f.modified),
        pulled_at: startedAt,
      }));
    let written = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from("material_item_file").upsert(rows.slice(i, i + 500), { onConflict: "file_id" });
      if (error) {
        if (/does not exist|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0118 first — Saamaan's tables don't exist yet.");
        throw new Error(error.message);
      }
      written += Math.min(500, rows.length - i);
    }
    // A file the ERP no longer has is gone here too — the URL would 404.
    const { count } = await admin.from("material_item_file").delete({ count: "exact" }).lt("pulled_at", startedAt);
    const removed = count ?? 0;
    const note = `${files.length} files on Items in the ERP, ${rows.length} on RM items; ${removed} no longer there, removed.`;
    await log(rows.length, written, removed, note);
    return ({ ok: true, phase, found: rows.length, written, removed, note });
  }

  // --------------------------------------------------------- projects
  if (phase === "projects") {
    const FIELDS = ["name", "project_name", "status", "customer", "custom_product_family", "custom_approved_bom",
      "design_stage", "custom_bom_release_target_date", "custom_bom_released_date", "custom_structural_bom",
      "custom_main_bom", "custom_hydraulic_bom", "custom_electric_bom", "custom_long_lead_items", "bom_for_action",
      "expected_end_date", "customer_committed_delivery_", "project_stage", "sales_order", "modified", "modified_by"];
    const docs = await pages(
      (start) => `${base}/api/resource/Project?fields=${encodeURIComponent(JSON.stringify(FIELDS))}&limit_start=${start}&limit_page_length=500`,
      H, (j) => ((j as { data?: Doc[] }).data ?? []),
    );
    const rows = docs.filter((d) => S(d.name)).map((d) => ({
      project_id: S(d.name),
      project_name: S(d.project_name),
      status: S(d.status),
      customer: S(d.customer),
      product_family: S(d.custom_product_family),
      approved_bom: S(d.custom_approved_bom),
      design_stage: S(d.design_stage),
      bom_release_target_date: D(d.custom_bom_release_target_date),
      bom_released_date: D(d.custom_bom_released_date),
      structural_bom: B(d.custom_structural_bom),
      main_bom: B(d.custom_main_bom),
      hydraulic_bom: B(d.custom_hydraulic_bom),
      electric_bom: B(d.custom_electric_bom),
      long_lead_items: B(d.custom_long_lead_items),
      bom_for_action: S(d.bom_for_action),
      erp_modified: T(d.modified),
      erp_modified_by: S(d.modified_by),
      erp: d,
      pulled_at: startedAt,
    }));
    let written = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from("material_project").upsert(rows.slice(i, i + 500), { onConflict: "project_id" });
      if (error) {
        if (/does not exist|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0119 first — Saamaan's project tables don't exist yet.");
        if (/erp_modified_by/i.test(error.message))
          throw new HttpError(503, "Run migration 0120 first — the Last Modified By column is not there yet.");
        throw new Error(error.message);
      }
      written += Math.min(500, rows.length - i);
    }
    const withBom = rows.filter((r) => r.approved_bom).length;
    const note = `${rows.length} projects; ${withBom} point at an Approved BOM.`;
    await log(rows.length, written, 0, note);
    return ({ ok: true, phase, found: rows.length, written, removed: 0, note });
  }

  // ------------------------------------------------------------- boms
  if (phase === "boms") {
    const FIELDS = ["name", "item", "item_name", "project", "is_active", "is_default", "docstatus", "quantity", "company", "modified", "modified_by",
      "total_cost", "raw_material_cost", "operating_cost"];
    const docs = await pages(
      (start) => `${base}/api/resource/BOM?fields=${encodeURIComponent(JSON.stringify(FIELDS))}&limit_start=${start}&limit_page_length=500`,
      H, (j) => ((j as { data?: Doc[] }).data ?? []),
    );
    const rows = docs.filter((d) => S(d.name)).map((d) => ({
      bom_id: S(d.name),
      item_code: S(d.item),
      item_name: S(d.item_name),
      project_id: S(d.project),
      is_active: B(d.is_active),
      is_default: B(d.is_default),
      docstatus: I(d.docstatus) ?? 0,
      quantity: N(d.quantity),
      total_cost: N(d.total_cost),
      raw_material_cost: N(d.raw_material_cost),
      operating_cost: N(d.operating_cost),
      erp_modified: T(d.modified),
      erp_modified_by: S(d.modified_by),
      erp: d,
      pulled_at: startedAt,
    }));
    let written = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from("material_bom").upsert(rows.slice(i, i + 500), { onConflict: "bom_id" });
      if (error) {
        if (/does not exist|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0119 first — Saamaan's project tables don't exist yet.");
        if (/erp_modified_by/i.test(error.message))
          throw new HttpError(503, "Run migration 0120 first — the Last Modified By column is not there yet.");
        if (/total_cost|raw_material_cost|operating_cost/i.test(error.message))
          throw new HttpError(503, "Run migration 0122 first — the BOM value columns are not there yet.");
        throw new Error(error.message);
      }
      written += Math.min(500, rows.length - i);
    }
    // A BOM gone from the ERP goes from here — the header is the ERP's
    // word, and there is nothing of Saamaan's own on the row yet.
    const { count } = await admin.from("material_bom").delete({ count: "exact" }).lt("pulled_at", startedAt);
    const removed = count ?? 0;
    const onProject = rows.filter((r) => r.project_id).length;
    const note = `${rows.length} BOMs, ${onProject} on a project; ${removed} no longer on the ERP, removed.`;
    await log(rows.length, written, removed, note);
    return ({ ok: true, phase, found: rows.length, written, removed, note });
  }

  // -------------------------------------------------------- bom_items
  if (phase === "bom_items") {
    // The scope: live BOMs on live projects — those with a job on the board.
    const projectIds = [...(await liveProjectIds(admin))];
    const { data: bomRows, error: bErr } = projectIds.length
      ? await admin.from("material_bom").select("bom_id").in("project_id", projectIds).neq("docstatus", 2).limit(5000)
      : { data: [], error: null };
    if (bErr) throw new Error(bErr.message);
    const bomIds = (bomRows ?? []).map((b) => String(b.bom_id));

    const rows: Doc[] = [];
    // Fifty BOMs a request keeps the URL sane; each pages at 500.
    for (let i = 0; i < bomIds.length; i += 50) {
      const slice = bomIds.slice(i, i + 50);
      const lines = await pages(
        (start) => `${base}/api/method/frappe.client.get_list?doctype=${encodeURIComponent("BOM Item")}&parent=BOM`
          + `&fields=${encodeURIComponent(JSON.stringify(["*"]))}`
          + `&filters=${encodeURIComponent(JSON.stringify([["parenttype", "=", "BOM"], ["parent", "in", slice]]))}`
          + `&order_by=${encodeURIComponent("parent asc, idx asc")}&limit_start=${start}&limit_page_length=500`,
        H, (j) => ((j as { message?: Doc[] }).message ?? []),
      );
      for (const d of lines) {
        if (!S(d.name)) continue;
        rows.push({
          row_id: S(d.name),
          bom_id: S(d.parent),
          idx: I(d.idx) ?? 0,
          item_code: S(d.item_code),
          item_name: S(d.item_name),
          item_group: S(d.custom_item_group),
          qty: N(d.qty),
          uom: S(d.uom),
          stock_qty: N(d.stock_qty),
          stock_uom: S(d.stock_uom),
          rate: N(d.rate),
          amount: N(d.amount),
          description: S(d.description),
          bom_status: S(d.bom_status),
          bom_remark: S(d.bom_remark),
          bom_no: S(d.bom_no),
          is_sub_assembly: B(d.is_sub_assembly_item),
          sourced_by_supplier: B(d.sourced_by_supplier),
          source_warehouse: S(d.source_warehouse),
          erp_modified: T(d.modified),
          erp_modified_by: S(d.modified_by),
          erp: d,
          pulled_at: startedAt,
        });
      }
    }
    let written = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from("material_bom_item").upsert(rows.slice(i, i + 500), { onConflict: "row_id" });
      if (error) {
        if (/does not exist|schema cache/i.test(error.message))
          throw new HttpError(503, "Run migration 0121 first — the BOM lines table doesn't exist yet.");
        throw new Error(error.message);
      }
      written += Math.min(500, rows.length - i);
    }
    // The working set, whole: anything not in this walk is out of it.
    const { count, error: dErr } = await admin.from("material_bom_item").delete({ count: "exact" }).lt("pulled_at", startedAt);
    if (dErr && /does not exist|schema cache/i.test(dErr.message))
      throw new HttpError(503, "Run migration 0121 first — the BOM lines table doesn't exist yet.");
    const removed = count ?? 0;
    /* the RBOM follows: Draft lines whose BOM the ERP has submitted become Released */
    const synced = await syncRbomReleased(admin).catch(() => 0);
    const note = `${rows.length} lines on ${bomIds.length} live BOMs across ${projectIds.length} live projects (a job on the board); ${removed} lines no longer in the set, removed.${synced ? ` ${synced} RBOM line${synced === 1 ? "" : "s"} moved Draft → Released, as the ERP has them.` : ""}`;
    await log(rows.length, written, removed, note);
    return ({ ok: true, phase, found: rows.length, written, removed, note });
  }

  // ------------------------------------------------------- warehouses
  if (phase === "warehouses") {
    const docs = await pages(
      (start) => `${base}/api/resource/Warehouse?fields=${encodeURIComponent(JSON.stringify(["name", "warehouse_name", "company", "parent_warehouse", "is_group", "disabled", "modified"]))}&limit_start=${start}&limit_page_length=500`,
      H, (j) => ((j as { data?: Doc[] }).data ?? []),
    );
    const { data: had, error: hadErr } = await admin.from("material_warehouse").select("warehouse").limit(1000);
    if (hadErr) {
      if (/does not exist|schema cache/i.test(hadErr.message))
        throw new HttpError(503, "Run migration 0124 first — the warehouse master doesn't exist yet.");
      throw new Error(hadErr.message);
    }
    const known = new Set((had ?? []).map((w) => String(w.warehouse)));
    // A first guess from the name, for a warehouse nobody has typed yet.
    // Shown as a guess in Masters; Genie's word once somebody sets it.
    const guess = (n: string) =>
      /sub-?ve|vendor|transit/i.test(n) ? "Vendor" : /work in pro|wip|kitting/i.test(n) ? "WIP" : /finished goods/i.test(n) ? "Finished goods" : /\bstore|stock\b/i.test(n) ? "Stock" : "";
    const rows = docs.filter((d) => S(d.name)).map((d) => {
      const name = S(d.name);
      const row: Doc = {
        warehouse: name,
        warehouse_name: S(d.warehouse_name),
        company: S(d.company),
        parent_warehouse: S(d.parent_warehouse),
        is_group: B(d.is_group),
        disabled: B(d.disabled),
        erp_modified: T(d.modified),
        pulled_at: startedAt,
      };
      // A NEW row always carries kind and remarks — blank for a group
      // warehouse, a guess for a working one — because a batch where some
      // rows lack a column is sent with null there, and kind refuses null.
      if (!known.has(name)) {
        const k = B(d.is_group) ? "" : guess(name);
        row.kind = k;
        row.remarks = k ? "type guessed from the name — check" : "";
      }
      return row;
    });
    // Two upserts: new rows carry the guess; known rows carry the ERP's
    // columns only, so the type and remark somebody set stay theirs.
    const fresh = rows.filter((r) => !known.has(String(r.warehouse)));
    const again = rows.filter((r) => known.has(String(r.warehouse)));
    let written = 0;
    for (const batch of [fresh, again]) {
      if (!batch.length) continue;
      const { error } = await admin.from("material_warehouse").upsert(batch, { onConflict: "warehouse" });
      if (error) throw new Error(error.message);
      written += batch.length;
    }
    const guessed = fresh.filter((r) => r.kind).length;
    const note = `${rows.length} warehouses, ${rows.filter((r) => !r.is_group).length} working; ${fresh.length} new${guessed ? `, ${guessed} typed by a guess from the name` : ""}.`;
    await log(rows.length, written, 0, note);
    return ({ ok: true, phase, found: rows.length, written, removed: 0, note });
  }

  throw new HttpError(400, "Unknown phase — items, children, files, projects, boms, bom_items or warehouses.");
}
