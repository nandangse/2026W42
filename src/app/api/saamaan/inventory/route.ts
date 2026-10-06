import { NextResponse } from "next/server";
import { wipKittedTotals } from "@/lib/wip-kitting";
import { readBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireSaamaan } from "@/lib/saamaan";
import {
  correctionsSince, COUNTERS_DEFAULT, erpQtyAtMany, groupCodes, inventoryDashboard, istStamp, itemGroupStock, itemGroupsInMirror,
  mayConsultInventory, mayLeadInventory, mirrorMeta, sample, warehouseBins, warehouseKinds,
} from "@/lib/saamaan-inventory";
import { erpBatchOrSerial, erpCreateStockReco, erpRecoState, erpSubmitStockReco, erpWarehouseBooks } from "@/lib/saamaan-write";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * SAAMAAN → INVENTORY (Dr Raghu, 6 Oct 2026). Internal to Saamaan.
 *
 * GET ?view=dashboard            RM, WIP and total stock today; classes A/B/C
 *     ?view=warehouses           every warehouse holding stock, with its type
 *     ?view=warehouse&wh=        one warehouse's items, live
 *     ?view=meta                 who may count, item groups, Stock warehouses
 *     ?view=counts               the count sheets (mine=1 for my own)
 *     ?view=count&id=            one sheet and its lines
 *     ?view=suspense             the suspense ledger and its releases
 *     ?view=suggestions          Genie's and people's suggestions
 *     ?view=erp_plan&id=         what a submitted sheet would send to the ERP
 *     ?view=itemgroups           every item group: items, at nought, value, average cost
 * POST create_count · save_line · submit_count · cancel_count · erp_draft · erp_submit
 *      release · sync_suspense · suggestion_add · suggestion_update
 */
const S = (v: unknown, n = 400) => String(v ?? "").trim().slice(0, n);
const missing = (m: string) => /material_count|material_suspense|material_inv|schema cache|does not exist/i.test(m);
const notInstalled = () => NextResponse.json({ installed: false, error: "Run migration 0201 first — Inventory has nowhere to keep its counts yet." }, { status: 503 });

/**
 * THE POSTING PLAN — what one submitted sheet would send to the ERP.
 *
 * The ERP gets a Stock Reconciliation, its own document for a physical
 * count, posted FOR the instant the counting began (T = the sheet's
 * earliest count). For each counted line:
 *
 *   variance = on the shelf − the ERP at the moment THAT line was counted
 *              − what people have since explained away by hand (a recount,
 *                a counting slip) in the suspense
 *   posted   = the ERP at T + variance
 *
 * Posting the ERP-at-T plus the variance, not the bare shelf figure, is
 * what keeps the ERP from double-counting: an issue made between T and the
 * moment a line was counted stays where it is, after T, on top of the
 * corrected figure. Back-dated corrections already made in the ERP move
 * both readings together and drop out. A line left blank was never counted
 * and is not in the plan at all.
 */
async function erpPlan(admin: ReturnType<typeof adminClient>, c: Record<string, unknown>, lines: Record<string, unknown>[]) {
  const counted = lines.filter((l) => l.physical_qty !== null && l.physical_qty !== undefined);
  if (!counted.length) return { postingAt: null as string | null, rows: [] as Record<string, unknown>[], ready: 0 };
  const when = (l: Record<string, unknown>) => String(l.counted_at || c.submitted_at || new Date().toISOString());
  const T = counted.map(when).sort()[0];
  const wh = String(c.warehouse);
  const at = await erpQtyAtMany(wh, [...counted.map((l) => ({ code: String(l.item_code), at: when(l) })), ...counted.map((l) => ({ code: String(l.item_code), at: T }))]);
  const ids = counted.map((l) => String(l.id));
  const sus: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await admin.from("material_suspense").select("id, count_line_id").in("count_line_id", ids.slice(i, i + 300));
    sus.push(...((data ?? []) as Record<string, unknown>[]));
  }
  const lineOfSus = new Map(sus.map((x) => [String(x.id), String(x.count_line_id)]));
  const manual = new Map<string, number>();
  const susIds = [...lineOfSus.keys()];
  for (let i = 0; i < susIds.length; i += 300) {
    const { data } = await admin.from("material_suspense_release").select("suspense_id, qty, voucher_no").in("suspense_id", susIds.slice(i, i + 300));
    for (const r of data ?? []) if (!r.voucher_no) { const l = lineOfSus.get(String(r.suspense_id))!; manual.set(l, (manual.get(l) ?? 0) + Number(r.qty || 0)); }
  }
  const batched = await erpBatchOrSerial([...new Set(counted.map((l) => String(l.item_code)))]);
  const rows = counted.map((l) => {
    const code = String(l.item_code);
    const atCount = at.get(`${code}|${when(l)}`) ?? { qty: 0, rate: 0 };
    const atT = at.get(`${code}|${T}`) ?? { qty: 0, rate: 0 };
    const explained = manual.get(String(l.id)) ?? 0;
    const variance = Number(l.physical_qty) - atCount.qty - explained;
    const post = atT.qty + variance;
    const rate = atT.rate || atCount.rate || Number(l.erp_rate) || 0;
    const why = batched.has(code) ? "batch or serial item — count it in the ERP itself"
      : Math.abs(variance) < 1e-9 ? "agrees with the ERP"
      : post < -1e-9 ? "would go below nought at the posting instant — something moved in between; post it by hand"
      : post > 1e-9 && rate <= 0 ? "the ERP has no valuation rate for it — set one first"
      : "";
    return {
      line_id: l.id, item_code: code, item_name: l.item_name, uom: l.uom, location: l.location ?? "",
      physical: Number(l.physical_qty), erp_at_count: atCount.qty, explained, variance, erp_at_post: atT.qty, post, rate, value: variance * rate,
      ok: !why, why,
    };
  });
  return { postingAt: T, rows, ready: rows.filter((r) => r.ok).length };
}

export async function GET(req: Request) {
  try {
    const me = await requireSaamaan();
    const admin = adminClient();
    const p = new URL(req.url).searchParams;
    const view = p.get("view") || "dashboard";

    if (view === "dashboard") {
      /* the WIP's kitted value, theory and actual, beside the ERP's WIP
         warehouses — a failure here never blanks the rest of the page */
      const [d, kitted] = await Promise.all([inventoryDashboard(admin), wipKittedTotals(admin).catch(() => null)]);
      return NextResponse.json({ ok: true, ...d, kitted });
    }

    if (view === "warehouses") {
      const d = await inventoryDashboard(admin);
      return NextResponse.json({ ok: true, readAt: d.readAt, warehouses: d.warehouses });
    }

    if (view === "warehouse") {
      const wh = S(p.get("wh"), 200);
      if (!wh) throw new HttpError(400, "Which warehouse?");
      return NextResponse.json({ ok: true, warehouse: wh, rows: await warehouseBins(admin, wh) });
    }

    if (view === "meta") {
      const [kinds, groups, access, profiles] = await Promise.all([
        warehouseKinds(admin), itemGroupsInMirror(admin),
        admin.from("material_access").select("email"),
        admin.from("profiles").select("email, display_name, disabled"),
      ]);
      const name = new Map((profiles.data ?? []).filter((x) => !x.disabled).map((x) => [String(x.email).toLowerCase(), String(x.display_name || "") || String(x.email).split("@")[0]]));
      const emails = new Set<string>([...COUNTERS_DEFAULT.map((h) => h.email), ...(access.data ?? []).map((a) => String(a.email).toLowerCase())]);
      const people = [...emails].filter((e) => name.has(e) || COUNTERS_DEFAULT.some((h) => h.email === e))
        .map((e) => ({ email: e, name: name.get(e) || COUNTERS_DEFAULT.find((h) => h.email === e)?.name || e.split("@")[0], store: COUNTERS_DEFAULT.some((h) => h.email === e) }))
        .sort((a, b) => Number(b.store) - Number(a.store) || a.name.localeCompare(b.name));
      return NextResponse.json({
        ok: true, people, groups,
        warehouses: [...kinds.entries()].map(([w, k]) => ({ warehouse: w, kind: k.kind })).sort((a, b) => (a.kind === "Stock" ? 0 : 1) - (b.kind === "Stock" ? 0 : 1) || a.warehouse.localeCompare(b.warehouse)),
        me: { email: me.email, lead: mayLeadInventory(me.email, me.isOwner), consult: mayConsultInventory(me.email, me.isOwner) },
      });
    }

    if (view === "counts") {
      let q = admin.from("material_count").select("*").order("created_at", { ascending: false }).limit(300);
      if (p.get("mine") === "1" || !mayLeadInventory(me.email, me.isOwner)) q = q.eq("assigned_email", me.email.toLowerCase());
      const { data, error } = await q;
      if (error) { if (missing(error.message)) return notInstalled(); throw new Error(error.message); }
      const ids = (data ?? []).map((c) => c.id);
      const stats = new Map<string, { lines: number; counted: number; variances: number; value: number }>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data: ls } = await admin.from("material_count_line").select("count_id, physical_qty, erp_qty, erp_qty_at_count, erp_rate").in("count_id", ids.slice(i, i + 200));
        for (const l of ls ?? []) {
          const s = stats.get(l.count_id) ?? stats.set(l.count_id, { lines: 0, counted: 0, variances: 0, value: 0 }).get(l.count_id)!;
          s.lines++;
          if (l.physical_qty !== null) {
            s.counted++;
            const v = Number(l.physical_qty) - Number(l.erp_qty_at_count ?? l.erp_qty ?? 0);
            if (Math.abs(v) > 1e-9) { s.variances++; s.value += v * (Number(l.erp_rate) || 0); }
          }
        }
      }
      return NextResponse.json({ ok: true, counts: (data ?? []).map((c) => ({ ...c, ...(stats.get(c.id) ?? { lines: 0, counted: 0, variances: 0, value: 0 }) })) });
    }

    if (view === "count") {
      const id = S(p.get("id"), 64);
      const { data: c, error } = await admin.from("material_count").select("*").eq("id", id).maybeSingle();
      if (error) { if (missing(error.message)) return notInstalled(); throw new Error(error.message); }
      if (!c) throw new HttpError(404, "No such count sheet.");
      if (c.assigned_email !== me.email.toLowerCase() && !mayLeadInventory(me.email, me.isOwner)) throw new HttpError(403, "That sheet is somebody else's.");
      const { data: lines } = await admin.from("material_count_line").select("*").eq("count_id", id).order("item_code");
      /* "always make sure that the valuation-wise highest values are always
         on the top so that they are always counted … Do not show the
         valuation on the physical counting; otherwise, it will tend to bias
         the person" (Dr Raghu, 6 Oct 2026). Highest ERP value first; while
         the sheet is open the rate never leaves the server. */
      const worth = (l: Record<string, unknown>) => Number(l.erp_qty || 0) * Number(l.erp_rate || 0);
      const sorted = [...(lines ?? [])].sort((a, b) => worth(b) - worth(a) || String(a.item_code).localeCompare(String(b.item_code)));
      const blind = c.status === "open";
      let erpLog: unknown[] = [];
      if (c.erp_reco || c.status === "submitted") { const { data } = await admin.from("material_count_erp").select("*").eq("count_id", id).order("at", { ascending: false }).limit(20); erpLog = data ?? []; }
      return NextResponse.json({
        ok: true, count: c, blind, erpLog, lead: mayLeadInventory(me.email, me.isOwner),
        lines: blind ? sorted.map((l) => ({ ...l, erp_rate: null })) : sorted,
        canEdit: c.status === "open" && (c.assigned_email === me.email.toLowerCase() || mayLeadInventory(me.email, me.isOwner)),
      });
    }

    if (view === "erp_plan") {
      if (!mayLeadInventory(me.email, me.isOwner)) throw new HttpError(403, "That is for Mukesh, Rameez or Dr Raghu.");
      const id = S(p.get("id"), 64);
      const { data: c } = await admin.from("material_count").select("*").eq("id", id).maybeSingle();
      if (!c) throw new HttpError(404, "No such count sheet.");
      if (c.status !== "submitted") throw new HttpError(409, "Submit the sheet first — only a submitted count goes to the ERP.");
      const { data: lines } = await admin.from("material_count_line").select("*").eq("count_id", id);
      return NextResponse.json({ ok: true, ...(await erpPlan(admin, c, lines ?? [])), erp_reco: c.erp_reco, erp_reco_state: c.erp_reco_state });
    }

    /* one item's on-the-fly counts, newest first — for the PI lightbox */
    if (view === "item_pi") {
      const code = S(p.get("code"), 80);
      const { data, error } = await admin.from("material_count_line").select("id, count_id, warehouse, physical_qty, erp_qty_at_count, location, remark, counted_by, counted_at")
        .eq("item_code", code).not("physical_qty", "is", null).order("counted_at", { ascending: false }).limit(15);
      if (error) { if (missing(error.message)) return notInstalled(); throw new Error(error.message); }
      return NextResponse.json({ ok: true, lines: data ?? [] });
    }

    if (view === "itemgroups") {
      return NextResponse.json({ ok: true, groups: await itemGroupStock(admin), readAt: new Date().toISOString() });
    }

    if (view === "suspense") {
      const { data, error } = await admin.from("material_suspense").select("*").order("opened_at", { ascending: false }).limit(2000);
      if (error) { if (missing(error.message)) return notInstalled(); throw new Error(error.message); }
      const ids = (data ?? []).map((s) => s.id);
      const rel: Record<string, unknown>[] = [];
      for (let i = 0; i < ids.length; i += 300) {
        const { data: r } = await admin.from("material_suspense_release").select("*").in("suspense_id", ids.slice(i, i + 300)).order("at");
        rel.push(...(r ?? []));
      }
      return NextResponse.json({ ok: true, suspense: data ?? [], releases: rel });
    }

    if (view === "suggestions") {
      const { data, error } = await admin.from("material_inv_suggestion").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) { if (missing(error.message)) return notInstalled(); throw new Error(error.message); }
      return NextResponse.json({ ok: true, suggestions: data ?? [] });
    }

    throw new HttpError(400, `Unknown view "${view}"`);
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await requireSaamaan();
    const admin = adminClient();
    const b = await readBody(req, {});
    const action = S(b.action, 40);
    const lead = mayLeadInventory(me.email, me.isOwner);
    const now = new Date().toISOString();
    const needLead = () => { if (!lead) throw new HttpError(403, "That is for Mukesh, Rameez or Dr Raghu."); };
    const fail = (m: string) => { throw new HttpError(missing(m) ? 503 : 500, missing(m) ? "Run migration 0201 first." : m); };

    /* ---- a count sheet: random N in one location, or a whole item group ---- */
    if (action === "create_count") {
      needLead();
      const kind = S(b.kind) === "group" ? "group" : "random";
      const warehouse = S(b.warehouse, 200);
      const who = S(b.assigned_email, 120).toLowerCase();
      if (!warehouse || !who) throw new HttpError(400, "A location and a person.");
      const n = Math.max(5, Math.min(50, Number(b.n) || 10));
      /* SEVERAL GROUPS ON ONE SHEET (Dr Raghu, 6 Oct 2026: "in item groups,
         let us choose multiple so that they all come in there") */
      const groups = [...new Set((Array.isArray(b.item_groups) ? (b.item_groups as unknown[]) : [b.item_group]).map((g) => S(g, 200)).filter(Boolean))].slice(0, 30);
      const group = groups.join(" + ");
      if (kind === "group" && !groups.length) throw new HttpError(400, "Which item group?");
      const bins = await warehouseBins(admin, warehouse, 20000);
      let pick = bins.filter((x) => x.qty > 0);
      if (kind === "group") {
        const inGroup = new Set((await Promise.all(groups.map((g) => groupCodes(admin, g)))).flat());
        pick = pick.filter((x) => inGroup.has(x.item_code));
        if (!pick.length) throw new HttpError(400, `Nothing of ${groups.length === 1 ? group : "those groups"} is on the ERP's books in ${warehouse}.`);
        if (pick.length > 600) throw new HttpError(400, `That is ${pick.length} items in ${warehouse} — more than one person counts on one sheet. Choose fewer groups (600 at most).`);
      } else {
        if (!pick.length) throw new HttpError(400, `${warehouse} holds nothing on the ERP's books.`);
        pick = sample(pick, n);
      }
      /* highest value first, so the sheet is counted from the top down */
      pick = [...pick].sort((a, b) => b.value - a.value);
      /* where each item was last found in this warehouse, carried onto the new sheet */
      const lastAt = new Map<string, string>();
      try {
        const codes = pick.map((x) => x.item_code);
        for (let i = 0; i < codes.length; i += 300) {
          const { data } = await admin.from("material_count_line").select("item_code, location, counted_at").eq("warehouse", warehouse).in("item_code", codes.slice(i, i + 300)).neq("location", "").order("counted_at", { ascending: true });
          for (const r of data ?? []) lastAt.set(String(r.item_code), String(r.location));
        }
      } catch { /* pre-0203: no locations yet */ }
      const { data: c, error } = await admin.from("material_count").insert({
        kind, warehouse, item_group: kind === "group" ? group : null, assigned_email: who, assigned_name: S(b.assigned_name, 120),
        title: S(b.title, 200) || (kind === "group" ? `${groups.length > 2 ? `${groups.slice(0, 2).join(" + ")} + ${groups.length - 2} more` : group} · ${warehouse}`.slice(0, 200) : `Random ${pick.length} · ${warehouse}`),
        due_on: /^\d{4}-\d{2}-\d{2}$/.test(S(b.due_on, 10)) ? S(b.due_on, 10) : null, created_by: me.email, note: S(b.note, 1000),
      }).select("id").single();
      if (error) fail(error.message);
      const { error: e2 } = await admin.from("material_count_line").insert(pick.map((x) => ({
        count_id: c!.id, item_code: x.item_code, item_name: x.item_name, item_group: x.item_group, uom: x.uom, warehouse, erp_qty: x.qty, erp_rate: x.rate,
        ...(lastAt.get(x.item_code) ? { location: lastAt.get(x.item_code) } : {}),
      })));
      if (e2) fail(e2.message);
      return NextResponse.json({ ok: true, id: c!.id, lines: pick.length });
    }

    /* ---- the counter's entry: what is on the shelf, and why it differs ---- */
    if (action === "save_line") {
      const id = S(b.line_id, 64);
      const { data: l } = await admin.from("material_count_line").select("id, count_id").eq("id", id).maybeSingle();
      if (!l) throw new HttpError(404, "No such line.");
      const { data: c } = await admin.from("material_count").select("status, assigned_email").eq("id", l.count_id).maybeSingle();
      if (!c || c.status !== "open") throw new HttpError(409, "This sheet is closed.");
      if (c.assigned_email !== me.email.toLowerCase() && !lead) throw new HttpError(403, "This sheet is somebody else's to count.");
      /* "make the location" (Dr Raghu, 6 Oct 2026) — rack, bin or bay where it was found; saved on its own */
      if ("location" in b && !("physical_qty" in b)) {
        const { error } = await admin.from("material_count_line").update({ location: S(b.location, 120) }).eq("id", id);
        if (error) throw new HttpError(missing(error.message) || /location/.test(error.message) ? 503 : 500, /location/.test(error.message) ? "Run migration 0203 first — the location has nowhere to live yet." : error.message);
        return NextResponse.json({ ok: true });
      }
      const raw = b.physical_qty;
      const qty = raw === null || raw === "" || raw === undefined ? null : Number(raw);
      if (qty !== null && (!Number.isFinite(qty) || qty < 0)) throw new HttpError(400, "A count is a number, nought or more.");
      /* a cleared box is no count at all — no counter, no time */
      const { error } = await admin.from("material_count_line").update(qty === null
        ? { physical_qty: null, remark: S(b.remark, 1000), counted_by: null, counted_at: null }
        : { physical_qty: qty, remark: S(b.remark, 1000), counted_by: me.email, counted_at: now }).eq("id", id);
      if (error) fail(error.message);
      return NextResponse.json({ ok: true });
    }

    /* ---- submit: the ERP is read again, the variance fixed, the suspense opened ---- */
    if (action === "submit_count") {
      const id = S(b.id, 64);
      const { data: c } = await admin.from("material_count").select("*").eq("id", id).maybeSingle();
      if (!c) throw new HttpError(404, "No such count sheet.");
      if (c.status !== "open") throw new HttpError(409, "Already submitted.");
      if (c.assigned_email !== me.email.toLowerCase() && !lead) throw new HttpError(403, "This sheet is somebody else's.");
      const { data: lines } = await admin.from("material_count_line").select("*").eq("count_id", id);
      /* "if he leaves it blank, ignore it. There will be no suspense entry
         made, or a consumption entry made, or an addition entry made for
         that" (Dr Raghu, 6 Oct 2026) — a blank line is simply not counted;
         it stays on the sheet as "not counted" and goes nowhere */
      const counted = (lines ?? []).filter((l) => l.physical_qty !== null);
      if (!counted.length) throw new HttpError(400, "Nothing on this sheet is counted yet — put in at least one figure. A nought is a count; a blank is not.");
      /* the ERP at the moment each line was counted, not at the moment of submitting */
      const at = await erpQtyAtMany(c.warehouse, counted.map((l) => ({ code: l.item_code, at: l.counted_at || now })));
      const suspense: Record<string, unknown>[] = [];
      for (const l of counted) {
        const erp = at.get(`${l.item_code}|${l.counted_at || now}`) ?? { qty: 0, rate: 0 };
        await admin.from("material_count_line").update({ erp_qty_at_count: erp.qty, erp_rate: erp.rate || l.erp_rate }).eq("id", l.id);
        const v = Number(l.physical_qty) - erp.qty;
        if (Math.abs(v) > 1e-9) suspense.push({
          item_code: l.item_code, item_name: l.item_name, uom: l.uom, warehouse: c.warehouse, qty: v, rate: erp.rate || l.erp_rate,
          counted_at: l.counted_at || now, count_line_id: l.id, remark: l.remark, opened_by: me.email,
        });
      }
      if (suspense.length) { const { error } = await admin.from("material_suspense").insert(suspense); if (error) fail(error.message); }
      await admin.from("material_count").update({ status: "submitted", submitted_at: now, submitted_by: me.email }).eq("id", id);
      return NextResponse.json({ ok: true, variances: suspense.length, counted: counted.length, skipped: (lines ?? []).length - counted.length });
    }

    /* ---- PI ON THE FLY (Dr Raghu, 6 Oct 2026: "one button … called PI,
       which will create an on-the-fly physical inventory item. Whenever
       anybody is referring to any item, they can at least update it and
       keep updating it.") Anybody in Saamaan, from the item itself: one
       line, counted and submitted at once — a one-line sheet like any other,
       so its variance goes to suspense and a lead can post it to the ERP. */
    if (action === "pi_quick") {
      const code = S(b.item_code, 80), warehouse = S(b.warehouse, 200);
      const qty = Number(b.physical_qty);
      if (!code || !warehouse) throw new HttpError(400, "Which item, and where?");
      if (b.physical_qty === "" || b.physical_qty === null || !Number.isFinite(qty) || qty < 0) throw new HttpError(400, "What is on the shelf — a number, nought or more.");
      const { data: wh } = await admin.from("material_warehouse").select("warehouse, kind").eq("warehouse", warehouse).maybeSingle();
      if (!wh) throw new HttpError(400, `${warehouse} is not a warehouse the ERP has.`);
      const { data: it } = await admin.from("material_item").select("item_name, item_group, stock_uom").eq("item_code", code).maybeSingle();
      const erp = (await erpQtyAtMany(warehouse, [{ code, at: now }])).get(`${code}|${now}`) ?? { qty: 0, rate: 0 };
      const { data: c, error } = await admin.from("material_count").insert({
        kind: "random", warehouse, title: `PI · ${code} · ${warehouse}`.slice(0, 200), assigned_email: me.email.toLowerCase(), assigned_name: S(b.assigned_name, 120),
        status: "submitted", submitted_at: now, submitted_by: me.email, created_by: me.email, note: "on the fly, from the item",
      }).select("id").single();
      if (error) fail(error.message);
      const { data: line, error: e2 } = await admin.from("material_count_line").insert({
        count_id: c!.id, item_code: code, item_name: S(it?.item_name), item_group: S(it?.item_group), uom: S(it?.stock_uom), warehouse,
        erp_qty: erp.qty, erp_rate: erp.rate, erp_qty_at_count: erp.qty, physical_qty: qty, remark: S(b.remark, 1000), location: S(b.location, 120),
        counted_by: me.email, counted_at: now,
      }).select("id").single();
      if (e2) fail(e2.message);
      const v = qty - erp.qty;
      if (Math.abs(v) > 1e-9) {
        const { error: e3 } = await admin.from("material_suspense").insert({
          item_code: code, item_name: S(it?.item_name), uom: S(it?.stock_uom), warehouse, qty: v, rate: erp.rate,
          counted_at: now, count_line_id: line!.id, remark: S(b.remark, 1000), opened_by: me.email,
        });
        if (e3) fail(e3.message);
      }
      return NextResponse.json({ ok: true, id: c!.id, erp: erp.qty, variance: v });
    }

    /* ---- the count to the ERP: a DRAFT Stock Reconciliation first ---- */
    if (action === "erp_draft") {
      needLead();
      const id = S(b.id, 64);
      const { data: c } = await admin.from("material_count").select("*").eq("id", id).maybeSingle();
      if (!c) throw new HttpError(404, "No such count sheet.");
      if (c.status !== "submitted") throw new HttpError(409, "Submit the sheet first — only a submitted count goes to the ERP.");
      if (c.erp_reco) {
        const st = await erpRecoState(String(c.erp_reco));
        if (st === 0 || st === 1) throw new HttpError(409, `${c.erp_reco} already carries this sheet (${st === 0 ? "a draft" : "submitted"}).`);
      }
      const { data: lines } = await admin.from("material_count_line").select("*").eq("count_id", id);
      const plan = await erpPlan(admin, c, lines ?? []);
      const go = plan.rows.filter((r) => r.ok);
      if (!go.length) throw new HttpError(400, "Nothing on this sheet differs from the ERP in a way that can be posted — see the reasons on each line.");
      const stamp = istStamp(String(plan.postingAt));
      let name = "";
      try {
        const books = await erpWarehouseBooks(String(c.warehouse));
        name = await erpCreateStockReco({ ...books, posting_date: stamp.date, posting_time: stamp.time,
          lines: go.map((r) => ({ item_code: String(r.item_code), warehouse: String(c.warehouse), qty: Number(r.post), valuation_rate: Number(r.rate) })) });
      } catch (e) {
        await admin.from("material_count_erp").insert({ count_id: id, action: "refused", lines: go.length, answer: e instanceof Error ? e.message : String(e), by_email: me.email });
        throw e;
      }
      await admin.from("material_count").update({ erp_reco: name, erp_reco_state: "draft", erp_reco_by: me.email, erp_reco_at: now, erp_posting_at: plan.postingAt }).eq("id", id);
      await admin.from("material_count_line").update({ posted_qty: null }).eq("count_id", id);
      for (const r of go) await admin.from("material_count_line").update({ posted_qty: r.post }).eq("id", String(r.line_id));
      await admin.from("material_count_erp").insert({ count_id: id, action: "draft", voucher: name, lines: go.length, answer: `draft made, posted for ${stamp.date} ${stamp.time} IST`, by_email: me.email });
      return NextResponse.json({ ok: true, voucher: name, lines: go.length });
    }

    /* ---- …then submitted from Genie, and the suspense on those lines closed by it ---- */
    if (action === "erp_submit") {
      needLead();
      const id = S(b.id, 64);
      const { data: c } = await admin.from("material_count").select("*").eq("id", id).maybeSingle();
      if (!c?.erp_reco) throw new HttpError(409, "There is no draft in the ERP for this sheet yet.");
      const name = String(c.erp_reco);
      const st = await erpRecoState(name);
      if (st === null || st === 2) {
        await admin.from("material_count").update({ erp_reco: null, erp_reco_state: null }).eq("id", id);
        await admin.from("material_count_line").update({ posted_qty: null }).eq("count_id", id);
        throw new HttpError(409, `${name} is ${st === 2 ? "cancelled" : "gone"} in the ERP — make a fresh draft.`);
      }
      if (st === 0) {
        try { await erpSubmitStockReco(name); }
        catch (e) { await admin.from("material_count_erp").insert({ count_id: id, action: "refused", voucher: name, answer: e instanceof Error ? e.message : String(e), by_email: me.email }); throw e; }
      }
      const { data: posted } = await admin.from("material_count_line").select("id").eq("count_id", id).not("posted_qty", "is", null);
      const lineIds = (posted ?? []).map((l) => String(l.id));
      let closed = 0;
      for (let i = 0; i < lineIds.length; i += 300) {
        const { data: open } = await admin.from("material_suspense").select("*").in("count_line_id", lineIds.slice(i, i + 300)).eq("status", "open");
        for (const x of open ?? []) {
          const left = Number(x.qty) - Number(x.released_qty);
          if (Math.abs(left) < 1e-9) continue;
          const { error } = await admin.from("material_suspense_release").insert({ suspense_id: x.id, qty: left, reason: "Posted to the ERP", voucher_type: "Stock Reconciliation", voucher_no: name, note: "the counted figure, put into the ERP from the count sheet", by_email: me.email });
          if (error) continue;
          await admin.from("material_suspense").update({ released_qty: Number(x.qty), status: "released", synced_at: now }).eq("id", x.id);
          closed++;
        }
      }
      await admin.from("material_count").update({ erp_reco_state: "submitted" }).eq("id", id);
      await admin.from("material_count_erp").insert({ count_id: id, action: "submit", voucher: name, lines: lineIds.length, answer: `submitted; ${closed} suspense entr${closed === 1 ? "y" : "ies"} closed by it`, by_email: me.email });
      return NextResponse.json({ ok: true, voucher: name, closed });
    }

    if (action === "cancel_count") {
      needLead();
      await admin.from("material_count").update({ status: "cancelled" }).eq("id", S(b.id, 64)).eq("status", "open");
      return NextResponse.json({ ok: true });
    }

    /* ---- a person explains part of a suspense ---- */
    if (action === "release") {
      needLead();
      const id = S(b.suspense_id, 64);
      const { data: s } = await admin.from("material_suspense").select("*").eq("id", id).maybeSingle();
      if (!s || s.status !== "open") throw new HttpError(404, "No open suspense by that id.");
      const open = Number(s.qty) - Number(s.released_qty);
      const want = Math.abs(Number(b.qty) || 0);
      if (!want) throw new HttpError(400, "How much is explained?");
      const qty = Math.sign(open) * Math.min(want, Math.abs(open));
      const reason = S(b.reason, 60) || "Other";
      const { error } = await admin.from("material_suspense_release").insert({ suspense_id: id, qty, reason, voucher_type: S(b.voucher_type, 60) || null, voucher_no: S(b.voucher_no, 80) || null, note: S(b.note, 1000), by_email: me.email });
      if (error) fail(error.message);
      const rel = Number(s.released_qty) + qty;
      await admin.from("material_suspense").update({ released_qty: rel, status: Math.abs(Number(s.qty) - rel) < 1e-9 ? "released" : "open" }).eq("id", id);
      return NextResponse.json({ ok: true, released: qty });
    }

    /* ---- the ERP explains it: back-dated corrections and reconciliations ---- */
    if (action === "sync_suspense") {
      needLead();
      let q = admin.from("material_suspense").select("*").eq("status", "open").limit(200);
      if (S(b.id, 64)) q = q.eq("id", S(b.id, 64));
      const { data: open, error } = await q;
      if (error) fail(error.message);
      let released = 0, touched = 0;
      for (const s of open ?? []) {
        const { data: already } = await admin.from("material_suspense_release").select("voucher_no").eq("suspense_id", s.id);
        const seen = new Set((already ?? []).map((r) => String(r.voucher_no || "")));
        let left = Number(s.qty) - Number(s.released_qty);
        for (const c of await correctionsSince(s.item_code, s.warehouse, String(s.counted_at))) {
          if (Math.abs(left) < 1e-9 || seen.has(c.voucher_no)) continue;
          /* only a movement in the direction that closes the gap releases it */
          if (Math.sign(c.qty) !== Math.sign(left)) continue;
          const take = Math.sign(left) * Math.min(Math.abs(c.qty), Math.abs(left));
          const { error: e2 } = await admin.from("material_suspense_release").insert({
            suspense_id: s.id, qty: take, reason: "ERP corrected", voucher_type: c.voucher_type, voucher_no: c.voucher_no,
            note: `${c.voucher_type} ${c.voucher_no}, posted for ${c.posting_date}`, by_email: "sync@genie",
          });
          if (e2) continue;
          left -= take; released++; seen.add(c.voucher_no);
        }
        const rel = Number(s.qty) - left;
        await admin.from("material_suspense").update({ released_qty: rel, status: Math.abs(left) < 1e-9 ? "released" : "open", synced_at: now }).eq("id", s.id);
        touched++;
      }
      return NextResponse.json({ ok: true, checked: touched, releases: released });
    }

    /* ---- suggestions ---- */
    if (action === "suggestion_add") {
      const title = S(b.title, 200);
      if (title.length < 3) throw new HttpError(400, "A suggestion in a line, please.");
      const { error } = await admin.from("material_inv_suggestion").insert({ title, body: S(b.body, 4000), source: "person", priority: ["high", "normal", "low"].includes(S(b.priority)) ? S(b.priority) : "normal", owner_email: S(b.owner_email, 120) || null, by_email: me.email });
      if (error) fail(error.message);
      return NextResponse.json({ ok: true });
    }
    if (action === "suggestion_update") {
      const patch: Record<string, unknown> = { updated_at: now };
      if (["open", "doing", "done", "dismissed"].includes(S(b.status))) patch.status = S(b.status);
      if ("owner_email" in b) patch.owner_email = S(b.owner_email, 120) || null;
      if ("note" in b) patch.note = S(b.note, 2000);
      const { error } = await admin.from("material_inv_suggestion").update(patch).eq("id", S(b.id, 64));
      if (error) fail(error.message);
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, `Unknown action "${action}"`);
  } catch (e) { return errJson(e); }
}

void mirrorMeta;
