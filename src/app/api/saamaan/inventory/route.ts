import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireSaamaan } from "@/lib/saamaan";
import {
  binsNow, correctionsSince, COUNTERS_DEFAULT, groupCodes, inventoryDashboard, itemGroupsInMirror, mayConsultInventory,
  mayLeadInventory, mirrorMeta, sample, warehouseBins, warehouseKinds,
} from "@/lib/saamaan-inventory";

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
 * POST create_count · save_line · submit_count · cancel_count
 *      release · sync_suspense · suggestion_add · suggestion_update
 */
const S = (v: unknown, n = 400) => String(v ?? "").trim().slice(0, n);
const missing = (m: string) => /material_count|material_suspense|material_inv|schema cache|does not exist/i.test(m);
const notInstalled = () => NextResponse.json({ installed: false, error: "Run migration 0201 first — Inventory has nowhere to keep its counts yet." }, { status: 503 });

export async function GET(req: Request) {
  try {
    const me = await requireSaamaan();
    const admin = adminClient();
    const p = new URL(req.url).searchParams;
    const view = p.get("view") || "dashboard";

    if (view === "dashboard") return NextResponse.json({ ok: true, ...(await inventoryDashboard(admin)) });

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
      return NextResponse.json({ ok: true, count: c, lines: lines ?? [], canEdit: c.status === "open" && (c.assigned_email === me.email.toLowerCase() || mayLeadInventory(me.email, me.isOwner)) });
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
      const group = S(b.item_group, 200);
      if (kind === "group" && !group) throw new HttpError(400, "Which item group?");
      const bins = await warehouseBins(admin, warehouse, 20000);
      let pick = bins.filter((x) => x.qty > 0);
      if (kind === "group") {
        const inGroup = new Set(await groupCodes(admin, group));
        pick = pick.filter((x) => inGroup.has(x.item_code)).slice(0, 300);
        if (!pick.length) throw new HttpError(400, `Nothing of ${group} is on the ERP's books in ${warehouse}.`);
      } else {
        if (!pick.length) throw new HttpError(400, `${warehouse} holds nothing on the ERP's books.`);
        pick = sample(pick, n);
      }
      const { data: c, error } = await admin.from("material_count").insert({
        kind, warehouse, item_group: kind === "group" ? group : null, assigned_email: who, assigned_name: S(b.assigned_name, 120),
        title: S(b.title, 200) || (kind === "group" ? `${group} · ${warehouse}` : `Random ${pick.length} · ${warehouse}`),
        due_on: /^\d{4}-\d{2}-\d{2}$/.test(S(b.due_on, 10)) ? S(b.due_on, 10) : null, created_by: me.email, note: S(b.note, 1000),
      }).select("id").single();
      if (error) fail(error.message);
      const { error: e2 } = await admin.from("material_count_line").insert(pick.map((x) => ({
        count_id: c!.id, item_code: x.item_code, item_name: x.item_name, item_group: x.item_group, uom: x.uom, warehouse, erp_qty: x.qty, erp_rate: x.rate,
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
      const raw = b.physical_qty;
      const qty = raw === null || raw === "" || raw === undefined ? null : Number(raw);
      if (qty !== null && (!Number.isFinite(qty) || qty < 0)) throw new HttpError(400, "A count is a number, nought or more.");
      const { error } = await admin.from("material_count_line").update({ physical_qty: qty, remark: S(b.remark, 1000), counted_by: me.email, counted_at: now }).eq("id", id);
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
      const blank = (lines ?? []).filter((l) => l.physical_qty === null);
      if (blank.length) throw new HttpError(400, `${blank.length} item${blank.length === 1 ? "" : "s"} not counted yet — a nought is a count; a blank is not.`);
      /* the ERP at the moment of submission, closest to the moment of counting */
      const nowBins = await binsNow(c.warehouse, (lines ?? []).map((l) => l.item_code));
      const suspense: Record<string, unknown>[] = [];
      for (const l of lines ?? []) {
        const erp = nowBins.get(l.item_code) ?? { qty: 0, rate: 0 };
        await admin.from("material_count_line").update({ erp_qty_at_count: erp.qty, erp_rate: erp.rate || l.erp_rate }).eq("id", l.id);
        const v = Number(l.physical_qty) - erp.qty;
        if (Math.abs(v) > 1e-9) suspense.push({
          item_code: l.item_code, item_name: l.item_name, uom: l.uom, warehouse: c.warehouse, qty: v, rate: erp.rate || l.erp_rate,
          counted_at: l.counted_at || now, count_line_id: l.id, remark: l.remark, opened_by: me.email,
        });
      }
      if (suspense.length) { const { error } = await admin.from("material_suspense").insert(suspense); if (error) fail(error.message); }
      await admin.from("material_count").update({ status: "submitted", submitted_at: now, submitted_by: me.email }).eq("id", id);
      return NextResponse.json({ ok: true, variances: suspense.length });
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
