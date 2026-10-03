import { NextResponse } from "next/server";
import { readBody, type AnyBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireSaamaan } from "@/lib/saamaan";
import { liveStock, consumption } from "@/lib/saamaan-stock";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * MRP AS PER REORDER LEVEL — THE KANBAN (Dr Raghu, 3 Oct 2026).
 *
 * "For Class C items, for example bolt, nut, and small small items … at any
 * point in time we keep a reorder level … based on the consumption of the
 * last 6 months … dynamic buffer management … it can get better and better."
 *
 * The buffer is the reorder level. It is cut in three: below a third is RED
 * (order now), the middle third YELLOW (watch), above two-thirds GREEN. DBM
 * is the plain rule: a buffer that has sat in red for two runs running was
 * too small, so it grows by a third; one that has sat green with nothing on
 * order for three runs was too big, so it shrinks by a third — never below
 * half a month's consumption. A buffer somebody TYPED is never moved by the
 * rule; the rule's own number is written beside it as a suggestion.
 *
 * The first buffer, for an item nobody has typed, is one month's
 * consumption ("it will actually predict in 1 month how much of that item
 * has been consumed. That will then be the reorder level") — or the ERP's
 * own reorder level where the item has one and it is the larger.
 *
 * The BOM still wins for the big draws: a job needing 2,000 bolts shows on
 * the MRP run as short against stock, as it always did. The Kanban is for
 * the 200 that must always be on the shelf.
 */
type Doc = Record<string, unknown>;
const S = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const N = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

const zoneOf = (stock: number | null, buffer: number): "red" | "yellow" | "green" | "" => {
  if (stock === null || buffer <= 0) return "";
  if (stock < buffer / 3) return "red";
  if (stock < (2 * buffer) / 3) return "yellow";
  return "green";
};

async function allKanban(admin: ReturnType<typeof adminClient>): Promise<Doc[]> {
  const rows: Doc[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await admin.from("material_kanban").select("*").eq("active", true).order("item_code").range(a, a + 999);
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) throw new HttpError(503, "Run migration 0193 first — the Kanban tables don't exist yet.");
      throw new Error(error.message);
    }
    rows.push(...((data ?? []) as Doc[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function itemsOf(admin: ReturnType<typeof adminClient>, codes: string[]): Promise<Map<string, Doc>> {
  const m = new Map<string, Doc>();
  for (let i = 0; i < codes.length; i += 500) {
    const { data } = await admin.from("material_item").select("item_code, item_name, item_group, custom_item_class, stock_uom, last_purchase_rate, valuation_rate, lead_time_days, children").in("item_code", codes.slice(i, i + 500));
    for (const it of (data ?? []) as Doc[]) m.set(S(it.item_code), it);
  }
  return m;
}
const rateOf = (it: Doc | undefined) => (it ? (N(it.last_purchase_rate) || N(it.valuation_rate) || null) : null);
const erpReorder = (it: Doc | undefined): number => {
  const rows = ((it?.children as Doc | undefined)?.reorder_levels as Doc[] | undefined) ?? [];
  return rows.reduce((a, r) => a + (Number(r.warehouse_reorder_level) || 0), 0);
};

async function cap(admin: ReturnType<typeof adminClient>): Promise<number> {
  const { data } = await admin.from("material_setting").select("value").eq("key", "kanban_cap").maybeSingle();
  return Number(data?.value) || 10000000;
}

/** The screen's whole picture: every Kanban item with the item master, stock as last read, zone, to-order. */
async function picture(admin: ReturnType<typeof adminClient>, live: boolean) {
  const rows = await allKanban(admin);
  const codes = rows.map((r) => S(r.item_code));
  const items = await itemsOf(admin, codes);
  const stock = live ? await liveStock(admin, codes) : null;
  const out = rows.map((r) => {
    const it = items.get(S(r.item_code));
    const st = stock?.get(S(r.item_code));
    const stockQty = st ? st.stock - st.blocked : N(r.stock);
    const ordered = st ? st.ordered : N(r.ordered);
    const buffer = Number(r.buffer_qty) || 0;
    const reorder = Number(r.reorder_qty) || 0;
    const rate = rateOf(it) ?? N(r.rate);
    const zone = zoneOf(stockQty, buffer);
    /* what to order: back up to the buffer, counting what is already on order; at least the reorder quantity when one is set */
    const gap = stockQty === null ? 0 : Math.max(0, buffer - stockQty - (ordered ?? 0));
    const toOrder = zone === "red" || zone === "yellow" ? (gap > 0 ? Math.max(gap, reorder) : 0) : 0;
    return {
      item_code: S(r.item_code), item_name: S(it?.item_name), item_group: S(it?.item_group), item_class: S(it?.custom_item_class), uom: S(it?.stock_uom),
      lead_days: N(it?.lead_time_days), erp_reorder: erpReorder(it),
      buffer, reorder, basis: S(r.basis), consumption_6m: N(r.consumption_6m), monthly_avg: N(r.monthly_avg), months_seen: N(r.months_seen),
      stock: stockQty, ordered, rate, zone, to_order: toOrder, to_order_value: rate === null ? null : toOrder * rate, buffer_value: rate === null ? null : buffer * rate, stock_value: rate === null || stockQty === null ? null : stockQty * rate,
      dbm_at: r.dbm_at ?? null, dbm_note: S(r.dbm_note), note: S(r.note), red_runs: Number(r.red_runs) || 0, green_runs: Number(r.green_runs) || 0, updated_by: S(r.updated_by),
    };
  });
  const sum = (k: "buffer_value" | "stock_value" | "to_order_value") => out.reduce((a, r) => a + (r[k] ?? 0), 0);
  const { data: runs } = await admin.from("material_kanban_run").select("*").order("at", { ascending: false }).limit(10);
  return {
    rows: out, stockLive: stock !== null, cap: await cap(admin),
    totals: { items: out.length, red: out.filter((r) => r.zone === "red").length, yellow: out.filter((r) => r.zone === "yellow").length, green: out.filter((r) => r.zone === "green").length, unread: out.filter((r) => !r.zone).length,
      buffer_value: sum("buffer_value"), stock_value: sum("stock_value"), to_order_value: sum("to_order_value") },
    runs: runs ?? [],
  };
}

export async function GET(req: Request) {
  try {
    await requireSaamaan();
    const url = new URL(req.url);
    const admin = adminClient();
    if (url.searchParams.get("mode") === "log") {
      const code = S(url.searchParams.get("item"));
      const { data } = await admin.from("material_kanban_log").select("*").eq("item_code", code).order("at", { ascending: false }).limit(50);
      return NextResponse.json({ ok: true, rows: data ?? [] });
    }
    return NextResponse.json({ ok: true, ...(await picture(admin, url.searchParams.get("live") !== "0")) });
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

    /* SEED — every class C item in the mirror that is not yet on the Kanban,
       or the codes given. The ERP's reorder level is the first buffer where
       there is one; otherwise 0 until the first DBM run reads consumption. */
    if (action === "seed") {
      const given = (Array.isArray(body.codes) ? body.codes : []).map((x: unknown) => S(x)).filter(Boolean);
      let codes: string[] = given;
      if (!codes.length) {
        for (let a = 0; ; a += 1000) {
          const { data, error } = await admin.from("material_item").select("item_code").eq("custom_item_class", "C").eq("disabled", false).order("item_code").range(a, a + 999);
          if (error) throw new Error(error.message);
          codes.push(...((data ?? []).map((r) => S(r.item_code))));
          if (!data || data.length < 1000) break;
        }
      }
      const have = new Set((await allKanban(admin)).map((r) => S(r.item_code)));
      const fresh = codes.filter((c) => !have.has(c));
      const items = await itemsOf(admin, fresh);
      const rows = fresh.map((item_code) => {
        const it = items.get(item_code);
        const erp = erpReorder(it);
        return { item_code, active: true, buffer_qty: erp, reorder_qty: 0, basis: erp ? "erp" : "seed", rate: rateOf(it), added_by: me.email, added_at: now };
      });
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await admin.from("material_kanban").upsert(rows.slice(i, i + 500), { onConflict: "item_code" });
        if (error) { if (/does not exist|schema cache/i.test(error.message)) throw new HttpError(503, "Run migration 0193 first — the Kanban tables don't exist yet."); throw error; }
      }
      return NextResponse.json({ ok: true, added: rows.length, had: have.size, classC: codes.length });
    }

    if (action === "remove") {
      const code = S(body.item_code);
      if (!code) throw new HttpError(400, "item_code required");
      const { error } = await admin.from("material_kanban").update({ active: false, updated_by: me.email, updated_at: now }).eq("item_code", code);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    /* SET — a buffer or reorder quantity typed by hand. Typed wins over the rule from here on; logged. */
    if (action === "set") {
      const code = S(body.item_code);
      if (!code) throw new HttpError(400, "item_code required");
      const { data: cur } = await admin.from("material_kanban").select("buffer_qty, reorder_qty, note").eq("item_code", code).maybeSingle();
      const patch: Doc = { updated_by: me.email, updated_at: now };
      if ("buffer_qty" in body) { patch.buffer_qty = Math.max(0, N(body.buffer_qty) ?? 0); patch.basis = "typed"; }
      if ("reorder_qty" in body) patch.reorder_qty = Math.max(0, N(body.reorder_qty) ?? 0);
      if ("note" in body) patch.note = S(body.note).slice(0, 400);
      const { error } = await admin.from("material_kanban").update(patch).eq("item_code", code);
      if (error) throw error;
      if ("buffer_qty" in body && Number(cur?.buffer_qty) !== patch.buffer_qty)
        await admin.from("material_kanban_log").insert({ item_code: code, by: me.email, from_qty: N(cur?.buffer_qty), to_qty: patch.buffer_qty, why: S(body.why) || "typed by hand" });
      return NextResponse.json({ ok: true });
    }

    if (action === "cap") {
      const v = Math.max(0, N(body.value) ?? 0);
      const { error } = await admin.from("material_setting").upsert({ key: "kanban_cap", value: String(v), updated_by: me.email, updated_at: now }, { onConflict: "key" });
      if (error) throw error;
      return NextResponse.json({ ok: true, cap: v });
    }

    /* DBM — the run. Reads six months of consumption and today's stock off
       the ERP, sets every untyped buffer, moves the ones the rule says to
       move, records zones, and writes the run on record. */
    if (action === "dbm") {
      const rows = await allKanban(admin);
      const codes = rows.map((r) => S(r.item_code));
      if (!codes.length) throw new HttpError(400, "Nothing on the Kanban yet — seed the class C items first.");
      const [items, stock, used] = await Promise.all([itemsOf(admin, codes), liveStock(admin, codes), consumption(admin, codes, 6)]);
      if (!stock || !used) throw new HttpError(502, "The ERP could not be read — stock or the stock ledger did not answer. Nothing was changed.");
      const monthsBack = 6;
      let red = 0, yellow = 0, green = 0, grown = 0, shrunk = 0, firstSet = 0;
      const logs: Doc[] = [];
      const ups: Doc[] = [];
      for (const r of rows) {
        const code = S(r.item_code);
        const it = items.get(code);
        const st = stock.get(code);
        const u = used.get(code);
        const stockQty = st ? st.stock - st.blocked : null;
        const ordered = st ? st.ordered : null;
        const cons = u ? u.qty : 0;
        /* months actually seen: six, or fewer if the first movement is younger — a new item is not judged on a six-month average of three weeks */
        let months = monthsBack;
        if (u && u.first !== "9999-99-99") {
          const d = new Date(u.first); const ms = Date.now() - d.getTime();
          months = Math.max(1, Math.min(monthsBack, Math.ceil(ms / (30.4 * 86400000))));
        }
        const monthly = cons / months;
        const oldBuf = Number(r.buffer_qty) || 0;
        const basis = S(r.basis);
        const erp = erpReorder(it);
        let buffer = oldBuf;
        let note = "";
        const suggested = Math.max(Math.ceil(monthly), erp);
        if (basis === "typed") {
          note = `typed buffer kept; the rule would say ${suggested} (${monthly.toFixed(1)}/month over ${months} month${months === 1 ? "" : "s"})`;
        } else if (basis === "seed" || basis === "erp" || oldBuf <= 0) {
          buffer = suggested; firstSet++;
          note = cons > 0 ? `first buffer: one month's consumption — ${monthly.toFixed(1)}/month over ${months} month${months === 1 ? "" : "s"}${erp > suggested - 1 && erp >= Math.ceil(monthly) ? " (the ERP's own reorder level, being larger)" : ""}` : "nothing consumed in six months — buffer left at the ERP's reorder level, or nothing";
        } else {
          /* consumption-based: the DBM nudge, on the zone the LAST run recorded */
          const lastZone = S(r.zone);
          const redRuns = (Number(r.red_runs) || 0), greenRuns = (Number(r.green_runs) || 0);
          if (lastZone === "red" && redRuns >= 2) { buffer = Math.ceil(oldBuf * 4 / 3); grown++; note = `red for ${redRuns} runs — buffer up by a third (${oldBuf} → ${buffer})`; }
          else if (lastZone === "green" && greenRuns >= 3 && !(ordered && ordered > 0)) { buffer = Math.max(Math.ceil(monthly / 2), Math.floor(oldBuf * 2 / 3)); shrunk++; note = `green for ${greenRuns} runs with nothing on order — buffer down by a third (${oldBuf} → ${buffer})`; }
          else note = `${monthly.toFixed(1)}/month over ${months} month${months === 1 ? "" : "s"}; buffer held at ${oldBuf}`;
        }
        const zone = zoneOf(stockQty, buffer);
        if (zone === "red") red++; else if (zone === "yellow") yellow++; else if (zone === "green") green++;
        const redRuns = zone === "red" ? (Number(r.red_runs) || 0) + 1 : 0;
        const greenRuns = zone === "green" ? (Number(r.green_runs) || 0) + 1 : 0;
        if (buffer !== oldBuf) logs.push({ item_code: code, by: me.email, from_qty: oldBuf, to_qty: buffer, why: `DBM run: ${note}` });
        ups.push({
          item_code: code, buffer_qty: buffer, basis: basis === "typed" ? "typed" : "consumption",
          consumption_6m: cons, monthly_avg: Math.round(monthly * 100) / 100, months_seen: months, stock: stockQty, ordered, rate: rateOf(it),
          zone, red_runs: buffer !== oldBuf ? 0 : redRuns, green_runs: buffer !== oldBuf ? 0 : greenRuns, dbm_at: now, dbm_note: note,
        });
      }
      for (let i = 0; i < ups.length; i += 500) {
        const { error } = await admin.from("material_kanban").upsert(ups.slice(i, i + 500), { onConflict: "item_code" });
        if (error) throw error;
      }
      for (let i = 0; i < logs.length; i += 500) await admin.from("material_kanban_log").insert(logs.slice(i, i + 500));
      const pic = await picture(admin, false);
      await admin.from("material_kanban_run").insert({
        by: me.email, items: rows.length, red, yellow, green,
        buffer_value: pic.totals.buffer_value, stock_value: pic.totals.stock_value, to_order_value: pic.totals.to_order_value,
        note: `${firstSet} first buffers set, ${grown} grown, ${shrunk} shrunk · ${S(body.note).slice(0, 200)}`.trim(),
      });
      return NextResponse.json({ ok: true, items: rows.length, red, yellow, green, firstSet, grown, shrunk, ...pic });
    }

    /* REQUISITION — one purchase slip for every red (and, if asked, yellow)
       item's to-order quantity, to one of the purchase hands. The same slip
       the MRP run raises, so purchase sees one kind of paper. */
    if (action === "requisition") {
      const to = S(body.to_email).toLowerCase();
      if (!to) throw new HttpError(400, "Say who the requisition goes to.");
      const includeYellow = body.yellow === true;
      const pic = await picture(admin, true);
      if (!pic.stockLive) throw new HttpError(502, "The ERP could not be read — stock is unknown, so nothing can be ordered by it.");
      const lines = pic.rows.filter((r) => r.to_order > 0 && (r.zone === "red" || (includeYellow && r.zone === "yellow"))).map((r) => ({
        project_id: "", job_no: "", item_group: r.item_group, item_code: r.item_code, item_name: r.item_name, qty: r.to_order, uom: r.uom, rate: r.rate, amount: r.rate === null ? null : r.to_order * r.rate, issue_ids: [],
      }));
      if (!lines.length) throw new HttpError(400, "Nothing to order — no Kanban item is below its buffer today.");
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data: last } = await admin.from("material_slip").select("slip_no").like("slip_no", "PR-%").order("slip_no", { ascending: false }).limit(1);
        const slip_no = `PR-${String(Number((S(last?.[0]?.slip_no).match(/(\d+)$/) ?? [])[1] ?? 0) + 1).padStart(4, "0")}`;
        const { data: slip, error } = await admin.from("material_slip").insert({ slip_no, kind: "purchase", mrp_id: null, from_email: me.email, to_email: to, note: "Kanban — MRP as per reorder level" }).select("*").maybeSingle();
        if (error) { if (/duplicate|unique/i.test(error.message)) continue; throw error; }
        const { error: lErr } = await admin.from("material_slip_line").insert(lines.map((l) => ({ ...l, slip_id: slip!.id })));
        if (lErr) throw lErr;
        return NextResponse.json({ ok: true, slip, lines: lines.length, value: lines.reduce((a, l) => a + (l.amount ?? 0), 0) });
      }
      throw new HttpError(409, "Two slips were numbered at once — try again.");
    }

    throw new HttpError(400, "Unknown action — seed, remove, set, cap, dbm or requisition.");
  } catch (e) {
    return errJson(e);
  }
}
