import { NextResponse } from "next/server";
import { readBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { isStaff, portalAudit, requirePortalUser } from "@/lib/portal/auth";
import { resolveScope } from "@/lib/portal/data";

export const dynamic = "force-dynamic";

/**
 * THE SUPPLIER'S RFQs (Dr Raghu, 6 Oct 2026: "that will then be sent to the
 * suppliers in their portal. When they log in, they'll see that we want it").
 *
 * GET ?slug=           the RFQs sent to this supplier (all of them for Nandan's staff)
 * GET ?slug=&id=       one RFQ: every line, and this supplier's quote so far — opening it marks it seen
 * POST quote   { slug, id, lines:[{rfq_item_id, rate, qty_offered, lead_days, remark}], remark, submit }
 * POST decline { slug, id, remark }
 *
 * A supplier sees only RFQs sent to its own organisation, and only once they
 * have gone out. It quotes until Nandan closes the RFQ; a quote can be
 * revised and submitted again until then.
 */
const S = (v: unknown, n = 400) => String(v ?? "").trim().slice(0, n);
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const missing = (m: string) => /material_rfq|schema cache|does not exist/i.test(m);

export async function GET(req: Request) {
  try {
    const u = await requirePortalUser();
    const p = new URL(req.url).searchParams;
    const scope = await resolveScope(u, p.get("slug"));
    const admin = adminClient();
    const slug = scope.org?.slug ?? null;
    if (scope.org && scope.org.kind !== "supplier") return NextResponse.json({ ok: true, rfqs: [] });
    const id = S(p.get("id"), 64);

    if (!id) {
      let q = admin.from("material_rfq_supplier").select("rfq_id, org_slug, org_name, status, quoted_at");
      if (slug) q = q.eq("org_slug", slug);
      const { data: inv, error } = await q;
      if (error) { if (missing(error.message)) return NextResponse.json({ ok: true, rfqs: [], installed: false }); throw new Error(error.message); }
      const ids = [...new Set((inv ?? []).map((i) => i.rfq_id))];
      const { data: rfqs } = ids.length ? await admin.from("material_rfq").select("id, rfq_no, title, status, due_on, sent_at").in("id", ids).in("status", ["sent", "closed"]).order("sent_at", { ascending: false }) : { data: [] };
      const { data: lines } = ids.length ? await admin.from("material_rfq_item").select("rfq_id").in("rfq_id", ids) : { data: [] };
      return NextResponse.json({
        ok: true,
        rfqs: (rfqs ?? []).map((r) => ({
          ...r, items: (lines ?? []).filter((l) => l.rfq_id === r.id).length,
          invited: (inv ?? []).filter((i) => i.rfq_id === r.id).map((i) => ({ org_slug: i.org_slug, org_name: i.org_name, status: i.status, quoted_at: i.quoted_at })),
        })),
      });
    }

    const { data: rfq } = await admin.from("material_rfq").select("id, rfq_no, title, status, due_on, note, sent_at").eq("id", id).maybeSingle();
    if (!rfq || !["sent", "closed"].includes(rfq.status)) throw new HttpError(404, "No such RFQ.");
    let inv = null;
    if (slug) {
      const { data } = await admin.from("material_rfq_supplier").select("*").eq("rfq_id", id).eq("org_slug", slug).maybeSingle();
      if (!data) throw new HttpError(404, "That RFQ was not sent to you.");
      inv = data;
      if (!isStaff(u) && data.status === "invited") {
        await admin.from("material_rfq_supplier").update({ status: "viewed", viewed_at: new Date().toISOString() }).eq("id", data.id);
        inv = { ...data, status: "viewed" };
      }
    }
    const [{ data: items }, { data: quotes }] = await Promise.all([
      admin.from("material_rfq_item").select("id, idx, item_code, item_name, description, addon, qty, uom, specs, required_by").eq("rfq_id", id).order("idx"),
      slug ? admin.from("material_rfq_quote").select("*").eq("rfq_id", id).eq("org_slug", slug) : admin.from("material_rfq_quote").select("*").eq("rfq_id", id),
    ]);
    return NextResponse.json({ ok: true, rfq, invitation: inv, items: items ?? [], quotes: quotes ?? [], canQuote: !!slug && rfq.status === "sent" && (!isStaff(u) || u.role === "admin") });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const u = await requirePortalUser();
    const b = await readBody(req, {});
    const scope = await resolveScope(u, S(b.slug, 40) || null);
    if (!scope.org || scope.org.kind !== "supplier") throw new HttpError(400, "Open a supplier's page to quote for it.");
    /* the supplier quotes; of Nandan's people only the portal admin may key in a quote that came by mail */
    if (isStaff(u) && u.role !== "admin") throw new HttpError(403, "Quotes are the supplier's to enter.");
    const admin = adminClient();
    const id = S(b.id, 64);
    const { data: rfq } = await admin.from("material_rfq").select("id, status").eq("id", id).maybeSingle();
    if (!rfq) throw new HttpError(404, "No such RFQ.");
    if (rfq.status !== "sent") throw new HttpError(409, "This RFQ is closed — quotes are no longer taken.");
    const { data: inv } = await admin.from("material_rfq_supplier").select("id").eq("rfq_id", id).eq("org_slug", scope.org.slug).maybeSingle();
    if (!inv) throw new HttpError(404, "That RFQ was not sent to you.");
    const now = new Date().toISOString();

    if (S(b.action) === "decline") {
      await admin.from("material_rfq_supplier").update({ status: "declined", remark: S(b.remark, 2000) }).eq("id", inv.id);
      await portalAudit(u, "rfq_declined", { rfq: id });
      return NextResponse.json({ ok: true });
    }
    if (S(b.action) !== "quote") throw new HttpError(400, "Unknown action.");
    const { data: items } = await admin.from("material_rfq_item").select("id").eq("rfq_id", id);
    const valid = new Set((items ?? []).map((i) => i.id));
    const rows = (Array.isArray(b.lines) ? (b.lines as Record<string, unknown>[]) : [])
      .filter((l) => valid.has(S(l.rfq_item_id, 64)))
      .map((l) => ({
        rfq_id: id, rfq_item_id: S(l.rfq_item_id, 64), org_slug: scope.org!.slug,
        rate: num(l.rate), qty_offered: num(l.qty_offered), lead_days: num(l.lead_days) === null ? null : Math.round(Number(l.lead_days)),
        remark: S(l.remark, 2000), quoted_by: u.email, at: now,
      }));
    if (rows.some((r) => r.rate !== null && r.rate < 0)) throw new HttpError(400, "A rate cannot be negative.");
    if (rows.length) {
      const { error } = await admin.from("material_rfq_quote").upsert(rows, { onConflict: "rfq_item_id,org_slug" });
      if (error) throw new Error(error.message);
    }
    const patch: Record<string, unknown> = { remark: S(b.remark, 2000) };
    if (b.submit) { patch.status = "quoted"; patch.quoted_at = now; }
    await admin.from("material_rfq_supplier").update(patch).eq("id", inv.id);
    await portalAudit(u, b.submit ? "rfq_quoted" : "rfq_saved", { rfq: id, lines: rows.length });
    return NextResponse.json({ ok: true, saved: rows.length });
  } catch (e) { return errJson(e); }
}
