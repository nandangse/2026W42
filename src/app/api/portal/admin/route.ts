import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { newInviteToken, PORTAL_ROLES, portalAudit, requirePortalAdmin, type PortalRole } from "@/lib/portal/auth";
import { norm } from "@/lib/portal/data";

export const dynamic = "force-dynamic";

/**
 * SETTINGS AND ADMIN (Dr Raghu, 3 Oct 2026: "Settings and admin, which will
 * only be available to a few people in the organisation").
 *
 * GET  → organisations, users, locations, the last 200 audit lines, and the
 *        names Genie actually holds (customers on the jobmaster, suppliers on
 *        the POs) so an organisation's match names are picked, not typed.
 * POST { action: "org_save", slug, name, kind, match_names[], intro, active }
 *      { action: "org_delete", slug }
 *      { action: "user_save", id?, email, name, phone, role, org_slug, locations[], sees_commercials, active }
 *      { action: "user_invite", id }                → a fresh 72-hour link to copy
 *      { action: "location_save", name, sort_order, active }
 *      { action: "location_delete", name }
 */
export async function GET() {
  try {
    await requirePortalAdmin();
    const admin = adminClient();
    const [orgs, users, locs, audit, custs, sups] = await Promise.all([
      admin.from("portal_org").select("slug,name,kind,match_names,intro,logo_path,active,created_at,updated_at").order("name"),
      admin.from("portal_user").select("id,email,name,phone,role,org_slug,locations,sees_commercials,active,must_change,invite_token,invite_expires,last_login_at,login_count,created_at").order("role").order("name"),
      admin.from("portal_location").select("name,sort_order,active").order("sort_order").order("name"),
      admin.from("portal_audit").select("email,action,detail,at").order("at", { ascending: false }).limit(200),
      admin.from("jobs").select("cust").order("cust").limit(5000),
      admin.from("material_supplier").select("name,supplier_name").eq("disabled", false).order("supplier_name").limit(5000),
    ]);
    const firstErr = [orgs, users, locs, audit].find((r) => r.error)?.error;
    if (firstErr) throw firstErr;
    const customers = Array.from(new Set(((custs.data || []) as { cust: string | null }[]).map((r) => String(r.cust || "").trim()).filter(Boolean))).sort();
    const suppliers = Array.from(new Set(((sups.data || []) as { name: string; supplier_name: string }[]).map((r) => String(r.supplier_name || r.name || "").trim()).filter(Boolean))).sort();
    return NextResponse.json({ orgs: orgs.data || [], users: users.data || [], locations: locs.data || [], audit: audit.data || [], customers, suppliers });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const u = await requirePortalAdmin();
    const admin = adminClient();
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(b.action || "");
    const now = new Date().toISOString();
    const S = (v: unknown, n = 200) => String(v ?? "").trim().slice(0, n);

    if (action === "org_save") {
      const slug = S(b.slug, 40).toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(slug)) throw new HttpError(400, "The slug is letters, digits and hyphens: veda, taj, tata-motors.");
      if (["login", "all", "settings", "api"].includes(slug)) throw new HttpError(400, "That word is taken by the portal itself.");
      const name = S(b.name);
      if (name.length < 2) throw new HttpError(400, "A name, please.");
      const kind = String(b.kind) === "supplier" ? "supplier" : "customer";
      const match_names = Array.from(new Set((Array.isArray(b.match_names) ? (b.match_names as unknown[]) : []).map(norm).filter(Boolean)));
      const row = { slug, name, kind, match_names, intro: String(b.intro || "").slice(0, 20000), active: b.active !== false, updated_at: now };
      const { data: cur } = await admin.from("portal_org").select("slug").eq("slug", slug).maybeSingle();
      const { error } = cur
        ? await admin.from("portal_org").update(row).eq("slug", slug)
        : await admin.from("portal_org").insert({ ...row, created_by: u.email, created_at: now });
      if (error) throw error;
      await portalAudit(u, "org_saved", { slug, kind, match_names });
      return NextResponse.json({ ok: true, slug });
    }

    if (action === "org_delete") {
      const slug = S(b.slug, 40);
      const { count } = await admin.from("portal_user").select("id", { count: "exact", head: true }).eq("org_slug", slug);
      if (Number(count || 0) > 0) throw new HttpError(400, "Move or remove its people first.");
      const { error } = await admin.from("portal_org").delete().eq("slug", slug);
      if (error) throw error;
      await portalAudit(u, "org_deleted", { slug });
      return NextResponse.json({ ok: true });
    }

    if (action === "user_save") {
      const email = S(b.email).toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "A proper e-mail.");
      const name = S(b.name);
      if (!name) throw new HttpError(400, "A name, please.");
      const role = PORTAL_ROLES.includes(b.role as PortalRole) ? (b.role as PortalRole) : "customer";
      const org_slug = S(b.org_slug, 40) || null;
      if ((role === "customer" || role === "supplier") && !org_slug) throw new HttpError(400, "A customer or supplier login belongs to an organisation.");
      if (org_slug) {
        const { data: o } = await admin.from("portal_org").select("slug,kind").eq("slug", org_slug).maybeSingle();
        if (!o) throw new HttpError(400, "No such organisation.");
        if ((role === "customer" && o.kind !== "customer") || (role === "supplier" && o.kind !== "supplier")) throw new HttpError(400, `${org_slug} is a ${o.kind} organisation.`);
      }
      const locations = Array.from(new Set((Array.isArray(b.locations) ? (b.locations as unknown[]) : []).map((x) => S(x, 80)).filter(Boolean)));
      const row: Record<string, unknown> = {
        email, name, phone: S(b.phone, 40) || null, role, org_slug: role === "customer" || role === "supplier" ? org_slug : null,
        locations, sees_commercials: !!b.sees_commercials, active: b.active !== false, updated_at: now,
      };
      const id = S(b.id, 40);
      let outId = id;
      if (id) {
        const { error } = await admin.from("portal_user").update(row).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await admin.from("portal_user").insert({ ...row, created_by: u.email, created_at: now, invite_token: newInviteToken(), invite_expires: new Date(Date.now() + 72 * 3600e3).toISOString(), invited_at: now }).select("id").single();
        if (error) throw error;
        outId = data.id;
      }
      await portalAudit(u, id ? "user_saved" : "user_added", { id: outId, email, role, org_slug });
      return NextResponse.json({ ok: true, id: outId });
    }

    if (action === "user_invite") {
      const id = S(b.id, 40);
      const token = newInviteToken();
      const { data: m, error } = await admin.from("portal_user").update({ invite_token: token, invite_expires: new Date(Date.now() + 72 * 3600e3).toISOString(), invited_at: now }).eq("id", id).select("email,name").single();
      if (error) throw error;
      await portalAudit(u, "invite_made", { id });
      const origin = new URL(req.url).origin;
      return NextResponse.json({ ok: true, link: `${origin}/portal/login?invite=${token}`, email: m.email, name: m.name });
    }

    if (action === "location_save") {
      const name = S(b.name, 80);
      if (!name) throw new HttpError(400, "A name, please.");
      const { error } = await admin.from("portal_location").upsert({ name, sort_order: Number(b.sort_order) || 100, active: b.active !== false }, { onConflict: "name" });
      if (error) throw error;
      await portalAudit(u, "location_saved", { name });
      return NextResponse.json({ ok: true });
    }

    if (action === "location_delete") {
      const name = S(b.name, 80);
      const { error } = await admin.from("portal_location").delete().eq("name", name);
      if (error) throw error;
      await portalAudit(u, "location_deleted", { name });
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
