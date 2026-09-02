import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireSaamaan } from "@/lib/saamaan";
import { crmDb, crmConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/saamaan/items — the mirrored Item master, read three ways:
 *
 *   ?mode=summary          — the counts the dashboard draws, one per group,
 *                            and the pull ledger.
 *   ?mode=list&q=&group=&group=&page=&size=&disabled=1
 *                          — a page of the list. 22,000 rows do not travel
 *                            to a browser; the search and the group filter
 *                            run in the database and a page comes back.
 *                            `group` repeats: several groups at once are
 *                            one question, answered with IN.
 *   ?mode=one&code=N040692 — one item whole: every column, the verbatim
 *                            ERP document, the child tables, the files.
 *
 * Every answer carries `erpBase`, the ERP's URL, so the screen can turn the
 * paths it holds (file_url, an <img src> inside a description, the item's
 * own form) into links that open — the paths themselves stay exactly as
 * the ERP wrote them.
 */

const notInstalled = (m: string) => /does not exist|schema cache/i.test(m);

/** The ERP's URL alone — never the key. Empty when the CRM is not wired. */
async function erpBase(): Promise<string> {
  try {
    if (!crmConfigured()) return "";
    const { data } = await crmDb().from("integration_setting").select("config").eq("key", "erpnext").maybeSingle();
    return String((data?.config as Record<string, string> | undefined)?.url || "").replace(/\/+$/, "");
  } catch {
    return "";
  }
}

const LIST_COLUMNS = [
  "item_code", "item_name", "item_group", "stock_uom", "custom_item_class", "kittable", "qc_status",
  "last_purchase_rate", "valuation_rate", "drawing_no", "drawing_pdf", "drawing_dwg", "custom_drawing_dxf",
  "image", "disabled", "erp_modified", "raw_material", "gst_hsn_code",
].join(", ");

/** What a search box may contain, once it reaches PostgREST's filter grammar. */
const safe = (q: string) => q.replace(/[,()"'\\%]/g, " ").trim();

export async function GET(req: Request) {
  try {
    await requireSaamaan();
    const admin = adminClient();
    const p = new URL(req.url).searchParams;
    const mode = String(p.get("mode") || "list");
    const base = await erpBase();

    if (mode === "summary") {
      const [total, disabled, withPdf, withDwg, withDxf, files, groups, pulls] = await Promise.all([
        admin.from("material_item").select("item_code", { count: "exact", head: true }).eq("disabled", false),
        admin.from("material_item").select("item_code", { count: "exact", head: true }).eq("disabled", true),
        admin.from("material_item").select("item_code", { count: "exact", head: true }).eq("disabled", false).neq("drawing_pdf", ""),
        admin.from("material_item").select("item_code", { count: "exact", head: true }).eq("disabled", false).neq("drawing_dwg", ""),
        admin.from("material_item").select("item_code", { count: "exact", head: true }).eq("disabled", false).neq("custom_drawing_dxf", ""),
        admin.from("material_item_file").select("file_id", { count: "exact", head: true }),
        admin.rpc("material_group_counts"),
        admin.from("material_pull").select("id, phase, found, written, removed, note, by, at").order("at", { ascending: false }).limit(30),
      ]);
      if (total.error) {
        if (notInstalled(total.error.message)) return NextResponse.json({ installed: false, erpBase: base });
        throw new Error(total.error.message);
      }
      const lastItems = (pulls.data || []).find((x) => x.phase === "items");
      return NextResponse.json({
        installed: true,
        erpBase: base,
        items: total.count ?? 0,
        disabled: disabled.count ?? 0,
        withPdf: withPdf.count ?? 0,
        withDwg: withDwg.count ?? 0,
        withDxf: withDxf.count ?? 0,
        files: files.count ?? 0,
        groups: (groups.data as { item_group: string; n: number }[] | null) ?? [],
        pulls: pulls.data ?? [],
        lastPulledAt: lastItems?.at ?? null,
      });
    }

    if (mode === "one") {
      const code = String(p.get("code") || "").trim();
      if (!code) throw new HttpError(400, "code required");
      const [item, files] = await Promise.all([
        admin.from("material_item").select("*").eq("item_code", code).maybeSingle(),
        admin.from("material_item_file").select("*").eq("item_code", code).order("attached_to_field").order("file_name"),
      ]);
      if (item.error) {
        if (notInstalled(item.error.message)) return NextResponse.json({ installed: false, erpBase: base });
        throw new Error(item.error.message);
      }
      if (!item.data) throw new HttpError(404, `No item ${code} in Saamaan — pull from the ERP, or check the code.`);
      return NextResponse.json({ installed: true, erpBase: base, item: item.data, files: files.data ?? [] });
    }

    // ---------------------------------------------------------------- list
    const q = safe(String(p.get("q") || ""));
    const groups = p.getAll("group").map((g) => g.trim()).filter(Boolean);
    const showDisabled = p.get("disabled") === "1";
    const size = Math.min(500, Math.max(20, Number(p.get("size") || 200) || 200));
    const page = Math.max(0, Number(p.get("page") || 0) || 0);

    let sel = admin.from("material_item").select(LIST_COLUMNS, { count: "exact" });
    if (!showDisabled) sel = sel.eq("disabled", false);
    if (groups.length) sel = sel.in("item_group", groups);
    if (q) sel = sel.or(`item_code.ilike.%${q}%,item_name.ilike.%${q}%,description.ilike.%${q}%,drawing_no.ilike.%${q}%`);
    const { data, error, count } = await sel.order("item_code").range(page * size, page * size + size - 1);
    if (error) {
      if (notInstalled(error.message)) return NextResponse.json({ installed: false, erpBase: base, rows: [], total: 0 });
      throw new Error(error.message);
    }
    return NextResponse.json({ installed: true, erpBase: base, rows: data ?? [], total: count ?? 0, page, size });
  } catch (e) {
    return errJson(e);
  }
}
