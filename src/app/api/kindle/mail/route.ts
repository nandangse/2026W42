import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { kindleAudit, newInviteToken, requireKindleAdmin } from "@/lib/kindle/auth";
import { sendKindleMail, welcomeHtml } from "@/lib/kindle/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/kindle/mail { action: "welcome", ids?: string[] } — the welcome
 * mail with a fresh 72-hour invite link, from Dr Raghu's Gmail, to the
 * members named (or to everyone active who has never signed in). The
 * facilitator presses it; nothing goes out on its own.
 * GET — the mail log.
 */
export async function GET() {
  try {
    await requireKindleAdmin();
    const { data } = await adminClient().from("kindle_mail").select("kind,to_email,subject,ref,sent_at,ok,error").order("sent_at", { ascending: false }).limit(200);
    return NextResponse.json({ log: data || [] });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const k = await requireKindleAdmin();
    const admin = adminClient();
    const b = (await req.json().catch(() => ({}))) as { action?: string; ids?: string[]; force?: boolean };
    if (b.action !== "welcome") throw new HttpError(400, "Unknown action.");
    let q = admin.from("kindle_member").select("id,email,name,login_count,active").eq("active", true);
    if (b.ids?.length) q = q.in("id", b.ids);
    const { data: members, error } = await q;
    if (error) throw error;
    const origin = new URL(req.url).origin;
    const results: { name: string; email: string; result: string }[] = [];
    /* one check before the loop, so a dead mailbox fails once with the reason instead of ten times */
    const { kindleSender } = await import("@/lib/kindle/mail");
    try { await kindleSender(); } catch (e) { throw new HttpError(503, e instanceof Error ? e.message : String(e)); }
    for (const m of members || []) {
      if (!b.ids?.length && Number(m.login_count) > 0 && !b.force) { results.push({ name: m.name, email: m.email, result: "skipped — already signed in" }); continue; }
      const token = newInviteToken();
      await admin.from("kindle_member").update({ invite_token: token, invite_expires: new Date(Date.now() + 72 * 3600e3).toISOString(), invited_at: new Date().toISOString() }).eq("id", m.id);
      const link = `${origin}/kindle/login?invite=${token}`;
      const ref = `welcome-${new Date().toISOString().slice(0, 10)}`;
      const r = await sendKindleMail("welcome", m.email, "Kindle has a home — your login", welcomeHtml(m.name, link, m.email), ref);
      results.push({ name: m.name, email: m.email, result: r });
    }
    await kindleAudit(k, "welcome_mailed", { results });
    return NextResponse.json({ ok: true, results });
  } catch (e) { return errJson(e); }
}
