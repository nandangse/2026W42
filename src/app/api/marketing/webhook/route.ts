import { NextResponse } from "next/server";
import { swallow } from "@/lib/swallow";
import { crmDb, crmConfigured } from "@/crm/db";
import { readBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

/**
 * POST /api/marketing/webhook — Resend's events. A bounce or a complaint
 * puts the address on the unsubscribe list at once (Dr Raghu: "Unsubscribe
 * will be meticulously maintained for those which have bounced").
 * Configure it in Resend → Webhooks with the events email.bounced and
 * email.complained. Guarded by ?key= matching RESEND_API_KEY's last 12 chars.
 */
export async function POST(req: Request) {
  try {
    const key = new URL(req.url).searchParams.get("key") || "";
    const want = String(process.env.RESEND_API_KEY || "").slice(-12);
    if (!want || key !== want) return NextResponse.json({ error: "no" }, { status: 401 });
    if (!crmConfigured()) return NextResponse.json({ ok: false });
    const b = await readBody(req, { type: "string?" });
    const type = String(b.type || "");
    const to: string[] = ([] as unknown[]).concat(b.data?.to || []).map((x) => String(x).toLowerCase());
    if ((type === "email.bounced" || type === "email.complained") && to.length) {
      const db = crmDb();
      await db.from("mk_unsubscribe").upsert(to.map((email) => ({ email, reason: type === "email.bounced" ? "bounce" : "complaint", note: String(b.data?.bounce?.message || b.data?.subject || "").slice(0, 200) })), { onConflict: "email", ignoreDuplicates: true });
      await db.from("mk_send").update({ status: "bounced", error: type }).in("email", to).in("status", ["sent", "opened"]);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    swallow("marketing/webhook", e);
    return NextResponse.json({ ok: false });
  }
}
