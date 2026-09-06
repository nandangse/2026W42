import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireMarketing } from "@/lib/marketing";
import { crmDb } from "@/crm/db";
import { readBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** GET — the unsubscribe list, newest first. */
export async function GET() {
  try {
    await requireMarketing();
    const { data, error } = await crmDb().from("mk_unsubscribe").select("email, reason, campaign_id, note, at").order("at", { ascending: false }).limit(5000);
    if (error) {
      if (/mk_unsubscribe|schema cache/i.test(error.message)) return NextResponse.json({ installed: false, rows: [] });
      throw new Error(error.message);
    }
    return NextResponse.json({ installed: true, rows: data ?? [] });
  } catch (e) {
    return errJson(e);
  }
}

/** POST — { action: "add", emails: [..], reason?, note? } · { action: "remove", email } (managers) */
export async function POST(req: Request) {
  try {
    const u = await requireMarketing();
    const b = await readBody(req, { action: "string" });
    const db = crmDb();
    if (b.action === "add") {
      const emails = [...new Set((Array.isArray(b.emails) ? b.emails : String(b.emails || "").split(/[\s,;]+/)).map((e: unknown) => String(e).trim().toLowerCase()).filter((e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
      if (!emails.length) throw new HttpError(400, "no valid e-mail");
      const reason = ["bounce", "request", "manual", "complaint"].includes(String(b.reason)) ? String(b.reason) : "manual";
      const { error } = await db.from("mk_unsubscribe").upsert(emails.map((email) => ({ email, reason, note: b.note || `by ${u.email}` })), { onConflict: "email", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, n: emails.length });
    }
    if (b.action === "remove") {
      if (u.scope !== "all") throw new HttpError(403, "Only sales and managers take an address off the list.");
      await db.from("mk_unsubscribe").delete().eq("email", String(b.email || "").toLowerCase());
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "unknown action");
  } catch (e) {
    return errJson(e);
  }
}
