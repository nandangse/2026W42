import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { requireSaamaan } from "@/lib/saamaan";
import { mayRfq, plainDescription } from "@/lib/saamaan-rfq";

export const dynamic = "force-dynamic";

/**
 * SAAMAAN → RFQs (Dr Raghu, 6 Oct 2026: "We will create an RFQ, add an item
 * ID, give a description, and that will then be sent to the suppliers in
 * their portal ... The basic default description should come from the item,
 * and then there can be an add-on remark ... all the description changes
 * should be done in the master so that it continues on forward").
 *
 * GET ?view=list · ?view=one&id= · ?view=suppliers · ?view=item&code=
 * POST create · save_header · add_item · update_item · remove_item ·
 *      refresh_description · set_suppliers · send · close · cancel
 *
 * A line's description is the master's, read again when the RFQ is SENT and
 * frozen there — so improving the master before sending improves the RFQ,
 * and nothing a supplier quoted against changes under them afterwards.
 */
const S = (v: unknown, n = 400) => String(v ?? "").trim().slice(0, n);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const missing = (m: string) => /material_rfq|portal_org|schema cache|does not exist/i.test(m);

async function masterOf(admin: ReturnType<typeof adminClient>, code: string) {
  const { data } = await admin.from("material_item").select("item_code, item_name, description, stock_uom, disabled").eq("item_code", code).maybeSingle();
  return data;
}

export async function GET(req: Request) {
  try {
    const me = await requireSaamaan();
    const admin = adminClient();
    const p = new URL(req.url).searchParams;
    const view = p.get("view") || "list";
    const may = mayRfq(me.email, me.isOwner);

    if (view === "list") {
      const { data, error } = await admin.from("material_rfq").select("*").order("created_at", { ascending: false }).limit(300);
      if (error) { if (missing(error.message)) return NextResponse.json({ installed: false, rfqs: [], may }); throw new Error(error.message); }
      const ids = (data ?? []).map((r) => r.id);
      const [it, su, qu] = ids.length ? await Promise.all([
        admin.from("material_rfq_item").select("rfq_id").in("rfq_id", ids),
        admin.from("material_rfq_supplier").select("rfq_id, status").in("rfq_id", ids),
        admin.from("material_rfq_quote").select("rfq_id, org_slug").in("rfq_id", ids),
      ]) : [{ data: [] }, { data: [] }, { data: [] }];
      const n = (rows: { rfq_id: string }[] | null, id: string) => (rows ?? []).filter((r) => r.rfq_id === id).length;
      return NextResponse.json({
        installed: true, may,
        rfqs: (data ?? []).map((r) => ({
          ...r, items: n(it.data as { rfq_id: string }[], r.id), suppliers: n(su.data as { rfq_id: string }[], r.id),
          quoted: ((su.data ?? []) as { rfq_id: string; status: string }[]).filter((s) => s.rfq_id === r.id && s.status === "quoted").length,
        })),
      });
    }

    if (view === "one") {
      const id = S(p.get("id"), 64);
      const { data: rfq } = await admin.from("material_rfq").select("*").eq("id", id).maybeSingle();
      if (!rfq) throw new HttpError(404, "No such RFQ.");
      const [items, sups, quotes] = await Promise.all([
        admin.from("material_rfq_item").select("*").eq("rfq_id", id).order("idx"),
        admin.from("material_rfq_supplier").select("*").eq("rfq_id", id).order("org_name"),
        admin.from("material_rfq_quote").select("*").eq("rfq_id", id),
      ]);
      /* the master as it reads now — so a draft shows when the master has improved */
      const codes = (items.data ?? []).map((i) => i.item_code);
      const { data: m } = codes.length ? await admin.from("material_item").select("item_code, item_name, description").in("item_code", codes) : { data: [] };
      const master = Object.fromEntries((m ?? []).map((x) => [x.item_code, plainDescription(x.description, x.item_name)]));
      return NextResponse.json({ ok: true, may, rfq, items: items.data ?? [], suppliers: sups.data ?? [], quotes: quotes.data ?? [], master });
    }

    if (view === "suppliers") {
      const { data, error } = await admin.from("portal_org").select("slug, name, active, match_names").eq("kind", "supplier").order("name");
      if (error) { if (missing(error.message)) return NextResponse.json({ ok: true, suppliers: [], portal: false }); throw new Error(error.message); }
      const { data: users } = await admin.from("portal_user").select("org_slug, active, last_login_at").eq("role", "supplier");
      return NextResponse.json({
        ok: true, portal: true,
        suppliers: (data ?? []).map((o) => ({ ...o, logins: (users ?? []).filter((u) => u.org_slug === o.slug && u.active).length })),
      });
    }

    if (view === "item") {
      const m = await masterOf(admin, S(p.get("code"), 60));
      if (!m) throw new HttpError(404, "No item with that code in the mirror.");
      return NextResponse.json({ ok: true, item_code: m.item_code, item_name: m.item_name, uom: m.stock_uom, description: plainDescription(m.description, m.item_name), disabled: m.disabled });
    }

    throw new HttpError(400, `Unknown view "${view}"`);
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await requireSaamaan();
    if (!mayRfq(me.email, me.isOwner)) throw new HttpError(403, "RFQs are raised by purchase — Mukesh, Pradip, Akshay, Shailaja — or Rameez.");
    const admin = adminClient();
    const b = await readBody(req, {});
    const action = S(b.action, 40);
    const now = new Date().toISOString();
    const fail = (m: string) => { throw new HttpError(missing(m) ? 503 : 500, missing(m) ? "Run migration 0201 first." : m); };
    const draft = async (id: string) => {
      const { data } = await admin.from("material_rfq").select("status").eq("id", id).maybeSingle();
      if (!data) throw new HttpError(404, "No such RFQ.");
      if (data.status !== "draft") throw new HttpError(409, "This RFQ has gone out — it is not edited any more.");
    };

    if (action === "create") {
      const { data, error } = await admin.from("material_rfq").insert({ title: S(b.title, 200), due_on: DAY.test(S(b.due_on, 10)) ? S(b.due_on, 10) : null, note: S(b.note, 4000), created_by: me.email }).select("id, rfq_no").single();
      if (error) fail(error.message);
      return NextResponse.json({ ok: true, id: data!.id, rfq_no: data!.rfq_no });
    }
    if (action === "save_header") {
      const id = S(b.id, 64); await draft(id);
      const { error } = await admin.from("material_rfq").update({ title: S(b.title, 200), due_on: DAY.test(S(b.due_on, 10)) ? S(b.due_on, 10) : null, note: S(b.note, 4000) }).eq("id", id);
      if (error) fail(error.message);
      return NextResponse.json({ ok: true });
    }
    if (action === "add_item") {
      const id = S(b.id, 64); await draft(id);
      const m = await masterOf(admin, S(b.item_code, 60));
      if (!m) throw new HttpError(404, "No item with that code in the mirror.");
      const qty = Number(b.qty);
      if (!(qty > 0)) throw new HttpError(400, "The quantity required, more than nought.");
      const { count } = await admin.from("material_rfq_item").select("id", { count: "exact", head: true }).eq("rfq_id", id);
      const { error } = await admin.from("material_rfq_item").insert({
        rfq_id: id, idx: Number(count || 0) + 1, item_code: m.item_code, item_name: m.item_name, description: plainDescription(m.description, m.item_name),
        addon: S(b.addon, 2000), qty, uom: S(b.uom, 30) || m.stock_uom, specs: S(b.specs, 2000), required_by: DAY.test(S(b.required_by, 10)) ? S(b.required_by, 10) : null,
      });
      if (error) fail(error.message);
      return NextResponse.json({ ok: true });
    }
    if (action === "update_item" || action === "remove_item" || action === "refresh_description") {
      const { data: line } = await admin.from("material_rfq_item").select("id, rfq_id, item_code").eq("id", S(b.item_id, 64)).maybeSingle();
      if (!line) throw new HttpError(404, "No such line.");
      await draft(line.rfq_id);
      if (action === "remove_item") { await admin.from("material_rfq_item").delete().eq("id", line.id); return NextResponse.json({ ok: true }); }
      if (action === "refresh_description") {
        const m = await masterOf(admin, line.item_code);
        await admin.from("material_rfq_item").update({ item_name: m?.item_name ?? "", description: plainDescription(m?.description, m?.item_name) }).eq("id", line.id);
        return NextResponse.json({ ok: true });
      }
      const patch: Record<string, unknown> = {};
      if ("qty" in b) { const q = Number(b.qty); if (!(q > 0)) throw new HttpError(400, "Quantity more than nought."); patch.qty = q; }
      for (const k of ["uom", "addon", "specs"] as const) if (k in b) patch[k] = S(b[k], k === "uom" ? 30 : 2000);
      if ("required_by" in b) patch.required_by = DAY.test(S(b.required_by, 10)) ? S(b.required_by, 10) : null;
      const { error } = await admin.from("material_rfq_item").update(patch).eq("id", line.id);
      if (error) fail(error.message);
      return NextResponse.json({ ok: true });
    }
    if (action === "set_suppliers") {
      const id = S(b.id, 64); await draft(id);
      const slugs = Array.isArray(b.slugs) ? (b.slugs as unknown[]).map((x) => S(x, 40)).filter(Boolean) : [];
      const { data: orgs } = slugs.length ? await admin.from("portal_org").select("slug, name").eq("kind", "supplier").in("slug", slugs) : { data: [] };
      await admin.from("material_rfq_supplier").delete().eq("rfq_id", id);
      if ((orgs ?? []).length) {
        const { error } = await admin.from("material_rfq_supplier").insert((orgs ?? []).map((o) => ({ rfq_id: id, org_slug: o.slug, org_name: o.name })));
        if (error) fail(error.message);
      }
      return NextResponse.json({ ok: true, suppliers: (orgs ?? []).length });
    }
    if (action === "send") {
      const id = S(b.id, 64); await draft(id);
      const [{ data: lines }, { count: sups }] = await Promise.all([
        admin.from("material_rfq_item").select("id, item_code").eq("rfq_id", id),
        admin.from("material_rfq_supplier").select("id", { count: "exact", head: true }).eq("rfq_id", id),
      ]);
      if (!(lines ?? []).length) throw new HttpError(400, "Add at least one item.");
      if (!sups) throw new HttpError(400, "Choose at least one supplier.");
      /* the master, read once more and frozen on the line */
      for (const l of lines ?? []) {
        const m = await masterOf(admin, l.item_code);
        if (m) await admin.from("material_rfq_item").update({ item_name: m.item_name, description: plainDescription(m.description, m.item_name) }).eq("id", l.id);
      }
      const { error } = await admin.from("material_rfq").update({ status: "sent", sent_at: now, sent_by: me.email }).eq("id", id);
      if (error) fail(error.message);
      return NextResponse.json({ ok: true });
    }
    if (action === "close" || action === "cancel") {
      const { error } = await admin.from("material_rfq").update({ status: action === "close" ? "closed" : "cancelled", closed_at: now }).eq("id", S(b.id, 64));
      if (error) fail(error.message);
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, `Unknown action "${action}"`);
  } catch (e) { return errJson(e); }
}
