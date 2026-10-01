import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { isKindleAdmin, kindleAudit, KINDLE_ROLES, newInviteToken, requireKindleAdmin, requireKindler } from "@/lib/kindle/auth";

export const dynamic = "force-dynamic";

const PROFILE_FIELDS = ["short_name", "company", "sector", "designation", "phone", "linkedin", "city", "birthday", "stay_at", "office_at", "about"] as const;
const ADMIN_FIELDS = [...PROFILE_FIELDS, "name", "email", "joined_on", "left_on", "sort_order"] as const;

/**
 * GET  /api/kindle/members — the facilitator's view: every member with the
 *      login state and the live invite link; a member gets his own row.
 * POST actions:
 *   profile      { fields }                    — my own profile (the onboarding form)
 *   family       { rows: [{id?, relation, name, birthday, is_legal, mail_wishes}] } — my family, replaced whole
 *   onboarded                                   — I have finished the first-login form
 *   admin_save   { id, fields, roles, is_admin, active }   (facilitator)
 *   admin_family { id, rows }                              (facilitator, for a member)
 *   invite       { id }  → a fresh 72-hour link          (facilitator)
 *   add          { email, name }                          (facilitator)
 */
export async function GET(req: Request) {
  try {
    const k = await requireKindler();
    const admin = adminClient();
    const url = new URL(req.url);
    const id = url.searchParams.get("id") || k.id;
    if (id !== k.id && !isKindleAdmin(k)) throw new HttpError(403, "Your own profile only.");
    const { data: m, error } = await admin.from("kindle_member").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!m) throw new HttpError(404, "No such member.");
    const { data: fam } = await admin.from("kindle_family").select("*").eq("member_id", id).order("relation").order("name");
    const origin = url.origin;
    const out: Record<string, unknown> = { ...m, pw_salt: undefined, pw_hash: undefined, has_password: !!m.pw_hash, family: fam || [] };
    if (isKindleAdmin(k) && m.invite_token) out.invite_link = `${origin}/kindle/login?invite=${m.invite_token}`;
    delete out.invite_token;
    return NextResponse.json(out);
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const k = await requireKindler();
    const admin = adminClient();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "");
    const now = new Date().toISOString();

    if (action === "profile") {
      const f = (body.fields || {}) as Record<string, unknown>;
      const patch: Record<string, unknown> = { updated_at: now };
      for (const key of PROFILE_FIELDS) if (key in f) patch[key] = f[key] === "" ? null : f[key];
      const { error } = await admin.from("kindle_member").update(patch).eq("id", k.id);
      if (error) throw error;
      await kindleAudit(k, "profile_saved", { keys: Object.keys(patch) });
      return NextResponse.json({ ok: true });
    }

    if (action === "family" || action === "admin_family") {
      const target = action === "family" ? k.id : String(body.id || "");
      if (action === "admin_family") await requireKindleAdmin();
      if (!target) throw new HttpError(400, "Which member?");
      const rows = Array.isArray(body.rows) ? (body.rows as Record<string, unknown>[]) : [];
      const clean = rows.filter((r) => String(r.name || "").trim()).map((r) => ({
        member_id: target, relation: ["spouse", "child", "parent", "other"].includes(String(r.relation)) ? String(r.relation) : "other",
        name: String(r.name).trim(), birthday: r.birthday ? String(r.birthday) : null,
        is_legal: r.is_legal !== false, mail_wishes: r.mail_wishes !== false, note: r.note ? String(r.note) : null,
      }));
      await admin.from("kindle_family").delete().eq("member_id", target);
      if (clean.length) { const { error } = await admin.from("kindle_family").insert(clean); if (error) throw error; }
      await kindleAudit(k, "family_saved", { member: target, n: clean.length });
      return NextResponse.json({ ok: true });
    }

    if (action === "onboarded") {
      await admin.from("kindle_member").update({ onboarded_at: now }).eq("id", k.id);
      return NextResponse.json({ ok: true });
    }

    /* ---- the facilitator's actions ---- */
    await requireKindleAdmin();

    if (action === "admin_save") {
      const id = String(body.id || "");
      const f = (body.fields || {}) as Record<string, unknown>;
      const patch: Record<string, unknown> = { updated_at: now };
      for (const key of ADMIN_FIELDS) if (key in f) patch[key] = f[key] === "" ? null : key === "email" ? String(f[key]).trim().toLowerCase() : f[key];
      if (Array.isArray(body.roles)) patch.roles = (body.roles as string[]).filter((r) => (KINDLE_ROLES as readonly string[]).includes(r));
      if (typeof body.is_admin === "boolean") patch.is_admin = body.is_admin;
      if (typeof body.active === "boolean") patch.active = body.active;
      /* the owner's own admin flag cannot be removed by anyone */
      const { data: cur } = await admin.from("kindle_member").select("email").eq("id", id).maybeSingle();
      if (cur?.email === "raghu@nandan.co.in") { delete patch.is_admin; delete patch.active; }
      const { error } = await admin.from("kindle_member").update(patch).eq("id", id);
      if (error) throw error;
      await kindleAudit(k, "member_saved", { id, keys: Object.keys(patch) });
      return NextResponse.json({ ok: true });
    }

    if (action === "invite") {
      const id = String(body.id || "");
      const token = newInviteToken();
      const { data: m, error } = await admin.from("kindle_member").update({ invite_token: token, invite_expires: new Date(Date.now() + 72 * 3600e3).toISOString(), invited_at: now }).eq("id", id).select("email,name").maybeSingle();
      if (error) throw error;
      await kindleAudit(k, "invite_made", { id });
      const origin = new URL(req.url).origin;
      return NextResponse.json({ ok: true, link: `${origin}/kindle/login?invite=${token}`, email: m?.email, name: m?.name });
    }

    if (action === "add") {
      const email = String(body.email || "").trim().toLowerCase();
      const name = String(body.name || "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) throw new HttpError(400, "A name and a proper e-mail.");
      const { data: n } = await admin.from("kindle_member").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
      const { error } = await admin.from("kindle_member").insert({ email, name, short_name: name.split(" ")[0], sort_order: Number(n?.sort_order || 100) + 10, joined_on: now.slice(0, 10) });
      if (error) throw error;
      await kindleAudit(k, "member_added", { email });
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
