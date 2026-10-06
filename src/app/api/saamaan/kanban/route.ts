import { NextResponse } from "next/server";
import { readBody, type AnyBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireSaamaan } from "@/lib/saamaan";
import { proposeAll } from "@/lib/kanban-dbm";
import { allKanban, itemsOf, missing, N, picture, rateOf, runDbm, S, settings, type Doc } from "@/lib/kanban-shelf";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * THE KANBAN — MRP AS PER REORDER LEVEL, ON DYNAMIC BUFFER MANAGEMENT.
 * First built 3 Oct 2026; rebuilt from scratch 6 Oct 2026 on the practice
 * (see src/lib/kanban-dbm.ts for the rules, in full).
 *
 * GET                       the shelf: every item, its zone on the stock
 *                           in hand, what to order on the virtual stock
 *                           in whole MOQs, Genie's proposal beside it
 * GET ?mode=log&item=       one item's every target change
 * POST seed                 class C items onto the Kanban
 * POST set                  a target or MOQ typed by hand (typed wins)
 * POST settings             the cap, the safety factor, the review gap
 * POST propose              the intelligence layer: usage, lead time,
 *                           target and MOQ read off the ERP, as proposals
 * POST accept / dismiss     proposals taken (one, chosen, or all) or set aside
 * POST dbm                  today's DBM step now (the cron runs it daily)
 * POST requisition          one purchase slip for black and red (and
 *                           yellow if asked), at the MOQ-rounded quantity
 * POST remove               off the Kanban
 */
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

    /* SEED — every class C item not yet on the Kanban, or the codes given. No target until Genie proposes one and it is accepted. */
    if (action === "seed") {
      const given = (Array.isArray(body.codes) ? body.codes : []).map((x: unknown) => S(x)).filter(Boolean);
      const codes: string[] = given;
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
      const rows = fresh.map((item_code) => ({ item_code, active: true, buffer_qty: 0, reorder_qty: 0, basis: "seed", rate: rateOf(items.get(item_code)), added_by: me.email, added_at: now }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await admin.from("material_kanban").upsert(rows.slice(i, i + 500), { onConflict: "item_code" });
        if (error) throw error;
      }
      return NextResponse.json({ ok: true, added: rows.length, had: have.size });
    }

    if (action === "remove") {
      const code = S(body.item_code);
      if (!code) throw new HttpError(400, "item_code required");
      const { error } = await admin.from("material_kanban").update({ active: false, updated_by: me.email, updated_at: now }).eq("item_code", code);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    /* SET — a target or MOQ typed by hand. Typed wins over the rule and over proposals; logged. */
    if (action === "set") {
      const code = S(body.item_code);
      if (!code) throw new HttpError(400, "item_code required");
      const { data: cur } = await admin.from("material_kanban").select("buffer_qty, reorder_qty").eq("item_code", code).maybeSingle();
      const patch: Doc = { updated_by: me.email, updated_at: now };
      if ("target" in body) { patch.buffer_qty = Math.max(0, N(body.target) ?? 0); patch.basis = "typed"; patch.last_change_at = now; patch.red_days = 0; patch.green_days = 0; }
      if ("moq" in body) { patch.reorder_qty = Math.max(0, N(body.moq) ?? 0); patch.moq_basis = "typed"; }
      if ("note" in body) patch.note = S(body.note).slice(0, 400);
      if ("untype" in body) patch.basis = "proposed";
      const { error } = await admin.from("material_kanban").update(patch).eq("item_code", code);
      if (error) throw error;
      if ("target" in body && Number(cur?.buffer_qty) !== patch.buffer_qty)
        await admin.from("material_kanban_log").insert({ item_code: code, by: me.email, from_qty: N(cur?.buffer_qty), to_qty: patch.buffer_qty, why: S(body.why) || "target typed by hand" });
      if ("moq" in body && Number(cur?.reorder_qty) !== patch.reorder_qty)
        await admin.from("material_kanban_log").insert({ item_code: code, by: me.email, from_qty: N(cur?.reorder_qty), to_qty: patch.reorder_qty, why: "MOQ typed by hand" });
      return NextResponse.json({ ok: true });
    }

    if (action === "settings") {
      const rows: Doc[] = [];
      if ("cap" in body) rows.push({ key: "kanban_cap", value: String(Math.max(0, N(body.cap) ?? 0)) });
      if ("paranoia" in body) rows.push({ key: "kanban_paranoia", value: String(Math.min(3, Math.max(1, N(body.paranoia) ?? 1.5))) });
      if ("review" in body) rows.push({ key: "kanban_review_days", value: String(Math.min(30, Math.max(0, N(body.review) ?? 7))) });
      if (rows.length) {
        const { error } = await admin.from("material_setting").upsert(rows.map((r) => ({ ...r, updated_by: me.email, updated_at: now })), { onConflict: "key" });
        if (error) throw error;
      }
      return NextResponse.json({ ok: true, settings: await settings(admin) });
    }

    /* PROPOSE — the intelligence layer. Reads usage, lead times and order sizes off the ERP and writes a proposal beside each item; changes nothing else. */
    if (action === "propose") {
      const rows = await allKanban(admin);
      const codes = rows.map((r) => S(r.item_code));
      if (!codes.length) throw new HttpError(400, "Nothing on the Kanban yet — seed the class C items first.");
      const set = await settings(admin);
      let props;
      try { props = await proposeAll(admin, codes, set); } catch (e) { throw new HttpError(502, e instanceof Error ? e.message : String(e)); }
      const cur = new Map(rows.map((r) => [S(r.item_code), r]));
      const ups = props.map((p) => {
        const r = cur.get(p.item_code)!;
        const same = Number(r.buffer_qty) === p.target && Number(r.reorder_qty) === p.moq;
        return {
          item_code: p.item_code, adu: p.adu, rlt_days: p.rlt, rlt_basis: p.rlt_basis,
          proposed_target: p.target, proposed_moq: p.moq, proposed_rlt: p.rlt, proposed_adu: p.adu, proposed_at: now, proposal_note: p.note,
          proposal_state: same ? "same" : "pending",
        };
      });
      for (let i = 0; i < ups.length; i += 500) {
        const { error } = await admin.from("material_kanban").upsert(ups.slice(i, i + 500), { onConflict: "item_code" });
        if (error) { if (missing(error.message)) throw new HttpError(503, "Run migration 0204 first — the proposals have nowhere to live yet."); throw error; }
      }
      const pending = ups.filter((u) => u.proposal_state === "pending").length;
      const withTarget = props.filter((p) => p.target > 0).length;
      await admin.from("material_kanban_run").insert({ by: me.email, kind: "propose", items: props.length, note: `Genie proposed: ${withTarget} with usage get a target, ${props.length - withTarget} used nothing in six months; ${pending} differ from today (×${set.paranoia}, ${set.review}-day review)` });
      return NextResponse.json({ ok: true, items: props.length, withTarget, pending });
    }

    /* ACCEPT — proposals into force: the codes given, or every pending one. Typed targets are kept unless the codes name them. */
    if (action === "accept" || action === "dismiss") {
      const given = (Array.isArray(body.codes) ? body.codes : []).map((x: unknown) => S(x)).filter(Boolean);
      const rows = (await allKanban(admin)).filter((r) => S(r.proposal_state) === "pending" && (given.length ? given.includes(S(r.item_code)) : S(r.basis) !== "typed"));
      if (action === "dismiss") {
        for (let i = 0; i < rows.length; i += 300) await admin.from("material_kanban").update({ proposal_state: "dismissed" }).in("item_code", rows.slice(i, i + 300).map((r) => S(r.item_code)));
        return NextResponse.json({ ok: true, dismissed: rows.length });
      }
      const logs: Doc[] = [];
      const ups = rows.map((r) => {
        const t = Number(r.proposed_target) || 0, m = Number(r.proposed_moq) || 0;
        if (Number(r.buffer_qty) !== t) logs.push({ item_code: r.item_code, by: me.email, from_qty: N(r.buffer_qty), to_qty: t, why: `Genie's proposal accepted: ${S(r.proposal_note)}` });
        const keepMoq = S(r.moq_basis) === "typed" && !given.length;
        return {
          item_code: r.item_code, buffer_qty: t, basis: "proposed", reorder_qty: keepMoq ? r.reorder_qty : m, moq_basis: keepMoq ? "typed" : m ? "proposed" : "",
          rlt_days: r.proposed_rlt, adu: r.proposed_adu, proposal_state: "accepted", last_change_at: now, red_days: 0, green_days: 0, updated_by: me.email, updated_at: now,
        };
      });
      for (let i = 0; i < ups.length; i += 500) {
        const { error } = await admin.from("material_kanban").upsert(ups.slice(i, i + 500), { onConflict: "item_code" });
        if (error) throw error;
      }
      for (let i = 0; i < logs.length; i += 500) await admin.from("material_kanban_log").insert(logs.slice(i, i + 500));
      return NextResponse.json({ ok: true, accepted: ups.length });
    }

    if (action === "dbm") {
      const r = await runDbm(admin, me.email, "dbm", S(body.note).slice(0, 200));
      return NextResponse.json({ ok: true, ...r });
    }

    /* REQUISITION — one purchase slip: black and red (and yellow if asked), at the MOQ-rounded quantity, to one of the purchase hands. */
    if (action === "requisition") {
      const to = S(body.to_email).toLowerCase();
      if (!to) throw new HttpError(400, "Say who the requisition goes to.");
      const zones = new Set<string>(["black", "red", ...(body.yellow === true ? ["yellow"] : [])]);
      const pic = await picture(admin, true);
      if (!pic.stockLive) throw new HttpError(502, "The ERP could not be read — stock is unknown, so nothing can be ordered by it.");
      const lines = pic.rows.filter((r) => r.to_order > 0 && zones.has(r.zone)).map((r) => ({
        project_id: "", job_no: "", item_group: r.item_group, item_code: r.item_code, item_name: r.item_name, qty: r.to_order, uom: r.uom, rate: r.rate, amount: r.rate === null ? null : r.to_order * r.rate, issue_ids: [],
      }));
      if (!lines.length) throw new HttpError(400, "Nothing to order — no Kanban item in those zones needs an order today (what is on order already counts).");
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data: last } = await admin.from("material_slip").select("slip_no").like("slip_no", "PR-%").order("slip_no", { ascending: false }).limit(1);
        const slip_no = `PR-${String(Number((S(last?.[0]?.slip_no).match(/(\d+)$/) ?? [])[1] ?? 0) + 1).padStart(4, "0")}`;
        const { data: slip, error } = await admin.from("material_slip").insert({ slip_no, kind: "purchase", mrp_id: null, from_email: me.email, to_email: to, note: `Kanban — ${[...zones].join(", ")} · in whole MOQs` }).select("*").maybeSingle();
        if (error) { if (/duplicate|unique/i.test(error.message)) continue; throw error; }
        const { error: lErr } = await admin.from("material_slip_line").insert(lines.map((l) => ({ ...l, slip_id: slip!.id })));
        if (lErr) throw lErr;
        return NextResponse.json({ ok: true, slip, lines: lines.length, value: lines.reduce((a, l) => a + (l.amount ?? 0), 0) });
      }
      throw new HttpError(409, "Two slips were numbered at once — try again.");
    }

    throw new HttpError(400, "Unknown action — seed, set, settings, propose, accept, dismiss, dbm, requisition or remove.");
  } catch (e) {
    return errJson(e);
  }
}
