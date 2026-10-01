import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { kindleAudit, requireKindleAdmin, requireKindler } from "@/lib/kindle/auth";

export const dynamic = "force-dynamic";

/** GET — every version, newest first. POST { version, revised_on, body, passed_by } saves a new current one (facilitator). */
export async function GET() {
  try {
    await requireKindler();
    const { data, error } = await adminClient().from("kindle_constitution").select("id,version,revised_on,passed_by,body,is_current,saved_by,created_at").order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ versions: data || [] });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const k = await requireKindleAdmin();
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const version = String(b.version || "").trim(), body = String(b.body || "");
    if (!version || body.length < 100) throw new HttpError(400, "A version number and the text.");
    const admin = adminClient();
    await admin.from("kindle_constitution").update({ is_current: false }).eq("is_current", true);
    const { error } = await admin.from("kindle_constitution").insert({
      version, body, revised_on: b.revised_on ? String(b.revised_on) : null,
      passed_by: Array.isArray(b.passed_by) ? b.passed_by : [], is_current: true, saved_by: k.email,
    });
    if (error) throw error;
    await kindleAudit(k, "constitution_saved", { version });
    return NextResponse.json({ ok: true });
  } catch (e) { return errJson(e); }
}
