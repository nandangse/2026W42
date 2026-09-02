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
 *   ?mode=projects         — every project with the BOMs the ERP holds on
 *                            it, joined here so the screen gets one list.
 *   ?mode=bom_front        — one row per project, every status, flagged
 *                            live where a job of its is on the board: its
 *                            latest SUBMITTED BOM, that BOM's line count
 *                            (pulled for live projects only), its value as
 *                            the ERP costs it, who and when.
 *   ?mode=bom&project=&bom=&status=&q=&page=&size=
 *                          — a page of BOM lines from the working set (live
 *                            BOMs on projects in process), each line joined
 *                            to its item in the mirror for the description,
 *                            the group and the suppliers.
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
      const [total, disabled, withPdf, withDwg, withDxf, files, groups, pulls, projects, boms] = await Promise.all([
        admin.from("material_item").select("item_code", { count: "exact", head: true }).eq("disabled", false),
        admin.from("material_item").select("item_code", { count: "exact", head: true }).eq("disabled", true),
        admin.from("material_item").select("item_code", { count: "exact", head: true }).eq("disabled", false).neq("drawing_pdf", ""),
        admin.from("material_item").select("item_code", { count: "exact", head: true }).eq("disabled", false).neq("drawing_dwg", ""),
        admin.from("material_item").select("item_code", { count: "exact", head: true }).eq("disabled", false).neq("custom_drawing_dxf", ""),
        admin.from("material_item_file").select("file_id", { count: "exact", head: true }),
        admin.rpc("material_group_counts"),
        admin.from("material_pull").select("id, phase, found, written, removed, note, by, at").order("at", { ascending: false }).limit(40),
        admin.from("material_project").select("project_id", { count: "exact", head: true }),
        admin.from("material_bom").select("bom_id", { count: "exact", head: true }),
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
        // Null until 0119 is in — "no table" is not "no projects".
        projects: projects.error ? null : projects.count ?? 0,
        boms: boms.error ? null : boms.count ?? 0,
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

    if (mode === "projects") {
      const all = async (table: string, cols: string, order: string) => {
        const out: Record<string, unknown>[] = [];
        for (let a = 0; ; a += 1000) {
          const { data, error } = await admin.from(table).select(cols).order(order).range(a, a + 999);
          if (error) throw error;
          out.push(...((data ?? []) as unknown as Record<string, unknown>[]));
          if (!data || data.length < 1000) break;
        }
        return out;
      };
      try {
        const [projects, boms, pull] = await Promise.all([
          all("material_project", "project_id, project_name, status, customer, product_family, approved_bom, design_stage, bom_release_target_date, bom_released_date, structural_bom, main_bom, hydraulic_bom, electric_bom, long_lead_items, erp_modified, erp_modified_by", "project_id"),
          all("material_bom", "bom_id, item_code, item_name, project_id, is_active, is_default, docstatus, quantity, erp_modified, erp_modified_by", "bom_id"),
          admin.from("material_pull").select("at").eq("phase", "projects").order("at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        const byProject = new Map<string, Record<string, unknown>[]>();
        for (const b of boms) {
          const k = String(b.project_id || "");
          if (!k) continue;
          (byProject.get(k) ?? byProject.set(k, []).get(k)!).push(b);
        }
        // Newest project first — the number is the ERP's running serial.
        const rows: Record<string, unknown>[] = projects
          .map((p) => ({ ...p, boms: byProject.get(String(p.project_id)) ?? [] }) as Record<string, unknown>)
          .sort((a, b) => String(b.project_id).localeCompare(String(a.project_id), undefined, { numeric: true }));
        return NextResponse.json({ installed: true, erpBase: base, projects: rows, lastPulledAt: pull.data?.at ?? null });
      } catch (e) {
        const m = e instanceof Error ? e.message : String((e as { message?: string })?.message || e);
        if (/erp_modified_by/i.test(m)) return NextResponse.json({ installed: true, erpBase: base, projects: [], lastPulledAt: null, error: "Run migration 0120 first — the Last Modified By column is not there yet." }, { status: 503 });
        if (notInstalled(m)) return NextResponse.json({ installed: false, erpBase: base, projects: [], lastPulledAt: null, error: "Run migration 0119 first — Saamaan's project tables don't exist yet." }, { status: 503 });
        throw new Error(m);
      }
    }

    if (mode === "bom_front") {
      const all = async (table: string, cols: string, apply: (s: any) => any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const out: Record<string, unknown>[] = [];
        for (let a = 0; ; a += 1000) {
          const { data, error } = await apply(admin.from(table).select(cols)).range(a, a + 999);
          if (error) throw error;
          out.push(...((data ?? []) as unknown as Record<string, unknown>[]));
          if (!data || data.length < 1000) break;
        }
        return out;
      };
      try {
        const projects = await all("material_project", "project_id, project_name, product_family, customer, status", (s) => s.order("project_id", { ascending: false }));
        const boms = await all("material_bom", "bom_id, project_id, item_code, item_name, docstatus, is_active, is_default, total_cost, erp_modified, erp_modified_by", (s) => s.neq("project_id", "").order("bom_id"));
        const liveIds = await liveProjectIds(admin);
        const bomIds = boms.filter((b) => Number(b.docstatus) !== 2 && liveIds.has(String(b.project_id))).map((b) => String(b.bom_id));
        const light = bomIds.length ? await all("material_bom_item", "bom_id", (s) => s.in("bom_id", bomIds).order("row_id")) : [];
        const linesPer = new Map<string, number>();
        for (const l of light) linesPer.set(String(l.bom_id), (linesPer.get(String(l.bom_id)) ?? 0) + 1);
        const { data: lastPull } = await admin.from("material_pull").select("at").eq("phase", "bom_items").order("at", { ascending: false }).limit(1).maybeSingle();

        // "The BOM No should be the latest number that is submitted" — the
        // highest-numbered submitted BOM on the project. BOM-N052488-003
        // beats -001; the number is the ERP's own revision serial.
        const byProject = new Map<string, Record<string, unknown>[]>();
        for (const b of boms) (byProject.get(String(b.project_id)) ?? byProject.set(String(b.project_id), []).get(String(b.project_id))!).push(b);
        const num = (a: unknown, b: unknown) => String(a).localeCompare(String(b), undefined, { numeric: true });
        const rows = projects.map((p) => {
          const mine = byProject.get(String(p.project_id)) ?? [];
          const submitted = mine.filter((b) => Number(b.docstatus) === 1).sort((a, b) => num(b.bom_id, a.bom_id));
          const latest = submitted[0] ?? null;
          const drafts = mine.filter((b) => Number(b.docstatus) === 0).length;
          const live = liveIds.has(String(p.project_id));
          return {
            project_id: p.project_id,
            project_name: p.project_name,
            customer: p.customer,
            status: p.status,
            live,
            item_group: p.product_family,
            bom_id: latest ? String(latest.bom_id) : "",
            bom_value: latest ? latest.total_cost ?? null : null,
            bom_item_code: latest ? String(latest.item_code) : "",
            bom_item_name: latest ? String(latest.item_name) : "",
            // Lines are pulled for live projects only; elsewhere the count is
            // unknown, which is not zero.
            lines: latest ? (live ? linesPer.get(String(latest.bom_id)) ?? 0 : linesPer.get(String(latest.bom_id)) ?? null) : null,
            submitted: submitted.length,
            drafts,
            erp_modified: latest ? latest.erp_modified : null,
            erp_modified_by: latest ? String(latest.erp_modified_by) : "",
          };
        });
        return NextResponse.json({ installed: true, erpBase: base, rows, lastPulledAt: lastPull?.at ?? null });
      } catch (e) {
        const m = e instanceof Error ? e.message : String((e as { message?: string })?.message || e);
        if (/material_bom_item/i.test(m) && notInstalled(m))
          return NextResponse.json({ error: "Run migration 0121 first — the BOM lines table doesn't exist yet." }, { status: 503 });
        if (notInstalled(m))
          return NextResponse.json({ error: "Run migration 0119 first — Saamaan's project tables don't exist yet." }, { status: 503 });
        throw new Error(m);
      }
    }

    if (mode === "bom") {
      const all = async (table: string, cols: string, apply: (s: any) => any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const out: Record<string, unknown>[] = [];
        for (let a = 0; ; a += 1000) {
          const { data, error } = await apply(admin.from(table).select(cols)).range(a, a + 999);
          if (error) throw error;
          out.push(...((data ?? []) as unknown as Record<string, unknown>[]));
          if (!data || data.length < 1000) break;
        }
        return out;
      };
      try {
        const liveIds = await liveProjectIds(admin);
        const projects = liveIds.size
          ? await all("material_project", "project_id, project_name", (s) => s.in("project_id", [...liveIds]).order("project_id", { ascending: false }))
          : [];
        const projectIds = projects.map((p) => String(p.project_id));
        const boms = projectIds.length
          ? await all("material_bom", "bom_id, project_id, item_name, docstatus", (s) => s.in("project_id", projectIds).neq("docstatus", 2).order("bom_id"))
          : [];
        const bomIds = boms.map((b) => String(b.bom_id));
        // One light pass over the set for the counts and the statuses.
        const light = bomIds.length ? await all("material_bom_item", "bom_id, bom_status", (s) => s.in("bom_id", bomIds).order("row_id")) : [];
        const linesPer = new Map<string, number>();
        const statusSet = new Set<string>();
        for (const l of light) { linesPer.set(String(l.bom_id), (linesPer.get(String(l.bom_id)) ?? 0) + 1); statusSet.add(String(l.bom_status ?? "")); }
        const { data: lastPull } = await admin.from("material_pull").select("at").eq("phase", "bom_items").order("at", { ascending: false }).limit(1).maybeSingle();

        const project = String(p.get("project") || "").trim();
        const bom = String(p.get("bom") || "").trim();
        const status = p.get("status");
        const q = safe(String(p.get("q") || ""));
        const size = Math.min(500, Math.max(20, Number(p.get("size") || 200) || 200));
        const page = Math.max(0, Number(p.get("page") || 0) || 0);
        const scope = bom ? bomIds.filter((b) => b === bom) : project ? boms.filter((b) => String(b.project_id) === project).map((b) => String(b.bom_id)) : bomIds;

        let rows: Record<string, unknown>[] = [];
        let total = 0;
        if (scope.length) {
          let sel = admin.from("material_bom_item")
            .select("row_id, bom_id, idx, item_code, item_name, item_group, qty, uom, rate, amount, description, bom_status, bom_remark, bom_no, is_sub_assembly, erp_modified, erp_modified_by", { count: "exact" })
            .in("bom_id", scope);
          if (status !== null && status !== "") sel = sel.eq("bom_status", status);
          if (q) sel = sel.or(`item_code.ilike.%${q}%,item_name.ilike.%${q}%,bom_remark.ilike.%${q}%,description.ilike.%${q}%`);
          const r = await sel.order("bom_id").order("idx").range(page * size, page * size + size - 1);
          if (r.error) throw r.error;
          rows = (r.data ?? []) as unknown as Record<string, unknown>[];
          total = r.count ?? 0;
        }

        // The item behind each line, from the mirror: description, group, suppliers.
        const codes = [...new Set(rows.map((r) => String(r.item_code)).filter(Boolean))];
        const items = new Map<string, Record<string, unknown>>();
        if (codes.length) {
          const { data: its } = await admin.from("material_item").select("item_code, description, item_group, children").in("item_code", codes);
          for (const it of its ?? []) items.set(String(it.item_code), it as Record<string, unknown>);
        }
        const bomMeta = new Map(boms.map((b) => [String(b.bom_id), b]));
        const projMeta = new Map(projects.map((pr) => [String(pr.project_id), pr]));
        const out = rows.map((r) => {
          const it = items.get(String(r.item_code));
          const sup = ((it?.children as Record<string, Record<string, unknown>[]> | undefined)?.supplier_items ?? [])
            .map((s) => String(s.supplier || "")).filter(Boolean);
          const bm = bomMeta.get(String(r.bom_id));
          const pj = bm ? projMeta.get(String(bm.project_id)) : undefined;
          return {
            ...r,
            item_description: it ? String(it.description ?? "") : null,
            item_group_of_item: it ? String(it.item_group ?? "") : "",
            suppliers: [...new Set(sup)],
            in_mirror: !!it,
            project_id: bm ? String(bm.project_id) : "",
            project_name: pj ? String(pj.project_name) : "",
          };
        });

        // A search or a status narrows the BOM/project pickers' counts no
        // further — the counts say what the set holds, not what the page shows.
        const bomsOut = boms.map((b) => ({ ...b, lines: linesPer.get(String(b.bom_id)) ?? 0 }));
        const perProject = new Map<string, number>();
        for (const b of boms) perProject.set(String(b.project_id), (perProject.get(String(b.project_id)) ?? 0) + 1);
        return NextResponse.json({
          installed: true, erpBase: base, rows: out, total, page, size,
          pickers: {
            projects: projects.filter((pr) => perProject.has(String(pr.project_id))).map((pr) => ({ ...pr, boms: perProject.get(String(pr.project_id)) ?? 0 })),
            boms: bomsOut,
          },
          statuses: [...statusSet].sort(),
          lastPulledAt: lastPull?.at ?? null,
        });
      } catch (e) {
        const m = e instanceof Error ? e.message : String((e as { message?: string })?.message || e);
        if (/material_bom_item/i.test(m) && notInstalled(m))
          return NextResponse.json({ error: "Run migration 0121 first — the BOM lines table doesn't exist yet." }, { status: 503 });
        if (notInstalled(m))
          return NextResponse.json({ error: "Run migration 0119 first — Saamaan's project tables don't exist yet." }, { status: 503 });
        throw new Error(m);
      }
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
