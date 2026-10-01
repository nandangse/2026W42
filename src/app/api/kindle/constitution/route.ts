import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { isKindleAdmin, kindleAudit, requireKindleAdmin, requireKindler } from "@/lib/kindle/auth";

export const dynamic = "force-dynamic";

/**
 * GET — every version, newest first, plus the acceptances of the current one
 * (mine always; everyone's for the facilitator — "maintain track of it").
 * POST { version, revised_on, body, passed_by } saves a new current one (facilitator).
 * POST { action: "accept", constitution_id, accepted?, note? } — I Accept, on record.
 */
export async function GET() {
  try {
    const k = await requireKindler();
    const admin = adminClient();
    const { data, error } = await admin.from("kindle_constitution").select("id,version,revised_on,passed_by,body,is_current,saved_by,created_at").order("created_at", { ascending: false });
    if (error) throw error;
    const cur = (data || []).find((v) => v.is_current);
    let accepts: { member_id: string; accepted: boolean; accepted_at: string; note: string | null }[] = [];
    if (cur) {
      const { data: a } = await admin.from("kindle_constitution_accept").select("member_id,accepted,accepted_at,note").eq("constitution_id", cur.id).order("accepted_at", { ascending: false });
      /* the newest row per member is the state */
      const seen = new Set<string>();
      for (const r of a || []) { if (seen.has(String(r.member_id))) continue; seen.add(String(r.member_id)); accepts.push(r as never); }
      if (!isKindleAdmin(k)) accepts = accepts.filter((r) => r.member_id === k.id);
    }
    return NextResponse.json({ versions: data || [], accepts, mine: accepts.find((r) => r.member_id === k.id) || null });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (b.action === "accept") {
      const me = await requireKindler();
      const constitution_id = String(b.constitution_id || "");
      if (!constitution_id) throw new HttpError(400, "Which version?");
      const { error } = await adminClient().from("kindle_constitution_accept").insert({
        constitution_id, member_id: me.id, accepted: b.accepted !== false, note: b.note ? String(b.note) : null,
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null, user_agent: req.headers.get("user-agent")?.slice(0, 200) || null,
      });
      if (error) throw error;
      await kindleAudit(me, b.accepted === false ? "constitution_withdrawn" : "constitution_accepted", { constitution_id });
      return NextResponse.json({ ok: true });
    }
    const k = await requireKindleAdmin();
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
