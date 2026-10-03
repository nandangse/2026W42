import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { newInviteToken, portalAudit, requirePortalAdmin } from "@/lib/portal/auth";
import { inviteHtml, sendPortalMail } from "@/lib/portal/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/portal/mail { action: "invite", ids: string[] } — the invite mail
 * with a fresh 72-hour link, to the logins named. The admin presses it;
 * nothing goes out on its own.
 * GET — the mail log.
 */
export async function GET() {
  try {
    await requirePortalAdmin();
    const { data } = await adminClient().from("portal_mail").select("kind,to_email,subject,ref,sent_at,ok,error").order("sent_at", { ascending: false }).limit(200);
    return NextResponse.json({ log: data || [] });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const u = await requirePortalAdmin();
    const admin = adminClient();
    const b = (await req.json().catch(() => ({}))) as { action?: string; ids?: string[] };
    if (b.action !== "invite" || !b.ids?.length) throw new HttpError(400, "Whom?");
    const { data: users, error } = await admin.from("portal_user").select("id,email,name,org_slug,active").in("id", b.ids).eq("active", true);
    if (error) throw error;
    const slugs = Array.from(new Set((users || []).map((x) => x.org_slug).filter(Boolean)));
    const orgName = new Map<string, string>();
    if (slugs.length) {
      const { data: orgs } = await admin.from("portal_org").select("slug,name").in("slug", slugs);
      for (const o of orgs || []) orgName.set(o.slug, o.name);
    }
    const origin = new URL(req.url).origin;
    const results: { name: string; email: string; result: string }[] = [];
    for (const m of users || []) {
      const token = newInviteToken();
      await admin.from("portal_user").update({ invite_token: token, invite_expires: new Date(Date.now() + 72 * 3600e3).toISOString(), invited_at: new Date().toISOString() }).eq("id", m.id);
      const link = `${origin}/portal/login?invite=${token}`;
      const ref = `invite-${new Date().toISOString().slice(0, 16)}`;
      const r = await sendPortalMail("invite", m.email, "Your login to the Nandan GSE Portal", inviteHtml(m.name, m.org_slug ? orgName.get(m.org_slug) || null : null, link, m.email), ref);
      results.push({ name: m.name, email: m.email, result: r });
    }
    await portalAudit(u, "invite_mailed", { results });
    return NextResponse.json({ ok: true, results });
  } catch (e) { return errJson(e); }
}
