import { NextResponse } from "next/server";
import { requireHrms, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const scrub = (html: string) =>
  String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?(iframe|object|embed|form|input|link|meta)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*(["'][^"']*["']|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "")
    .replace(/<(?!\/?(p|br|b|strong|i|em|u|ol|ul|li|h3|h4|span)(\s|\/|>))[^>]*>/gi, "")
    .slice(0, 200000);

/**
 * Masters → Standard Texts. The paragraphs that go into letters, written
 * once. Each letter snapshots what it used, so editing here changes the next
 * letter and never one already sent.
 */
export async function GET() {
  try {
    await requireHrms();
    const admin = adminClient();
    const { data, error } = await admin.from("hrms_text_master").select("*").order("title");
    if (error) {
      if (/hrms_text_master|schema cache|does not exist/i.test(error.message))
        return NextResponse.json({ texts: [], needsMigration: true });
      throw new Error(error.message);
    }
    return NextResponse.json({ texts: data || [] });
  } catch (e) {
    return errJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireHrms();
    const admin = adminClient();
    const body = await req.json();
    const key = String(body.key || "").trim();
    if (!key) throw new HttpError(400, "Which text?");
    const stamp = me.initials ? `${me.initials} · ${me.email}` : me.email;

    const { data: prev } = await admin.from("hrms_text_master").select("version").eq("key", key).maybeSingle();
    const { error } = await admin.from("hrms_text_master").upsert({
      key,
      title: String(body.title || key).slice(0, 200),
      body: scrub(String(body.body ?? "")),
      note: String(body.note || "").slice(0, 2000) || null,
      version: (prev?.version || 0) + 1,
      updated_by: stamp, updated_at: new Date().toISOString(),
    }, { onConflict: "key" });
    if (error) {
      if (/hrms_text_master|schema cache|does not exist/i.test(error.message))
        throw new HttpError(503, "Run migration 0068 first — the standard texts have nowhere to live yet.");
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errJson(e);
  }
}
