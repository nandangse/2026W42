import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireMarketing } from "@/lib/marketing";
import { crmDb } from "@/crm/db";
import { readBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** GET — every sending channel with today's counts and whether its Gmail is connected. */
export async function GET() {
  try {
    await requireMarketing();
    const db = crmDb();
    const { data, error } = await db.from("mk_channel").select("id, email, label, kind, daily_limit, hourly_limit, active, sent_on, sent_today, sent_this_hour, hour_mark, api_key").order("email");
    if (error) {
      if (/mk_channel|schema cache/i.test(error.message)) return NextResponse.json({ installed: false, channels: [] });
      throw new Error(error.message);
    }
    const { data: boxes } = await db.from("mailbox").select("email_address, status");
    const B = new Map((boxes || []).map((m) => [String(m.email_address).toLowerCase(), String(m.status)]));
    return NextResponse.json({
      installed: true,
      channels: (data || []).map((c) => ({ ...c, api_key: c.api_key ? "•••" + String(c.api_key).slice(-4) : null, gmail: B.get(String(c.email).toLowerCase()) ?? null, resendKeyOnDeploy: !!process.env.RESEND_API_KEY })),
    });
  } catch (e) {
    return errJson(e);
  }
}

/** POST — { action: "save", id?, email, label, kind, api_key?, daily_limit, hourly_limit, active } · { action: "delete", id } — managers and sales only. */
export async function POST(req: Request) {
  try {
    const u = await requireMarketing();
    if (u.scope !== "all") throw new HttpError(403, "Channels are set by sales and managers.");
    const b = await readBody(req, { action: "string", id: "uuid?" });
    const db = crmDb();
    if (b.action === "save") {
      const row: Record<string, unknown> = {
        email: String(b.email || "").trim().toLowerCase(), label: b.label || null, kind: b.kind === "resend" ? "resend" : b.kind === "mailercloud" ? "mailercloud" : "gmail",
        daily_limit: Math.max(1, Number(b.daily_limit) || 200), hourly_limit: Math.max(1, Number(b.hourly_limit) || 50), active: b.active !== false,
      };
      if (typeof b.api_key === "string" && b.api_key && !b.api_key.startsWith("•••")) row.api_key = b.api_key;
      if (!row.email) throw new HttpError(400, "an e-mail address is required");
      if (b.id) { const { error } = await db.from("mk_channel").update(row).eq("id", b.id); if (error) throw new Error(error.message); return NextResponse.json({ ok: true, id: b.id }); }
      const { data, error } = await db.from("mk_channel").insert({ ...row, created_by_email: u.email.toLowerCase() }).select("id").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, id: data.id });
    }
    if (b.action === "delete") { if (!b.id) throw new HttpError(400, "id"); await db.from("mk_channel").delete().eq("id", b.id); return NextResponse.json({ ok: true }); }
    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}
