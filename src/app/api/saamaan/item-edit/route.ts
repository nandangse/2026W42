import { NextResponse } from "next/server";
import { readBody, type AnyBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireSaamaan } from "@/lib/saamaan";
import { mayEditItems, mayMergeItems } from "@/lib/saamaan-hands";
import { erpPutItem, erpSetBuyingPrice, erpMergeItem } from "@/lib/saamaan-write";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * THE ITEM MASTER, WRITTEN BACK (Dr Raghu, 3 Oct 2026, "go").
 *
 *   bulk_class  codes[], cls           — "select multiple … say Class B and Change"
 *   group       codes[], item_group    — "move an item to another item group"
 *   price       code, rate              — "one by one, and when a price is added, it should be pushed into the ERP"
 *   field       code, field, value      — "Rameez or Mukesh can edit the cells … pushed back to the ERP"
 *   merge       codes[], master         — "which one of the four should be the master … then Generate"
 *
 * ERP FIRST, MIRROR SECOND. The ERP owns the Item master; Genie holds a
 * mirror. So every write goes to the ERP and only then into the mirror, and
 * a write the ERP refuses leaves the mirror as it was — the next pull would
 * have overwritten a mirror that ran ahead anyway. Every change is a row in
 * material_item_edit with the ERP's answer; every merge a row in
 * material_merge, loser by loser.
 */
type Doc = Record<string, unknown>;
const S = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const N = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/** The fields a hand may type. Not the UOMs (the ERP forbids them once there are transactions), not the rates the ERP computes. */
const TEXT_FIELDS = new Set(["item_name", "item_short_description", "description", "custom_item_class", "kittable", "qc_status", "each_blank", "gst_hsn_code", "brand",
  "country_of_origin", "weight_uom", "end_of_life", "valuation_method", "default_material_request_type", "warranty_period", "customer_code",
  "default_item_manufacturer", "default_manufacturer_part_no", "raw_material", "drawing_no"]);
const NUM_FIELDS = new Set(["weight_per_unit", "safety_stock", "min_order_qty", "lead_time_days", "shelf_life_in_days"]);
const CLASSES = new Set(["A", "B", "C", ""]);

/** Tables that carry an item code and must follow a merge. */
const REPOINT: { table: string; col: string }[] = [
  { table: "material_rbom_item", col: "item_code" }, { table: "material_bom_item", col: "item_code" }, { table: "material_bom", col: "item_code" },
  { table: "material_rbom", col: "item_code" }, { table: "material_issue", col: "item_code" }, { table: "material_slip_line", col: "item_code" },
  { table: "material_po_item", col: "item_code" }, { table: "material_grn_item", col: "item_code" }, { table: "material_pinv_item", col: "item_code" },
  { table: "material_item_file", col: "item_code" }, { table: "material_kanban_log", col: "item_code" }, { table: "material_item_edit", col: "item_code" },
];

async function logEdit(admin: ReturnType<typeof adminClient>, row: Doc) {
  try { await admin.from("material_item_edit").insert(row); } catch { /* pre-0194: the write still went */ }
}

export async function GET(req: Request) {
  try {
    await requireSaamaan();
    const url = new URL(req.url);
    const admin = adminClient();
    if (url.searchParams.get("mode") === "merges") {
      const { data } = await admin.from("material_merge").select("*").order("at", { ascending: false }).limit(30);
      return NextResponse.json({ ok: true, rows: data ?? [] });
    }
    const code = S(url.searchParams.get("code"));
    const { data } = await admin.from("material_item_edit").select("*").eq("item_code", code).order("at", { ascending: false }).limit(40);
    return NextResponse.json({ ok: true, rows: data ?? [] });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireSaamaan();
    const admin = adminClient();
    const body = await readBody(req, {}).catch((): AnyBody => ({}));
    const action = S(body.action);
    const now = new Date().toISOString();

    if (action === "merge") {
      if (!mayMergeItems(me.email)) throw new HttpError(403, "Merging items is Mukesh's and Rameez's alone.");
    } else if (!mayEditItems(me.email, me.isOwner)) {
      throw new HttpError(403, "Writing the Item master is Mukesh's and Rameez's.");
    }

    const mirror = async (code: string, patch: Doc) => {
      const { error } = await admin.from("material_item").update({ ...patch, pulled_at: now }).eq("item_code", code);
      if (error) throw new Error(error.message);
    };
    const current = async (code: string, field: string): Promise<unknown> => {
      const { data } = await admin.from("material_item").select(field).eq("item_code", code).maybeSingle();
      return (data as Doc | null)?.[field] ?? null;
    };
    const codesOf = () => [...new Set(((Array.isArray(body.codes) ? body.codes : body.code ? [body.code] : []) as unknown[]).map((x) => S(x)).filter(Boolean))];

    /* one field on many items, ERP first, each on record */
    const setMany = async (codes: string[], field: string, value: string) => {
      let done = 0; const failed: { code: string; error: string }[] = [];
      for (const code of codes) {
        const from = S(await current(code, field));
        if (from === value) { done++; continue; }
        try {
          await erpPutItem(code, { [field]: value });
          await mirror(code, { [field]: value });
          await logEdit(admin, { item_code: code, field, from_value: from, to_value: value, by: me.email, erp_status: "done" });
          done++;
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          failed.push({ code, error });
          await logEdit(admin, { item_code: code, field, from_value: from, to_value: value, by: me.email, erp_status: "failed", erp_error: error.slice(0, 400) });
        }
      }
      return { done, failed };
    };

    if (action === "bulk_class") {
      const codes = codesOf();
      const cls = S(body.cls).toUpperCase();
      if (!codes.length) throw new HttpError(400, "Tick at least one item.");
      if (!CLASSES.has(cls)) throw new HttpError(400, "Class is A, B, C or blank.");
      return NextResponse.json({ ok: true, ...(await setMany(codes, "custom_item_class", cls)) });
    }

    if (action === "group") {
      const codes = codesOf();
      const group = S(body.item_group);
      if (!codes.length || !group) throw new HttpError(400, "An item and a group are needed.");
      return NextResponse.json({ ok: true, ...(await setMany(codes, "item_group", group)) });
    }

    if (action === "price") {
      const code = S(body.code);
      const rate = N(body.rate);
      if (!code || rate === null || rate < 0) throw new HttpError(400, "An item and a price are needed.");
      const from = S(await current(code, "standard_rate"));
      try {
        const how = await erpSetBuyingPrice(code, rate, today());
        await mirror(code, { standard_rate: rate, date_price_updated: today() });
        await logEdit(admin, { item_code: code, field: "price", from_value: from, to_value: String(rate), by: me.email, erp_status: "done", erp_error: how });
        return NextResponse.json({ ok: true, how });
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        await logEdit(admin, { item_code: code, field: "price", from_value: from, to_value: String(rate), by: me.email, erp_status: "failed", erp_error: error.slice(0, 400) });
        throw e;
      }
    }

    if (action === "field") {
      const code = S(body.code), field = S(body.field);
      if (!code || !field) throw new HttpError(400, "An item and a field are needed.");
      let value: unknown;
      if (TEXT_FIELDS.has(field)) {
        value = S(body.value).slice(0, 4000);
        if (field === "custom_item_class") { value = String(value).toUpperCase(); if (!CLASSES.has(String(value))) throw new HttpError(400, "Class is A, B, C or blank."); }
      } else if (NUM_FIELDS.has(field)) {
        value = N(body.value) ?? 0;
      } else throw new HttpError(400, `${field} is not a field a hand may type here — the UOMs and the computed rates stay the ERP's.`);
      const from = await current(code, field);
      if (S(from) === S(value)) return NextResponse.json({ ok: true, unchanged: true });
      try {
        await erpPutItem(code, { [field]: value });
        await mirror(code, { [field]: value });
        await logEdit(admin, { item_code: code, field, from_value: S(from), to_value: S(value), by: me.email, erp_status: "done" });
        return NextResponse.json({ ok: true });
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        await logEdit(admin, { item_code: code, field, from_value: S(from), to_value: S(value), by: me.email, erp_status: "failed", erp_error: error.slice(0, 400) });
        throw e;
      }
    }

    /* MERGE — loser by loser: the ERP merges first (its own rename-and-merge,
       which rewrites every ledger, BOM line, purchase and sales row); only
       when the ERP says yes does Genie re-point its own tables to the master
       and retire the loser in the mirror. A loser the ERP refuses is left
       whole on both sides and named in the record. */
    if (action === "merge") {
      const codes = codesOf();
      const master = S(body.master);
      if (codes.length < 2) throw new HttpError(400, "Tick at least two items.");
      if (!codes.includes(master)) throw new HttpError(400, "The master must be one of the ticked items.");
      const losers = codes.filter((c) => c !== master);
      const { data: mrow } = await admin.from("material_item").select("item_code").eq("item_code", master).maybeSingle();
      if (!mrow) throw new HttpError(404, `${master} is not in the mirror.`);
      const { data: rec, error: rErr } = await admin.from("material_merge").insert({ master, losers, by: me.email, status: "running", note: S(body.note).slice(0, 400) }).select("id").maybeSingle();
      if (rErr) { if (/does not exist|schema cache/i.test(rErr.message)) throw new HttpError(503, "Run migration 0194 first — the merge record does not exist yet."); throw new Error(rErr.message); }
      const steps: Doc[] = [];
      let okCount = 0;
      for (const loser of losers) {
        const step: Doc = { loser, at: new Date().toISOString() };
        try {
          await erpMergeItem(loser, master);
          step.erp = "merged";
          const counts: Doc = {};
          for (const { table, col } of REPOINT) {
            const { count, error } = await admin.from(table).update({ [col]: master }, { count: "exact" }).eq(col, loser);
            counts[table] = error ? `ERR ${error.message.slice(0, 80)}` : (count ?? 0);
          }
          /* keyed rows: a loser's plan line folds into the master's; a loser's Kanban row goes if the master has one */
          const { data: plans } = await admin.from("material_mrp_plan").select("mrp_id, order_qty").eq("item_code", loser);
          let folded = 0;
          for (const p of (plans ?? []) as Doc[]) {
            const { data: mp } = await admin.from("material_mrp_plan").select("order_qty").eq("mrp_id", String(p.mrp_id)).eq("item_code", master).maybeSingle();
            if (mp) {
              await admin.from("material_mrp_plan").update({ order_qty: (Number(mp.order_qty) || 0) + (Number(p.order_qty) || 0) }).eq("mrp_id", String(p.mrp_id)).eq("item_code", master);
              await admin.from("material_mrp_plan").delete().eq("mrp_id", String(p.mrp_id)).eq("item_code", loser);
            } else {
              await admin.from("material_mrp_plan").update({ item_code: master }).eq("mrp_id", String(p.mrp_id)).eq("item_code", loser);
            }
            folded++;
          }
          counts.material_mrp_plan = folded;
          const { data: mk } = await admin.from("material_kanban").select("item_code").eq("item_code", master).maybeSingle();
          if (mk) { const { count } = await admin.from("material_kanban").delete({ count: "exact" }).eq("item_code", loser); counts.material_kanban = `dropped ${count ?? 0}`; }
          else { const { count } = await admin.from("material_kanban").update({ item_code: master }, { count: "exact" }).eq("item_code", loser); counts.material_kanban = count ?? 0; }
          await admin.from("material_item").update({ merged_into: master, disabled: true, pulled_at: now }).eq("item_code", loser);
          step.genie = counts;
          okCount++;
        } catch (e) {
          step.erp = "failed"; step.error = (e instanceof Error ? e.message : String(e)).slice(0, 400);
        }
        steps.push(step);
        await admin.from("material_merge").update({ steps }).eq("id", rec!.id);
      }
      const status = okCount === losers.length ? "done" : okCount ? "partial" : "failed";
      await admin.from("material_merge").update({ status, steps }).eq("id", rec!.id);
      await logEdit(admin, { item_code: master, field: "merge", from_value: losers.join(", "), to_value: master, by: me.email, erp_status: status === "done" ? "done" : "failed", erp_error: status === "done" ? "" : steps.filter((s) => s.erp === "failed").map((s) => `${s.loser}: ${s.error}`).join(" · ").slice(0, 400) });
      return NextResponse.json({ ok: status !== "failed", status, master, steps });
    }

    throw new HttpError(400, "Unknown action — bulk_class, group, price, field or merge.");
  } catch (e) {
    return errJson(e);
  }
}
